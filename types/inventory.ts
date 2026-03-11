export interface InventoryAlerts {
  overstock: { count: number; amount: number }
  season_ending: { count: number; amount: number }
  season_exceeded: { count: number; amount: number }
}

export interface SeasonSummaryItem {
  season: string
  in_season_amount: number
  exceeded_amount: number
  total_amount: number
}

export interface CategorySummaryItem {
  category: string
  brand: string
  stock_retail_value: number
}

export interface InventoryListItem {
  goods_id: string
  product_code: string
  goods_name: string
  brand: string
  category: string
  season: string
  total_stock: number
  free_stock: number
  zozo_stock: number
  own_stock: number
  stock_retail_value: number
  daily_sales: number
  stock_days: number
  season_remaining_days: number
  lifecycle_stance: string
  inventory_status: string
  reorder_judgment: string
  recommended_discount: string | null
  lifecycle_action: string | null
}
