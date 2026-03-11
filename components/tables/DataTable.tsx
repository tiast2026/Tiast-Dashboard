'use client'
// DataTable component
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'

export interface Column<T> {
  key: string
  label: string
  sortable?: boolean
  align?: 'left' | 'center' | 'right'
  render?: (row: T) => React.ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  pageSize?: number
  currentPage?: number
  totalItems?: number
  onPageChange?: (page: number) => void
  onSort?: (key: string, order: 'asc' | 'desc') => void
  sortKey?: string
  sortOrder?: 'asc' | 'desc'
  rowClassName?: (row: T) => string
  onRowClick?: (row: T) => void
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  pageSize = 50,
  currentPage = 1,
  totalItems,
  onPageChange,
  onSort,
  sortKey,
  sortOrder,
  rowClassName,
  onRowClick,
}: DataTableProps<T>) {
  const total = totalItems ?? data.length
  const totalPages = Math.ceil(total / pageSize)

  const handleSort = (key: string) => {
    if (!onSort) return
    const newOrder = sortKey === key && sortOrder === 'asc' ? 'desc' : 'asc'
    onSort(key, newOrder)
  }

  return (
    <div>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={`text-xs font-semibold text-gray-600 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''} ${col.sortable ? 'cursor-pointer select-none hover:bg-gray-100' : ''} ${col.className || ''}`}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                    {col.label}
                    {col.sortable && (
                      sortKey === col.key
                        ? (sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)
                        : <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400" />
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8 text-gray-500">
                  データがありません
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, i) => (
                <TableRow
                  key={i}
                  className={`${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''} ${rowClassName ? rowClassName(row) : ''}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={`text-sm ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''} ${col.className || ''}`}
                    >
                      {col.render ? col.render(row) : String(row[col.key] ?? '-')}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">
            全{total.toLocaleString()}件中 {((currentPage - 1) * pageSize + 1).toLocaleString()}-{Math.min(currentPage * pageSize, total).toLocaleString()}件
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm px-3">{currentPage} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
