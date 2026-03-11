export interface SalesSummary {
  sales_amount: number
  order_count: number
  gross_profit_rate: number
  avg_order_value: number
}

export interface SalesSummaryResponse {
  current: SalesSummary
  previous_month: SalesSummary
  previous_year: SalesSummary
}

export interface MonthlyTrendItem {
  month: string
  channel_group: string
  sales_amount: number
}

export interface BrandCompositionItem {
  brand: string
  sales_amount: number
  ratio: number
}

export interface CategoryRankingItem {
  category: string
  sales_amount: number
}

export interface YoYComparisonItem {
  brand: string
  channel: string
  current_sales: number
  previous_year_sales: number
  yoy_ratio: number | null
}
