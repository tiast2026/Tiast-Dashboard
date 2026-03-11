-- Scheduled Query: Materialize mart_sales_by_shop_month VIEW into mart_sales_by_shop_month table
-- Frequency: Every hour
-- Region: asia-northeast1

CREATE OR REPLACE TABLE
  `tiast-data-platform.analytics_mart.mart_sales_by_shop_month`
AS
SELECT * FROM
  `tiast-data-platform.analytics_mart.mart_sales_by_shop_month`;
