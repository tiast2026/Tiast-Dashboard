-- ============================================================
-- 7. mart_customer_segments
--    顧客セグメント（新規/リピート × 店舗 × 月）
--    使用先: 顧客分析（サマリ, チャネル別, リピート率, 月別推移）
-- ============================================================
CREATE OR REPLACE VIEW `tiast-data-platform.analytics_mart.mart_customer_segments` AS

WITH ne_orders_with_customer AS (
  SELECT
    o.receive_order_id,
    o.receive_order_date,
    FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS order_month,
    -- 店舗名: receive_order_shop_idで判別（NE店舗マスタに基づく）
    CASE o.receive_order_shop_id
      WHEN 1 THEN '公式'
      WHEN 7 THEN '公式'
      WHEN 2 THEN '楽天'
      WHEN 4 THEN '楽天'
      WHEN 10 THEN '楽天'
      WHEN 3 THEN 'SHOPLIST'
      WHEN 5 THEN 'Amazon'
      WHEN 6 THEN 'aupay'
      WHEN 8 THEN 'サステナ'
      WHEN 9 THEN 'Yahoo!'
      WHEN 11 THEN 'Rakuten Fashion'
      WHEN 12 THEN 'TikTok'
      WHEN 13 THEN 'TikTok'
      ELSE CONCAT('その他(', CAST(o.receive_order_shop_id AS STRING), ')')
    END AS shop_name,
    -- 購入者キー（メールアドレス or 購入者名+電話番号でユニーク化）
    COALESCE(
      NULLIF(o.purchaser_mail_address, ''),
      CONCAT(COALESCE(o.purchaser_name, ''), '_', COALESCE(o.purchaser_tel, ''))
    ) AS customer_key,
    CASE
      WHEN LEFT(o.goods_id, 1) = 'n' THEN 'NOAHL'
      WHEN LEFT(o.goods_id, 1) = 'b' THEN 'BLACKQUEEN'
      ELSE 'OTHER'
    END AS shop_brand,
    o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount) AS line_sales
  FROM `tiast-data-platform.raw_nextengine.orders` o
  WHERE CAST(o.cancel_type_id AS STRING) = '0'
    AND CAST(o.row_cancel_flag AS STRING) = '0'
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
    o.shop_brand,
    o.customer_key,
    SUM(o.line_sales) AS order_sales,
    -- 新規/リピート判定
    CASE
      WHEN o.order_month = cfo.first_order_month THEN '新規'
      ELSE 'リピート'
    END AS customer_type
  FROM ne_orders_with_customer o
  LEFT JOIN customer_first_order cfo ON o.customer_key = cfo.customer_key
  GROUP BY o.receive_order_id, o.order_month, o.shop_name, o.shop_brand, o.customer_key, cfo.first_order_month
)

SELECT
  order_month,
  shop_name,
  shop_brand,
  customer_type,
  COUNT(DISTINCT customer_key) AS customer_count,
  SUM(order_sales) AS sales_amount,
  COUNT(DISTINCT receive_order_id) AS order_count
FROM order_level
GROUP BY order_month, shop_name, shop_brand, customer_type
;
