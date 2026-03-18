#!/bin/bash
# ============================================================
# TIAST Dashboard セットアップスクリプト
# 環境変数の設定とBigQueryテーブル作成を自動化
# ============================================================

set -e

ENV_FILE=".env.local"
ENV_EXAMPLE=".env.local.example"
SQL_DIR="sql"

echo "======================================"
echo "  TIAST Dashboard セットアップ"
echo "======================================"
echo ""

# ----- 1. .env.local の作成 -----
if [ -f "$ENV_FILE" ]; then
  echo "[1/4] .env.local は既に存在します"
  echo "      上書きしますか？ (y/N)"
  read -r overwrite
  if [ "$overwrite" != "y" ] && [ "$overwrite" != "Y" ]; then
    echo "      スキップします"
    SKIP_ENV=true
  fi
fi

if [ "${SKIP_ENV}" != "true" ]; then
  echo "[1/4] .env.local を設定します"
  echo ""

  # NEXTAUTH_SECRET 自動生成
  NEXTAUTH_SECRET=$(openssl rand -base64 32)
  echo "  NEXTAUTH_SECRET を自動生成しました"

  # CRON_SECRET 自動生成
  CRON_SECRET=$(openssl rand -hex 16)
  echo "  CRON_SECRET を自動生成しました"

  # GCP サービスアカウントJSON
  echo ""
  echo "  --- GCP サービスアカウント設定 ---"
  echo "  JSONキーファイルのパスを入力してください"
  echo "  (GCP Console → IAM → サービスアカウント → 鍵を作成 で取得)"
  echo "  パス (空欄でスキップ): "
  read -r GCP_KEY_PATH

  GCP_JSON=""
  if [ -n "$GCP_KEY_PATH" ] && [ -f "$GCP_KEY_PATH" ]; then
    # JSONファイルを1行に変換
    GCP_JSON=$(cat "$GCP_KEY_PATH" | tr -d '\n' | tr -s ' ')
    echo "  サービスアカウントJSON を読み込みました"
  elif [ -n "$GCP_KEY_PATH" ]; then
    echo "  警告: ファイルが見つかりません: $GCP_KEY_PATH"
    echo "  手動で .env.local を編集してください"
  fi

  # 楽天API
  echo ""
  echo "  --- 楽天API設定 ---"
  echo "  楽天アプリIDを入力してください"
  echo "  (https://webservice.rakuten.co.jp/ で無料取得可能)"
  echo "  アプリID (空欄でスキップ): "
  read -r RAKUTEN_APP_ID

  # ログインユーザー設定
  echo ""
  echo "  --- ログインユーザー設定 ---"
  echo "  メールアドレス (default: admin@tiast.jp): "
  read -r LOGIN_EMAIL
  LOGIN_EMAIL=${LOGIN_EMAIL:-admin@tiast.jp}

  echo "  パスワード (default: ランダム生成): "
  read -r LOGIN_PASS
  if [ -z "$LOGIN_PASS" ]; then
    LOGIN_PASS=$(openssl rand -base64 12)
    echo "  パスワードを自動生成しました: $LOGIN_PASS"
  fi

  # Googleスプレッドシート
  echo ""
  echo "  --- Googleスプレッドシート設定 (任意) ---"
  echo "  スプレッドシートID (空欄でスキップ): "
  read -r SPREADSHEET_ID
  echo "  シート名 (default: ダッシュボード用): "
  read -r SHEET_NAME
  SHEET_NAME=${SHEET_NAME:-ダッシュボード用}

  # .env.local を書き出し
  cat > "$ENV_FILE" << ENVEOF
# GCP BigQuery サービスアカウント
GOOGLE_APPLICATION_CREDENTIALS_JSON=${GCP_JSON}

# Googleスプレッドシート連携
GOOGLE_SPREADSHEET_ID=${SPREADSHEET_ID}
GOOGLE_SHEET_NAME=${SHEET_NAME}

# NextAuth 認証
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_USERS=${LOGIN_EMAIL}:${LOGIN_PASS}

# 楽天ランキングAPI
RAKUTEN_APP_ID=${RAKUTEN_APP_ID}

