-- Scheduled Query: Materialize mart_product_master VIEW into t_product_master table
-- Frequency: Every hour
-- Region: asia-northeast1

CREATE OR REPLACE TABLE
  `tiast-data-platform.analytics_mart.t_product_master`
AS
SELECT * FROM
  `tiast-data-platform.analytics_mart.mart_product_master`;
