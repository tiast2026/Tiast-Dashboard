-- ============================================================
-- 3. mart_sales_by_product
--    商品（代表品番）単位の売上集計
--    使用先: 商品分析一覧, 商品詳細ページ
-- ============================================================
CREATE OR REPLACE VIEW `tiast-data-platform.analytics_mart.mart_sales_by_product` AS

WITH ne_product_sales AS (
  SELECT
    -- SKU → 代表品番に集約
    COALESCE(p.goods_representation_id, o.goods_id) AS product_code,
    MAX(p.goods_name) AS product_name,
    CASE
      WHEN LEFT(o.goods_id, 1) = 'n' THEN 'NOAHL'
      WHEN LEFT(o.goods_id, 1) = 'b' THEN 'BLACKQUEEN'
      ELSE 'OTHER'
    END AS brand,
    MAX(COALESCE(p.goods_merchandise_name, 'その他')) AS category,
    -- シーズン推定: 品番末尾のYYMM → 季節判定
    MAX(CASE
      WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, o.goods_id), 2) AS INT64) BETWEEN 1 AND 3 THEN '春'
      WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, o.goods_id), 2) AS INT64) BETWEEN 4 AND 6 THEN '夏'
      WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, o.goods_id), 2) AS INT64) BETWEEN 7 AND 9 THEN '秋'
      WHEN SAFE_CAST(RIGHT(COALESCE(p.goods_representation_id, o.goods_id), 2) AS INT64) BETWEEN 10 AND 12 THEN '冬'
      ELSE ''
    END) AS season,
    -- 価格帯
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

-- NE + ZOZOを代表品番で再集約
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
-- 4. mart_product_master
--    商品マスタ（代表品番単位でSKU集約）
--    使用先: 商品一覧・詳細の画像/SKU数
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
  -- 画像URL: 楽天の商品画像URL推定
  -- (実運用では楽天APIから取得。ここではNULL)
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
