-- ============================================================
-- TIAST Analytics Mart - 一括セットアップSQL
-- BigQueryコンソールで実行してください
--
-- 実行手順:
--   1. BigQueryコンソールでリージョンをasia-northeast1に設定
--   2. このファイルの内容をコピペして実行
--   3. エラーが出る場合はセクションごとに分けて実行
--
-- 注意: 各CREATE OR REPLACE VIEWは独立して実行可能です
-- ============================================================


-- ============================================================
-- STEP 0: データセット作成
-- ============================================================
CREATE SCHEMA IF NOT EXISTS `tiast-data-platform.analytics_mart`
  OPTIONS(
    location = 'asia-northeast1',
    description = 'TIAST分析用マートテーブル（VIEWs）'
  );


-- ============================================================
-- STEP 1: mart_sales_by_shop_month
--   売上 × 店舗 × 月 の集計
-- ============================================================
CREATE OR REPLACE VIEW `tiast-data-platform.analytics_mart.mart_sales_by_shop_month` AS

WITH ne_sales AS (
  SELECT
    FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS order_month,
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
    CASE
      WHEN LEFT(o.goods_id, 1) = 'n' THEN 'NOAHL'
      WHEN LEFT(o.goods_id, 1) = 'b' THEN 'BLACKQUEEN'
      ELSE 'OTHER'
    END AS shop_brand,
    SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS sales_amount,
    COUNT(DISTINCT o.receive_order_id) AS order_count,
    SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount))
      - SUM(COALESCE(o.received_time_first_cost, 0) * o.quantity) AS gross_profit
  FROM `tiast-data-platform.raw_nextengine.orders` o
  WHERE CAST(o.cancel_type_id AS STRING) = '0'
    AND CAST(o.row_cancel_flag AS STRING) = '0'
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
-- STEP 2: mart_sales_by_brand_month
--   売上 × ブランド × カテゴリ × 月
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
  WHERE CAST(o.cancel_type_id AS STRING) = '0'
    AND CAST(o.row_cancel_flag AS STRING) = '0'
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


-- ============================================================
-- STEP 3: mart_sales_by_product
--   商品（代表品番）単位の売上集計
-- ============================================================
CREATE OR REPLACE VIEW `tiast-data-platform.analytics_mart.mart_sales_by_product` AS

WITH ne_product_sales AS (
  SELECT
    COALESCE(p.goods_representation_id, o.goods_id) AS product_code,
    MAX(p.goods_name) AS product_name,
    CASE
      WHEN LEFT(o.goods_id, 1) = 'n' THEN 'NOAHL'
      WHEN LEFT(o.goods_id, 1) = 'b' THEN 'BLACKQUEEN'
      ELSE 'OTHER'
    END AS brand,
    MAX(COALESCE(p.goods_merchandise_name, 'その他')) AS category,
    MAX(CASE
      WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, o.goods_id), 2) AS INT64) BETWEEN 1 AND 3 THEN '春'
      WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, o.goods_id), 2) AS INT64) BETWEEN 4 AND 6 THEN '夏'
      WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, o.goods_id), 2) AS INT64) BETWEEN 7 AND 9 THEN '秋'
      WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, o.goods_id), 2) AS INT64) BETWEEN 10 AND 12 THEN '冬'
      ELSE ''
    END) AS season,
    MAX(CASE
      WHEN p.goods_selling_price < 3000 THEN '~3,000'
      WHEN p.goods_selling_price < 5000 THEN '3,000~5,000'
      WHEN p.goods_selling_price < 8000 THEN '5,000~8,000'
      WHEN p.goods_selling_price < 10000 THEN '8,000~10,000'
      ELSE '10,000~'
    END) AS price_tier,
    MAX(p.goods_selling_price) AS selling_price,
    MAX(p.goods_cost_price) AS cost_price,
    SUM(o.quantity) AS total_quantity,
    COUNT(DISTINCT o.receive_order_id) AS order_count,
    SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) AS sales_amount,
    SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount))
      - SUM(COALESCE(o.received_time_first_cost, 0) * o.quantity) AS gross_profit,
    SAFE_DIVIDE(
      SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount))
        - SUM(COALESCE(o.received_time_first_cost, 0) * o.quantity),
      SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount))
    ) AS gross_profit_rate
  FROM `tiast-data-platform.raw_nextengine.orders` o
  LEFT JOIN `tiast-data-platform.raw_nextengine.products` p
    ON o.goods_id = p.goods_id
  WHERE CAST(o.cancel_type_id AS STRING) = '0'
    AND CAST(o.row_cancel_flag AS STRING) = '0'
    AND o.receive_order_date IS NOT NULL
  GROUP BY 1, 3
),

