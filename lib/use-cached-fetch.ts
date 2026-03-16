'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getCached, setCache, isFresh } from './client-cache'

interface UseCachedFetchOptions {
  /** Cache TTL in milliseconds (default: 5 min) */
  ttlMs?: number
}

/**
 * Hook for fetching data with client-side stale-while-revalidate caching.
 * - If cached data exists: shows it immediately, fetches in background
 * - If no cache: shows loading state, fetches normally
 */
export function useCachedFetch<T>(
  cacheKey: string,
  fetchFn: () => Promise<T>,
  deps: unknown[],
  options?: UseCachedFetchOptions,
): { data: T | null; loading: boolean } {
  const ttlMs = options?.ttlMs ?? 5 * 60 * 1000
  const cached = getCached<T>(cacheKey)
  const [data, setData] = useState<T | null>(cached)
  const [loading, setLoading] = useState(!cached)
  const mountedRef = useRef(true)

  const doFetch = useCallback(async () => {
    // If we have fresh cache, skip fetch
    if (isFresh(cacheKey, ttlMs)) return

    // If we have stale cache, don't show loading spinner
    if (!getCached(cacheKey)) {
      setLoading(true)
    }

    try {
      const result = await fetchFn()
      if (mountedRef.current) {
        setData(result)
        setCache(cacheKey, result)
        setLoading(false)
      }
    } catch {
      if (mountedRef.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, ttlMs, ...deps])

  useEffect(() => {
    mountedRef.current = true
    doFetch()
    return () => {
      mountedRef.current = false
    }
  }, [doFetch])

  return { data, loading }
}
