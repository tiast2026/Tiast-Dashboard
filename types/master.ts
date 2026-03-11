// Master data types for product master management

export interface ProductMaster {
  product_code: string         // 品番 (e.g., nlmtp001-2510)
  product_name: string         // 商品名
  brand: string                // ブランド (NOAHL, BLACKQUEEN, MYRTH)
  category: string             // カテゴリ
  season: string               // シーズン (春, 夏, 秋, 冬)
  collaborator: string | null  // コラボ名
  commission_rate: number      // 楽天紹介料 (0.03 ~ 0.15)
  selling_price: number        // 販売価格
  cost_price: number           // 原価
  order_lot: number | null     // 発注ロット
  sales_start_date: string | null  // 販売開始日
  sales_end_date: string | null    // 販売終了日
  lifecycle_stance: string     // スタンス (助走期, 最盛期, 安定期, 衰退期)
  operation_note: string       // 運用のポイント
  image_url: string | null     // 画像URL
  sku_images: SkuImage[]       // SKU別画像
  created_at: string
  updated_at: string
}

export interface SkuImage {
  sku_code: string       // SKUコード (品番-色)
  sku_name: string       // SKU名
  image_url: string      // 画像URL
}

export interface ProductMasterListResponse {
  data: ProductMaster[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

export interface RakutenImageResult {
  item_name: string
  item_code: string
  image_url: string
  shop_name: string
  price: number
}
