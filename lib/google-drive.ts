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
  manage_number: string
  review_source: '楽天' | '公式'
}

// CSV header → internal key mapping (supports both Rakuten and official store CSVs)
const REVIEW_HEADER_MAP: Record<string, keyof ReviewRow> = {
  // Rakuten CSV headers
  'レビュータイプ': 'review_type',
  '商品名': 'product_name',
  '商品管理番号': 'manage_number',
  'レビュー詳細URL': 'review_url',
  '評価': 'rating',
  '投稿時間': 'posted_at',
  'タイトル': 'title',
  'レビュー本文': 'review_body',
  'フラグ': 'flag',
  '注文番号': 'order_number',
  '未対応フラグ': 'unhandled_flag',
  // Official store (futureshop) CSV headers
  '商品番号（投稿時）': 'manage_number',
  '商品名（投稿時）': 'product_name',
  '商品URL': 'review_url',
  'おすすめ度区分': 'rating',
  '投稿日': 'posted_at',
  '内容': 'review_body',
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

/**
 * Split CSV content into logical rows, handling quoted fields that contain newlines.
 */
function splitCSVRows(content: string): string[] {
  const rows: string[] = []
  let rowStart = 0
  let inQuotes = false

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    if (ch === '"') {
      if (inQuotes && i + 1 < content.length && content[i + 1] === '"') {
        i++ // skip escaped quote ""
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === '\n' && !inQuotes) {
      let end = i
      if (end > rowStart && content[end - 1] === '\r') end--
      const row = content.slice(rowStart, end)
      if (row.trim()) rows.push(row)
      rowStart = i + 1
    }
  }
  if (rowStart < content.length) {
    let end = content.length
    if (end > rowStart && content[end - 1] === '\r') end--
    const row = content.slice(rowStart, end)
    if (row.trim()) rows.push(row)
  }
  return rows
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

function parseReviewCSV(content: string, shopName: string = '', fileName: string = ''): ReviewRow[] {
  const lowerName = fileName.toLowerCase()
  // reviews_ (with s) = 楽天, review_ (without s) = 公式
  const isOfficial = lowerName.startsWith('review_') && !lowerName.startsWith('reviews_')
  const reviewSource: '楽天' | '公式' = isOfficial ? '公式' : '楽天'
  // Detect delimiter from first line
  const firstNewline = content.indexOf('\n')
  const headerLine = (firstNewline >= 0 ? content.slice(0, firstNewline) : content).replace(/\r$/, '')
  const delimiter = headerLine.includes('\t') ? '\t' : ','

  // TSV: simple line split (no quoted newlines in TSV)
  // CSV: use quote-aware split to handle newlines inside quoted fields
  const lines = delimiter === '\t'
    ? content.split(/\r?\n/).filter(l => l.trim())
    : splitCSVRows(content)
  if (lines.length < 2) return []

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

    // Skip rows without review_url and no useful data
    if (!obj.review_url && !obj.product_name) continue

    rows.push({
      shop_name: shopName,
      review_type: String(obj.review_type || '商品レビュー'),
      product_name: String(obj.product_name || ''),
      review_url: String(obj.review_url || ''),
      rating: Number(obj.rating) || 0,
      posted_at: String(obj.posted_at || ''),
      title: String(obj.title || ''),
      review_body: String(obj.review_body || ''),
      flag: Number(obj.flag) || 0,
      order_number: String(obj.order_number || ''),
      unhandled_flag: Number(obj.unhandled_flag) || 0,
      manage_number: String(obj.manage_number || ''),
      review_source: reviewSource,
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
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
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
  const fileMeta = await client.files.get({ fileId: targetFileId, fields: 'mimeType,name', supportsAllDrives: true })
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
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
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
): Promise<{ reviews: ReviewRow[]; fileIds: { id: string; name: string }[]; debug?: Record<string, unknown>; csvDebug?: Record<string, unknown>[] }> {
  const client = getDriveClient()

  const queryParts: string[] = [
    "trashed=false",
    `(name contains 'reviews' or name contains 'review_')`,
    `'${folderId}' in parents`,
  ]

  const query = queryParts.join(' and ')

  const res = await client.files.list({
    q: query,
    fields: 'files(id, name, mimeType, modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: 50,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  const files = res.data.files || []
  if (files.length === 0) {
    // Diagnose: check folder access and list all files
    const debug: Record<string, unknown> = { shop: shopName, folderId, query, reviewFilesFound: 0 }
    try {
      const folderRes = await client.files.get({ fileId: folderId, fields: 'id,name,mimeType', supportsAllDrives: true })
      debug.folderAccess = 'OK'
      debug.folderName = folderRes.data.name
      // List all files in folder (no reviews filter)
      const allFilesRes = await client.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType)',
        pageSize: 20,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      })
      const allFiles = allFilesRes.data.files || []
      debug.allFilesInFolder = allFiles.map(f => ({ name: f.name, mimeType: f.mimeType }))
    } catch (folderErr) {
      debug.folderAccess = 'ERROR'
      debug.folderError = folderErr instanceof Error ? folderErr.message : String(folderErr)
    }
    return { reviews: [], fileIds: [], debug }
  }

  console.log(`[レビュー][${shopName}] ${files.length}件のreviews CSVファイルを発見`)

  const allReviews: ReviewRow[] = []
  const fileIds: { id: string; name: string }[] = []
  const csvDebug: Record<string, unknown>[] = []

  for (const file of files) {
    if (!file.id || !file.name) continue
    if (!file.name.toLowerCase().startsWith('review')) continue

    console.log(`[レビュー][${shopName}] 読み込み中: ${file.name}`)
    try {
      // Download as arraybuffer to handle Shift_JIS encoding
      const dlRes = await client.files.get(
        { fileId: file.id, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' },
      )
      const buffer = dlRes.data as ArrayBuffer
      // Try Shift_JIS first (Rakuten CSVs are typically Shift_JIS), fall back to UTF-8
      let content: string
      try {
        const sjisDecoder = new TextDecoder('shift_jis')
        content = sjisDecoder.decode(buffer)
      } catch {
        const utf8Decoder = new TextDecoder('utf-8')
        content = utf8Decoder.decode(buffer)
      }
      const contentLines = content.split(/\r?\n/).filter((l: string) => l.trim())
      const headerLine = contentLines[0] || ''
      const rows = parseReviewCSV(content, shopName, file.name)
      csvDebug.push({
        fileName: file.name,
        mimeType: file.mimeType,
        contentLength: content.length,
        totalLines: contentLines.length,
        headerLine: headerLine.substring(0, 500),
        secondLine: (contentLines[1] || '').substring(0, 500),
        parsedRows: rows.length,
      })
      console.log(`[レビュー][${shopName}] ${file.name}: ${rows.length}件`)
      allReviews.push(...rows)
      fileIds.push({ id: file.id, name: file.name })
    } catch (e) {
      csvDebug.push({ fileName: file.name, error: e instanceof Error ? e.message : String(e) })
      console.warn(`[レビュー][${shopName}] ${file.name} 読み込みエラー:`, e)
    }
  }

  return { reviews: allReviews, fileIds, csvDebug: csvDebug.length > 0 ? csvDebug : undefined }
}

/**
 * Fetch reviews from all shop folders (NOAHL + BLACKQUEEN).
 */
export async function fetchAllShopReviewCSVs(): Promise<{
  reviews: ReviewRow[]
  fileIds: { id: string; name: string }[]
  debug?: Record<string, unknown>[]
  csvDebug?: Record<string, unknown>[]
}> {
  const allReviews: ReviewRow[] = []
  const allFileIds: { id: string; name: string }[] = []
  const debugInfo: Record<string, unknown>[] = []
  const allCsvDebug: Record<string, unknown>[] = []

  for (const shop of REVIEW_CSV_FOLDERS) {
    const { reviews, fileIds, debug, csvDebug } = await fetchReviewCSVsFromFolder(shop.folderId, shop.shopName)
    allReviews.push(...reviews)
    allFileIds.push(...fileIds)
    if (debug) debugInfo.push(debug)
    if (csvDebug) allCsvDebug.push(...csvDebug)
  }

  console.log(`[レビュー] 全店舗合計: ${allReviews.length}件（${allFileIds.length}ファイル）`)
  return {
    reviews: allReviews,
    fileIds: allFileIds,
    debug: debugInfo.length > 0 ? debugInfo : undefined,
    csvDebug: allCsvDebug.length > 0 ? allCsvDebug : undefined,
  }
}

/**
 * Delete a file from Google Drive
 */
export async function deleteDriveFile(fileId: string): Promise<void> {
  const client = getDriveClient()
  await client.files.delete({ fileId, supportsAllDrives: true })
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
