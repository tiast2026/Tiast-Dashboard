/**
 * TIAST 月次レポート自動生成スクリプト
 *
 * BigQuery の analytics_mart データセットからデータを取得し、
 * Google スプレッドシートに月次レポートを自動生成します。
 *
 * トリガー設定: 毎月1日 07:00 JST に自動実行
 */

// ============================================================
// 設定
// ============================================================
const CONFIG = {
  PROJECT_ID: 'tiast-data-platform',
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE', // ★ ここにスプレッドシートIDを設定してください
  DATASET: 'analytics_mart',
};

// ============================================================
// メイン関数
// ============================================================

/**
 * 月次レポートを生成するメイン関数
 * 前月のデータを集計し、新しいシートにレポートを出力します。
 */
function generateMonthlyReport() {
  const target = getPreviousMonth();
  Logger.log(`レポート対象: ${target.year}年${target.month}月 (${target.formatted})`);

  // スプレッドシートを取得し、新しいシートを作成
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheetName = `${target.year}年${target.month}月`;

  // 同名シートが既に存在する場合は削除して再作成
  const existingSheet = ss.getSheetByName(sheetName);
  if (existingSheet) {
    ss.deleteSheet(existingSheet);
  }
  const sheet = ss.insertSheet(sheetName);

  // レポートタイトル
  sheet.getRange('A1').setValue(`TIAST 月次レポート: ${target.year}年${target.month}月`);
  sheet.getRange('A1').setFontSize(18).setFontWeight('bold');
  sheet.getRange('A2').setValue(`生成日時: ${Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm')}`);

  let currentRow = 4;

  // 各セクションを書き込み
  currentRow = writeExecutiveSummary(sheet, currentRow, target);
  currentRow += 2;

  currentRow = writeBrandChannelSales(sheet, currentRow, target);
  currentRow += 2;

  currentRow = writeCategoryRanking(sheet, currentRow, target);
  currentRow += 2;

  currentRow = writeProductTop20(sheet, currentRow, target);
  currentRow += 2;

  currentRow = writeInventoryAlerts(sheet, currentRow);
  currentRow += 2;

  currentRow = writeCustomerSummary(sheet, currentRow, target);

  // スタイル適用
  applyStyles(sheet);

  // シートをアクティブにする
  ss.setActiveSheet(sheet);

  Logger.log('月次レポートの生成が完了しました。');
}

// ============================================================
// ヘルパー関数
// ============================================================

/**
 * BigQuery にクエリを実行し、結果を返す
 * @param {string} sql - 実行するSQLクエリ
 * @returns {Object} BigQuery クエリ結果
 */
function runBigQuery(sql) {
  const request = {
    query: sql,
    useLegacySql: false,
  };

  let response = BigQuery.Jobs.query(request, CONFIG.PROJECT_ID);
  const jobId = response.jobReference.jobId;

  // ジョブ完了まで待機
  while (!response.jobComplete) {
    Utilities.sleep(1000);
    response = BigQuery.Jobs.getQueryResults(CONFIG.PROJECT_ID, jobId);
  }

  return response;
}

/**
 * Date オブジェクトを YYYY-MM 形式にフォーマットする
 * @param {Date} date - フォーマット対象の日付
 * @returns {string} YYYY-MM 形式の文字列
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * 前月の年・月・フォーマット済み文字列を取得する
 * @returns {Object} { year, month, formatted }
 */
function getPreviousMonth() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    year: prev.getFullYear(),
    month: prev.getMonth() + 1,
    formatted: formatDate(prev),
  };
}

// ============================================================
// セクション書き込み関数
// ============================================================

/**
 * (a) エグゼクティブサマリーを書き込む
 * 売上合計・粗利・注文数・平均注文単価と前年比を表示
 *
 * @param {Sheet} sheet - 書き込み対象シート
 * @param {number} row - 開始行
 * @param {Object} month - 対象月 { year, month, formatted }
 * @returns {number} 次のセクション開始行
 */
