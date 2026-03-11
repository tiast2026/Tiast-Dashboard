export interface CustomerSummary {
  new_customers: number
  repeat_customers: number
  repeat_rate: number
  new_avg_order_value: number
  repeat_avg_order_value: number
  prev_new_customers: number
  prev_repeat_customers: number
  prev_repeat_rate: number
}

export interface CustomerMonthlyTrendItem {
  month: string
  new_count: number
  repeat_count: number
  repeat_rate: number
}

export interface ChannelRepeatRateItem {
  shop_name: string
  repeat_rate: number
  customer_count: number
}

export interface ChannelDetailItem {
  shop_name: string
  new_customers: number
  new_sales: number
  new_avg_order_value: number
  repeat_customers: number
  repeat_sales: number
  repeat_avg_order_value: number
  repeat_rate: number
  new_sales_share: number
  repeat_sales_share: number
}
