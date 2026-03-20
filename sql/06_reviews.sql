-- ============================================================
-- 楽天レビューデータ
-- Project: tiast-data-platform
-- Dataset: analytics_mart
--
-- NOAHL / BLACKQUEEN 両店舗のレビューCSVをGoogle Driveから取り込み
-- レビューページのスクレイピングで品番を自動マッチング
-- ============================================================

-- レビュー生データテーブル
CREATE TABLE IF NOT EXISTS `tiast-data-platform.analytics_mart.rakuten_reviews` (
  shop_name           STRING,       -- 店舗名: NOAHL / BLACKQUEEN
  review_type         STRING,       -- レビュータイプ: 商品レビュー / ショップレビュー
  product_name        STRING,       -- 商品名（楽天掲載名）
  review_url          STRING,       -- レビュー詳細URL（重複チェックのキー）
  rating              INT64,        -- 評価 (1-5)
  posted_at           STRING,       -- 投稿日 (YYYY-MM-DD)
  title               STRING,       -- レビュータイトル
  review_body         STRING,       -- レビュー本文
  flag                INT64,        -- フラグ (0 or 1)
  order_number        STRING,       -- 注文番号
  unhandled_flag      INT64,        -- 未対応フラグ (0 or 1)
  -- マッチング用
  rakuten_item_id     STRING,       -- 楽天商品番号（URLから抽出: 例 10002317）
  matched_product_code STRING,      -- マッチした自社品番（スクレイピング経由）
  _imported_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY shop_name, matched_product_code, review_type
OPTIONS(
  description='楽天レビューデータ（NOAHL + BLACKQUEEN、Google Drive CSVからインポート）'
);

-- ショップレビュー専用テーブル
CREATE TABLE IF NOT EXISTS `tiast-data-platform.analytics_mart.rakuten_shop_reviews` (
  shop_name           STRING,       -- 店舗名: NOAHL / BLACKQUEEN
  review_type         STRING,       -- 常に 'ショップレビュー'
  product_name        STRING,       -- 商品名（楽天掲載名）
  review_url          STRING,       -- レビュー詳細URL（重複チェックのキー）
  rating              INT64,        -- 評価 (1-5)
  posted_at           STRING,       -- 投稿日 (YYYY-MM-DD)
  title               STRING,       -- レビュータイトル
  review_body         STRING,       -- レビュー本文
  flag                INT64,        -- フラグ (0 or 1)
  order_number        STRING,       -- 注文番号
  unhandled_flag      INT64,        -- 未対応フラグ (0 or 1)
  _imported_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY shop_name
OPTIONS(
  description='楽天ショップレビュー（NOAHL + BLACKQUEEN、Google Drive CSVからインポート）'
);

-- 商品別レビューサマリービュー（商品レビューのみ）
CREATE OR REPLACE VIEW `tiast-data-platform.analytics_mart.v_review_summary` AS
SELECT
  shop_name,
  matched_product_code AS product_code,
  COUNT(*) AS total_reviews,
  ROUND(AVG(rating), 2) AS avg_rating,
  COUNT(CASE WHEN rating >= 4 THEN 1 END) AS positive_count,
  COUNT(CASE WHEN rating <= 2 THEN 1 END) AS negative_count,
  MAX(posted_at) AS latest_review_date,
FROM `tiast-data-platform.analytics_mart.rakuten_reviews`
WHERE matched_product_code IS NOT NULL
  AND review_type = '商品レビュー'
GROUP BY shop_name, matched_product_code;

-- ショップレビューサマリービュー
CREATE OR REPLACE VIEW `tiast-data-platform.analytics_mart.v_shop_review_summary` AS
SELECT
  shop_name,
  COUNT(*) AS total_reviews,
  ROUND(AVG(rating), 2) AS avg_rating,
  COUNT(CASE WHEN rating >= 4 THEN 1 END) AS positive_count,
  COUNT(CASE WHEN rating <= 2 THEN 1 END) AS negative_count,
  MAX(posted_at) AS latest_review_date,
FROM `tiast-data-platform.analytics_mart.rakuten_shop_reviews`
GROUP BY shop_name;
