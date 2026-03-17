-- ============================================================
-- raw_nextengine / raw_zozo データセット & テーブル定義
-- BigQueryコンソールで実行してrawテーブルを作成
-- ============================================================

-- ------------------------------------------------------------
-- データセット作成
-- ------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS `tiast-data-platform.raw_nextengine`
  OPTIONS(location = 'asia-northeast1', description = 'ネクストエンジン生データ');

CREATE SCHEMA IF NOT EXISTS `tiast-data-platform.raw_zozo`
  OPTIONS(location = 'asia-northeast1', description = 'ZOZO生データ');


-- ============================================================
-- raw_nextengine.orders
-- ネクストエンジン受注明細
-- ソース: NE API「受注明細一括取得」
-- ============================================================
CREATE TABLE IF NOT EXISTS `tiast-data-platform.raw_nextengine.orders` (
  -- 受注ヘッダ
  receive_order_id             STRING    NOT NULL,   -- 受注伝票番号
  receive_order_row_no         INT64,                -- 明細行番号
  receive_order_date           STRING,               -- 受注日 (YYYY-MM-DD HH:MM:SS)
  receive_order_shop_id        INT64,                -- 店舗ID
  receive_order_shop_cut_form_id STRING,             -- 受注番号（店舗側）
  import_type_name             STRING,               -- 取込種類名（CSV等）

  -- 商品情報
  goods_id                     STRING,               -- 商品コード（SKU）
  goods_name                   STRING,               -- 商品名
  unit_price                   FLOAT64,              -- 単価
  quantity                     INT64,                -- 数量

  -- 金額情報
  total_amount                 FLOAT64,              -- 受注合計金額（税・送料込）
  goods_amount                 FLOAT64,              -- 商品合計金額
  received_time_first_cost     FLOAT64,              -- 受注時原価

  -- キャンセル判定
  cancel_type_id               STRING,               -- キャンセル区分 ('0'=未キャンセル)
  row_cancel_flag              STRING,               -- 明細キャンセルフラグ ('0'=有効)

  -- 購入者情報（顧客分析用）
  purchaser_mail_address       STRING,               -- 購入者メールアドレス
  purchaser_name               STRING,               -- 購入者名
  purchaser_tel                STRING,               -- 購入者電話番号

  -- メタ
  _loaded_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', receive_order_date))
CLUSTER BY goods_id, receive_order_shop_id
OPTIONS(description = 'NE受注明細');


-- ============================================================
-- raw_nextengine.products
-- ネクストエンジン商品マスタ
-- ソース: NE API「商品マスタ一括取得」
-- ============================================================
CREATE TABLE IF NOT EXISTS `tiast-data-platform.raw_nextengine.products` (
  goods_id                     STRING    NOT NULL,   -- 商品コード（SKU）
  goods_representation_id      STRING,               -- 代表商品コード（品番）
  goods_name                   STRING,               -- 商品名
  goods_merchandise_name       STRING,               -- 商品分類名（カテゴリ）
  goods_selling_price          FLOAT64,              -- 販売価格
  goods_cost_price             FLOAT64,              -- 原価
  goods_first_time_sold_date   STRING,               -- 初回販売日
  goods_last_time_sold_date    STRING,               -- 最終販売日

  _loaded_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY goods_representation_id
OPTIONS(description = 'NE商品マスタ');


-- ============================================================
-- raw_nextengine.stock
-- ネクストエンジン在庫
-- ソース: NE API「在庫一括取得」
-- ============================================================
CREATE TABLE IF NOT EXISTS `tiast-data-platform.raw_nextengine.stock` (
  goods_id                     STRING    NOT NULL,   -- 商品コード（SKU）
  warehouse_id                 INT64,                -- 倉庫ID
  stock_quantity               INT64,                -- 在庫数
  stock_free_quantity          INT64,                -- フリー在庫数（出荷可能）
  stock_advance_quantity       INT64,                -- 予約在庫数

  _loaded_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY goods_id
OPTIONS(description = 'NE在庫データ');


-- ============================================================
-- raw_nextengine.stock_io_history
-- ネクストエンジン入出庫履歴
-- ソース: NE API「入出庫履歴一括取得」
-- ============================================================
CREATE TABLE IF NOT EXISTS `tiast-data-platform.raw_nextengine.stock_io_history` (
  goods_id                     STRING    NOT NULL,   -- 商品コード
  io_date                      STRING,               -- 入出庫日 (YYYY-MM-DD)
  io_type                      STRING,               -- 入出庫区分
  quantity                     INT64,                -- 数量
  deleted_flag                 STRING    DEFAULT '0', -- 削除フラグ

  _loaded_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY goods_id
OPTIONS(description = 'NE入出庫履歴');


-- ============================================================
-- raw_zozo.zozo_orders
-- ZOZO受注データ
-- ソース: ZOZOバックオフィス CSV or API
-- ============================================================
CREATE TABLE IF NOT EXISTS `tiast-data-platform.raw_zozo.zozo_orders` (
  order_number                 STRING    NOT NULL,   -- 注文番号
  order_date                   STRING,               -- 注文日 (YYYY/MM/DD HH:MM:SS)
  brand_code                   STRING,               -- ブランドコード
  ne_goods_id                  STRING,               -- NE商品コード（マッピング用）
  ne_goods_representation_id   STRING,               -- NE代表商品コード
  product_name                 STRING,               -- 商品名
  parent_category              STRING,               -- 親カテゴリ
  child_category               STRING,               -- 子カテゴリ
  selling_price                FLOAT64,              -- 販売価格
  proper_price                 FLOAT64,              -- 定価
  order_quantity               INT64,                -- 注文数量
  cancel_flag                  STRING,               -- キャンセルフラグ (''=有効)

  _loaded_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY brand_code, ne_goods_id
OPTIONS(description = 'ZOZO受注データ');


-- ============================================================
-- raw_zozo.zozo_stock
-- ZOZO在庫データ
-- ソース: ZOZOバックオフィス CSV or API
-- ============================================================
CREATE TABLE IF NOT EXISTS `tiast-data-platform.raw_zozo.zozo_stock` (
  ne_goods_id                  STRING,               -- NE商品コード（マッピング用）
  zozo_goods_id                STRING,               -- ZOZO商品ID
  stock_quantity               INT64,                -- 在庫数

  _loaded_at                   TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY ne_goods_id
OPTIONS(description = 'ZOZO在庫データ');
