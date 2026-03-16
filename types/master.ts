// Master data types for product master management

export interface ProductMaster {
  product_code: string         // 代表品番 (e.g., nlmtp001-2510)
  zozo_product_code: string    // ZOZO専用商品番号
  product_name: string         // 商品名
  brand: string                // ブランド (NOAHL, BLACKQUEEN, MYRTH)
  category: string             // カテゴリ
  season: string               // シーズン (春, 夏, 秋, 冬)
  season_extraction: string    // シーズン抽出
  collaborator: string | null  // コラボ名
  commission_rate: number      // 楽天紹介料 (0.03 ~ 0.15)
  selling_price: number        // 上代
  cost_price: number           // 下代
  order_lot: number | null     // 発注ロット
  sales_start_date: string | null  // 販売日
  sales_end_date: string | null    // 終了日
  is_focus: string             // 注力
  restock: string              // 再入荷
  size: string                 // サイズ
  lifecycle_stance: string     // スタンス (助走期, 最盛期, 安定期, 衰退期)
  operation_note: string       // 運用のポイント
  image_url: string | null     // サムネURL
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
