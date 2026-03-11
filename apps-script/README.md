# TIAST 月次レポート - Google Apps Script セットアップガイド

BigQuery のデータを基に、毎月自動で Google スプレッドシートにレポートを生成する Apps Script の設定手順です。

---

## 1. Google Apps Script プロジェクトの作成

1. [Google Apps Script](https://script.google.com/) にアクセスします。
2. 「新しいプロジェクト」をクリックします。
3. プロジェクト名を「TIAST月次レポート」などわかりやすい名前に変更します。

> **補足**: レポートの出力先となる Google スプレッドシートから直接作成することもできます。
> スプレッドシートを開き、メニューの「拡張機能」→「Apps Script」を選択してください。

---

## 2. BigQuery Advanced Service の有効化

Apps Script から BigQuery を利用するには、Advanced Service を有効にする必要があります。

1. Apps Script エディタの左サイドバーで「サービス」の横にある「＋」をクリックします。
2. 一覧から **BigQuery API** を選択します。
3. バージョンは「v2」のままで「追加」をクリックします。
4. 左サイドバーの「サービス」に「BigQuery」が表示されることを確認します。

---

## 3. CONFIG.SPREADSHEET_ID の設定

レポートの出力先スプレッドシートを指定します。

1. レポート出力先の Google スプレッドシートを開きます（なければ新規作成します）。
2. URL からスプレッドシート ID をコピーします。
   ```
   https://docs.google.com/spreadsheets/d/【ここがスプレッドシートID】/edit
   ```
3. `monthly-report.gs` 内の `CONFIG.SPREADSHEET_ID` にコピーした ID を貼り付けます。
   ```javascript
   const CONFIG = {
     PROJECT_ID: 'tiast-data-platform',
     SPREADSHEET_ID: 'ここにスプレッドシートIDを貼り付け',
     DATASET: 'analytics_mart',
   };
   ```

---

## 4. コードの貼り付け

1. Apps Script エディタでデフォルトの `コード.gs` を開きます。
2. 既存のコードをすべて削除します。
3. `monthly-report.gs` の内容をすべてコピーして貼り付けます。
4. 「Ctrl + S」（Mac: Cmd + S）で保存します。

---

## 5. トリガー設定（毎月1日 07:00 JST 自動実行）

1. Apps Script エディタの左サイドバーで「トリガー」（時計アイコン）をクリックします。
2. 右下の「＋ トリガーを追加」をクリックします。
3. 以下のように設定します:

   | 項目 | 設定値 |
   |------|--------|
   | 実行する関数 | `generateMonthlyReport` |
   | 実行するデプロイ | `Head` |
   | イベントのソース | `時間主導型` |
   | 時間ベースのトリガーのタイプ | `月ベースのタイマー` |
   | 日にち | `1日` |
   | 時刻 | `午前7時～8時` |

4. 「保存」をクリックします。

> **注意**: Google Apps Script のタイムゾーンが JST（Asia/Tokyo）に設定されていることを確認してください。
> プロジェクト設定（歯車アイコン）→「タイムゾーン」で確認・変更できます。

---

## 6. 初回テスト（手動実行）

初回は手動でスクリプトを実行し、正常に動作することを確認します。

1. Apps Script エディタで関数の選択ドロップダウンから `generateMonthlyReport` を選択します。
2. 「実行」ボタン（▶）をクリックします。
3. 初回実行時は以下の権限の承認が求められます:
   - Google スプレッドシートへのアクセス
   - BigQuery へのアクセス
4. 「権限を確認」→ Google アカウントを選択 →「許可」をクリックします。
5. 実行ログで「月次レポートの生成が完了しました。」が表示されることを確認します。
6. スプレッドシートに前月のシート（例: 「2026年2月」）が作成されていることを確認します。

### トラブルシューティング

- **「BigQuery is not defined」エラー**: BigQuery Advanced Service が有効化されていません。手順2を再確認してください。
- **「Access Denied」エラー**: GCP プロジェクトへのアクセス権限が不足しています。手順7を参照してください。
- **「Spreadsheet not found」エラー**: `CONFIG.SPREADSHEET_ID` が正しく設定されているか確認してください。

---

## 7. 注意事項

### GCP プロジェクトの紐付け

Apps Script プロジェクトを BigQuery のデータがある GCP プロジェクト（`tiast-data-platform`）に紐付ける必要があります。

1. Apps Script エディタの「プロジェクトの設定」（歯車アイコン）を開きます。
2. 「Google Cloud Platform（GCP）プロジェクト」セクションで「プロジェクトを変更」をクリックします。
3. GCP プロジェクト番号を入力します。
   - GCP コンソール（https://console.cloud.google.com/）でプロジェクト `tiast-data-platform` を開き、ダッシュボードでプロジェクト番号を確認してください。
4. 「プロジェクトを設定」をクリックします。

### 権限設定

スクリプトを実行するアカウントには以下の権限が必要です:

- **BigQuery**: `bigquery.jobs.create` および `bigquery.tables.getData`（BigQuery データ閲覧者ロール以上）
- **スプレッドシート**: 対象スプレッドシートの編集権限

### 実行時間の制限

- Google Apps Script の実行時間制限は **6分間** です。
- データ量が非常に多い場合、タイムアウトする可能性があります。その場合はセクションを分割して実行することを検討してください。

### レポート内容のカスタマイズ

- `CONFIG` オブジェクトでプロジェクト ID やデータセット名を変更できます。
- 各セクションの SQL クエリを編集することで、レポート内容をカスタマイズできます。
- 新しいセクションを追加する場合は、`generateMonthlyReport()` 関数内に書き込み関数の呼び出しを追加してください。
