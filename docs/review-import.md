# レビューインポート機能

## 概要
楽天R-KarteからダウンロードしたレビューCSVをGoogle Drive経由でBigQueryに自動取り込みする機能。

## 対象店舗・Driveフォルダ

| 店舗 | Google Drive フォルダID |
|---|---|
| NOAHL | `1B4QMfyfgoh7I3D5n2pGLBNFSSmHudmEk` |
| BLACKQUEEN | `1uLw0fGWu6I0YGHduENPYoUOObQ3J_7ox` |

## BigQuery保存先
- **テーブル**: `tiast-data-platform.analytics_mart.rakuten_reviews`
- **ビュー**: `tiast-data-platform.analytics_mart.v_review_summary`
- テーブルは初回インポート時に自動作成

## APIエンドポイント
- `POST /api/reviews/import` — 手動実行（dryRun対応）
- `GET /api/reviews/import` — Vercel Cron用（CRON_SECRET認証）

## 処理フロー

```
1. Google Driveの両フォルダから "reviews*" CSVを検索・取得
2. 既存データと重複チェック（review_url + posted_at の組み合わせ）
3. 新規レビューのみ、レビューページをスクレイピングして品番マッチング
   - review.rakuten.co.jp/item/1/338335_10002317/ → ページ取得
   - ページ内の item.rakuten.co.jp/noahl/nltp244-2502/ → 品番: nltp244-2502
   - レート制限: 1リクエスト/秒
   - フォールバック: Google Sheets「レビューマッピング」シート
4. BigQueryにINSERT（50件ずつバッチ）
5. インポート成功後、DriveからCSVを自動削除
```

## 定期実行（Vercel Cron）
- **スケジュール**: 毎日 6:00 UTC（`vercel.json`で設定）
- CSVがなければ何もしない
- `CRON_SECRET` で認証

## 手動実行

```bash
# dryRun（確認のみ）
curl -X POST https://YOUR-URL/api/reviews/import \
  -H "Content-Type: application/json" -d '{"dryRun": true}'

# 本実行
curl -X POST https://YOUR-URL/api/reviews/import \
  -H "Content-Type: application/json" -d '{}'
```

## BQテーブルスキーマ

| カラム | 型 | 説明 |
|---|---|---|
| shop_name | STRING | NOAHL / BLACKQUEEN |
| review_type | STRING | 商品レビュー / ショップレビュー |
| product_name | STRING | 楽天掲載商品名 |
| review_url | STRING | レビュー詳細URL |
| rating | INT64 | 評価 (1-5) |
| posted_at | STRING | 投稿日 (YYYY-MM-DD) |
| title | STRING | タイトル |
| review_body | STRING | 本文 |
| rakuten_item_id | STRING | 楽天商品番号（URLから抽出） |
| matched_product_code | STRING | マッチした品番 |
| _imported_at | TIMESTAMP | インポート日時 |

## 関連ファイル
- `app/api/reviews/import/route.ts` — インポートAPI（GET/POST）
- `app/api/reviews/mapping/route.ts` — マッピング管理API
- `lib/google-drive.ts` — Drive CSV取得・削除
- `lib/rakuten-review-scraper.ts` — レビューページスクレイピング
- `lib/google-sheets.ts` — マッピングシート読み書き
- `lib/rakuten-rms.ts` — RMS API v2.0クライアント
- `sql/06_reviews.sql` — BQテーブル定義
- `vercel.json` — Cron設定

## Vercelデプロイ
https://vercel.com/tiast2026s-projects/tiast-dashboard/3Pwpj3tfae8Hf2CqU1yLRWpAuri9

## 運用手順
1. R-KarteからレビューCSVをダウンロード
2. 対応する店舗のDriveフォルダにアップロード（ファイル名は `reviews` で始める）
3. 毎日6:00に自動取り込み or 手動でAPI実行
4. 取り込み完了後、CSVは自動削除される
