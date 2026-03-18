/**
 * Client-side cache for API responses with stale-while-revalidate (SWR).
 *
 * Strategy:
 *   - Returns cached data immediately (if available) to avoid loading states
 *   - `isFresh()` checks whether background revalidation is needed
 *   - In-flight request dedup prevents duplicate fetches for the same key
 *   - 10-minute default TTL for dashboard data
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
}

const cache = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

const DEFAULT_TTL_MS = 10 * 60 * 1000 // 10 minutes

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  return entry.data
}

export function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() })
}

export function isFresh(key: string, ttlMs: number = DEFAULT_TTL_MS): boolean {
  const entry = cache.get(key)
  if (!entry) return false
  return Date.now() - entry.timestamp < ttlMs
}

/**
 * Deduplicated fetch: if an identical request is already in-flight, reuse it.
 * Prevents multiple components or effects from firing duplicate API calls.
 */
export async function fetchWithDedup<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>

  const promise = fetcher().finally(() => {
    inflight.delete(key)
  })
  inflight.set(key, promise)
  return promise
}

export function buildClientCacheKey(prefix: string, params: Record<string, string>): string {
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== '' && v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  return `${prefix}:${sorted}`
}
