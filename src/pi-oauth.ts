import type { Api, Model, OAuthCredentials, OAuthLoginCallbacks, OAuthProviderInterface } from "@oh-my-pi/pi-ai"
import { Effect } from "effect"
import { CLINE_AUTH_REGISTER_URL, CLINE_AUTH_TIMEOUT_MS, CLINE_CURRENT_USER_URL, CLINE_REFRESH_URL, WORKOS_AUTHENTICATE_URL, WORKOS_CLIENT_ID, WORKOS_DEVICE_AUTH_URL } from "./config.js"
import { CLINEPASS_DISPLAY_NAME, CLINEPASS_PROVIDER_ID } from "./constants.js"
import { AuthError } from "./errors.js"
import { fetchWithTimeout } from "./http.js"

const DEFAULT_EXPIRES_IN_SECONDS = 300
const DEFAULT_POLL_INTERVAL_SECONDS = 5
const REFRESH_FALLBACK_EXPIRES_MS = 60 * 60 * 1000

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

type ClineTokenResponse = {
  success?: boolean
  data?: {
    accessToken?: string
    refreshToken?: string
    expiresAt?: string
    userInfo?: {
      clineUserId?: string | null
      email?: string
      [key: string]: unknown
    }
    [key: string]: unknown
  }
}

type ClineUserEnvelope = {
  success?: boolean
  data?: { id?: string; email?: string; [key: string]: unknown }
}

type DeviceCodeInfo = {
  userCode: string
  verificationUri: string
  intervalSeconds?: number
  expiresInSeconds?: number
}

type ClinePassOAuthLoginCallbacks = OAuthLoginCallbacks & {
  onDeviceCode?: (info: DeviceCodeInfo) => void
}

function expiresAtMs(value?: string): number {
  if (!value) return Date.now() + REFRESH_FALLBACK_EXPIRES_MS
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Date.now() + REFRESH_FALLBACK_EXPIRES_MS
}

function withoutWorkosPrefix(token: string): string {
  return token.startsWith("workos:") ? token.slice("workos:".length) : token
}

export function withWorkosPrefix(token: string): string {
  return token.startsWith("workos:") ? token : `workos:${token}`
}

function credentialsFromClineResponse(payload: ClineTokenResponse, fallbackRefresh?: string): Effect.Effect<OAuthCredentials, AuthError> {
  const access = payload.data?.accessToken
  const refresh = payload.data?.refreshToken ?? fallbackRefresh
  if (!payload.success || !access || !refresh) {
    return Effect.fail(new AuthError({ message: "Cline OAuth response missing tokens" }))
  }
  return Effect.succeed({
    access: withoutWorkosPrefix(access),
    refresh,
    expires: expiresAtMs(payload.data?.expiresAt),
    accountId: payload.data?.userInfo?.clineUserId ?? undefined,
    email: payload.data?.userInfo?.email ?? undefined,
  })
}

function decodeJson<T>(response: Response, label: string) {
  return Effect.tryPromise({
    try: () => response.json() as Promise<T>,
    catch: (cause) => new AuthError({ message: `${label} returned invalid JSON`, status: response.status, cause }),
  })
}

function postForm<T>(url: string, body: URLSearchParams, fetcher: typeof fetch) {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetchWithTimeout(url, CLINE_AUTH_TIMEOUT_MS, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body }, fetcher),
      catch: (cause) => new AuthError({ message: "OAuth network request failed", cause }),
    })
    const payload = yield* decodeJson<T & { error?: string; error_description?: string }>(response, "OAuth request")
    if (!response.ok) {
      return yield* Effect.fail(new AuthError({ message: payload.error_description || payload.error || `OAuth request failed with HTTP ${response.status}`, status: response.status }))
    }
    return payload
  })
}

function postJson<T>(url: string, value: unknown, fetcher: typeof fetch) {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetchWithTimeout(url, CLINE_AUTH_TIMEOUT_MS, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }, fetcher),
      catch: (cause) => new AuthError({ message: "Cline OAuth request failed", cause }),
    })
    const payload = yield* decodeJson<T>(response, "Cline OAuth request")
    if (!response.ok) {
      return yield* Effect.fail(new AuthError({ message: `Cline OAuth request failed with HTTP ${response.status}`, status: response.status }))
    }
    return payload
  })
}

export function startClineDeviceAuth(fetcher: typeof fetch = fetch) {
  return Effect.gen(function* () {
    const payload = yield* postForm<DeviceAuthResponse>(WORKOS_DEVICE_AUTH_URL, new URLSearchParams({ client_id: WORKOS_CLIENT_ID }), fetcher)
    if (!payload.device_code || !payload.user_code || !payload.verification_uri) {
      return yield* Effect.fail(new AuthError({ message: "WorkOS device auth response missing required fields" }))
    }
    return {
      deviceCode: payload.device_code,
      userCode: payload.user_code,
      verificationUri: payload.verification_uri,
      verificationUriComplete: payload.verification_uri_complete ?? payload.verification_uri,
      expiresInSeconds: payload.expires_in ?? DEFAULT_EXPIRES_IN_SECONDS,
      intervalSeconds: payload.interval ?? DEFAULT_POLL_INTERVAL_SECONDS,
    }
  })
}

function sleep(ms: number) {
  return Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, ms)))
}