function writeExecutiveSummary(sheet, row, month) {
  // セクションタイトル
  sheet.getRange(row, 1).setValue('1. エグゼクティブサマリー');
  row += 1;

  // 当月データ取得
  const currentSql = `
    SELECT
      SUM(sales_amount) AS total_sales,
      SUM(gross_profit) AS total_gross_profit,
      SUM(order_count) AS total_orders,
      SAFE_DIVIDE(SUM(sales_amount), SUM(order_count)) AS avg_order_value
    FROM \`${CONFIG.PROJECT_ID}.${CONFIG.DATASET}.t_sales_by_shop_month\`
    WHERE year_month = '${month.formatted}'
  `;

  // 前年同月データ取得（YoY 比較用）
  const lastYearFormatted = `${month.year - 1}-${String(month.month).padStart(2, '0')}`;
  const lastYearSql = `
    SELECT
      SUM(sales_amount) AS total_sales,
      SUM(gross_profit) AS total_gross_profit,
      SUM(order_count) AS total_orders,
      SAFE_DIVIDE(SUM(sales_amount), SUM(order_count)) AS avg_order_value
    FROM \`${CONFIG.PROJECT_ID}.${CONFIG.DATASET}.t_sales_by_shop_month\`
    WHERE year_month = '${lastYearFormatted}'
  `;

  const currentResult = runBigQuery(currentSql);
  const lastYearResult = runBigQuery(lastYearSql);

  // ヘッダー行
  const headers = ['指標', '当月実績', '前年同月', '前年比（YoY）'];
  sheet.getRange(row, 1, 1, headers.length).setValues([headers]);
  row += 1;

  // データ行の解析
  const currentData = currentResult.rows ? currentResult.rows[0].f : null;
  const lastYearData = lastYearResult.rows ? lastYearResult.rows[0].f : null;

  const metrics = [
    { label: '売上合計', index: 0, isCurrency: true },
    { label: '粗利合計', index: 1, isCurrency: true },
    { label: '注文数', index: 2, isCurrency: false },
    { label: '平均注文単価', index: 3, isCurrency: true },
  ];

  metrics.forEach(function(metric) {
    const currentVal = currentData ? parseFloat(currentData[metric.index].v || 0) : 0;
    const lastYearVal = lastYearData ? parseFloat(lastYearData[metric.index].v || 0) : 0;
    const yoy = lastYearVal > 0 ? (currentVal / lastYearVal) : null;

    const rowData = [
      metric.label,
      currentVal,
      lastYearVal,
      yoy,
    ];
    sheet.getRange(row, 1, 1, rowData.length).setValues([rowData]);

    // 通貨フォーマット
    if (metric.isCurrency) {
      sheet.getRange(row, 2).setNumberFormat('¥#,##0');
      sheet.getRange(row, 3).setNumberFormat('¥#,##0');
    } else {
      sheet.getRange(row, 2).setNumberFormat('#,##0');
      sheet.getRange(row, 3).setNumberFormat('#,##0');
    }

    // YoY パーセントフォーマット
    if (yoy !== null) {
      sheet.getRange(row, 4).setNumberFormat('0.0%');
      // YoY 100%超: 緑、100%未満: 赤
      if (yoy > 1.0) {
        sheet.getRange(row, 4).setFontColor('#16A34A');
      } else if (yoy < 1.0) {
        sheet.getRange(row, 4).setFontColor('#DC2626');
      }
    }

    row += 1;
  });

  return row;
}

/**
 * (b) ブランド×チャネル別売上クロス表を書き込む
 * 売上金額・注文数・粗利・粗利率のテーブルを作成
 *
 * @param {Sheet} sheet - 書き込み対象シート
 * @param {number} row - 開始行
 * @param {Object} month - 対象月
 * @returns {number} 次のセクション開始行
 */
