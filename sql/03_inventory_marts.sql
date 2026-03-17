-- ============================================================
-- 5. mart_inventory_health
--    在庫健全性分析（SKU単位）
--    使用先: 在庫一覧, 在庫アラート, 商品詳細
-- ============================================================
CREATE OR REPLACE VIEW `tiast-data-platform.analytics_mart.mart_inventory_health` AS

WITH ne_stock AS (
  -- NE在庫（倉庫合算）
  SELECT
    s.goods_id,
    SUM(s.stock_quantity) AS total_stock,
    SUM(s.stock_free_quantity) AS free_stock,
    SUM(COALESCE(s.stock_advance_order_quantity, 0)) AS advance_stock
  FROM `tiast-data-platform.raw_nextengine.stock` s
  GROUP BY s.goods_id
),

zozo_stock AS (
  -- ZOZO在庫
  SELECT
    zs.ne_goods_id AS goods_id,
    SUM(zs.stock_quantity) AS zozo_stock
  FROM `tiast-data-platform.raw_zozo.zozo_stock` zs
  WHERE zs.ne_goods_id IS NOT NULL AND zs.ne_goods_id != ''
  GROUP BY zs.ne_goods_id
),

recent_sales AS (
  -- 直近売上データ（1日/7日/30日）
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
  -- daily_sales: 30日平均を基準
  COALESCE(rs.sales_30day_avg, 0) AS daily_sales,
  -- stock_days: 在庫消化日数
  SAFE_DIVIDE(COALESCE(ns.total_stock, 0), GREATEST(COALESCE(rs.sales_30day_avg, 0), 0.01)) AS stock_days,
  -- season_remaining_days: シーズン残日数（品番末尾YYMMから推定）
  -- 各シーズン終了: 春=6月末, 夏=9月末, 秋=12月末, 冬=3月末
  CAST(NULL AS INT64) AS season_remaining_days,
  -- is_overstock: 在庫消化日数 > 90 で過剰判定
  SAFE_DIVIDE(COALESCE(ns.total_stock, 0), GREATEST(COALESCE(rs.sales_30day_avg, 0), 0.01)) > 90 AS is_overstock,
  -- is_stockout: フリー在庫 <= 0 かつ直近売上あり
  COALESCE(ns.free_stock, 0) <= 0 AND COALESCE(rs.sales_30day_avg, 0) > 0 AS is_stockout,
  -- reorder_judgment
  CASE
    WHEN COALESCE(ns.free_stock, 0) <= 0 AND COALESCE(rs.sales_30day_avg, 0) > 0 THEN '要発注'
    WHEN SAFE_DIVIDE(COALESCE(ns.total_stock, 0), GREATEST(COALESCE(rs.sales_30day_avg, 0), 0.01)) < 14 THEN '発注検討'
    WHEN SAFE_DIVIDE(COALESCE(ns.total_stock, 0), GREATEST(COALESCE(rs.sales_30day_avg, 0), 0.01)) > 90 THEN '発注停止'
    ELSE '適正'
  END AS reorder_judgment,
  -- recommended_discount: 過剰在庫時の推奨値引率
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
-- 6. mart_md_dashboard
--    MD（マーチャンダイジング）ダッシュボード
--    使用先: 在庫一覧, 在庫アラート, 商品詳細
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

-- 直近30日の日販
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

-- 年間売上（回転率計算用）
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

-- 最終入出庫日
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
  -- product_code = 代表品番
  COALESCE(p.goods_representation_id, ps.goods_id) AS product_code,
  p.goods_name,
  CASE
    WHEN LEFT(ps.goods_id, 1) = 'n' THEN 'NOAHL'
    WHEN LEFT(ps.goods_id, 1) = 'b' THEN 'BLACKQUEEN'
    ELSE 'OTHER'
  END AS brand,
  COALESCE(p.goods_merchandise_name, 'その他') AS category,
  -- season推定
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
  -- stock_retail_value: 在庫金額（売価ベース）
  COALESCE(ps.total_stock, 0) * COALESCE(p.goods_selling_price, 0) AS stock_retail_value,
  COALESCE(ds.daily_sales_amount, 0) AS daily_sales,
  -- stock_days
  SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) AS stock_days,
  -- season_remaining_days
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
  -- lifecycle_stance
  CASE
    WHEN COALESCE(ds.daily_qty, 0) = 0 AND COALESCE(ps.total_stock, 0) > 0 THEN '衰退期'
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) > 90 THEN '安定期'
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) < 14 THEN '最盛期'
    ELSE '助走期'
  END AS lifecycle_stance,
  -- inventory_status
  CASE
    WHEN COALESCE(ps.free_stock, 0) <= 0 AND COALESCE(ds.daily_qty, 0) > 0 THEN '欠品'
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) > 90 THEN '過剰'
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) < 14 THEN '不足'
    ELSE '適正'
  END AS inventory_status,
  -- reorder_judgment
  CASE
    WHEN COALESCE(ps.free_stock, 0) <= 0 AND COALESCE(ds.daily_qty, 0) > 0 THEN '要発注'
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) < 14 THEN '発注検討'
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) > 90 THEN '発注停止'
    ELSE '適正'
  END AS reorder_judgment,
  -- recommended_discount
  CASE
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) > 180 THEN 0.30
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) > 90 THEN 0.20
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) > 60 THEN 0.10
    ELSE 0
  END AS recommended_discount,
  -- lifecycle_action
  CASE
    WHEN COALESCE(ps.free_stock, 0) <= 0 AND COALESCE(ds.daily_qty, 0) > 0 THEN '緊急補充'
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) > 180 THEN '値引販売で在庫消化'
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) > 90 THEN '発注抑制・在庫圧縮'
    WHEN SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) < 14 THEN '追加発注を検討'
    ELSE '現状維持'
  END AS lifecycle_action,
  -- is_overstock
  SAFE_DIVIDE(COALESCE(ps.total_stock, 0), GREATEST(COALESCE(ds.daily_qty, 0), 0.01)) > 90 AS is_overstock,
  -- turnover_rate_annual: 年間在庫回転率 = 年間売上原価 / 平均在庫原価
  SAFE_DIVIDE(COALESCE(asales.annual_cogs, 0), COALESCE(ps.total_stock, 0) * COALESCE(p.goods_cost_price, 0)) AS turnover_rate_annual,
  -- turnover_days: 回転日数
  SAFE_DIVIDE(365.0, SAFE_DIVIDE(COALESCE(asales.annual_cogs, 0), COALESCE(ps.total_stock, 0) * COALESCE(p.goods_cost_price, 0))) AS turnover_days,
  -- 最終入出庫日
  lio.last_io_date,
  DATE_DIFF(CURRENT_DATE(), SAFE.PARSE_DATE('%Y-%m-%d', LEFT(lio.last_io_date, 10)), DAY) AS days_since_last_io,
  -- stagnation_alert: 30日以上入出庫なし
  DATE_DIFF(CURRENT_DATE(), SAFE.PARSE_DATE('%Y-%m-%d', LEFT(lio.last_io_date, 10)), DAY) > 30 AS stagnation_alert

FROM product_stock ps
LEFT JOIN `tiast-data-platform.raw_nextengine.products` p ON ps.goods_id = p.goods_id
LEFT JOIN zozo_stock zs ON ps.goods_id = zs.goods_id
LEFT JOIN daily_sales ds ON ps.goods_id = ds.goods_id
LEFT JOIN annual_sales asales ON ps.goods_id = asales.goods_id
LEFT JOIN last_io lio ON ps.goods_id = lio.goods_id
WHERE ps.total_stock > 0
;
