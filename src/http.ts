/**
 * Fetch with an abort timeout. Mirrors pi-cline's fetchWithTimeout: an
 * AbortController fires after timeoutMs, combined with any caller-supplied
 * signal via AbortSignal.any so both can abort the request. An optional
 * fetcher (defaults to global fetch) preserves test injection.
 */
export function fetchWithTimeout(
  input: string | URL,
  timeoutMs: number,
  init?: RequestInit,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const timeoutController = new AbortController()
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs)
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutController.signal])
    : timeoutController.signal
  return fetcher(input, { ...init, signal }).finally(() => clearTimeout(timeout))
}

/**
 * Best-effort JSON parse. Returns null on failure instead of throwing, so
 * callers can fall back to text/status for error reporting.
 */
export async function safeJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}
