export const CLINEPASS_PROVIDER_ID = "clinepass"
export const CLINEPASS_DISPLAY_NAME = "ClinePass"
export const CLINEPASS_BASE_URL = "https://api.cline.bot/api/v1"
export const CLINEPASS_DEFAULT_CONTEXT_WINDOW = 128_000
export const CLINEPASS_DEFAULT_MAX_TOKENS = 8_192

export const CLINE_CLIENT_HEADERS = {
  "User-Agent": "Cline/4.0.0",
  "X-PLATFORM": "linux",
  "X-PLATFORM-VERSION": "unknown",
  "X-CLIENT-TYPE": "vscode",
  "X-CLIENT-VERSION": "4.0.0",
  "X-CORE-VERSION": "4.0.0",
} as const

export const CLINEPASS_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const
