interface CacheEntry<T> {
  data: T
  expiry: number
}

const cache = new Map<string, CacheEntry<unknown>>()

const DEFAULT_TTL = 60 * 60 * 1000 // 60 minutes

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiry) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

export function setCache<T>(key: string, data: T, ttl: number = DEFAULT_TTL): void {
  cache.set(key, {
    data,
    expiry: Date.now() + ttl,
  })
}

export function clearCache(): void {
  cache.clear()
}

export function buildCacheKey(prefix: string, params: Record<string, string | undefined>): string {
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  return `${prefix}:${sorted}`
}

// Wrapper: fetch from cache or execute query
export async function cachedQuery<T>(
  key: string,
  queryFn: () => Promise<T>,
  ttl?: number
): Promise<T> {
  const cached = getCached<T>(key)
  if (cached !== null) return cached

  const data = await queryFn()
  setCache(key, data, ttl)
  return data
}
