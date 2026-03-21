'use client'

import { useState } from 'react'
import Header from '@/components/layout/Header'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Download, CheckCircle, AlertCircle } from 'lucide-react'

interface FileResult {
  fileName: string
  shopName: string
  dataType: string
  dataTypeLabel: string
  period: string
  rowCount: number
  inserted: number
}

interface ImportResponse {
  success: boolean
  files: FileResult[]
  totalInserted: number
  filesMoved: number
  error?: string
}

export default function RakutenDataPage() {
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResponse | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const handleImport = async () => {
    setImporting(true)
    setStatusMessage(null)
    setResult(null)

    try {
      const res = await fetch('/api/rakuten-data/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json: ImportResponse = await res.json()
      setResult(json)

      if (json.success && json.files.length > 0) {
        setStatusMessage(`${json.totalInserted}件インポート完了（${json.files.length}ファイル）`)
      } else if (json.success && json.files.length === 0) {
        setStatusMessage(json.error || 'CSVファイルが見つかりません')
      } else {
        setStatusMessage(json.error || 'エラーが発生しました')
      }
    } catch (e) {
      setStatusMessage(`エラー: ${e}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <Header title="楽天データ インポート">
        {statusMessage && (
          <span className="text-xs text-gray-500 max-w-[400px] truncate">
            {statusMessage}
          </span>
        )}
        <button
          onClick={handleImport}
          disabled={importing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          {importing ? '処理中...' : 'インポート'}
        </button>
      </Header>

      <div className="p-6 space-y-6">
        {/* 説明 */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <p className="font-medium mb-2">使い方</p>
          <ol className="list-decimal pl-5 space-y-1 text-xs text-amber-700">
            <li>楽天RMSの「データダウンロード」からCSVをダウンロード</li>
            <li>Google Driveの <span className="font-medium">【csvデータ】NOAHL</span>（または BLACKQUEEN）フォルダにアップロード</li>
            <li>上の「インポート」ボタンをクリック</li>
            <li>処理完了後、CSVファイルはフォルダ内の「imported」フォルダに自動移動されます</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            {['店舗データ', 'SKU別売上データ', '新規・リピート購入者数（店舗別）', '新規・リピート購入者数（商品別）', '新規・リピート購入者数（商品ジャンル別）'].map(label => (
              <span key={label} className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[11px] rounded-full">{label}</span>
            ))}
          </div>
        </div>

        {/* インポート結果 */}
        {result && result.files.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              {result.success ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400" />
              )}
              <h3 className="text-sm font-medium text-gray-700">
                インポート結果 — {result.totalInserted.toLocaleString()}件
              </h3>
              <span className="text-xs text-gray-400 ml-auto">
                {result.filesMoved}ファイル移動済み
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80">
                  <TableHead className="text-xs px-4">ファイル名</TableHead>
                  <TableHead className="text-xs px-4">ショップ</TableHead>
                  <TableHead className="text-xs px-4">データ種類</TableHead>
                  <TableHead className="text-xs px-4">対象期間</TableHead>
                  <TableHead className="text-xs px-4 text-right">行数</TableHead>
                  <TableHead className="text-xs px-4 text-right">インポート</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.files.map((f, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs px-4 font-mono text-gray-600 max-w-[300px] truncate">{f.fileName}</TableCell>
                    <TableCell className="text-xs px-4">{f.shopName}</TableCell>
                    <TableCell className="text-xs px-4">
                      <span className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-[10px] font-medium">{f.dataTypeLabel}</span>
                    </TableCell>
                    <TableCell className="text-xs px-4 text-gray-500">{f.period}</TableCell>
                    <TableCell className="text-xs px-4 text-right">{f.rowCount.toLocaleString()}</TableCell>
                    <TableCell className="text-xs px-4 text-right text-green-600 font-medium">{f.inserted.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* 空状態 */}
        {!result && (
          <div className="text-center py-20 text-gray-400">
            <Download className="w-12 h-12 mx-auto mb-3 text-gray-200" />
            <p className="text-sm">楽天RMSのCSVをGoogle Driveに入れて「インポート」をクリック</p>
            <p className="text-xs mt-1 text-gray-300">レビューCSVと同じフォルダに入れてください</p>
          </div>
        )}

        {/* CSVなし */}
        {result && result.files.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-gray-200" />
            <p className="text-sm">{result.error || '対象のCSVファイルが見つかりませんでした'}</p>
            <p className="text-xs mt-1 text-gray-300">Google Driveフォルダに楽天RMSのCSVをアップロードしてください</p>
          </div>
        )}
      </div>
    </>
  )
}
