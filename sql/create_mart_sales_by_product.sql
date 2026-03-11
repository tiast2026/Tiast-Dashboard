-- Scheduled Query: Materialize mart_sales_by_product VIEW into mart_sales_by_product table
-- Frequency: Every hour
-- Region: asia-northeast1

CREATE OR REPLACE TABLE
  `tiast-data-platform.analytics_mart.mart_sales_by_product`
AS
SELECT * FROM
  `tiast-data-platform.analytics_mart.mart_sales_by_product`;