zozo_product_sales AS (
  SELECT
    COALESCE(z.ne_goods_representation_id, z.brand_code) AS product_code,
    MAX(z.product_name) AS product_name,
    CASE
      WHEN LEFT(z.brand_code, 1) = 'n' THEN 'NOAHL'
      WHEN LEFT(z.brand_code, 1) = 'b' THEN 'BLACKQUEEN'
      ELSE 'OTHER'
    END AS brand,
    MAX(COALESCE(z.child_category, z.parent_category, 'その他')) AS category,
    '' AS season,
    '' AS price_tier,
    MAX(z.proper_price) AS selling_price,
    0 AS cost_price,
    SUM(z.order_quantity) AS total_quantity,
    COUNT(DISTINCT z.order_number) AS order_count,
    SUM(z.selling_price * z.order_quantity) AS sales_amount,
    0 AS gross_profit,
    0 AS gross_profit_rate
  FROM `tiast-data-platform.raw_zozo.zozo_orders` z
  WHERE (z.cancel_flag = '' OR z.cancel_flag IS NULL)
    AND z.order_date IS NOT NULL
  GROUP BY 1, 3
)

SELECT
  product_code,
  MAX(product_name) AS product_name,
  MAX(brand) AS brand,
  MAX(category) AS category,
  MAX(season) AS season,
  MAX(price_tier) AS price_tier,
  MAX(selling_price) AS selling_price,
  MAX(cost_price) AS cost_price,
  SUM(total_quantity) AS total_quantity,
  SUM(order_count) AS order_count,
  SUM(sales_amount) AS sales_amount,
  SUM(gross_profit) AS gross_profit,
  SAFE_DIVIDE(SUM(gross_profit), SUM(sales_amount)) AS gross_profit_rate
FROM (
  SELECT * FROM ne_product_sales
  UNION ALL
  SELECT * FROM zozo_product_sales
)
GROUP BY product_code
;


-- ============================================================
-- STEP 4: mart_product_master
--   商品マスタ（代表品番単位でSKU集約）
-- ============================================================
CREATE OR REPLACE VIEW `tiast-data-platform.analytics_mart.mart_product_master` AS

SELECT
  goods_representation_id AS product_code,
  MAX(goods_name) AS product_name,
  CASE
    WHEN LEFT(goods_representation_id, 1) = 'n' THEN 'NOAHL'
    WHEN LEFT(goods_representation_id, 1) = 'b' THEN 'BLACKQUEEN'
    ELSE 'OTHER'
  END AS brand,
  CAST(NULL AS STRING) AS image_url,
  MIN(goods_first_time_sold_date) AS sales_start_date,
  MAX(goods_last_time_sold_date) AS sales_end_date,
  COUNT(DISTINCT goods_id) AS sku_count,
  MAX(goods_selling_price) AS selling_price,
  MAX(goods_cost_price) AS cost_price,
  MAX(goods_merchandise_name) AS category
FROM `tiast-data-platform.raw_nextengine.products` p
WHERE goods_representation_id IS NOT NULL
  AND goods_representation_id != ''
GROUP BY goods_representation_id
;


-- ============================================================
-- STEP 5: mart_inventory_health
--   在庫健全性分析（SKU単位）
-- ============================================================
CREATE OR REPLACE VIEW `tiast-data-platform.analytics_mart.mart_inventory_health` AS

WITH ne_stock AS (
  SELECT
    s.goods_id,
    SUM(s.stock_quantity) AS total_stock,
    SUM(s.stock_free_quantity) AS free_stock,
    SUM(COALESCE(s.stock_advance_order_quantity, 0)) AS advance_stock
  FROM `tiast-data-platform.raw_nextengine.stock` s
  GROUP BY s.goods_id
),

zozo_stock AS (
  SELECT
    zs.ne_goods_id AS goods_id,
    SUM(zs.stock_quantity) AS zozo_stock
  FROM `tiast-data-platform.raw_zozo.zozo_stock` zs
  WHERE zs.ne_goods_id IS NOT NULL AND zs.ne_goods_id != ''
  GROUP BY zs.ne_goods_id
),

