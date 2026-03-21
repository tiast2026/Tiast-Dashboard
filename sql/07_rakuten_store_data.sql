-- ============================================================
-- 楽天RMS 店舗データ CSV インポートテーブル
-- ============================================================
-- 楽天RMSからダウンロードした店舗データCSVを格納するテーブル。
-- ブラウザからCSVアップロード → BigQueryへINSERT。
-- 重複は shop_name + date + device の組み合わせで判定。

CREATE TABLE IF NOT EXISTS `tiast-data-platform.analytics_mart.rakuten_store_data` (
  shop_name               STRING      NOT NULL,   -- NOAHL / BLACKQUEEN / MYRTH
  date                    DATE        NOT NULL,   -- 日付
  day_of_week             STRING,                 -- 曜日
  device                  STRING,                 -- デバイス（PC / スマートフォン / 全デバイス）
  sales_amount            INT64,                  -- 売上金額
  sales_count             INT64,                  -- 売上件数
  access_count            INT64,                  -- アクセス人数
  conversion_rate         FLOAT64,                -- 転換率
  avg_order_value         INT64,                  -- 客単価
  unique_users            INT64,                  -- ユニークユーザー数
  total_buyers            INT64,                  -- 購入者数（全体）
  new_buyers              INT64,                  -- 新規購入者数
  first_buyers            INT64,                  -- 初回購入者数
  repeat_buyers           INT64,                  -- リピート購入者数
  discount_amount         INT64,                  -- 割引（内税額）
  shipping_fee            INT64,                  -- 送料額
  coupon_discount_store   INT64,                  -- クーポン値引額（店舗）
  coupon_discount_rakuten INT64,                  -- クーポン値引額（楽天）
  free_shipping_coupon    INT64,                  -- 送料無料クーポン
  wrapping_fee            INT64,                  -- のし・ラッピング代金
  payment_fee             INT64,                  -- 決済手数料
  page_views              INT64,                  -- ページビュー（アクセス回数相当）
  _imported_at            TIMESTAMP   DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY date
CLUSTER BY shop_name, device;
