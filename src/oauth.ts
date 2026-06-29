import { setTimeout as sleep } from "node:timers/promises"
import { Effect } from "effect"
import { CLINE_AUTH_REGISTER_URL, WORKOS_AUTHENTICATE_URL, WORKOS_CLIENT_ID, WORKOS_DEVICE_AUTH_URL } from "./config.ts"
import { AuthError } from "./errors.ts"
import { TokenStore } from "./token-store.ts"
import type { RefreshResponse, SelectedCredentials } from "./types.ts"

const DEFAULT_AUTH_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_POLL_INTERVAL_SECONDS = 5

type DeviceAuthResponse = {
  device_code?: string
  user_code?: string
  verification_uri?: string
  verification_uri_complete?: string
  expires_in?: number
  interval?: number
  error?: string
  error_description?: string
}

type WorkOsTokenResponse = {
  access_token?: string
  refresh_token?: string
  token_type?: string
  error?: string
  error_description?: string
}

export type DeviceLoginPrompt = {
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  expiresInSeconds: number
  intervalSeconds: number
}

export interface DeviceLoginOptions {
  readonly tokenStore: TokenStore
  readonly onPrompt: (prompt: DeviceLoginPrompt) => void
  readonly timeoutMs?: number
}

function parseExpiresAt(value?: string): number | undefined {
  if (!value) return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function toAuthError(cause: unknown, message: string): AuthError {
  return cause instanceof AuthError ? cause : new AuthError({ message, cause })
}

async function postForm<T>(url: string, body: URLSearchParams): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  })
  const payload = (await response.json().catch(() => ({}))) as T
  if (!response.ok) {
    const error = payload as { error?: string; error_description?: string }
    throw new AuthError({
      message: `${error.error_description || error.error || "OAuth request failed"} (HTTP ${response.status})`,
      status: response.status,
    })
  }
  return payload
}

async function startDeviceAuthAsync(): Promise<DeviceAuthResponse> {
  const payload = await postForm<DeviceAuthResponse>(
    WORKOS_DEVICE_AUTH_URL,
    new URLSearchParams({ client_id: WORKOS_CLIENT_ID }),
  )
  if (!payload.device_code || !payload.user_code || !payload.verification_uri) {
    throw new AuthError({ message: "WorkOS device auth response missing required fields" })
  }
  return payload
}

async function pollWorkOsAsync(deviceCode: string, expiresInSeconds: number, intervalSeconds: number): Promise<WorkOsTokenResponse> {
  const deadline = Date.now() + expiresInSeconds * 1000
  let interval = Math.max(1, intervalSeconds || DEFAULT_POLL_INTERVAL_SECONDS)

  while (Date.now() < deadline) {
    const response = await fetch(WORKOS_AUTHENTICATE_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
        client_id: WORKOS_CLIENT_ID,
      }),
    })
    const payload = (await response.json().catch(() => ({}))) as WorkOsTokenResponse

    if (response.ok) {
      if (!payload.access_token || !payload.refresh_token) {
        throw new AuthError({ message: "WorkOS token response missing tokens", status: response.status })
      }
      return payload
    }

    if (payload.error === "authorization_pending") {
      await sleep(interval * 1000)
      continue
    }
    if (payload.error === "slow_down") {
      interval += 1
      await sleep(interval * 1000)
      continue
    }
    throw new AuthError({
      message: payload.error_description || payload.error || `WorkOS token polling failed with HTTP ${response.status}`,
      status: response.status,
    })
  }

  throw new AuthError({ message: "WorkOS device authorization expired" })
}

async function registerWithClineAsync(tokens: WorkOsTokenResponse): Promise<RefreshResponse> {
  const response = await fetch(CLINE_AUTH_REGISTER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token }),
  })
  const payload = (await response.json().catch(() => ({}))) as RefreshResponse
  if (!response.ok) {
    throw new AuthError({ message: `Cline token registration failed with HTTP ${response.status}`, status: response.status })
  }
  if (!payload.success || !payload.data?.accessToken || !payload.data.refreshToken) {
    throw new AuthError({ message: "Cline token registration response missing tokens", status: response.status })
  }
  return payload
}

export async function loginWithDeviceCodeAsync(options: DeviceLoginOptions): Promise<SelectedCredentials> {
  const device = await startDeviceAuthAsync()
  const expiresInSeconds = device.expires_in ?? Math.floor((options.timeoutMs ?? DEFAULT_AUTH_TIMEOUT_MS) / 1000)
  const intervalSeconds = device.interval ?? DEFAULT_POLL_INTERVAL_SECONDS
  options.onPrompt({
    userCode: device.user_code ?? "",
    verificationUri: device.verification_uri ?? "",
    verificationUriComplete: device.verification_uri_complete ?? device.verification_uri ?? "",
    expiresInSeconds,
    intervalSeconds,
  })

  const workosTokens = await pollWorkOsAsync(device.device_code ?? "", expiresInSeconds, intervalSeconds)
  const clineTokens = await registerWithClineAsync(workosTokens)
  return await options.tokenStore.updateCredentialsAsync("cline", {
    accessToken: clineTokens.data?.accessToken ?? "",
    refreshToken: clineTokens.data?.refreshToken ?? "",
    expiresAt: parseExpiresAt(clineTokens.data?.expiresAt),
    accountId: clineTokens.data?.userInfo?.clineUserId ?? undefined,
  })
}

export function loginWithDeviceCode(options: DeviceLoginOptions) {
  return Effect.tryPromise({
    try: () => loginWithDeviceCodeAsync(options),
    catch: (cause) => toAuthError(cause, "ClinePass OAuth device login failed"),
  })
}
