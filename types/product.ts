export interface ProductListItem {
  product_code: string
  product_name: string
  brand: string
  category: string
  season: string
  selling_price: number
  cost_price: number
  total_quantity: number
  sales_amount: number
  gross_profit_rate: number
  image_url: string | null
  sales_start_date: string | null
  sales_end_date: string | null
}

export interface ProductDetail {
  // Basic info
  product_code: string
  product_name: string
  brand: string
  category: string
  season: string
  price_tier: string
  selling_price: number
  cost_price: number
  sku_count: number
  image_url: string | null
  sales_start_date: string | null
  sales_end_date: string | null

  // Sales performance
  total_quantity: number
  order_count: number
  sales_amount: number
  gross_profit: number
  gross_profit_rate: number

  // Inventory (aggregated across SKUs)
  inventory: ProductInventory[]

  // MD analysis (per SKU)
  md_analysis: ProductMdAnalysis[]
}

export interface ProductInventory {
  goods_id: string
  goods_name: string
  total_stock: number
  free_stock: number
  zozo_stock: number
  own_stock: number
  sales_1day: number
  sales_7days: number
  sales_30days: number
  daily_sales: number
  stock_days: number
  season_remaining_days: number
  is_overstock: boolean
  is_stockout: boolean
  reorder_judgment: string
  recommended_discount: string | null
  selling_price: number
  cost_price: number
}

export interface ProductMdAnalysis {
  goods_id: string
  goods_name: string
  lifecycle_stance: string
  turnover_rate_annual: number
  turnover_days: number
  last_io_date: string | null
  days_since_last_io: number
  stagnation_alert: string | null
  lifecycle_action: string | null
  inventory_status: string
}