function writeBrandChannelSales(sheet, row, month) {
  sheet.getRange(row, 1).setValue('2. ブランド×チャネル別実績');
  row += 1;

  // ブランドとチャネル（ショップ）の一覧を取得
  const distinctSql = `
    SELECT DISTINCT shop_brand, shop_name
    FROM \`${CONFIG.PROJECT_ID}.${CONFIG.DATASET}.t_sales_by_shop_month\`
    WHERE year_month = '${month.formatted}'
    ORDER BY shop_brand, shop_name
  `;
  const distinctResult = runBigQuery(distinctSql);

  if (!distinctResult.rows || distinctResult.rows.length === 0) {
    sheet.getRange(row, 1).setValue('データがありません');
    return row + 1;
  }

  // ブランドとチャネルの構造化
  const brandChannels = {};
  const allChannels = [];
  distinctResult.rows.forEach(function(r) {
    const brand = r.f[0].v;
    const channel = r.f[1].v;
    if (!brandChannels[brand]) {
      brandChannels[brand] = [];
    }
    brandChannels[brand].push(channel);
    if (allChannels.indexOf(channel) === -1) {
      allChannels.push(channel);
    }
  });
  allChannels.sort();
  const brands = Object.keys(brandChannels).sort();

  // 各指標のテーブルを作成
  const metricsConfig = [
    { label: '売上金額', column: 'sales_amount', format: '¥#,##0' },
    { label: '注文数', column: 'order_count', format: '#,##0' },
    { label: '粗利', column: 'gross_profit', format: '¥#,##0' },
    { label: '粗利率', column: 'gross_profit_rate', format: '0.0%' },
  ];

  metricsConfig.forEach(function(metricConf) {
    sheet.getRange(row, 1).setValue(`【${metricConf.label}】`);
    row += 1;

    // ヘッダー: ブランド / チャネル1 / チャネル2 / ... / 合計
    const header = ['ブランド'].concat(allChannels).concat(['合計']);
    sheet.getRange(row, 1, 1, header.length).setValues([header]);
    row += 1;

    // データ取得
    const dataSql = `
      SELECT
        shop_brand,
        shop_name,
        ${metricConf.column === 'gross_profit_rate'
          ? 'SAFE_DIVIDE(SUM(gross_profit), SUM(sales_amount))'
          : `SUM(${metricConf.column})`} AS metric_value
      FROM \`${CONFIG.PROJECT_ID}.${CONFIG.DATASET}.t_sales_by_shop_month\`
      WHERE year_month = '${month.formatted}'
      GROUP BY shop_brand, shop_name
      ORDER BY shop_brand, shop_name
    `;
    const dataResult = runBigQuery(dataSql);

    // ピボットデータ構築
    const pivotData = {};
    if (dataResult.rows) {
      dataResult.rows.forEach(function(r) {
        const brand = r.f[0].v;
        const channel = r.f[1].v;
        const value = parseFloat(r.f[2].v || 0);
        if (!pivotData[brand]) {
          pivotData[brand] = {};
        }
        pivotData[brand][channel] = value;
      });
    }

    // ブランドごとに行を出力
    brands.forEach(function(brand) {
      const rowValues = [brand];
      let total = 0;
      allChannels.forEach(function(ch) {
        const val = (pivotData[brand] && pivotData[brand][ch]) ? pivotData[brand][ch] : 0;
        rowValues.push(val);
        total += val;
      });
      // 粗利率の場合は合計ではなく平均を使う
      if (metricConf.column === 'gross_profit_rate') {
        const count = allChannels.filter(function(ch) {
          return pivotData[brand] && pivotData[brand][ch];
        }).length;
        rowValues.push(count > 0 ? total / count : 0);
      } else {
        rowValues.push(total);
      }

      sheet.getRange(row, 1, 1, rowValues.length).setValues([rowValues]);

      // 数値フォーマットの適用（2列目以降）
      for (let c = 2; c <= rowValues.length; c++) {
        sheet.getRange(row, c).setNumberFormat(metricConf.format);
      }
      row += 1;
    });

    row += 1; // テーブル間のスペース
  });

  return row;
}

/**
 * (c) カテゴリ別ランキングを書き込む
 * ブランドごとのカテゴリ売上ランキングを表示
 *
 * @param {Sheet} sheet - 書き込み対象シート
 * @param {number} row - 開始行
 * @param {Object} month - 対象月
 * @returns {number} 次のセクション開始行
 */
