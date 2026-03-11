-- Scheduled Query: Materialize mart_customer_segments VIEW into t_customer_segments table
-- Frequency: Every hour
-- Region: asia-northeast1

CREATE OR REPLACE TABLE
  `tiast-data-platform.analytics_mart.t_customer_segments`
AS
SELECT * FROM
  `tiast-data-platform.analytics_mart.mart_customer_segments`;
