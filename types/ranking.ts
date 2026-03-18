// 楽天ランキング関連の型定義

export interface RakutenRankingItem {
  rank: number
  item_name: string
  item_code: string
  item_price: number
  item_url: string
  image_url: string
  shop_name: string
  review_count: number
  review_average: number
}

export interface RankingHistoryRecord {
  fetched_at: string
  ranking_type: string
  genre_id: string
  rank: number
  item_name: string
  item_code: string
  item_price: number
  item_url: string
  image_url: string
  shop_name: string
  review_count: number
  review_average: number
  is_own_product: boolean
  matched_product_code: string | null
}

export interface OwnProductRanking {
  fetched_at: string
  ranking_type: string
  genre_id: string
  rank: number
  item_name: string
  item_code: string
  item_price: number
  item_url: string
  image_url: string
  shop_name: string
  matched_product_code: string
  review_count: number
  review_average: number
  first_ranked_at: string
  best_rank: number
  rank_count: number
}

export interface RankingCollectResult {
  fetched_at: string
  ranking_type: string
  genre_id: string
  total_items: number
  own_items: number
  own_products: { rank: number; item_name: string; matched_product_code: string }[]
}