function writeCategoryRanking(sheet, row, month) {
  sheet.getRange(row, 1).setValue('3. カテゴリ別ランキング（ブランド別）');
  row += 1;

  const sql = `
    SELECT
      brand,
      category,
      SUM(sales_amount) AS total_sales,
      SUM(order_count) AS total_orders,
      SUM(gross_profit) AS total_gross_profit
    FROM \`${CONFIG.PROJECT_ID}.${CONFIG.DATASET}.t_sales_by_brand_month\`
    WHERE year_month = '${month.formatted}'
    GROUP BY brand, category
    ORDER BY brand, total_sales DESC
  `;

  const result = runBigQuery(sql);

  if (!result.rows || result.rows.length === 0) {
    sheet.getRange(row, 1).setValue('データがありません');
    return row + 1;
  }

  // ブランドごとにグループ化して出力
  let currentBrand = null;
  let rank = 0;

  result.rows.forEach(function(r) {
    const brand = r.f[0].v;
    const category = r.f[1].v;
    const sales = parseFloat(r.f[2].v || 0);
    const orders = parseFloat(r.f[3].v || 0);
    const grossProfit = parseFloat(r.f[4].v || 0);

    // 新しいブランドの場合、ヘッダーを出力
    if (brand !== currentBrand) {
      if (currentBrand !== null) {
        row += 1; // ブランド間のスペース
      }
      currentBrand = brand;
      rank = 0;

      sheet.getRange(row, 1).setValue(`【${brand}】`);
      row += 1;

      const headers = ['順位', 'カテゴリ', '売上金額', '注文数', '粗利'];
      sheet.getRange(row, 1, 1, headers.length).setValues([headers]);
      row += 1;
    }

    rank += 1;
    const rowData = [rank, category, sales, orders, grossProfit];
    sheet.getRange(row, 1, 1, rowData.length).setValues([rowData]);
    sheet.getRange(row, 3).setNumberFormat('¥#,##0');
    sheet.getRange(row, 4).setNumberFormat('#,##0');
    sheet.getRange(row, 5).setNumberFormat('¥#,##0');
    row += 1;
  });

  return row;
}

/**
 * (d) 商品別売上 Top20 を書き込む
 * 売上金額上位20商品と在庫情報を表示
 *
 * @param {Sheet} sheet - 書き込み対象シート
 * @param {number} row - 開始行
 * @param {Object} month - 対象月
 * @returns {number} 次のセクション開始行
 */
function writeProductTop20(sheet, row, month) {
  sheet.getRange(row, 1).setValue('4. 商品別売上 Top20');
  row += 1;

  const sql = `
    SELECT
      p.product_code,
      p.product_name,
      p.brand,
      p.category,
      p.sales_amount,
      p.order_count,
      p.gross_profit,
      i.stock_quantity,
      i.stock_days
    FROM \`${CONFIG.PROJECT_ID}.${CONFIG.DATASET}.t_sales_by_product\` AS p
    LEFT JOIN \`${CONFIG.PROJECT_ID}.${CONFIG.DATASET}.t_inventory_health\` AS i
      ON p.product_code = i.product_code
    WHERE p.year_month = '${month.formatted}'
    ORDER BY p.sales_amount DESC
    LIMIT 20
  `;

  const result = runBigQuery(sql);

  // ヘッダー
  const headers = [
    '順位', '商品コード', '商品名', 'ブランド', 'カテゴリ',
    '売上金額', '注文数', '粗利', '在庫数', '在庫日数',
  ];
  sheet.getRange(row, 1, 1, headers.length).setValues([headers]);
  row += 1;

  if (!result.rows || result.rows.length === 0) {
    sheet.getRange(row, 1).setValue('データがありません');
    return row + 1;
  }

  result.rows.forEach(function(r, index) {
    const rowData = [
      index + 1,
      r.f[0].v || '',
      r.f[1].v || '',
      r.f[2].v || '',
      r.f[3].v || '',
      parseFloat(r.f[4].v || 0),
      parseFloat(r.f[5].v || 0),
      parseFloat(r.f[6].v || 0),
      parseFloat(r.f[7].v || 0),
      parseFloat(r.f[8].v || 0),
    ];
    sheet.getRange(row, 1, 1, rowData.length).setValues([rowData]);
    sheet.getRange(row, 6).setNumberFormat('¥#,##0');
    sheet.getRange(row, 7).setNumberFormat('#,##0');
    sheet.getRange(row, 8).setNumberFormat('¥#,##0');
    sheet.getRange(row, 9).setNumberFormat('#,##0');
    sheet.getRange(row, 10).setNumberFormat('#,##0');
    row += 1;
  });

  return row;
}

/**
 * (e) 在庫アラートサマリーを書き込む
 * 過剰在庫・シーズンアラート・過剰在庫Top5を表示
 *
 * @param {Sheet} sheet - 書き込み対象シート
 * @param {number} row - 開始行
 * @returns {number} 次のセクション開始行
 */