# 定期実行用シークレット（Vercel Cron）
CRON_SECRET=${CRON_SECRET}
ENVEOF

  echo ""
  echo "  .env.local を作成しました"
fi

# ----- 2. npm install -----
echo ""
echo "[2/4] 依存パッケージをインストールします..."
if [ -d "node_modules" ]; then
  echo "      node_modules は既に存在します。スキップします"
  echo "      再インストールする場合は npm install を実行してください"
else
  npm install
fi

# ----- 3. BigQuery テーブルセットアップ -----
echo ""
echo "[3/4] BigQuery テーブルを作成しますか？"
echo "      (bq コマンドが必要です。gcloud CLI がインストール済みであること)"
echo "      実行する？ (y/N): "
read -r setup_bq

if [ "$setup_bq" = "y" ] || [ "$setup_bq" = "Y" ]; then
  # bq コマンドの存在確認
  if ! command -v bq &> /dev/null; then
    echo "  エラー: bq コマンドが見つかりません"
    echo "  gcloud CLI をインストールしてください:"
    echo "  https://cloud.google.com/sdk/docs/install"
  else
    echo "  BigQuery セットアップを実行中..."

    # 一括セットアップSQLがある場合はそれを使う
    if [ -f "${SQL_DIR}/setup_all_views.sql" ]; then
      echo "  setup_all_views.sql を実行中..."
      bq query --use_legacy_sql=false --location=asia-northeast1 < "${SQL_DIR}/setup_all_views.sql"
      echo "  マートVIEW作成完了"
    else
      # 個別ファイルを順番に実行
      for sql_file in \
        "${SQL_DIR}/00_create_dataset.sql" \
        "${SQL_DIR}/01_sales_marts.sql" \
        "${SQL_DIR}/02_product_marts.sql" \
        "${SQL_DIR}/03_inventory_marts.sql" \
        "${SQL_DIR}/04_customer_marts.sql"; do
        if [ -f "$sql_file" ]; then
          echo "  $(basename $sql_file) を実行中..."
          bq query --use_legacy_sql=false --location=asia-northeast1 < "$sql_file"
        fi
      done
    fi

    # ランキングテーブル（VIEWではなくTABLE）
    if [ -f "${SQL_DIR}/05_rakuten_ranking.sql" ]; then
      echo "  05_rakuten_ranking.sql を実行中..."
      bq query --use_legacy_sql=false --location=asia-northeast1 < "${SQL_DIR}/05_rakuten_ranking.sql"
    fi

    echo "  BigQuery セットアップ完了"
  fi
else
  echo "      スキップしました"
  echo "      後で手動実行する場合:"
  echo "        bq query --use_legacy_sql=false --location=asia-northeast1 < sql/setup_all_views.sql"
  echo "        bq query --use_legacy_sql=false --location=asia-northeast1 < sql/05_rakuten_ranking.sql"
fi

# ----- 4. 完了 -----
echo ""
echo "[4/4] セットアップ完了"
echo ""
echo "======================================"
echo "  次のステップ"
echo "======================================"
echo ""
echo "  1. 開発サーバー起動:"
echo "     npm run dev"
echo ""
echo "  2. ブラウザでアクセス:"
echo "     http://localhost:3000"
echo ""
echo "  3. ログイン情報:"
echo "     Email: ${LOGIN_EMAIL:-(.env.local を確認)}"
if [ -n "$LOGIN_PASS" ]; then
echo "     Password: ${LOGIN_PASS}"
fi
echo ""

# 未設定項目の警告
echo "  --- 確認事項 ---"
if [ -z "$GCP_JSON" ]; then
  echo "  ⚠ GOOGLE_APPLICATION_CREDENTIALS_JSON が未設定です"
  echo "    → .env.local にサービスアカウントJSONを設定してください"
fi
if [ -z "$RAKUTEN_APP_ID" ]; then
  echo "  ⚠ RAKUTEN_APP_ID が未設定です"
  echo "    → 楽天ランキング機能を使う場合は設定してください"
  echo "    → https://webservice.rakuten.co.jp/ で無料取得可能"
fi
echo ""
