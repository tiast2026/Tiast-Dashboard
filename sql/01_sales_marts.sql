-- ============================================================
-- TIAST Analytics Mart - BigQuery VIEW定義
-- Project: tiast-data-platform
-- Dataset: analytics_mart
--
-- 依存元:
--   raw_nextengine.orders, raw_nextengine.products, raw_nextengine.stock,
--   raw_nextengine.customers, raw_nextengine.stock_io_history,
--   raw_zozo.zozo_orders, raw_zozo.zozo_stock
--
-- 売上計算ロジック:
--   NE:   unit_price × quantity × (total_amount / goods_amount)
--   ZOZO: selling_price × order_quantity
--
-- キャンセル除外:
--   NE:   cancel_type_id = '0' AND row_cancel_flag = '0'
--   ZOZO: cancel_flag = '' OR cancel_flag IS NULL
--
-- ブランド判別: goods_id先頭1文字 n=NOAHL, b=BLACKQUEEN
-- ============================================================


-- ============================================================
-- 1. mart_sales_by_shop_month
--    売上 × 店舗 × 月 の集計
--    使用先: ダッシュボード（KPI, 月別推移, 前年比）
-- ============================================================
CREATE OR REPLACE VIEW `tiast-data-platform.analytics_mart.mart_sales_by_shop_month` AS

WITH ne_sales AS (
  SELECT
    FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS order_month,
    -- 店舗名からshop_name (API側でchannel_groupにマッピング)
    CASE
      WHEN o.receive_order_shop_id = 1 THEN '自社EC'
      WHEN LOWER(COALESCE(o.import_type_name, '')) LIKE '%楽天%' THEN '楽天市場'
      WHEN LOWER(COALESCE(o.import_type_name, '')) LIKE '%yahoo%' THEN 'Yahoo!'
      WHEN LOWER(COALESCE(o.import_type_name, '')) LIKE '%amazon%' THEN 'Amazon'
      WHEN LOWER(COALESCE(o.import_type_name, '')) LIKE '%qoo10%' THEN 'Qoo10'
      ELSE COALESCE(o.import_type_name, 'その他')
    END AS shop_name,
    -- ブランド判別
    CASE
      WHEN LEFT(o.goods_id, 1) = 'n' THEN 'NOAHL'
      WHEN LEFT(o.goods_id, 1) = 'b' THEN 'BLACKQUEEN'
      ELSE 'OTHER'
    END AS shop_brand,
    -- SKU実売上 = unit_price × quantity × (total_amount / goods_amount)
    SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS sales_amount,
    COUNT(DISTINCT o.receive_order_id) AS order_count,
    -- 粗利 = 売上 - 原価
    SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount))
      - SUM(COALESCE(o.received_time_first_cost, 0) * o.quantity) AS gross_profit
  FROM `tiast-data-platform.raw_nextengine.orders` o
  WHERE o.cancel_type_id = '0'
    AND o.row_cancel_flag = '0'
    AND o.receive_order_date IS NOT NULL
  GROUP BY 1, 2, 3
),

zozo_sales AS (
  SELECT
    FORMAT_DATE('%Y-%m', PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10))) AS order_month,
    'ZOZO' AS shop_name,
    CASE
      WHEN LEFT(z.brand_code, 1) = 'n' THEN 'NOAHL'
      WHEN LEFT(z.brand_code, 1) = 'b' THEN 'BLACKQUEEN'
      ELSE 'OTHER'
    END AS shop_brand,
    SUM(z.selling_price * z.order_quantity) AS sales_amount,
    COUNT(DISTINCT z.order_number) AS order_count,
    -- ZOZO原価はNE productsから取得
    SUM(z.selling_price * z.order_quantity)
      - SUM(COALESCE(p.goods_cost_price, 0) * z.order_quantity) AS gross_profit
  FROM `tiast-data-platform.raw_zozo.zozo_orders` z
  LEFT JOIN `tiast-data-platform.raw_nextengine.products` p
    ON z.ne_goods_id = p.goods_id
  WHERE (z.cancel_flag = '' OR z.cancel_flag IS NULL)
    AND z.order_date IS NOT NULL
  GROUP BY 1, 2, 3
)

SELECT * FROM ne_sales
UNION ALL
SELECT * FROM zozo_sales
;


-- ============================================================
-- 2. mart_sales_by_brand_month
--    売上 × ブランド × カテゴリ × 月
--    使用先: ブランド構成比ドーナツ, カテゴリランキング
-- ============================================================
CREATE OR REPLACE VIEW `tiast-data-platform.analytics_mart.mart_sales_by_brand_month` AS

WITH ne_sales AS (
  SELECT
    FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS order_month,
    CASE
      WHEN LEFT(o.goods_id, 1) = 'n' THEN 'NOAHL'
      WHEN LEFT(o.goods_id, 1) = 'b' THEN 'BLACKQUEEN'
      ELSE 'OTHER'
    END AS brand,
    COALESCE(p.goods_merchandise_name, 'その他') AS category,
    SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS sales_amount
  FROM `tiast-data-platform.raw_nextengine.orders` o
  LEFT JOIN `tiast-data-platform.raw_nextengine.products` p
    ON o.goods_id = p.goods_id
  WHERE o.cancel_type_id = '0'
    AND o.row_cancel_flag = '0'
    AND o.receive_order_date IS NOT NULL
  GROUP BY 1, 2, 3
),

zozo_sales AS (
  SELECT
    FORMAT_DATE('%Y-%m', PARSE_DATE('%Y/%m/%d', LEFT(z.order_date, 10))) AS order_month,
    CASE
      WHEN LEFT(z.brand_code, 1) = 'n' THEN 'NOAHL'
      WHEN LEFT(z.brand_code, 1) = 'b' THEN 'BLACKQUEEN'
      ELSE 'OTHER'
    END AS brand,
    COALESCE(z.child_category, z.parent_category, 'その他') AS category,
    SUM(z.selling_price * z.order_quantity) AS sales_amount
  FROM `tiast-data-platform.raw_zozo.zozo_orders` z
  WHERE (z.cancel_flag = '' OR z.cancel_flag IS NULL)
    AND z.order_date IS NOT NULL
  GROUP BY 1, 2, 3
)

SELECT * FROM ne_sales
UNION ALL
SELECT * FROM zozo_sales
;
