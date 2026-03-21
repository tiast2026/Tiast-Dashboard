-- ============================================================
-- 楽天RMS データダウンロード CSVインポート テーブル定義
-- ============================================================
-- 楽天RMSの「データダウンロード」からCSVを取得し、ダッシュボードへアップロード。
-- 対応データ種類:
--   1. 店舗データ        → rakuten_store_data
--   2. SKU別売上データ   → rakuten_sku_sales

-- ============================================================
-- 1. 店舗データ
-- ============================================================
-- 重複判定: shop_name + date + device
-- CSVフォーマット: タブ区切り、先頭2行メタデータ、3行目ヘッダー

CREATE TABLE IF NOT EXISTS `tiast-data-platform.analytics_mart.rakuten_store_data` (
  shop_name               STRING      NOT NULL,   -- NOAHL / BLACKQUEEN / MYRTH
  date                    DATE        NOT NULL,   -- 日付
  day_of_week             STRING,                 -- 曜日
  device                  STRING,                 -- デバイス（すべて / PC / 楽天市場アプリ / スマートフォン）
  -- 基本指標
  sales_amount            INT64,                  -- 売上金額
  sales_count             INT64,                  -- 売上件数
  access_count            INT64,                  -- アクセス人数
  conversion_rate         FLOAT64,                -- 転換率
  avg_order_value         INT64,                  -- 客単価
  unique_users            INT64,                  -- ユニークユーザー数
  buyers_member           INT64,                  -- 購入者数（会員）
  buyers_non_member       INT64,                  -- 購入者数（非会員）
  new_buyers              INT64,                  -- 新規購入者数
  repeat_buyers           INT64,                  -- リピート購入者数
  -- 費用・割引
  tax_amount              INT64,                  -- 税額（外税額）
  shipping_fee            INT64,                  -- 送料額
  coupon_discount_store   INT64,                  -- クーポン値引額（店舗）
  coupon_discount_rakuten INT64,                  -- クーポン値引額（楽天）
  free_shipping_coupon    INT64,                  -- 送料無料クーポン
  wrapping_fee            INT64,                  -- のし・ラッピング代金
  payment_fee             INT64,                  -- 決済手数料
  -- 楽天スーパーDEAL
  deal_sales_amount       INT64,                  -- 楽天スーパーDEAL 売上金額
  deal_sales_count        INT64,                  -- 楽天スーパーDEAL 売上件数
  deal_access_count       INT64,                  -- 楽天スーパーDEAL アクセス人数
  deal_conversion_rate    FLOAT64,                -- 楽天スーパーDEAL 転換率
  deal_avg_order_value    INT64,                  -- 楽天スーパーDEAL 客単価
  deal_unique_users       INT64,                  -- 楽天スーパーDEAL ユニークユーザー数
  deal_buyers_member      INT64,                  -- 楽天スーパーDEAL 購入者数（会員）
  deal_buyers_non_member  INT64,                  -- 楽天スーパーDEAL 購入者数（非会員）
  deal_new_buyers         INT64,                  -- 楽天スーパーDEAL 新規購入者数
  deal_repeat_buyers      INT64,                  -- 楽天スーパーDEAL リピート購入者数
  -- 運用型ポイント
  points_sales_amount     INT64,                  -- 運用型ポイント変倍経由売上金額
  points_sales_count      INT64,                  -- 運用型ポイント変倍経由売上件数
  points_cost             INT64,                  -- 運用型ポイント変倍経由ポイント付与料
  -- メタ
  _imported_at            TIMESTAMP   DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY date
CLUSTER BY shop_name, device;

-- ============================================================
-- 2. SKU別売上データ
-- ============================================================
-- 重複判定: shop_name + period_start + period_end + sku_code
-- CSVフォーマット: タブ区切り、先頭2行メタデータ、3行目ヘッダー

CREATE TABLE IF NOT EXISTS `tiast-data-platform.analytics_mart.rakuten_sku_sales` (
  shop_name               STRING      NOT NULL,   -- NOAHL / BLACKQUEEN / MYRTH
  period_start            DATE        NOT NULL,   -- データ対象期間 開始
  period_end              DATE        NOT NULL,   -- データ対象期間 終了
  catalog_id              STRING,                 -- カタログID
  product_code            STRING,                 -- 商品管理番号
  product_number          STRING,                 -- 商品番号
  product_name            STRING,                 -- 商品名
  sku_code                STRING,                 -- SKU管理番号
  sku_system_code         STRING,                 -- システム連携用SKU番号
  sku_option_1            STRING,                 -- SKU項目1
  sku_option_2            STRING,                 -- SKU項目2
  sku_option_3            STRING,                 -- SKU項目3
  sku_option_4            STRING,                 -- SKU項目4
  sku_option_5            STRING,                 -- SKU項目5
  sku_option_6            STRING,                 -- SKU項目6
  sales_amount            INT64,                  -- 売上金額
  sales_count             INT64,                  -- 売上件数
  sales_quantity           INT64,                  -- 売上個数
  -- メタ
  _imported_at            TIMESTAMP   DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY period_start
CLUSTER BY shop_name, product_code;
