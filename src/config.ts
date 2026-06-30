import { homedir } from "node:os"
import { join } from "node:path"

export const CLINE_API_BASE_URL = "https://api.cline.bot"
export const CLINE_CHAT_URL = `${CLINE_API_BASE_URL}/api/v1/chat/completions`
export const CLINE_REFRESH_URL = `${CLINE_API_BASE_URL}/api/v1/auth/refresh`
export const CLINE_AUTH_REGISTER_URL = `${CLINE_API_BASE_URL}/api/v1/auth/register`
export const CLINE_CURRENT_USER_URL = `${CLINE_API_BASE_URL}/api/v1/users/me`
export const CLINE_MODELS_URL = `${CLINE_API_BASE_URL}/api/v1/ai/cline/recommended-models`

export const WORKOS_CLIENT_ID = "client_01K3A541FN8TA3EPPHTD2325AR"
export const WORKOS_DEVICE_AUTH_URL = "https://api.workos.com/user_management/authorize/device"
export const WORKOS_AUTHENTICATE_URL = "https://api.workos.com/user_management/authenticate"

/** Network timeouts (ms). Auth/registration requests are short-lived. */
export const CLINE_AUTH_TIMEOUT_MS = Number(process.env.CLINE_AUTH_TIMEOUT_MS?.trim()) || 15_000
export const CLINE_MODELS_TIMEOUT_MS = Number(process.env.CLINE_MODELS_TIMEOUT_MS?.trim()) || 15_000

/** Retry backoff for transient 429/5xx failures. */
export const CLINE_RETRY_COUNT = Number(process.env.CLINE_RETRY_COUNT?.trim()) || 4
export const CLINE_RETRY_DELAY_MS = Number(process.env.CLINE_RETRY_DELAY_MS?.trim()) || 1_000

/** On-disk models cache: TTL and file location. */
export const CLINEPASS_MODELS_CACHE_TTL_MS = Number(process.env.CLINEPASS_MODELS_CACHE_TTL_MS?.trim()) || 24 * 60 * 60 * 1000

export function defaultProviderSettingsPath(): string {
  return process.env.CLINE_PROVIDER_SETTINGS_PATH?.trim() || join(homedir(), ".cline", "data", "settings", "providers.json")
}

export function defaultModelsCachePath(): string {
  return process.env.CLINEPASS_MODELS_CACHE_PATH?.trim() || join(homedir(), ".cline", "data", "cache", "clinepass-models.json")
}
