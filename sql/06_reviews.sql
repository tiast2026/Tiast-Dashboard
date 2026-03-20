-- ============================================================
-- 楽天レビューデータ
-- Project: tiast-data-platform
-- Dataset: analytics_mart
--
-- Google Drive上のCSVからインポートしたレビューデータ
-- 注文番号でNE受注データとマッチングし商品コードを紐付け
-- ============================================================

-- レビュー生データテーブル
CREATE TABLE IF NOT EXISTS `tiast-data-platform.analytics_mart.rakuten_reviews` (
  review_type         STRING,       -- レビュータイプ: 商品レビュー / ショップレビュー
  product_name        STRING,       -- 商品名（楽天掲載名）
  review_url          STRING,       -- レビュー詳細URL
  rating              INT64,        -- 評価 (1-5)
  posted_at           STRING,       -- 投稿日 (YYYY-MM-DD)
  title               STRING,       -- レビュータイトル
  review_body         STRING,       -- レビュー本文
  flag                INT64,        -- フラグ (0 or 1)
  order_number        STRING,       -- 注文番号
  unhandled_flag      INT64,        -- 未対応フラグ (0 or 1)
  -- マッチング結果
  matched_product_code STRING,      -- マッチした自社品番
  _imported_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY matched_product_code, review_type
OPTIONS(
  description='楽天レビューデータ（Google Drive CSVからインポート）'
);

-- 商品別レビューサマリービュー
CREATE OR REPLACE VIEW `tiast-data-platform.analytics_mart.v_review_summary` AS
SELECT
  matched_product_code AS product_code,
  COUNT(*) AS total_reviews,
  COUNT(CASE WHEN review_type = '商品レビュー' THEN 1 END) AS product_reviews,
  COUNT(CASE WHEN review_type = 'ショップレビュー' THEN 1 END) AS shop_reviews,
  ROUND(AVG(rating), 2) AS avg_rating,
  COUNT(CASE WHEN rating >= 4 THEN 1 END) AS positive_count,
  COUNT(CASE WHEN rating <= 2 THEN 1 END) AS negative_count,
  MAX(posted_at) AS latest_review_date,
FROM `tiast-data-platform.analytics_mart.rakuten_reviews`
WHERE matched_product_code IS NOT NULL
GROUP BY matched_product_code;
