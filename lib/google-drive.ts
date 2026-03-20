import { drive, drive_v3, auth as gauth } from '@googleapis/drive'

function getDriveClient(): drive_v3.Drive {
  const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  if (!credJson) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON is not set')
  }

  const credentials = JSON.parse(credJson)
  const authClient = new gauth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })

  return drive({ version: 'v3', auth: authClient })
}

/** Review CSV folders per shop */
export const REVIEW_CSV_FOLDERS: { shopName: string; folderId: string }[] = [
  { shopName: 'NOAHL',      folderId: '1B4QMfyfgoh7I3D5n2pGLBNFSSmHudmEk' },
  { shopName: 'BLACKQUEEN', folderId: '1uLw0fGWu6I0YGHduENPYoUOObQ3J_7ox' },
]

export interface ReviewRow {
  shop_name: string
  review_type: string
  product_name: string
  review_url: string
  rating: number
  posted_at: string
  title: string
  review_body: string
  flag: number
  order_number: string
  unhandled_flag: number
}

// CSV header → internal key mapping
const REVIEW_HEADER_MAP: Record<string, keyof ReviewRow> = {
  'レビュータイプ': 'review_type',
  '商品名': 'product_name',
  'レビュー詳細URL': 'review_url',
  '評価': 'rating',
  '投稿時間': 'posted_at',
  'タイトル': 'title',
  'レビュー本文': 'review_body',
  'フラグ': 'flag',
  '注文番号': 'order_number',
  '未対応フラグ': 'unhandled_flag',
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === '\t' || ch === ',') {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current.trim())
  return fields
}

function normalizeDate(raw: string): string {
  if (!raw || raw === '##########') return ''
  // Try to parse various date formats
  const d = new Date(raw)
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return raw
}

function parseReviewCSV(content: string, shopName: string = ''): ReviewRow[] {
  const lines = content.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  // Detect delimiter (tab or comma)
  const headerLine = lines[0]
  const delimiter = headerLine.includes('\t') ? '\t' : ','

  // Parse header
  const rawHeaders = headerLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''))

  // Map header indices
  const headerIndices: { idx: number; key: keyof ReviewRow }[] = []
  for (let i = 0; i < rawHeaders.length; i++) {
    const mapped = REVIEW_HEADER_MAP[rawHeaders[i]]
    if (mapped) {
      headerIndices.push({ idx: i, key: mapped })
    }
  }

  const rows: ReviewRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const fields = delimiter === '\t' ? lines[i].split('\t') : parseCSVLine(lines[i])
    if (fields.length < 3) continue

    const obj: Record<string, string | number> = {}
    for (const { idx, key } of headerIndices) {
      const val = (fields[idx] || '').trim().replace(/^"|"$/g, '')
      if (key === 'rating' || key === 'flag' || key === 'unhandled_flag') {
        obj[key] = parseInt(val) || 0
      } else if (key === 'posted_at') {
        obj[key] = normalizeDate(val)
      } else {
        obj[key] = val
      }
    }

    // Skip rows without review_type and review_url
    if (!obj.review_type && !obj.review_url) continue

    rows.push({
      shop_name: shopName,
      review_type: String(obj.review_type || ''),
      product_name: String(obj.product_name || ''),
      review_url: String(obj.review_url || ''),
      rating: Number(obj.rating) || 0,
      posted_at: String(obj.posted_at || ''),
      title: String(obj.title || ''),
      review_body: String(obj.review_body || ''),
      flag: Number(obj.flag) || 0,
      order_number: String(obj.order_number || ''),
      unhandled_flag: Number(obj.unhandled_flag) || 0,
    })
  }

  return rows
}

/**
 * Find and read a review CSV file from Google Drive.
 * Searches by file name in the specified folder (or root).
 */
export async function fetchReviewCSVFromDrive(
  fileId?: string,
  fileName?: string,
  folderId?: string,
): Promise<ReviewRow[]> {
  const client = getDriveClient()

  let targetFileId = fileId

  if (!targetFileId) {
    // Search for the file
    const queryParts: string[] = [
      "mimeType='text/csv' or mimeType='text/tab-separated-values' or mimeType='application/vnd.google-apps.spreadsheet'",
      "trashed=false",
    ]
    if (fileName) {
      queryParts.push(`name contains '${fileName.replace(/'/g, "\\'")}'`)
    }
    if (folderId) {
      queryParts.push(`'${folderId}' in parents`)
    }

    const query = queryParts.join(' and ')
    const res = await client.files.list({
      q: query,
      fields: 'files(id, name, mimeType, modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 10,
    })

    const files = res.data.files || []
    if (files.length === 0) {
      throw new Error(`レビューCSVファイルが見つかりません${fileName ? ` (検索: ${fileName})` : ''}`)
    }

    // Pick the most recently modified file
    targetFileId = files[0].id!
    console.log(`[レビュー] Google Driveファイル発見: ${files[0].name} (${targetFileId})`)
  }

  // Check if it's a Google Sheets file (needs export instead of download)
  const fileMeta = await client.files.get({ fileId: targetFileId, fields: 'mimeType,name' })
  const mimeType = fileMeta.data.mimeType

  let content: string

  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    // Export as TSV
    const res = await client.files.export({
      fileId: targetFileId,
      mimeType: 'text/tab-separated-values',
    })
    content = res.data as string
  } else {
    // Download CSV/TSV directly
    const res = await client.files.get(
      { fileId: targetFileId, alt: 'media' },
      { responseType: 'text' },
    )
    content = res.data as string
  }

  const rows = parseReviewCSV(content)
  console.log(`[レビュー] ${rows.length}件のレビューをパース完了`)
  return rows
}

