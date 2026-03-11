#!/usr/bin/env bash
# ============================================================
# BigQuery初期セットアップスクリプト
#
# 実行順序:
#   1. このスクリプト（データセット + テーブル + VIEW作成）
#   2. import-csv-to-bigquery.sh（データ投入）
#
# 使い方:
#   ./scripts/setup-bigquery.sh
# ============================================================

set -euo pipefail

PROJECT="tiast-data-platform"
SQL_DIR="$(cd "$(dirname "$0")/../sql" && pwd)"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

run_sql() {
  local file="$1"
  local desc="$2"
  log_info "${desc}: $(basename "$file")"
  bq query \
    --project_id="${PROJECT}" \
    --use_legacy_sql=false \
    --location=asia-northeast1 \
    < "$file"
}

main() {
  if ! command -v bq &> /dev/null; then
    log_error "bqコマンドが見つかりません。Google Cloud SDKをインストールしてください。"
    exit 1
  fi

  echo "=== TIAST BigQuery セットアップ ==="
  echo "プロジェクト: ${PROJECT}"
  echo ""

  # Step 1: rawテーブル作成
  run_sql "${SQL_DIR}/10_create_raw_tables.sql" "rawテーブル作成"
  echo ""

  # Step 2: analytics_mart データセット作成
  run_sql "${SQL_DIR}/00_create_dataset.sql" "analytics_martデータセット作成"
  echo ""

  # Step 3: mart VIEW作成
  for f in 01 02 03 04; do
    run_sql "${SQL_DIR}/${f}_"*.sql "mart VIEW作成"
    echo ""
  done

  log_info "=== セットアップ完了 ==="
  echo ""
  log_info "次のステップ:"
  echo "  1. data/ ディレクトリにCSVファイルを配置"
  echo "  2. ./scripts/import-csv-to-bigquery.sh を実行"
  echo "  3. Vercelの環境変数にGOOGLE_APPLICATION_CREDENTIALS_JSONを設定"
}

main "$@"
