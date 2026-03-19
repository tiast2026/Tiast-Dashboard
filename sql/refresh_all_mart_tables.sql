-- Refresh All Mart Tables
-- Materializes all analytics_mart VIEWs (mart_*) into real tables (mart_*)
-- Frequency: Every hour
-- Region: asia-northeast1

CREATE OR REPLACE TABLE
  `tiast-data-platform.analytics_mart.mart_sales_by_brand_month`
AS
SELECT * FROM
  `tiast-data-platform.analytics_mart.mart_sales_by_brand_month`;

CREATE OR REPLACE TABLE
  `tiast-data-platform.analytics_mart.mart_sales_by_shop_month`
AS
SELECT * FROM
  `tiast-data-platform.analytics_mart.mart_sales_by_shop_month`;

CREATE OR REPLACE TABLE
  `tiast-data-platform.analytics_mart.mart_sales_by_product`
AS
SELECT * FROM
  `tiast-data-platform.analytics_mart.mart_sales_by_product`;

CREATE OR REPLACE TABLE
  `tiast-data-platform.analytics_mart.mart_inventory_health`
AS
SELECT * FROM
  `tiast-data-platform.analytics_mart.mart_inventory_health`;

CREATE OR REPLACE TABLE
  `tiast-data-platform.analytics_mart.mart_md_dashboard`
AS
SELECT * FROM
  `tiast-data-platform.analytics_mart.mart_md_dashboard`;

CREATE OR REPLACE TABLE
  `tiast-data-platform.analytics_mart.mart_customer_segments`
AS
SELECT * FROM
  `tiast-data-platform.analytics_mart.mart_customer_segments`;

CREATE OR REPLACE TABLE
  `tiast-data-platform.analytics_mart.mart_product_master`
AS
SELECT * FROM
  `tiast-data-platform.analytics_mart.mart_product_master`;
