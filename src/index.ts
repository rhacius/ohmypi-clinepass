import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Effect } from "effect"
import { CLINEPASS_BASE_URL, CLINEPASS_PROVIDER_ID } from "./constants.ts"
import { discoverClinePassModels, fallbackClinePassModels } from "./discovery.ts"
import { createClinePassOAuthProvider } from "./pi-oauth.ts"

export default async function (pi: ExtensionAPI): Promise<void> {
  const models = await Effect.runPromise(
    discoverClinePassModels().pipe(
      Effect.catchTag("UpstreamError", (error) => {
        console.warn(`[pi-clinepass] Failed to fetch live ClinePass models; using fallback list. ${error.message}`)
        return Effect.succeed(fallbackClinePassModels())
      }),
    ),
  )

  pi.registerProvider(CLINEPASS_PROVIDER_ID, {
    baseUrl: CLINEPASS_BASE_URL,
    models,
    oauth: createClinePassOAuthProvider(),
  })
}