recent_sales AS (
  SELECT
    o.goods_id,
    COUNTIF(PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)) * 1.0 AS sales_1day_qty,
    COUNTIF(PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)) * 1.0 / 7 AS sales_7day_avg,
    COUNTIF(PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)) * 1.0 / 30 AS sales_30day_avg,
    SUM(IF(
      PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY),
      o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount), 0
    )) AS sales_1day,
    SUM(IF(
      PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY),
      o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount), 0
    )) / 7 AS sales_7days,
    SUM(IF(
      PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY),
      o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount), 0
    )) / 30 AS sales_30days
  FROM `tiast-data-platform.raw_nextengine.orders` o
  WHERE CAST(o.cancel_type_id AS STRING) = '0'
    AND CAST(o.row_cancel_flag AS STRING) = '0'
    AND o.receive_order_date IS NOT NULL
    AND PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  GROUP BY o.goods_id
)

SELECT
  ns.goods_id,
  p.goods_name,
  COALESCE(ns.total_stock, 0) AS total_stock,
  COALESCE(ns.free_stock, 0) AS free_stock,
  COALESCE(ns.advance_stock, 0) AS advance_stock,
  COALESCE(zs.zozo_stock, 0) AS zozo_stock,
  COALESCE(ns.total_stock, 0) - COALESCE(zs.zozo_stock, 0) AS own_stock,
  COALESCE(rs.sales_1day, 0) AS sales_1day,
  COALESCE(rs.sales_7days, 0) AS sales_7days,
  COALESCE(rs.sales_30days, 0) AS sales_30days,
  COALESCE(rs.sales_30day_avg, 0) AS daily_sales,
  SAFE_DIVIDE(COALESCE(ns.total_stock, 0), GREATEST(COALESCE(rs.sales_30day_avg, 0), 0.01)) AS stock_days,
  CAST(NULL AS INT64) AS season_remaining_days,
  SAFE_DIVIDE(COALESCE(ns.total_stock, 0), GREATEST(COALESCE(rs.sales_30day_avg, 0), 0.01)) > 90 AS is_overstock,
  COALESCE(ns.free_stock, 0) <= 0 AND COALESCE(rs.sales_30day_avg, 0) > 0 AS is_stockout,
  CASE
    WHEN COALESCE(ns.free_stock, 0) <= 0 AND COALESCE(rs.sales_30day_avg, 0) > 0 THEN '要発注'
    WHEN SAFE_DIVIDE(COALESCE(ns.total_stock, 0), GREATEST(COALESCE(rs.sales_30day_avg, 0), 0.01)) < 14 THEN '発注検討'
    WHEN SAFE_DIVIDE(COALESCE(ns.total_stock, 0), GREATEST(COALESCE(rs.sales_30day_avg, 0), 0.01)) > 90 THEN '発注停止'
    ELSE '適正'
  END AS reorder_judgment,
  CASE
    WHEN SAFE_DIVIDE(COALESCE(ns.total_stock, 0), GREATEST(COALESCE(rs.sales_30day_avg, 0), 0.01)) > 180 THEN 0.30
    WHEN SAFE_DIVIDE(COALESCE(ns.total_stock, 0), GREATEST(COALESCE(rs.sales_30day_avg, 0), 0.01)) > 90 THEN 0.20
    WHEN SAFE_DIVIDE(COALESCE(ns.total_stock, 0), GREATEST(COALESCE(rs.sales_30day_avg, 0), 0.01)) > 60 THEN 0.10
    ELSE 0
  END AS recommended_discount,
  p.goods_selling_price AS selling_price,
  p.goods_cost_price AS cost_price
FROM ne_stock ns
LEFT JOIN `tiast-data-platform.raw_nextengine.products` p ON ns.goods_id = p.goods_id
LEFT JOIN zozo_stock zs ON ns.goods_id = zs.goods_id
LEFT JOIN recent_sales rs ON ns.goods_id = rs.goods_id
WHERE ns.total_stock > 0
;


-- ============================================================
-- STEP 6: mart_md_dashboard
--   MD（マーチャンダイジング）ダッシュボード
-- ============================================================
CREATE OR REPLACE VIEW `tiast-data-platform.analytics_mart.mart_md_dashboard` AS

WITH product_stock AS (
  SELECT
    s.goods_id,
    SUM(s.stock_quantity) AS total_stock,
    SUM(s.stock_free_quantity) AS free_stock,
    SUM(COALESCE(s.stock_advance_order_quantity, 0)) AS advance_stock
  FROM `tiast-data-platform.raw_nextengine.stock` s
  GROUP BY s.goods_id
),