function writeInventoryAlerts(sheet, row) {
  sheet.getRange(row, 1).setValue('5. 在庫アラート');
  row += 1;

  // --- 過剰在庫サマリー ---
  sheet.getRange(row, 1).setValue('【過剰在庫サマリー】');
  row += 1;

  const overstockSummarySql = `
    SELECT
      COUNT(*) AS overstock_count,
      SUM(stock_quantity) AS total_stock,
      SUM(stock_amount) AS total_stock_amount
    FROM \`${CONFIG.PROJECT_ID}.${CONFIG.DATASET}.t_inventory_health\`
    WHERE overstock_flag = TRUE
  `;
  const overstockSummary = runBigQuery(overstockSummarySql);

  const summaryHeaders = ['過剰在庫SKU数', '在庫数量合計', '在庫金額合計'];
  sheet.getRange(row, 1, 1, summaryHeaders.length).setValues([summaryHeaders]);
  row += 1;

  if (overstockSummary.rows && overstockSummary.rows.length > 0) {
    const d = overstockSummary.rows[0].f;
    const summaryData = [
      parseFloat(d[0].v || 0),
      parseFloat(d[1].v || 0),
      parseFloat(d[2].v || 0),
    ];
    sheet.getRange(row, 1, 1, summaryData.length).setValues([summaryData]);
    sheet.getRange(row, 1).setNumberFormat('#,##0');
    sheet.getRange(row, 2).setNumberFormat('#,##0');
    sheet.getRange(row, 3).setNumberFormat('¥#,##0');
  }
  row += 2;

  // --- シーズンアラート ---
  sheet.getRange(row, 1).setValue('【シーズンアラート】');
  row += 1;

  const seasonAlertSql = `
    SELECT
      alert_type,
      COUNT(*) AS alert_count,
      SUM(stock_amount) AS total_amount
    FROM \`${CONFIG.PROJECT_ID}.${CONFIG.DATASET}.t_md_dashboard\`
    WHERE season_alert IS NOT NULL
    GROUP BY alert_type
    ORDER BY total_amount DESC
  `;
  const seasonResult = runBigQuery(seasonAlertSql);

  const seasonHeaders = ['アラート種別', '対象SKU数', '在庫金額'];
  sheet.getRange(row, 1, 1, seasonHeaders.length).setValues([seasonHeaders]);
  row += 1;

  if (seasonResult.rows) {
    seasonResult.rows.forEach(function(r) {
      const rowData = [
        r.f[0].v || '',
        parseFloat(r.f[1].v || 0),
        parseFloat(r.f[2].v || 0),
      ];
      sheet.getRange(row, 1, 1, rowData.length).setValues([rowData]);
      sheet.getRange(row, 2).setNumberFormat('#,##0');
      sheet.getRange(row, 3).setNumberFormat('¥#,##0');
      row += 1;
    });
  }
  row += 1;

  // --- 過剰在庫 Top5 ---
  sheet.getRange(row, 1).setValue('【過剰在庫 Top5（在庫金額順）】');
  row += 1;

  const topOverstockSql = `
    SELECT
      product_code,
      product_name,
      brand,
      stock_quantity,
      stock_amount,
      stock_days
    FROM \`${CONFIG.PROJECT_ID}.${CONFIG.DATASET}.t_inventory_health\`
    WHERE overstock_flag = TRUE
    ORDER BY stock_amount DESC
    LIMIT 5
  `;
  const topResult = runBigQuery(topOverstockSql);

  const topHeaders = ['商品コード', '商品名', 'ブランド', '在庫数', '在庫金額', '在庫日数'];
  sheet.getRange(row, 1, 1, topHeaders.length).setValues([topHeaders]);
  row += 1;

  if (topResult.rows) {
    topResult.rows.forEach(function(r) {
      const rowData = [
        r.f[0].v || '',
        r.f[1].v || '',
        r.f[2].v || '',
        parseFloat(r.f[3].v || 0),
        parseFloat(r.f[4].v || 0),
        parseFloat(r.f[5].v || 0),
      ];
      sheet.getRange(row, 1, 1, rowData.length).setValues([rowData]);
      sheet.getRange(row, 4).setNumberFormat('#,##0');
      sheet.getRange(row, 5).setNumberFormat('¥#,##0');
      sheet.getRange(row, 6).setNumberFormat('#,##0');
      row += 1;
    });
  }

  return row;
}

