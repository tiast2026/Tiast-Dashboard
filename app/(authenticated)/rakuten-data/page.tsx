'use client'

import { useState, useCallback, useRef } from 'react'
import Header from '@/components/layout/Header'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Upload, CheckCircle, AlertCircle, FileText, Trash2 } from 'lucide-react'

interface ImportResult {
  success: boolean
  data_type: string
  data_type_label: string
  shop_name: string
  period: string
  total_rows: number
  inserted: number
  skipped: number
  error?: string
}

interface FileEntry {
  file: File
  status: 'pending' | 'uploading' | 'done' | 'error'
  result?: ImportResult
  error?: string
}

const SHOPS = [
  { value: 'NOAHL', label: 'NOAHL' },
  { value: 'BLACKQUEEN', label: 'BLACKQUEEN' },
  { value: 'MYRTH', label: 'MYRTH' },
]

export default function RakutenDataPage() {
  const [shopName, setShopName] = useState('NOAHL')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [importing, setImporting] = useState(false)
  const [history, setHistory] = useState<ImportResult[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const entries: FileEntry[] = Array.from(newFiles)
      .filter(f => f.name.endsWith('.csv'))
      .map(f => ({ file: f, status: 'pending' as const }))
    if (entries.length === 0) return
    setFiles(prev => [...prev, ...entries])
  }, [])

  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files)
    }
  }, [addFiles])

  const handleImport = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending')
    if (pendingFiles.length === 0) return

    setImporting(true)

    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== 'pending') continue

      setFiles(prev => prev.map((f, idx) =>
        idx === i ? { ...f, status: 'uploading' } : f
      ))

      try {
        const formData = new FormData()
        formData.append('file', files[i].file)
        formData.append('shop_name', shopName)

        const res = await fetch('/api/rakuten-data/import', {
          method: 'POST',
          body: formData,
        })

        const json = await res.json()

        if (res.ok && json.success) {
          setFiles(prev => prev.map((f, idx) =>
            idx === i ? { ...f, status: 'done', result: json } : f
          ))
          setHistory(prev => [json, ...prev])
        } else {
          setFiles(prev => prev.map((f, idx) =>
            idx === i ? { ...f, status: 'error', error: json.error || 'エラーが発生しました' } : f
          ))
        }
      } catch (e) {
        setFiles(prev => prev.map((f, idx) =>
          idx === i ? { ...f, status: 'error', error: String(e) } : f
        ))
      }
    }

    setImporting(false)
  }

  const clearCompleted = () => {
    setFiles(prev => prev.filter(f => f.status !== 'done'))
  }

  const pendingCount = files.filter(f => f.status === 'pending').length

  return (
    <>
      <Header title="楽天データ インポート" subtitle="楽天RMSからダウンロードしたCSVをアップロード" />

      <div className="p-6 space-y-6">
        {/* 設定 + アップロードエリア */}
        <div className="grid grid-cols-[300px_1fr] gap-6">
          {/* 左: ショップ選択 */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">ショップ</label>
              <Select value={shopName} onValueChange={setShopName}>
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHOPS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 space-y-1">
              <p className="font-medium">対応データ種類</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>店舗データ</li>
                <li>SKU別売上データ</li>
              </ul>
              <p className="text-amber-500 mt-2">CSVのヘッダーから自動判別します。複数ファイルの同時アップロードに対応しています。</p>
            </div>
          </div>

          {/* 右: ドラッグ&ドロップエリア */}
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer
              transition-all duration-200 min-h-[160px]
              ${dragOver
                ? 'border-blue-400 bg-blue-50/50'
                : 'border-gray-200 bg-gray-50/50 hover:border-gray-300 hover:bg-gray-50'
              }
            `}
          >
            <Upload className={`w-8 h-8 mb-3 ${dragOver ? 'text-blue-400' : 'text-gray-300'}`} />
            <p className="text-sm text-gray-500 font-medium">
              CSVファイルをドラッグ＆ドロップ
            </p>
            <p className="text-xs text-gray-400 mt-1">
              またはクリックしてファイルを選択
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              multiple
              className="hidden"
              onChange={e => {
                if (e.target.files) addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
        </div>

        {/* ファイルリスト */}
        {files.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-700">
                アップロードファイル ({files.length})
              </h3>
              <div className="flex items-center gap-2">
                {files.some(f => f.status === 'done') && (
                  <button
                    onClick={clearCompleted}
                    className="text-xs text-gray-400 hover:text-gray-600 transition"
                  >
                    完了済みをクリア
                  </button>
                )}
                <button
                  onClick={handleImport}
                  disabled={importing || pendingCount === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-[#BF0000] text-white rounded-md hover:bg-[#A00] transition disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {importing ? '処理中...' : `インポート (${pendingCount}件)`}
                </button>
              </div>
            </div>

            <div className="divide-y divide-gray-50">
              {files.map((entry, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <FileText className={`w-4 h-4 flex-shrink-0 ${
                    entry.status === 'done' ? 'text-green-500' :
                    entry.status === 'error' ? 'text-red-400' :
                    entry.status === 'uploading' ? 'text-blue-400 animate-pulse' :
                    'text-gray-300'
                  }`} />

                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-700 truncate">{entry.file.name}</div>
                    <div className="text-[11px] text-gray-400">
                      {(entry.file.size / 1024).toFixed(1)} KB
                      {entry.result && (
                        <span className="ml-2 text-green-600">
                          {entry.result.data_type_label} — {entry.result.inserted}件インポート
                          {entry.result.skipped > 0 && ` / ${entry.result.skipped}件スキップ`}
                          {` (${entry.result.period})`}
                        </span>
                      )}
                      {entry.error && (
                        <span className="ml-2 text-red-500">{entry.error}</span>
                      )}
                    </div>
                  </div>

                  {entry.status === 'done' && (
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  )}
                  {entry.status === 'error' && (
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  )}
                  {entry.status === 'pending' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                      className="p-1 text-gray-300 hover:text-red-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {entry.status === 'uploading' && (
                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* インポート履歴 */}
        {history.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-700">今回のインポート結果</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80">
                  <TableHead className="text-xs px-4">データ種類</TableHead>
                  <TableHead className="text-xs px-4">ショップ</TableHead>
                  <TableHead className="text-xs px-4">対象期間</TableHead>
                  <TableHead className="text-xs px-4 text-right">全行数</TableHead>
                  <TableHead className="text-xs px-4 text-right">新規</TableHead>
                  <TableHead className="text-xs px-4 text-right">スキップ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm px-4">{r.data_type_label}</TableCell>
                    <TableCell className="text-sm px-4">{r.shop_name}</TableCell>
                    <TableCell className="text-sm px-4">{r.period}</TableCell>
                    <TableCell className="text-sm px-4 text-right">{r.total_rows.toLocaleString()}</TableCell>
                    <TableCell className="text-sm px-4 text-right text-green-600">{r.inserted.toLocaleString()}</TableCell>
                    <TableCell className="text-sm px-4 text-right text-gray-400">{r.skipped.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* 空状態 */}
        {files.length === 0 && history.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <Upload className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            <p className="text-sm">楽天RMSの「データダウンロード」からCSVをダウンロードし、上のエリアにドロップしてください</p>
            <p className="text-xs mt-1 text-gray-300">店舗データ / SKU別売上データ に対応</p>
          </div>
        )}
      </div>
    </>
  )
}