zozo_stock AS (
  SELECT
    zs.ne_goods_id AS goods_id,
    SUM(zs.stock_quantity) AS zozo_stock
  FROM `tiast-data-platform.raw_zozo.zozo_stock` zs
  WHERE zs.ne_goods_id IS NOT NULL AND zs.ne_goods_id != ''
  GROUP BY zs.ne_goods_id
),

daily_sales AS (
  SELECT
    o.goods_id,
    SUM(o.quantity) * 1.0 / 30 AS daily_qty,
    SUM(o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount)) / 30 AS daily_sales_amount
  FROM `tiast-data-platform.raw_nextengine.orders` o
  WHERE CAST(o.cancel_type_id AS STRING) = '0'
    AND CAST(o.row_cancel_flag AS STRING) = '0'
    AND PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  GROUP BY o.goods_id
),

annual_sales AS (
  SELECT
    o.goods_id,
    SUM(COALESCE(o.received_time_first_cost, 0) * o.quantity) AS annual_cogs
  FROM `tiast-data-platform.raw_nextengine.orders` o
  WHERE CAST(o.cancel_type_id AS STRING) = '0'
    AND CAST(o.row_cancel_flag AS STRING) = '0'
    AND PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10)) >= DATE_SUB(CURRENT_DATE(), INTERVAL 365 DAY)
  GROUP BY o.goods_id
),

last_io AS (
  SELECT
    goods_id,
    MAX(io_date) AS last_io_date
  FROM `tiast-data-platform.raw_nextengine.stock_io_history`
  WHERE CAST(deleted_flag AS STRING) = '0'
  GROUP BY goods_id
)

SELECT
  ps.goods_id,
  COALESCE(p.goods_representation_id, ps.goods_id) AS product_code,
  p.goods_name,
  CASE
    WHEN LEFT(ps.goods_id, 1) = 'n' THEN 'NOAHL'
    WHEN LEFT(ps.goods_id, 1) = 'b' THEN 'BLACKQUEEN'
    ELSE 'OTHER'
  END AS brand,
  COALESCE(p.goods_merchandise_name, 'その他') AS category,
  CASE
    WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, ps.goods_id), 2) AS INT64) BETWEEN 1 AND 3 THEN '春'
    WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, ps.goods_id), 2) AS INT64) BETWEEN 4 AND 6 THEN '夏'
    WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, ps.goods_id), 2) AS INT64) BETWEEN 7 AND 9 THEN '秋'
    WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, ps.goods_id), 2) AS INT64) BETWEEN 10 AND 12 THEN '冬'
    ELSE ''
  END AS season,
  COALESCE(ps.total_stock, 0) AS total_stock,
  COALESCE(ps.free_stock, 0) AS free_stock,
  COALESCE(ps.advance_stock, 0) AS advance_stock,
  COALESCE(zs.zozo_stock, 0) AS zozo_stock,
  COALESCE(ps.total_stock, 0) - COALESCE(zs.zozo_stock, 0) AS own_stock,
  COALESCE(ps.total_stock, 0) * COALESCE(p.goods_selling_price, 0) AS stock_retail_value,
  COALESCE(ds.daily_sales_amount, 0) AS daily_sales,
  SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) AS stock_days,
  CASE
    WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, ps.goods_id), 2) AS INT64) BETWEEN 1 AND 3
      THEN DATE_DIFF(DATE(EXTRACT(YEAR FROM CURRENT_DATE()), 6, 30), CURRENT_DATE(), DAY)
    WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, ps.goods_id), 2) AS INT64) BETWEEN 4 AND 6
      THEN DATE_DIFF(DATE(EXTRACT(YEAR FROM CURRENT_DATE()), 9, 30), CURRENT_DATE(), DAY)
    WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, ps.goods_id), 2) AS INT64) BETWEEN 7 AND 9
      THEN DATE_DIFF(DATE(EXTRACT(YEAR FROM CURRENT_DATE()), 12, 31), CURRENT_DATE(), DAY)
    WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, ps.goods_id), 2) AS INT64) BETWEEN 10 AND 12
      THEN DATE_DIFF(DATE(EXTRACT(YEAR FROM CURRENT_DATE()) + 1, 3, 31), CURRENT_DATE(), DAY)
    ELSE NULL
  END AS season_remaining_days,
  CASE
    WHEN COALESCE(ds.daily_qty, 0) = 0 AND COALESCE(ps.total_stock, 0) > 0 THEN '衰退期'
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) > 90 THEN '安定期'
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) < 14 THEN '最盛期'
    ELSE '助走期'
  END AS lifecycle_stance,
  CASE
    WHEN COALESCE(ps.free_stock, 0) <= 0 AND COALESCE(ds.daily_qty, 0) > 0 THEN '欠品'
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) > 90 THEN '過剰'
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) < 14 THEN '不足'
    ELSE '適正'
  END AS inventory_status,
  CASE
    WHEN COALESCE(ps.free_stock, 0) <= 0 AND COALESCE(ds.daily_qty, 0) > 0 THEN '要発注'
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) < 14 THEN '発注検討'
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) > 90 THEN '発注停止'
    ELSE '適正'
  END AS reorder_judgment,
  CASE
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) > 180 THEN 0.30
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) > 90 THEN 0.20
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) > 60 THEN 0.10
    ELSE 0
  END AS recommended_discount,
  CASE
    WHEN COALESCE(ps.free_stock, 0) <= 0 AND COALESCE(ds.daily_qty, 0) > 0 THEN '緊急補充'
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) > 180 THEN '値引販売で在庫消化'
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) > 90 THEN '発注抑制・在庫圧縮'
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) < 14 THEN '追加発注を検討'
    ELSE '現状維持'
  END AS lifecycle_action,
  SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) > 90 AS is_overstock,
  SAFE_DIVIDE(COALESCE(asales.annual_cogs, 0), COALESCE(ps.total_stock, 0) * COALESCE(p.goods_cost_price, 0)) AS turnover_rate_annual,
  SAFE_DIVIDE(365.0, SAFE_DIVIDE(COALESCE(asales.annual_cogs, 0), COALESCE(ps.total_stock, 0) * COALESCE(p.goods_cost_price, 0))) AS turnover_days,
  lio.last_io_date,
  DATE_DIFF(CURRENT_DATE(), SAFE.PARSE_DATE('%Y-%m-%d', LEFT(lio.last_io_date, 10)), DAY) AS days_since_last_io,
  DATE_DIFF(CURRENT_DATE(), SAFE.PARSE_DATE('%Y-%m-%d', LEFT(lio.last_io_date, 10)), DAY) > 30 AS stagnation_alert

