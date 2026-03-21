# レビュー取り込み構造

## 全体フロー

```
Google Drive (CSV)  →  インポートAPI  →  品番マッチング  →  BigQuery
     ↑                                       ↑
  楽天R-Karte                          3段階マッチング
  エクスポート                         (シート / CSV / スクレイピング)
```

## 1. データソース

楽天R-Karteからエクスポートされた **CSV** ファイルを Google Drive に配置。

| ショップ | Drive フォルダ |
|---------|---------------|
| NOAHL | `1B4QMfyfgoh7I3D5n2pGLBNFSSmHudmEk` |
| BLACKQUEEN | `1uLw0fGWu6I0YGHduENPYoUOObQ3J_7ox` |

### CSVカラム

| CSV列名 | 内部キー | 内容 |
|---------|---------|------|
| レビュータイプ | `review_type` | 商品レビュー / ショップレビュー |
| 商品名 | `product_name` | 楽天の商品名 |
| 商品管理番号 | `manage_number` | 品番マッチングのフォールバック用 |
| レビュー詳細URL | `review_url` | 重複チェックキーにも使用 |
| 評価 | `rating` | 1〜5 |
| 投稿時間 | `posted_at` | YYYY-MM-DD |
| タイトル | `title` | - |
| レビュー本文 | `review_body` | - |
| フラグ | `flag` | 0 or 1 |
| 注文番号 | `order_number` | - |
| 未対応フラグ | `unhandled_flag` | 0 or 1 |

## 2. インポート処理

**エンドポイント**: `POST /api/reviews/import`

### 処理ステップ

1. **CSV取得**: Google DriveからCSVファイルを取得（Shift_JIS対応）
2. **重複チェック**: `review_url + posted_at` の組み合わせで既存レビューと照合
3. **品番マッチング**: 3段階で品番を特定（後述）
4. **テーブル振り分け**: 商品レビューとショップレビューを別テーブルに保存
5. **バッチ挿入**: 500件ずつBigQueryに書き込み
6. **CSV削除**: 処理済みCSVをDriveから削除

### 自動実行

Vercel Cronで毎日 **6:00 UTC** に自動実行（`vercel.json`で設定）。

## 3. 品番マッチング（3段階）

レビューと自社品番を紐づける核心ロジック。

### 第1段階: Google Sheetsマッピング（最優先）

- `レビューマッピング` シートに `rakuten_item_id → product_code` の対応表
- レビューURLから `rakuten_item_id` を抽出し、シートを参照

### 第2段階: CSV manage_number

- 楽天CSVの「商品管理番号」フィールドをそのまま品番として使用
- マッピングシートにエントリがない場合のフォールバック

### 第3段階: Webスクレイピング

- 未マッチレビューのURLにアクセスし、商品ページから品番を取得
- 正規表現: `item\.rakuten\.co\.jp\/[^/]+\/([^/?"]+)`
- レート制限: 1リクエスト/秒
- 取得した対応はマッピングシートに自動追記

## 4. BigQueryテーブル

### `rakuten_reviews`（商品レビュー）

| カラム | 型 | 説明 |
|-------|-----|------|
| `shop_name` | STRING | NOAHL / BLACKQUEEN |
| `review_type` | STRING | 商品レビュー |
| `product_name` | STRING | 楽天の商品名 |
| `review_url` | STRING | 重複チェックキー |
| `rating` | INT64 | 1〜5 |
| `posted_at` | STRING | YYYY-MM-DD |
| `title` | STRING | レビュータイトル |
| `review_body` | STRING | レビュー本文 |
| `flag` | INT64 | 0 or 1 |
| `unhandled_flag` | INT64 | 0 or 1 |
| `order_number` | STRING | - |
| `rakuten_item_id` | STRING | URLから抽出 |
| `matched_product_code` | STRING | **マッチした品番** |
| `_imported_at` | TIMESTAMP | 取り込み日時 |

### `rakuten_shop_reviews`（ショップレビュー）

商品レビューとほぼ同構造。`rakuten_item_id` / `matched_product_code` なし。

### ビュー

- `v_review_summary` — 品番ごとのレビュー集計（件数・平均評価）
- `v_shop_review_summary` — ショップごとの集計

## 5. リマッチ（再マッチング）

**エンドポイント**: `POST /api/reviews/mapping`

未マッチレビューに対して品番の再紐付けを実行。

1. BigQueryから `matched_product_code` が空のレビューを抽出
2. マッピングシートを再チェック
3. 未解決分はスクレイピング（1回最大40件）
4. 新規マッピングをシートに追記
5. BigQueryを `UPDATE ... SET matched_product_code = CASE ...` で一括更新

## 6. 表示側の画像紐付け

`GET /api/reviews` のレスポンスで、商品マスタシート（`サムネURL`列）から `matched_product_code` をキーに画像URLを付与。

```
レビュー.matched_product_code → 商品マスタ.product_code → image_url
```

## 7. 導入に必要なもの

| 項目 | 説明 |
|------|------|
| Google Cloud サービスアカウント | Drive / Sheets / BigQuery アクセス用 |
| Google Drive フォルダ | 楽天CSVの配置先 |
| Google Sheets | 商品マスタ + レビューマッピングシート |
| BigQuery データセット | `analytics_mart` 相当のテーブル群 |
| 楽天R-Karte | CSV定期エクスポートの設定 |
| Vercel (任意) | Cron による自動取り込み |

## 8. ファイル構成

```
app/api/reviews/
├── route.ts              # レビュー取得API（フィルタ・画像付与）
├── import/route.ts       # インポートAPI（CSV→BQ）
├── mapping/route.ts      # リマッチAPI
└── shop/route.ts         # ショップレビュー取得

lib/
├── google-drive.ts       # Drive CSV取得・パース
├── google-sheets.ts      # マッピングシート読み書き
├── rakuten-review-scraper.ts  # 品番スクレイピング
├── rakuten-rms.ts        # RMS API連携
└── bigquery.ts           # BQクライアント

sql/
└── 06_reviews.sql        # テーブル・ビュー定義
```
