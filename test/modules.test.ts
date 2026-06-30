import { afterEach, describe, expect, it, mock } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import os from "node:os"
import { backoff } from "../src/backoff.ts"
import { fetchWithTimeout, safeJson } from "../src/http.ts"
import { freshCachedModels, isCacheStale, pendingModelsRefresh, readCachedModels, resetModelsCacheForTests, updateCachedModelsInBackground, writeCachedModels } from "../src/models-cache.ts"

const tmpRoot = join(os.tmpdir(), `clinepass-test-${process.pid}`)

afterEach(() => {
  resetModelsCacheForTests()
  rmSync(tmpRoot, { recursive: true, force: true })
})

describe("fetchWithTimeout", () => {
  it("aborts the request after the timeout", async () => {
    const fetcher = mock((_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
      }),
    ) as unknown as typeof fetch
    await expect(fetchWithTimeout("https://example.com", 10, undefined, fetcher)).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("resolves normally when the request finishes before the timeout", async () => {
    const fetcher = mock(async () => new Response("ok")) as unknown as typeof fetch
    const response = await fetchWithTimeout("https://example.com", 5_000, undefined, fetcher)
    expect(await response.text()).toBe("ok")
  })
})

describe("safeJson", () => {
  it("returns parsed JSON for valid responses", async () => {
    const response = new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } })
    expect(await safeJson<{ ok: boolean }>(response)).toEqual({ ok: true })
  })

  it("returns null for invalid JSON", async () => {
    const response = new Response("not-json", { headers: { "content-type": "text/plain" } })
    expect(await safeJson(response)).toBeNull()
  })
})

describe("backoff", () => {
  it("retries up to the retry count on failure", async () => {
    let attempts = 0
    const result = await backoff(async () => {
      attempts++
      if (attempts < 3) throw new Error("transient")
      return "ok"
    }, { retries: 5, delayMs: 1 })
    expect(result).toBe("ok")
    expect(attempts).toBe(3)
  })

  it("stops early when shouldRetry returns false", async () => {
    let attempts = 0
    await expect(
      backoff(async () => {
        attempts++
        throw new Error("permanent")
      }, { retries: 5, delayMs: 1, shouldRetry: () => false }),
    ).rejects.toThrow("permanent")
    expect(attempts).toBe(1)
  })

  it("throws the last error after exhausting retries", async () => {
    let attempts = 0
    await expect(
      backoff(async () => {
        attempts++
        throw new Error(`attempt-${attempts}`)
      }, { retries: 2, delayMs: 1 }),
    ).rejects.toThrow("attempt-2")
    expect(attempts).toBe(2)
  })
})

describe("models-cache", () => {
  it("round-trips a payload through disk", () => {
    const cachePath = join(tmpRoot, "models.json")
    const payload = { clinePass: [{ id: "cline-pass/glm-5.2", name: "GLM 5.2" }] }
    writeCachedModels(payload, cachePath)
    expect(readCachedModels(cachePath)).toEqual(payload)
  })

  it("treats a cache without lastUpdatedAt as stale", () => {
    const cachePath = join(tmpRoot, "stale.json")
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(cachePath, JSON.stringify({ data: { clinePass: [] } }))
    const cached = readCachedModels(cachePath)
    expect(isCacheStale(cached ? { data: cached, lastUpdatedAt: undefined } : undefined)).toBe(true)
  })

  it("returns fresh payload from freshCachedModels within TTL", () => {
    const cachePath = join(tmpRoot, "fresh.json")
    const payload = { clinePass: [{ id: "cline-pass/glm-5.2" }] }
    writeCachedModels(payload, cachePath)
    expect(freshCachedModels(cachePath)).toEqual(payload)
  })

  it("returns undefined when the cache file is missing", () => {
    expect(freshCachedModels(join(tmpRoot, "missing.json"))).toBeUndefined()
  })

  it("refreshes a stale cache in the background", async () => {
    const cachePath = join(tmpRoot, "bg-refresh.json")
    const stalePayload = { clinePass: [{ id: "cline-pass/old" }] }
    writeCachedModels(stalePayload, cachePath)
    // Force staleness by backdating the timestamp.
    writeFileSync(cachePath, JSON.stringify({ data: stalePayload, lastUpdatedAt: "2000-01-01T00:00:00.000Z" }))

    const freshPayload = { clinePass: [{ id: "cline-pass/new" }] }
    updateCachedModelsInBackground(async () => freshPayload, cachePath)
    // Await the in-flight refresh promise directly instead of guessing a delay.
    await pendingModelsRefresh()
    expect(readCachedModels(cachePath)).toEqual(freshPayload)
  })

  it("skips refresh when the cache is fresh", async () => {
    const cachePath = join(tmpRoot, "fresh-skip.json")
    const payload = { clinePass: [{ id: "cline-pass/glm-5.2" }] }
    writeCachedModels(payload, cachePath)
    const fetcher = mock(async () => ({ clinePass: [{ id: "cline-pass/other" }] }))
    updateCachedModelsInBackground(fetcher, cachePath)
    expect(pendingModelsRefresh()).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