FROM product_stock ps
LEFT JOIN `tiast-data-platform.raw_nextengine.products` p ON ps.goods_id = p.goods_id
LEFT JOIN zozo_stock zs ON ps.goods_id = zs.goods_id
LEFT JOIN daily_sales ds ON ps.goods_id = ds.goods_id
LEFT JOIN annual_sales asales ON ps.goods_id = asales.goods_id
LEFT JOIN last_io lio ON ps.goods_id = lio.goods_id
WHERE ps.total_stock > 0
;


-- ============================================================
-- STEP 7: mart_customer_segments
--   顧客セグメント（新規/リピート × 店舗 × 月）
-- ============================================================
CREATE OR REPLACE VIEW `tiast-data-platform.analytics_mart.mart_customer_segments` AS

WITH ne_orders_with_customer AS (
  SELECT
    o.receive_order_id,
    o.receive_order_date,
    FORMAT_DATE('%Y-%m', PARSE_DATE('%Y-%m-%d', LEFT(o.receive_order_date, 10))) AS order_month,
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
    CASE
      WHEN LEFT(o.goods_id, 1) = 'n' THEN 'NOAHL'
      WHEN LEFT(o.goods_id, 1) = 'b' THEN 'BLACKQUEEN'
      ELSE 'OTHER'
    END AS shop_brand,
    COALESCE(
      NULLIF(o.purchaser_mail_address, ''),
      CONCAT(COALESCE(o.purchaser_name, ''), '_', COALESCE(o.purchaser_tel, ''))
    ) AS customer_key,
    o.unit_price * o.quantity * SAFE_DIVIDE(o.total_amount, o.goods_amount) AS line_sales
  FROM `tiast-data-platform.raw_nextengine.orders` o
  WHERE CAST(o.cancel_type_id AS STRING) = '0'
    AND CAST(o.row_cancel_flag AS STRING) = '0'
    AND o.receive_order_date IS NOT NULL
),

customer_first_order AS (
  SELECT
    customer_key,
    MIN(order_month) AS first_order_month
  FROM ne_orders_with_customer
  GROUP BY customer_key
),

order_level AS (
  SELECT
    o.receive_order_id,
    o.order_month,
    o.shop_name,
    o.shop_brand,
    o.customer_key,
    SUM(o.line_sales) AS order_sales,
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
