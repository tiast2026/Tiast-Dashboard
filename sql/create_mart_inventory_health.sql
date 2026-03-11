-- Scheduled Query: Materialize mart_inventory_health VIEW into mart_inventory_health table
-- Frequency: Every hour
-- Region: asia-northeast1

CREATE OR REPLACE TABLE
  `tiast-data-platform.analytics_mart.mart_inventory_health`
AS
SELECT * FROM
  `tiast-data-platform.analytics_mart.mart_inventory_health`;
