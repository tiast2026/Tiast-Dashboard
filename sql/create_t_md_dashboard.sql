-- Scheduled Query: Materialize mart_md_dashboard VIEW into t_md_dashboard table
-- Frequency: Every hour
-- Region: asia-northeast1

CREATE OR REPLACE TABLE
  `tiast-data-platform.analytics_mart.t_md_dashboard`
AS
SELECT * FROM
  `tiast-data-platform.analytics_mart.mart_md_dashboard`;
