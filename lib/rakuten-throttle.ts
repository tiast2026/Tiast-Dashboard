/**
 * 楽天API グローバルスロットル
 *
 * 楽天APIは1アプリIDにつき1秒に1リクエストの制限がある。
 * このモジュールは全ての楽天API呼び出しで共有され、
 * リクエスト間隔を最低1.1秒に保つ。
 */

const MIN_INTERVAL_MS = 1100 // 1.1秒（余裕を持たせる）

let lastRequestTime = 0

/**
 * 楽天APIレート制限を守るためのスロットル付きfetch。
 * 前回のリクエストから MIN_INTERVAL_MS 経過するまで待機する。
 */
export async function rakutenFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - elapsed))
  }
  lastRequestTime = Date.now()
  return fetch(url, init)
}
