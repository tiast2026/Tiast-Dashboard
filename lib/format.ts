// Format currency (JPY)
export function formatCurrency(value: number): string {
  return `¥${Math.round(value).toLocaleString('ja-JP')}`
}

// Format percentage
export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`
}

// Format percentage that's already multiplied by 100
export function formatPercentRaw(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

// Format number with commas
export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString('ja-JP')
}

// Format month string (YYYY-MM -> YYYY年M月)
export function formatMonth(month: string): string {
  const [year, m] = month.split('-')
  return `${year}年${parseInt(m)}月`
}

// Format date
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

// Calculate year-over-year ratio
export function calcYoY(current: number, previous: number): number | null {
  if (previous === 0) return null
  return current / previous
}

// Format YoY as percentage
export function formatYoY(current: number, previous: number): string {
  const yoy = calcYoY(current, previous)
  if (yoy === null) return '-'
  return formatPercentRaw(yoy * 100, 1)
}

// Format change rate with arrow
export function formatChangeRate(current: number, previous: number): { text: string; isPositive: boolean } | null {
  if (previous === 0) return null
  const rate = (current - previous) / previous
  const isPositive = rate >= 0
  const arrow = isPositive ? '↑' : '↓'
  return {
    text: `${arrow}${Math.abs(rate * 100).toFixed(1)}%`,
    isPositive,
  }
}

// Get current month string (YYYY-MM)
export function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Get previous month string
export function getPreviousMonth(month: string): string {
  const [year, m] = month.split('-').map(Number)
  if (m === 1) return `${year - 1}-12`
  return `${year}-${String(m - 1).padStart(2, '0')}`
}

// Get same month last year
export function getLastYearMonth(month: string): string {
  const [year, m] = month.split('-')
  return `${parseInt(year) - 1}-${m}`
}
