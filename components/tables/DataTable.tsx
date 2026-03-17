'use client'
// DataTable component
import React from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'

export interface Column<T> {
  key: string
  label: string
  sortable?: boolean
  align?: 'left' | 'center' | 'right'
  render?: (row: T) => React.ReactNode
  headerRender?: () => React.ReactNode
  className?: string
  /** Fixed width in pixels for table-layout:fixed */
  width?: number
  /** Make this column sticky from the left. Value is the left offset in pixels. */
  stickyLeft?: number
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
  expandedRowKeys?: Set<string>
  renderExpandedRow?: (row: T) => React.ReactNode
  /** Render expanded content as inline sibling <tr> elements (no colSpan wrapper) */
  renderExpandedRows?: (row: T, columns: Column<T>[]) => React.ReactNode
  rowKeyField?: string
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
  expandedRowKeys,
  renderExpandedRow,
  renderExpandedRows,
  rowKeyField,
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
      <div className="border border-black/[0.06] rounded-xl overflow-hidden bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
        <Table style={{ tableLayout: 'fixed' }}>
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} style={col.width ? { width: col.width } : undefined} />
            ))}
          </colgroup>
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="bg-[#FAFAF8] border-b border-black/[0.06]">
              {columns.map((col) => {
                const stickyStyle = col.stickyLeft != null
                  ? { position: 'sticky' as const, left: col.stickyLeft, zIndex: 20 }
                  : undefined
                return (
                <TableHead
                  key={col.key}
                  className={`text-xs font-semibold text-[#8A7D72] tracking-wider whitespace-nowrap ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''} ${col.sortable ? 'cursor-pointer select-none hover:bg-black/[0.02] transition-colors' : ''} ${col.stickyLeft != null ? 'bg-[#FAFAF8]' : ''} ${col.className || ''}`}
                  style={stickyStyle}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                    {col.headerRender ? col.headerRender() : col.label}
                    {col.sortable && (
                      sortKey === col.key
                        ? (sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)
                        : <ChevronsUpDown className="w-3.5 h-3.5 text-[#C4B8AC]" />
                    )}
                  </div>
                </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-12 text-[#A99D93]">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-[#F3F0ED] flex items-center justify-center">
                      <span className="text-lg">-</span>
                    </div>
                    <span className="text-sm">データがありません</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, i) => {
                const rowKey = rowKeyField ? String(row[rowKeyField]) : String(i)
                const isExpanded = expandedRowKeys?.has(rowKey)
                return (
                  <React.Fragment key={rowKey}>
                    <TableRow
                      className={`group/row border-b border-black/[0.08] ${onRowClick ? 'cursor-pointer hover:bg-[#FDFCFA] transition-colors duration-150' : ''} ${rowClassName ? rowClassName(row) : ''} ${isExpanded ? 'bg-[#FAFAF8]' : ''}`}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      {columns.map((col) => {
                        const stickyStyle = col.stickyLeft != null
                          ? { position: 'sticky' as const, left: col.stickyLeft, zIndex: 5 }
                          : undefined
                        return (
                          <TableCell
                            key={col.key}
                            className={`text-xs text-[#3D352F] ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''} ${col.stickyLeft != null ? (isExpanded ? 'bg-[#FAFAF8]' : 'bg-white group-hover/row:bg-[#FDFCFA]') : ''} ${col.className || ''}`}
                            style={stickyStyle}
                          >
                            {col.render ? col.render(row) : String(row[col.key] ?? '-')}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                    {isExpanded && renderExpandedRows && renderExpandedRows(row, columns)}
                    {isExpanded && !renderExpandedRows && renderExpandedRow && (
                      <TableRow className="bg-[#FAFAF8] border-b border-black/[0.08]">
                        <TableCell colSpan={columns.length} className="p-0">
                          {renderExpandedRow(row)}
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                )
              })
            )}
          </TableBody>
        </Table>
        </div>
      </div>
      {totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-between mt-4 px-1">
          <span className="text-[13px] text-[#A99D93]">
            全{total.toLocaleString()}件中 {((currentPage - 1) * pageSize + 1).toLocaleString()}-{Math.min(currentPage * pageSize, total).toLocaleString()}件
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-lg border-black/[0.08]"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-[13px] px-3 text-[#5A524B]">{currentPage} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-lg border-black/[0.08]"
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
