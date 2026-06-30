import { Effect } from "effect"
import { backoff } from "./backoff.js"
import { CLINE_MODELS_TIMEOUT_MS, CLINE_MODELS_URL, CLINE_RETRY_COUNT, CLINE_RETRY_DELAY_MS } from "./config.js"
import {
  CLINE_CLIENT_HEADERS,
  CLINEPASS_BASE_URL,
  CLINEPASS_COST,
  CLINEPASS_PROVIDER_ID,
  modelSpecsFor,
} from "./constants.js"
import { UpstreamError } from "./errors.js"
import { fetchWithTimeout } from "./http.js"

class ModelsHttpError {
  readonly status: number
  readonly message: string
  readonly cause?: unknown
  constructor(status: number, message: string, cause?: unknown) {
    this.status = status
    this.message = message
    this.cause = cause
  }
}

export interface RecommendedModelsResponse {
  clinePass?: Array<{ id: string; name?: string; description?: string }>
  [key: string]: unknown
}

export interface ClinePassModelEntry {
  readonly id: string
  readonly name?: string
  readonly description?: string
}

const FALLBACK_MODELS: readonly ClinePassModelEntry[] = [
  { id: "cline-pass/glm-5.2", name: "cline-pass/glm-5.2" },
  { id: "cline-pass/qwen3.7-max", name: "cline-pass/qwen3.7-max" },
  { id: "cline-pass/qwen3.7-plus", name: "cline-pass/qwen3.7-plus" },
  { id: "cline-pass/kimi-k2.7-code", name: "cline-pass/kimi-k2.7-code" },
  { id: "cline-pass/deepseek-v4-pro", name: "cline-pass/deepseek-v4-pro" },
  { id: "cline-pass/deepseek-v4-flash", name: "cline-pass/deepseek-v4-flash" },
  { id: "cline-pass/minimax-m3", name: "cline-pass/minimax-m3" },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeEntry(value: unknown): ClinePassModelEntry | undefined {
  if (!isRecord(value) || typeof value.id !== "string") return undefined
  const id = value.id.trim()
  if (!id.startsWith("cline-pass/")) return undefined
  return {
    id,
    ...(typeof value.name === "string" && value.name.trim() ? { name: value.name.trim() } : {}),
    ...(typeof value.description === "string" ? { description: value.description } : {}),
  }
}

function uniqueModels(entries: readonly ClinePassModelEntry[]): ClinePassModelEntry[] {
  const seen = new Set<string>()
  const result: ClinePassModelEntry[] = []
  for (const entry of entries) {
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    result.push(entry)
  }
  return result
}

export function parseClinePassModelEntries(payload: RecommendedModelsResponse): ClinePassModelEntry[] {
  const entries = Array.isArray(payload.clinePass) ? payload.clinePass : []
  return uniqueModels(entries.flatMap((entry) => {
    const normalized = normalizeEntry(entry)
    return normalized ? [normalized] : []
  }))
}

/** Retry on transient 429/5xx and network errors; bail otherwise. */
function shouldRetryModels(error: unknown): boolean {
  if (error instanceof ModelsHttpError) {
    return error.status === 429 || error.status >= 500
  }
  return true
}

export function fetchClinePassModelEntries(fetcher: typeof fetch = fetch) {
  return Effect.gen(function* () {
    let payload: RecommendedModelsResponse
    try {
      payload = yield* Effect.promise(() =>
        backoff(async () => {
          const response = await fetchWithTimeout(
            CLINE_MODELS_URL,
            CLINE_MODELS_TIMEOUT_MS,
            { headers: { accept: "application/json" } },
            fetcher,
          ).catch((cause) => {
            throw new ModelsHttpError(0, "Failed to fetch ClinePass model list", cause)
          })
          const text = await response.text().catch((cause) => {
            throw new ModelsHttpError(response.status, "Failed to read ClinePass model response", cause)
          })
          if (!response.ok) {
            throw new ModelsHttpError(response.status, `ClinePass model list failed with HTTP ${response.status}`, text.slice(0, 500))
          }
          try {
            return JSON.parse(text) as RecommendedModelsResponse
          } catch (cause) {
            throw new ModelsHttpError(response.status, "ClinePass model list returned invalid JSON", cause)
          }
        }, { retries: CLINE_RETRY_COUNT, delayMs: CLINE_RETRY_DELAY_MS, shouldRetry: shouldRetryModels }),
      )
    } catch (error) {
      const http = error instanceof ModelsHttpError ? error : undefined
      return yield* Effect.fail(new UpstreamError({
        message: http?.message ?? "Failed to fetch ClinePass model list",
        status: http?.status || undefined,
        body: http?.message,
        cause: http?.cause ?? error,
      }))
    }
    const models = parseClinePassModelEntries(payload)
    return models.length > 0 ? models : [...FALLBACK_MODELS]
  })
}

function isReasoningModel(id: string): boolean {
  const normalized = id.toLowerCase()
  return /glm|qwen|minimax|mimo|kimi|deepseek/.test(normalized)
}

function displayName(entry: ClinePassModelEntry): string {
  return entry.name?.trim() || entry.id
}

export interface ClinePassModelConfig {
  id: string
  name: string
  provider: string
  baseUrl: string
  api: "openai-completions"
  reasoning: boolean
  thinkingLevelMap: { minimal: string; low: string; medium: string; high: string; xhigh: string }
  input: ["text"]
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number }
  contextWindow: number
  maxTokens: number
  headers: Record<string, string>
  compat: {
    supportsStore: boolean
    supportsDeveloperRole: boolean
    supportsReasoningEffort: boolean
    supportsUsageInStreaming: boolean
    maxTokensField: string
    requiresToolResultName: boolean
    supportsStrictMode: boolean
    thinkingFormat: string
    reasoningDisableMode: string
    cacheControlFormat: string
  }
}

export function toClinePassModelConfig(entry: ClinePassModelEntry): ClinePassModelConfig {

  const specs = modelSpecsFor(entry.id)
  return {
    id: entry.id,
    name: displayName(entry),
    provider: CLINEPASS_PROVIDER_ID,
    baseUrl: CLINEPASS_BASE_URL,
    api: "openai-completions",
    reasoning: isReasoningModel(entry.id),
    thinkingLevelMap: {
      minimal: "low",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "high",
    },
    input: ["text"],
    cost: { ...CLINEPASS_COST },
    contextWindow: specs.contextWindow,
    maxTokens: specs.maxTokens,
    headers: { ...CLINE_CLIENT_HEADERS },
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: true,
      supportsUsageInStreaming: true,
      maxTokensField: "max_tokens",
      requiresToolResultName: false,
      supportsStrictMode: true,
      thinkingFormat: "openrouter",
      reasoningDisableMode: "openrouter-enabled-false",
      cacheControlFormat: "anthropic",
    },
  }
}

export function buildClinePassModels(entries: readonly ClinePassModelEntry[]): ClinePassModelConfig[] {
  return uniqueModels(entries).map((entry) => toClinePassModelConfig(entry))
}

export function fallbackClinePassModels() {
  return buildClinePassModels(FALLBACK_MODELS)
}