export function pollWorkOsDeviceToken(input: { deviceCode: string; expiresInSeconds: number; intervalSeconds: number; callbacks?: ClinePassOAuthLoginCallbacks; fetcher?: typeof fetch }) {
  return Effect.gen(function* () {
    const fetcher = input.fetcher ?? fetch
    const deadline = Date.now() + input.expiresInSeconds * 1000
    let intervalSeconds = Math.max(1, input.intervalSeconds || DEFAULT_POLL_INTERVAL_SECONDS)

    while (Date.now() < deadline) {
      if (input.callbacks?.signal?.aborted) return yield* Effect.fail(new AuthError({ message: "ClinePass login cancelled" }))
      const response = yield* Effect.tryPromise({
        try: () => fetchWithTimeout(WORKOS_AUTHENTICATE_URL, CLINE_AUTH_TIMEOUT_MS, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: input.deviceCode,
            client_id: WORKOS_CLIENT_ID,
          }),
        }, fetcher),
        catch: (cause) => new AuthError({ message: "WorkOS polling failed", cause }),
      })
      const payload = yield* decodeJson<WorkOsTokenResponse>(response, "WorkOS polling")
      if (response.ok) {
        if (!payload.access_token || !payload.refresh_token) {
          return yield* Effect.fail(new AuthError({ message: "WorkOS token response missing tokens", status: response.status }))
        }
        return payload
      }
      if (payload.error === "authorization_pending") {
        yield* sleep(intervalSeconds * 1000)
        continue
      }
      if (payload.error === "slow_down") {
        intervalSeconds += 5
        yield* sleep(intervalSeconds * 1000)
        continue
      }
      return yield* Effect.fail(new AuthError({ message: payload.error_description || payload.error || `WorkOS polling failed with HTTP ${response.status}`, status: response.status }))
    }

    return yield* Effect.fail(new AuthError({ message: "WorkOS device authorization expired" }))
  })
}

/**
 * Validates a freshly issued/refreshed Cline access token via GET /users/me.
 * Non-fatal: a failure surfaces a stderr warning but does not reject the
 * credentials, since the token envelope was already validated by the issuer.
 */
function validateClinePassToken(credentials: OAuthCredentials, fetcher: typeof fetch) {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetchWithTimeout(CLINE_CURRENT_USER_URL, CLINE_AUTH_TIMEOUT_MS, {
        method: "GET",
        headers: { accept: "application/json", authorization: `Bearer ${withWorkosPrefix(credentials.access)}` },
      }, fetcher),
      catch: (cause) => new AuthError({ message: "ClinePass token validation request failed", cause }),
    })
    if (!response.ok) {
      return yield* Effect.fail(new AuthError({ message: `ClinePass token validation failed with HTTP ${response.status}`, status: response.status }))
    }
    const payload = yield* decodeJson<ClineUserEnvelope>(response, "ClinePass token validation")
    if (!payload.success || !payload.data) {
      return yield* Effect.fail(new AuthError({ message: "ClinePass token validation returned invalid response" }))
    }
    return credentials
  }).pipe(
    Effect.catchTag("AuthError", (error) => {
      process.stderr.write(`[ohmypi-clinepass] Token validation warning: ${error.message}\n`)
      return Effect.succeed(credentials)
    }),
  )
}

export function registerWorkOsTokens(tokens: WorkOsTokenResponse, fetcher: typeof fetch = fetch) {
  return postJson<ClineTokenResponse>(CLINE_AUTH_REGISTER_URL, { accessToken: tokens.access_token, refreshToken: tokens.refresh_token }, fetcher).pipe(
    Effect.flatMap((payload) => credentialsFromClineResponse(payload)),
    Effect.flatMap((credentials) => validateClinePassToken(credentials, fetcher)),
  )
}

export function refreshClinePassCredentials(credentials: OAuthCredentials, fetcher: typeof fetch = fetch) {
  return postJson<ClineTokenResponse>(CLINE_REFRESH_URL, { refreshToken: credentials.refresh, grantType: "refresh_token" }, fetcher).pipe(
    Effect.flatMap((payload) => credentialsFromClineResponse(payload, credentials.refresh)),
    Effect.flatMap((refreshed) => validateClinePassToken(refreshed, fetcher)),
  )
}

export function loginClinePass(callbacks: ClinePassOAuthLoginCallbacks, fetcher: typeof fetch = fetch) {
  return Effect.gen(function* () {
    const device = yield* startClineDeviceAuth(fetcher)
    callbacks.onDeviceCode?.({
      userCode: device.userCode,
      verificationUri: device.verificationUri,
      intervalSeconds: device.intervalSeconds,
      expiresInSeconds: device.expiresInSeconds,
    })
    callbacks.onAuth({
      url: device.verificationUriComplete,
      instructions: `Open the Cline auth page and enter code ${device.userCode}`,
    })
    callbacks.onProgress?.("Waiting for ClinePass browser authorization...")
    const workos = yield* pollWorkOsDeviceToken({ ...device, callbacks, fetcher })
    return yield* registerWorkOsTokens(workos, fetcher)
  })
}

export function createClinePassOAuthProvider(options?: { modifyModels?: (models: Model<Api>[]) => Model<Api>[]; fetcher?: typeof fetch }): OAuthProviderInterface {
  const fetcher = options?.fetcher ?? fetch
  const modifyModels = options?.modifyModels
  return {
    id: CLINEPASS_PROVIDER_ID,
    name: CLINEPASS_DISPLAY_NAME,
    login: (callbacks) => Effect.runPromise(loginClinePass(callbacks, fetcher)),
    refreshToken: (credentials) => Effect.runPromise(refreshClinePassCredentials(credentials, fetcher)),
    getApiKey(credentials) {
      if (!credentials.access?.trim()) throw new AuthError({ message: "Stored ClinePass credentials are missing access token. Run /login again." })
      return withWorkosPrefix(credentials.access.trim())
    },
    ...(modifyModels
      ? {
          modifyModels(models: Model<Api>[]) {
            return modifyModels(models)
          },
        }
      : {}),
  }
}
