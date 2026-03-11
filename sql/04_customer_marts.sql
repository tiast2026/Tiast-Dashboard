-- ============================================================
-- 7. t_customer_segments
--    顧客セグメント（新規/リピート × 店舗 × 月）
--    使用先: 顧客分析（サマリ, チャネル別, リピート率, 月別推移）
-- ============================================================
CREATE OR REPLACE VIEW `tiast-data-platform.analytics_mart.t_customer_segments` AS

WITH ne_orders_with_customer AS (
  SELECT
    o.receive_order_id,
    o.receive_order_date,
    FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS order_month,
    -- 店舗名
    CASE
      WHEN o.receive_order_shop_id = 1 THEN '自社EC'
      WHEN LOWER(COALESCE(o.import_type_name, '')) LIKE '%楽天%' THEN '楽天市場'
      WHEN LOWER(COALESCE(o.import_type_name, '')) LIKE '%yahoo%' THEN 'Yahoo!'
      WHEN LOWER(COALESCE(o.import_type_name, '')) LIKE '%amazon%' THEN 'Amazon'
      WHEN LOWER(COALESCE(o.import_type_name, '')) LIKE '%qoo10%' THEN 'Qoo10'
      ELSE COALESCE(o.import_type_name, 'その他')
    END AS shop_name,
    -- 購入者キー（メールアドレス or 購入者名+電話番号でユニーク化）
    COALESCE(
      NULLIF(o.purchaser_mail_address, ''),
      CONCAT(COALESCE(o.purchaser_name, ''), '_', COALESCE(o.purchaser_tel, ''))
    ) AS customer_key,
    o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount) AS line_sales
  FROM `tiast-data-platform.raw_nextengine.orders` o
  WHERE o.cancel_type_id = '0'
    AND o.row_cancel_flag = '0'
    AND o.receive_order_date IS NOT NULL
),

-- 顧客の初回注文月を特定
customer_first_order AS (
  SELECT
    customer_key,
    MIN(order_month) AS first_order_month
  FROM ne_orders_with_customer
  GROUP BY customer_key
),

-- 受注単位に集約（明細→受注ヘッダ）
order_level AS (
  SELECT
    o.receive_order_id,
    o.order_month,
    o.shop_name,
    o.customer_key,
    SUM(o.line_sales) AS order_sales,
    -- 新規/リピート判定
    CASE
      WHEN o.order_month = cfo.first_order_month THEN '新規'
      ELSE 'リピート'
    END AS customer_type
  FROM ne_orders_with_customer o
  LEFT JOIN customer_first_order cfo ON o.customer_key = cfo.customer_key
  GROUP BY o.receive_order_id, o.order_month, o.shop_name, o.customer_key, cfo.first_order_month
)

SELECT
  order_month,
  shop_name,
  customer_type,
  COUNT(DISTINCT customer_key) AS customer_count,
  SUM(order_sales) AS sales_amount,
  COUNT(DISTINCT receive_order_id) AS order_count
FROM order_level
GROUP BY order_month, shop_name, customer_type
;
