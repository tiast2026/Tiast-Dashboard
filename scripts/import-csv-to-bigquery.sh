#!/usr/bin/env bash
# ============================================================
# CSVファイルをBigQueryのrawテーブルにインポートするスクリプト
#
# 前提条件:
#   1. gcloud CLI がインストール済み
#   2. gcloud auth login 済み
#   3. sql/10_create_raw_tables.sql でテーブル作成済み
#
# 使い方:
#   # 全テーブル一括インポート（data/ ディレクトリにCSV配置）
#   ./scripts/import-csv-to-bigquery.sh
#
#   # 個別テーブルのインポート
#   ./scripts/import-csv-to-bigquery.sh orders data/ne_orders.csv
#
# CSVファイル名規約（data/ ディレクトリに配置）:
#   ne_orders.csv          → raw_nextengine.orders
#   ne_products.csv        → raw_nextengine.products
#   ne_stock.csv           → raw_nextengine.stock
#   ne_stock_io_history.csv → raw_nextengine.stock_io_history
#   zozo_orders.csv        → raw_zozo.zozo_orders
#   zozo_stock.csv         → raw_zozo.zozo_stock
# ============================================================

set -euo pipefail

PROJECT="tiast-data-platform"
DATA_DIR="${DATA_DIR:-./data}"

# カラー出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# --- テーブルマッピング ---
declare -A TABLE_MAP=(
  ["ne_orders"]="raw_nextengine.orders"
  ["ne_products"]="raw_nextengine.products"
  ["ne_stock"]="raw_nextengine.stock"
  ["ne_stock_io_history"]="raw_nextengine.stock_io_history"
  ["zozo_orders"]="raw_zozo.zozo_orders"
  ["zozo_stock"]="raw_zozo.zozo_stock"
)

# --- 1ファイルをインポート ---
import_csv() {
  local csv_file="$1"
  local table="$2"

  if [[ ! -f "$csv_file" ]]; then
    log_warn "ファイルが見つかりません: $csv_file (スキップ)"
    return 0
  fi

  local row_count
  row_count=$(wc -l < "$csv_file")
  row_count=$((row_count - 1))  # ヘッダー行を除く

  log_info "インポート中: $csv_file → ${PROJECT}.${table} (${row_count}行)"

  bq load \
    --project_id="${PROJECT}" \
    --source_format=CSV \
    --skip_leading_rows=1 \
    --allow_quoted_newlines \
    --replace \
    --location=asia-northeast1 \
    "${table}" \
    "$csv_file"

  if [[ $? -eq 0 ]]; then
    log_info "完了: ${table} (${row_count}行)"
  else
    log_error "失敗: ${table}"
    return 1
  fi
}

# --- メイン処理 ---
main() {
  # gcloud確認
  if ! command -v bq &> /dev/null; then
    log_error "bqコマンドが見つかりません。Google Cloud SDKをインストールしてください。"
    log_info "  → https://cloud.google.com/sdk/docs/install"
    exit 1
  fi

  # 個別テーブル指定の場合
  if [[ $# -ge 2 ]]; then
    local table_key="$1"
    local csv_file="$2"
    if [[ -z "${TABLE_MAP[$table_key]+x}" ]]; then
      log_error "不明なテーブルキー: $table_key"
      log_info "有効なキー: ${!TABLE_MAP[*]}"
      exit 1
    fi
    import_csv "$csv_file" "${TABLE_MAP[$table_key]}"
    exit 0
  fi

  # 一括インポート
  log_info "=== BigQuery rawテーブル一括インポート ==="
  log_info "データディレクトリ: ${DATA_DIR}"
  echo ""

  local success=0
  local skipped=0
  local failed=0

  for key in "${!TABLE_MAP[@]}"; do
    local csv_file="${DATA_DIR}/${key}.csv"
    if [[ -f "$csv_file" ]]; then
      if import_csv "$csv_file" "${TABLE_MAP[$key]}"; then
        ((success++))
      else
        ((failed++))
      fi
    else
      log_warn "スキップ: ${csv_file} (ファイルなし)"
      ((skipped++))
    fi
    echo ""
  done

  log_info "=== 完了 ==="
  log_info "成功: ${success}, スキップ: ${skipped}, 失敗: ${failed}"

  if [[ $success -eq 0 ]]; then
    echo ""
    log_warn "CSVファイルが見つかりませんでした。"
    log_info "data/ ディレクトリに以下のCSVを配置してください:"
    for key in "${!TABLE_MAP[@]}"; do
      echo "  ${DATA_DIR}/${key}.csv  →  ${TABLE_MAP[$key]}"
    done
  fi
}

main "$@"
