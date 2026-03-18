-- ============================================================
-- 楽天市場ランキング履歴テーブル
-- Project: tiast-data-platform
-- Dataset: analytics_mart
--
-- 楽天ランキングAPIから取得したデータを蓄積し、
-- 自社商品のランクイン履歴を追跡する
-- ============================================================

-- ランキング取得ログ（生データ）
CREATE TABLE IF NOT EXISTS `tiast-data-platform.analytics_mart.rakuten_ranking_history` (
  fetched_at      TIMESTAMP   NOT NULL,       -- 取得日時
  ranking_type    STRING      NOT NULL,       -- ranking種別: realtime, daily, weekly
  genre_id        STRING      NOT NULL,       -- ジャンルID (例: 100371=レディースファッション)
  rank            INT64       NOT NULL,       -- 順位
  item_name       STRING,                     -- 商品名
  item_code       STRING,                     -- 商品コード
  item_price      INT64,                      -- 価格
  item_url        STRING,                     -- 商品URL
  image_url       STRING,                     -- 商品画像URL
  shop_name       STRING,                     -- ショップ名
  review_count    INT64,                      -- レビュー数
  review_average  FLOAT64,                    -- レビュー平均
  is_own_product  BOOL        DEFAULT FALSE,  -- 自社商品フラグ
  matched_product_code STRING,                -- マッチした自社品番
)
PARTITION BY DATE(fetched_at)
CLUSTER BY genre_id, is_own_product
OPTIONS(
  description='楽天市場ランキングAPI取得履歴',
  labels=[("source", "rakuten_api")]
);

-- 自社商品ランクイン履歴ビュー（ダッシュボード表示用）
CREATE OR REPLACE VIEW `tiast-data-platform.analytics_mart.v_rakuten_own_ranking` AS
SELECT
  fetched_at,
  ranking_type,
  genre_id,
  rank,
  item_name,
  item_code,
  item_price,
  item_url,
  image_url,
  shop_name,
  matched_product_code,
  review_count,
  review_average,
  -- 初回ランクイン日
  MIN(fetched_at) OVER (
    PARTITION BY matched_product_code, ranking_type, genre_id
  ) AS first_ranked_at,
  -- 最高順位
  MIN(rank) OVER (
    PARTITION BY matched_product_code, ranking_type, genre_id
  ) AS best_rank,
  -- ランクイン回数
  COUNT(*) OVER (
    PARTITION BY matched_product_code, ranking_type, genre_id
  ) AS rank_count,
FROM `tiast-data-platform.analytics_mart.rakuten_ranking_history`
WHERE is_own_product = TRUE
ORDER BY fetched_at DESC, rank ASC;
