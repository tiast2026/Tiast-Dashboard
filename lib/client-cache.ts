/**
 * Simple client-side cache for API responses.
 * Stores data in module-level Map so it persists across page navigations.
 * Provides stale-while-revalidate behavior:
 *   - Returns cached data immediately (if available)
 *   - Fetches fresh data in background
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
}

const cache = new Map<string, CacheEntry<unknown>>()

const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 minutes

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  // Return cached data even if stale (caller decides whether to refetch)
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

export function buildClientCacheKey(prefix: string, params: Record<string, string>): string {
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== '' && v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  return `${prefix}:${sorted}`
}
