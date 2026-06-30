import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent"
import { Effect } from "effect"
import { CLINEPASS_BASE_URL, CLINEPASS_PROVIDER_ID } from "./constants.js"
import { buildClinePassModels, fallbackClinePassModels, fetchClinePassModelEntries, parseClinePassModelEntries } from "./discovery.js"
import type { ClinePassModelConfig, RecommendedModelsResponse } from "./discovery.js"
import { freshCachedModels, updateCachedModelsInBackground, writeCachedModels } from "./models-cache.js"
import { createClinePassOAuthProvider } from "./pi-oauth.js"

type RegisteredProviderConfig = Parameters<ExtensionAPI["registerProvider"]>[1]

export default async function (pi: ExtensionAPI): Promise<void> {
  // Fast path: serve a fresh on-disk cache without any network call.
  const cached = freshCachedModels()
  const models: ClinePassModelConfig[] = cached
    ? buildClinePassModels(parseClinePassModelEntries(cached))
    : await loadModelsFromNetwork()

  // Seed background refresh for the next launch when the cache is stale/missing.
  if (!cached) {
    updateCachedModelsInBackground(fetchClinePassModelsPayloadForCache)
  }

  pi.registerProvider(CLINEPASS_PROVIDER_ID, {
    baseUrl: CLINEPASS_BASE_URL,
    models: models as RegisteredProviderConfig["models"],
    oauth: createClinePassOAuthProvider(),
  })
}

/** Fetches the raw recommended-models payload for the background cache refresh. */
async function fetchClinePassModelsPayloadForCache(): Promise<RecommendedModelsResponse> {
  const entries = await Effect.runPromise(
    fetchClinePassModelEntries().pipe(
      Effect.catchTag("UpstreamError", (error) => {
        process.stderr.write(`[ohmypi-clinepass] Background model refresh failed: ${error.message}\n`)
        return Effect.succeed([])
      }),
    ),
  )
  return { clinePass: entries.map((entry) => ({ id: entry.id, ...(entry.name ? { name: entry.name } : {}), ...(entry.description ? { description: entry.description } : {}) })) }
}

/** Live network path: fetch, persist raw payload, then build models. Falls back on failure. */
async function loadModelsFromNetwork(): Promise<ClinePassModelConfig[]> {
  try {
    const payload = await fetchClinePassModelsPayloadForCache()
    if (payload.clinePass?.length) writeCachedModels(payload)
    return buildClinePassModels(parseClinePassModelEntries(payload))
  } catch {
    return fallbackClinePassModels()
  }
}