/**
 * List available CSV files from Google Drive folder
 */
export async function listDriveCSVFiles(folderId?: string): Promise<{
  id: string
  name: string
  modifiedTime: string
}[]> {
  const client = getDriveClient()

  const queryParts: string[] = [
    "(mimeType='text/csv' or mimeType='text/tab-separated-values' or mimeType='application/vnd.google-apps.spreadsheet')",
    "trashed=false",
  ]
  if (folderId) {
    queryParts.push(`'${folderId}' in parents`)
  }

  const res = await client.files.list({
    q: queryParts.join(' and '),
    fields: 'files(id, name, modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: 20,
  })

  return (res.data.files || []).map(f => ({
    id: f.id!,
    name: f.name!,
    modifiedTime: f.modifiedTime!,
  }))
}

/**
 * Find all "reviews*" CSV files in the specified folder for one shop,
 * read and merge all reviews, then return file IDs for deletion.
 */
async function fetchReviewCSVsFromFolder(
  folderId: string,
  shopName: string,
): Promise<{ reviews: ReviewRow[]; fileIds: { id: string; name: string }[] }> {
  const client = getDriveClient()

  const queryParts: string[] = [
    "trashed=false",
    `name contains 'reviews'`,
    `'${folderId}' in parents`,
  ]

  const res = await client.files.list({
    q: queryParts.join(' and '),
    fields: 'files(id, name, mimeType, modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: 50,
  })

  const files = res.data.files || []
  if (files.length === 0) {
    return { reviews: [], fileIds: [] }
  }

  console.log(`[レビュー][${shopName}] ${files.length}件のreviews CSVファイルを発見`)

  const allReviews: ReviewRow[] = []
  const fileIds: { id: string; name: string }[] = []

  for (const file of files) {
    if (!file.id || !file.name) continue
    if (!file.name.toLowerCase().startsWith('reviews')) continue

    console.log(`[レビュー][${shopName}] 読み込み中: ${file.name}`)
    try {
      const dlRes = await client.files.get(
        { fileId: file.id, alt: 'media' },
        { responseType: 'text' },
      )
      const content = dlRes.data as string
      const rows = parseReviewCSV(content, shopName)
      console.log(`[レビュー][${shopName}] ${file.name}: ${rows.length}件`)
      allReviews.push(...rows)
      fileIds.push({ id: file.id, name: file.name })
    } catch (e) {
      console.warn(`[レビュー][${shopName}] ${file.name} 読み込みエラー:`, e)
    }
  }

  return { reviews: allReviews, fileIds }
}

/**
 * Fetch reviews from all shop folders (NOAHL + BLACKQUEEN).
 */
export async function fetchAllShopReviewCSVs(): Promise<{
  reviews: ReviewRow[]
  fileIds: { id: string; name: string }[]
}> {
  const allReviews: ReviewRow[] = []
  const allFileIds: { id: string; name: string }[] = []

  for (const shop of REVIEW_CSV_FOLDERS) {
    const { reviews, fileIds } = await fetchReviewCSVsFromFolder(shop.folderId, shop.shopName)
    allReviews.push(...reviews)
    allFileIds.push(...fileIds)
  }

  console.log(`[レビュー] 全店舗合計: ${allReviews.length}件（${allFileIds.length}ファイル）`)
  return { reviews: allReviews, fileIds: allFileIds }
}

/**
 * Delete a file from Google Drive
 */
export async function deleteDriveFile(fileId: string): Promise<void> {
  const client = getDriveClient()
  await client.files.delete({ fileId })
}

/**
 * Delete multiple files from Google Drive
 */
export async function deleteDriveFiles(fileIds: string[]): Promise<{ deleted: number; errors: string[] }> {
  let deleted = 0
  const errors: string[] = []

  for (const id of fileIds) {
    try {
      await deleteDriveFile(id)
      deleted++
    } catch (e) {
      errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { deleted, errors }
}