/**
 * (f) 顧客サマリーを書き込む
 * ブランド別の新規・リピート顧客サマリーを表示
 *
 * @param {Sheet} sheet - 書き込み対象シート
 * @param {number} row - 開始行
 * @param {Object} month - 対象月
 * @returns {number} 次のセクション開始行
 */
function writeCustomerSummary(sheet, row, month) {
  sheet.getRange(row, 1).setValue('6. 顧客サマリー（ブランド別）');
  row += 1;

  const sql = `
    SELECT
      brand,
      segment,
      COUNT(*) AS customer_count,
      SUM(total_sales) AS total_sales,
      AVG(total_sales) AS avg_sales
    FROM \`${CONFIG.PROJECT_ID}.${CONFIG.DATASET}.t_customer_segments\`
    WHERE year_month = '${month.formatted}'
    GROUP BY brand, segment
    ORDER BY brand, segment
  `;

  const result = runBigQuery(sql);

  if (!result.rows || result.rows.length === 0) {
    sheet.getRange(row, 1).setValue('データがありません');
    return row + 1;
  }

  // ブランドごとにグループ化して出力
  let currentBrand = null;

  result.rows.forEach(function(r) {
    const brand = r.f[0].v;
    const segment = r.f[1].v;
    const customerCount = parseFloat(r.f[2].v || 0);
    const totalSales = parseFloat(r.f[3].v || 0);
    const avgSales = parseFloat(r.f[4].v || 0);

    // 新しいブランドの場合、ヘッダーを出力
    if (brand !== currentBrand) {
      if (currentBrand !== null) {
        row += 1;
      }
      currentBrand = brand;

      sheet.getRange(row, 1).setValue(`【${brand}】`);
      row += 1;

      const headers = ['セグメント', '顧客数', '売上合計', '平均売上'];
      sheet.getRange(row, 1, 1, headers.length).setValues([headers]);
      row += 1;
    }

    const rowData = [segment, customerCount, totalSales, avgSales];
    sheet.getRange(row, 1, 1, rowData.length).setValues([rowData]);
    sheet.getRange(row, 2).setNumberFormat('#,##0');
    sheet.getRange(row, 3).setNumberFormat('¥#,##0');
    sheet.getRange(row, 4).setNumberFormat('¥#,##0');
    row += 1;
  });

  return row;
}

// ============================================================
// スタイル適用関数
// ============================================================

/**
 * レポートシート全体にスタイルを適用する
 * - セクションタイトル: 太字、フォントサイズ14
 * - ヘッダー行: 背景色 #F3F4F6、太字
 * - 列幅の自動調整
 *
 * @param {Sheet} sheet - スタイルを適用するシート
 */
function applyStyles(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow === 0 || lastCol === 0) return;

  for (let r = 1; r <= lastRow; r++) {
    const cellValue = sheet.getRange(r, 1).getValue();
    if (typeof cellValue !== 'string') continue;

    // セクションタイトル（"1." ～ "6." で始まる行）
    if (cellValue.match(/^[1-6]\.\s/)) {
      sheet.getRange(r, 1, 1, lastCol)
        .setFontSize(14)
        .setFontWeight('bold');
    }

    // 【】で囲まれたサブセクションタイトル
    if (cellValue.match(/^【.*】$/)) {
      sheet.getRange(r, 1, 1, lastCol)
        .setFontWeight('bold')
        .setFontSize(11);
    }

    // ヘッダー行の判定（指標・順位・ブランド・商品コード・セグメント・アラート種別・過剰在庫SKU数 で始まる行）
    const headerKeywords = [
      '指標', '順位', 'ブランド', '商品コード', 'セグメント',
      'アラート種別', '過剰在庫SKU数',
    ];
    if (headerKeywords.indexOf(cellValue) !== -1) {
      sheet.getRange(r, 1, 1, lastCol)
        .setBackground('#F3F4F6')
        .setFontWeight('bold');
    }
  }

  // 列幅を自動調整
  for (let c = 1; c <= lastCol; c++) {
    sheet.autoResizeColumn(c);
  }
}
