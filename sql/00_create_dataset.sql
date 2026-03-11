-- ============================================================
-- analytics_mart データセット作成
-- BigQueryコンソールで最初に1回実行
-- ============================================================

CREATE SCHEMA IF NOT EXISTS `tiast-data-platform.analytics_mart`
  OPTIONS(
    location = 'asia-northeast1',
    description = 'TIAST分析用マートテーブル（VIEWs）'
  );


-- ============================================================
-- 実行順序:
--   1. 00_create_dataset.sql  (このファイル)
--   2. 01_sales_marts.sql     (t_sales_by_shop_month, t_sales_by_brand_month)
--   3. 02_product_marts.sql   (t_sales_by_product, t_product_master)
--   4. 03_inventory_marts.sql (t_inventory_health, t_md_dashboard)
--   5. 04_customer_marts.sql  (t_customer_segments)
--
-- 全てVIEWなのでデータ複製コスト = 0
-- raw_*テーブルが更新されると自動的に最新値が反映
-- ============================================================
