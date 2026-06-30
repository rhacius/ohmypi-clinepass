export const CLINEPASS_PROVIDER_ID = "clinepass"
export const CLINEPASS_DISPLAY_NAME = "ClinePass"
export const CLINEPASS_BASE_URL = "https://api.cline.bot/api/v1"
export const CLINEPASS_DEFAULT_CONTEXT_WINDOW = 128_000
export const CLINEPASS_DEFAULT_MAX_TOKENS = 8_192

/**
 * Per-model specs from vendor documentation.
 * Cline source defaults to 128k/8192 but enriches from OpenRouter.
 * We use a static table instead since the ClinePass API returns only id/name/description.
 *
 * Sources: z.ai/blog/glm-5.2, qwencloud.com, api-docs.deepseek.com,
 * platform.kimi.ai, minimax.io
 */
export const CLINEPASS_MODEL_SPECS: Readonly<Record<string, { contextWindow: number; maxTokens: number }>> = {
  "cline-pass/glm-5.2": { contextWindow: 1_000_000, maxTokens: 131_072 },
  "cline-pass/qwen3.7-max": { contextWindow: 1_000_000, maxTokens: 66_000 },
  "cline-pass/qwen3.7-plus": { contextWindow: 1_000_000, maxTokens: 66_000 },
  "cline-pass/deepseek-v4-pro": { contextWindow: 1_000_000, maxTokens: 384_000 },
  "cline-pass/deepseek-v4-flash": { contextWindow: 1_000_000, maxTokens: 384_000 },
  "cline-pass/kimi-k2.7-code": { contextWindow: 262_144, maxTokens: 8_192 },
  "cline-pass/minimax-m3": { contextWindow: 1_000_000, maxTokens: 512_000 },
}

export function modelSpecsFor(id: string): { contextWindow: number; maxTokens: number } {
  return CLINEPASS_MODEL_SPECS[id] ?? { contextWindow: CLINEPASS_DEFAULT_CONTEXT_WINDOW, maxTokens: CLINEPASS_DEFAULT_MAX_TOKENS }
}

const CLINE_CLIENT_VERSION = "4.0.4"

/**
 * Cline client identification headers, matching Cline VS Code ext v4.0.4
 * `buildBasicClineHeaders()`. X-PLATFORM is derived from process.platform;
 * X-PLATFORM-VERSION stays "unknown" — the legitimate Cline fallback when no
 * host IDE is present (this package runs outside an editor).
 */
export const CLINE_CLIENT_HEADERS = {
  "User-Agent": `Cline/${CLINE_CLIENT_VERSION}`,
  "X-PLATFORM": process.platform,
  "X-PLATFORM-VERSION": "unknown",
  "X-CLIENT-TYPE": "vscode",
  "X-CLIENT-VERSION": CLINE_CLIENT_VERSION,
  "X-CORE-VERSION": CLINE_CLIENT_VERSION,
} as const

export const CLINEPASS_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const
