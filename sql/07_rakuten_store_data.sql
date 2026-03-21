-- ============================================================
-- 楽天RMS データダウンロード CSVインポート テーブル定義
-- ============================================================
-- 楽天RMSの「データダウンロード」からCSVを取得し、Google Driveへアップロード。
-- ダッシュボードの「インポート」ボタンでDriveからBigQueryへ取り込み。
--
-- 対応データ種類（5種）:
--   1. 店舗データ                          → rakuten_store_data
--   2. SKU別売上データ                      → rakuten_sku_sales
--   3. 新規・リピート購入者数（店舗別）        → rakuten_new_repeat_store
--   4. 新規・リピート購入者数（商品別）        → rakuten_new_repeat_product
--   5. 新規・リピート購入者数（商品ジャンル別）  → rakuten_new_repeat_genre

-- ============================================================
-- 1. 店舗データ
-- ============================================================
CREATE TABLE IF NOT EXISTS `tiast-data-platform.analytics_mart.rakuten_store_data` (
  shop_name               STRING      NOT NULL,
  date                    DATE        NOT NULL,
  day_of_week             STRING,
  device                  STRING,
  sales_amount            INT64,
  sales_count             INT64,
  access_count            INT64,
  conversion_rate         FLOAT64,
  avg_order_value         INT64,
  unique_users            INT64,
  buyers_member           INT64,
  buyers_non_member       INT64,
  new_buyers              INT64,
  repeat_buyers           INT64,
  tax_amount              INT64,
  shipping_fee            INT64,
  coupon_discount_store   INT64,
  coupon_discount_rakuten INT64,
  free_shipping_coupon    INT64,
  wrapping_fee            INT64,
  payment_fee             INT64,
  deal_sales_amount       INT64,
  deal_sales_count        INT64,
  deal_access_count       INT64,
  deal_conversion_rate    FLOAT64,
  deal_avg_order_value    INT64,
  deal_unique_users       INT64,
  deal_buyers_member      INT64,
  deal_buyers_non_member  INT64,
  deal_new_buyers         INT64,
  deal_repeat_buyers      INT64,
  points_sales_amount     INT64,
  points_sales_count      INT64,
  points_cost             INT64,
  _imported_at            TIMESTAMP   DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY date
CLUSTER BY shop_name, device;

-- ============================================================
-- 2. SKU別売上データ
-- ============================================================
CREATE TABLE IF NOT EXISTS `tiast-data-platform.analytics_mart.rakuten_sku_sales` (
  shop_name               STRING      NOT NULL,
  period_start            DATE        NOT NULL,
  period_end              DATE        NOT NULL,
  catalog_id              STRING,
  product_code            STRING,
  product_number          STRING,
  product_name            STRING,
  sku_code                STRING,
  sku_system_code         STRING,
  sku_option_1            STRING,
  sku_option_2            STRING,
  sku_option_3            STRING,
  sku_option_4            STRING,
  sku_option_5            STRING,
  sku_option_6            STRING,
  sales_amount            INT64,
  sales_count             INT64,
  sales_quantity          INT64,
  _imported_at            TIMESTAMP   DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY period_start
CLUSTER BY shop_name, product_code;

-- ============================================================
-- 3. 新規・リピート購入者数（店舗別）
-- ============================================================
CREATE TABLE IF NOT EXISTS `tiast-data-platform.analytics_mart.rakuten_new_repeat_store` (
  shop_name               STRING      NOT NULL,
  month                   STRING      NOT NULL,   -- "2024年4月"
  month_date              DATE,                   -- 2024-04-01（ソート・集計用）
  new_buyers              INT64,
  new_avg_order_value     INT64,
  new_sales               INT64,
  new_sales_count         INT64,
  new_sales_quantity      INT64,
  repeat_buyers           INT64,
  repeat_avg_order_value  INT64,
  repeat_sales            INT64,
  repeat_sales_count      INT64,
  repeat_sales_quantity   INT64,
  _imported_at            TIMESTAMP   DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY shop_name;

-- ============================================================
-- 4. 新規・リピート購入者数（商品別）
-- ============================================================
CREATE TABLE IF NOT EXISTS `tiast-data-platform.analytics_mart.rakuten_new_repeat_product` (
  shop_name               STRING      NOT NULL,
  period_start            DATE        NOT NULL,
  period_end              DATE        NOT NULL,
  product_name            STRING,
  product_url             STRING,
  product_price           INT64,
  is_discontinued         BOOL,
  new_buyers              INT64,
  repeat_buyers           INT64,
  repeat_rate             FLOAT64,
  _imported_at            TIMESTAMP   DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY shop_name;

-- ============================================================
-- 5. 新規・リピート購入者数（商品ジャンル別）
-- ============================================================
CREATE TABLE IF NOT EXISTS `tiast-data-platform.analytics_mart.rakuten_new_repeat_genre` (
  shop_name               STRING      NOT NULL,
  period_start            DATE        NOT NULL,
  period_end              DATE        NOT NULL,
  genre_name              STRING,
  new_buyers              INT64,
  repeat_buyers           INT64,
  repeat_rate             FLOAT64,
  new_avg_purchase        INT64,
  repeat_avg_purchase     INT64,
  avg_purchase_count      FLOAT64,
  avg_purchase_amount     INT64,
  _imported_at            TIMESTAMP   DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY shop_name;
