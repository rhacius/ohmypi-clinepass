export interface BackoffOptions {
  retries: number
  delayMs: number
  shouldRetry?: (error: unknown, attempt: number) => boolean
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

/**
 * Linear backoff retry. Attempts `fn` up to `retries` times, sleeping
 * `delayMs * attempt` between tries. `shouldRetry` can short-circuit errors
 * that are not worth retrying (e.g. non-429/5xx HTTP failures).
 */
export async function backoff<T>(fn: () => Promise<T>, options: BackoffOptions): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= options.retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt >= options.retries) throw error
      if (options.shouldRetry && !options.shouldRetry(error, attempt)) throw error
      await sleep(options.delayMs * attempt)
    }
  }
  throw lastError
}
