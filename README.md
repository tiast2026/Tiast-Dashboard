# TIAST 社内ダッシュボード

株式会社TIASTの社内データダッシュボード。
3ブランド（NOAHL / MYRTH / BLACKQUEEN）のEC事業データをBigQueryから読み取り、WEBブラウザで可視化するシステム。

## 技術スタック

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS** + **shadcn/ui**
- **Recharts** (グラフ描画)
- **@google-cloud/bigquery** (BigQuery接続)
- **NextAuth.js** (ログイン認証)
- デプロイ先: **Vercel**
- レスポンシブ対応済み（PC・タブレット・スマートフォン）

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local.example` をコピーして `.env.local` を作成し、各値を設定:

```bash
cp .env.local.example .env.local
```

| 変数名 | 説明 |
|--------|------|
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | BigQuery サービスアカウントキーのJSON |
| `NEXTAUTH_SECRET` | NextAuth.js のシークレットキー |
| `NEXTAUTH_URL` | アプリケーションURL（dev: `http://localhost:3000`） |
| `NEXTAUTH_USERS` | ログインユーザー（`email:password` をカンマ区切り） |

### 3. BigQuery 実テーブルの作成

`/sql` ディレクトリのSQLを使って、BigQueryにスケジュールクエリを登録:

1. [BigQuery コンソール](https://console.cloud.google.com/bigquery)にアクセス
2. `sql/refresh_all_mart_tables.sql` の内容を実行し、全テーブルを初期作成
3. 各 `sql/create_t_*.sql` をスケジュールクエリとして登録（毎時1回）

詳細は `/sql` ディレクトリ内のSQLファイルを参照。

### 4. 開発サーバーの起動

```bash
npm run dev
```

http://localhost:3000 にアクセス。

## 画面構成

| 画面 | パス | 説明 |
|------|------|------|
| ダッシュボード | `/dashboard` | KPI・売上推移・ブランド構成比・前年比 |
| 商品分析 | `/products` | 商品一覧・詳細・シーズン消化予測・値引き提案 |
| 在庫管理 | `/inventory` | アラート・シーズン別在庫・カテゴリ別構成 |
| 顧客分析 | `/customers` | 新規/リピート分析・チャネル別詳細 |
| 楽天ランキング | `/ranking` | 楽天市場のランキングデータ表示 |
| レビュー管理 | `/reviews` | 楽天・公式のレビュー管理 |
| 楽天データ | `/rakuten-data` | 楽天市場のCSVデータ取込・分析 |
| マスタ管理 | `/master` | 商品マスタ等の管理 |
| 広告効果 | `/ads` | Phase 2（準備中） |
| アクセス分析 | `/analytics` | Phase 2（準備中） |
| 予算管理 | `/budget` | Phase 3（準備中） |

## API エンドポイント

### 売上 (`/api/sales/`)
- `GET /api/sales/summary` - KPIサマリ
- `GET /api/sales/monthly-trend` - 月別売上推移
- `GET /api/sales/brand-composition` - ブランド別構成比
- `GET /api/sales/category-ranking` - カテゴリ別ランキング
- `GET /api/sales/yoy-comparison` - 前年同月比

### 商品 (`/api/products/`)
- `GET /api/products/list` - 商品一覧（検索・フィルタ・ページネーション）
- `GET /api/products/[product_code]` - 商品詳細

### 在庫 (`/api/inventory/`)
- `GET /api/inventory/alerts` - アラートサマリ
- `GET /api/inventory/season-summary` - シーズン別サマリ
- `GET /api/inventory/category-summary` - カテゴリ別サマリ
- `GET /api/inventory/list` - 在庫一覧

### 顧客 (`/api/customers/`)
- `GET /api/customers/summary` - KPIサマリ
- `GET /api/customers/monthly-trend` - 月別推移
- `GET /api/customers/channel-repeat-rate` - チャネル別リピート率
- `GET /api/customers/channel-detail` - チャネル別詳細

## パフォーマンス最適化

1. **BigQuery実テーブル化**: VIEWの結果を実テーブル（`t_` プレフィックス）に定期保存
2. **APIキャッシュ**: インメモリキャッシュ（有効期間60分）

## 月次レポート（Apps Script）

`/apps-script` ディレクトリに月次レポート自動生成スクリプトを格納。
詳細は `apps-script/README.md` を参照。

## ブランドカラー

| ブランド | カラー |
|---------|--------|
| NOAHL | `#C4A882`（ベージュ/ラテカラー） |
| BLACKQUEEN | `#1A1A1A`（ブラック） |
| MYRTH | `#8FAE8B`（セージグリーン） |

## NextEngine 店舗マスタ（shop_id マッピング）

BigQueryの `receive_order_shop_id` とダッシュボード上のチャネル名の対応表。
SQL内のCASE文（`01_sales_marts.sql`, `04_customer_marts.sql`, `setup_all_views.sql` 等）で使用。

| shop_id | NE店舗名 | ブランド | チャネル名（SQL上） |
|---------|---------|---------|-------------------|
| 1 | 【公式】BLACKQUEEN | BLACKQUEEN | 公式 |
| 2 | 【楽天】BLACKQUEEN | BLACKQUEEN | 楽天市場 |
| 3 | 【SHOPLIST】BLACKQUEEN | BLACKQUEEN | SHOPLIST |
| 4 | 【楽天】NOAHL | NOAHL | 楽天市場 |
| 5 | 【Amazon】BLACKQUEEN | BLACKQUEEN | Amazon |
| 6 | 【aupay】BLACKQUEEN | BLACKQUEEN | aupay |
| 7 | 【公式】NOAHL | NOAHL | 公式 |
| 8 | 【サステナ】BLACKQUEEN | BLACKQUEEN | サステナ |
| 9 | 【YAHOO】BLACKQUEEN | BLACKQUEEN | Yahoo! |
| 10 | 【楽天】MYRTH | MYRTH | 楽天市場 |
| 11 | 【RakutenFashion】NOAHL | NOAHL | RakutenFashion |
| 12 | 【TIKTOK】BLACKQUEEN | BLACKQUEEN | TikTok |
| 13 | 【TIKTOK】NOAHL | NOAHL | TikTok |

> **注意**: ZOZOは別テーブル（`raw_zozo.orders`）から取得。NE店舗マスタには含まれない。
>
> 店舗が追加された場合は、上記SQLファイルのCASE文と `lib/constants.ts` の `CHANNEL_COLORS` / `getChannelKey()` を更新すること。
