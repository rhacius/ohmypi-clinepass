import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { CLINEPASS_MODELS_CACHE_TTL_MS, defaultModelsCachePath } from "./config.js"
import type { RecommendedModelsResponse } from "./discovery.js"

export interface CachedModelsFile {
  data: RecommendedModelsResponse
  lastUpdatedAt?: string
}

let updateInFlight: Promise<void> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isCachedModelsFile(value: unknown): value is CachedModelsFile {
  if (!isRecord(value)) return false
  const { data, lastUpdatedAt } = value
  if (!isRecord(data)) return false
  // Free-form payload: only require it be an object. ClinePass key is optional.
  if (lastUpdatedAt !== undefined && typeof lastUpdatedAt !== "string") return false
  return true
}

function readCache(cachePath: string): CachedModelsFile | undefined {
  try {
    if (!existsSync(cachePath)) return undefined
    const parsed = JSON.parse(readFileSync(cachePath, "utf8")) as unknown
    return isCachedModelsFile(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export function isCacheStale(cache: CachedModelsFile | undefined): boolean {
  if (!cache?.lastUpdatedAt) return true
  const lastUpdatedAt = Date.parse(cache.lastUpdatedAt)
  return Number.isNaN(lastUpdatedAt) || Date.now() - lastUpdatedAt >= CLINEPASS_MODELS_CACHE_TTL_MS
}

/**
 * Returns cached payload iff a fresh cache file exists (within TTL). Does not
 * fetch. Use {@link updateCachedModelsInBackground} to refresh a stale cache.
 */
export function readCachedModels(cachePath: string = defaultModelsCachePath()): RecommendedModelsResponse | undefined {
  return readCache(cachePath)?.data
}

export function writeCachedModels(data: RecommendedModelsResponse, cachePath: string = defaultModelsCachePath()): void {
  try {
    mkdirSync(dirname(cachePath), { recursive: true })
    const cache: CachedModelsFile = { data, lastUpdatedAt: new Date().toISOString() }
    writeFileSync(cachePath, JSON.stringify(cache, null, 2))
  } catch {
    // Best-effort persistence; missing cache is not fatal.
  }
}

/**
 * Runs `fetch` and writes its result to disk. Resolves even on fetch failure
 * (callers swallow errors to keep a background refresh from surfacing).
 */
async function runRefresh(
  fetcher: () => Promise<RecommendedModelsResponse>,
  cachePath: string,
): Promise<void> {
  const data = await fetcher()
  writeCachedModels(data, cachePath)
}

/**
 * Refreshes the cache in the background if stale, deduplicating concurrent
 * refreshes via an in-flight singleton. Never throws: callers fire-and-forget.
 */
export function updateCachedModelsInBackground(
  fetcher: () => Promise<RecommendedModelsResponse>,
  cachePath: string = defaultModelsCachePath(),
): void {
  if (updateInFlight) return
  if (!isCacheStale(readCache(cachePath))) return
  updateInFlight = runRefresh(fetcher, cachePath).finally(() => {
    updateInFlight = null
  })
}

/** Returns the in-flight background refresh promise, if any. For tests/await. */
export function pendingModelsRefresh(): Promise<void> | null {
  return updateInFlight
}

/**
 * Synchronous foreground path used at startup: returns cached payload if fresh,
 * otherwise undefined (caller should fetch live, write, and seed background refresh).
 */
export function freshCachedModels(cachePath: string = defaultModelsCachePath()): RecommendedModelsResponse | undefined {
  const cache = readCache(cachePath)
  return cache && !isCacheStale(cache) ? cache.data : undefined
}

export function resetModelsCacheForTests(): void {
  updateInFlight = null
}
