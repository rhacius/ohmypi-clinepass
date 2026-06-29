import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "bun:test"
import { withDefaultReasoningSuppression } from "../src/proxy.ts"
import { emptyStoredProviders, redactToken, selectCredentials, TokenStore } from "../src/token-store.ts"

describe("withDefaultReasoningSuppression", () => {
  it("adds reasoning exclusion for cline-pass models", () => {
    expect(withDefaultReasoningSuppression({ model: "cline-pass/glm-5.2", messages: [] })).toEqual({
      model: "cline-pass/glm-5.2",
      messages: [],
      reasoning: { exclude: true },
    })
  })

  it("preserves explicit reasoning", () => {
    expect(withDefaultReasoningSuppression({ model: "cline-pass/glm-5.2", reasoning: { enabled: true } })).toEqual({
      model: "cline-pass/glm-5.2",
      reasoning: { enabled: true },
    })
  })

  it("does not mutate non ClinePass models", () => {
    expect(withDefaultReasoningSuppression({ model: "openai/gpt", messages: [] })).toEqual({ model: "openai/gpt", messages: [] })
  })
})

describe("token helpers", () => {
  it("selects cline before cline-pass", () => {
    const selected = selectCredentials({
      providers: {
        "cline-pass": { settings: { auth: { refreshToken: "pass-refresh" } } },
        cline: { settings: { auth: { refreshToken: "cline-refresh", accessToken: "cline-access" } } },
      },
    })
    expect(selected.providerId).toBe("cline")
    expect(selected.refreshToken).toBe("cline-refresh")
  })

  it("redacts tokens", () => {
    expect(redactToken("workos:abcdefghijklmnopqrstuvwxyz")).toBe("abcd…wxyz")
  })

  it("uses empty provider shape for missing custom token file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-clinepass-test-"))
    const path = join(dir, "providers.json")
    const store = new TokenStore(path)

    expect(await store.readStateAsync()).toEqual(emptyStoredProviders())

    await store.updateCredentialsAsync("cline", {
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: 123,
      accountId: "acct",
    })

    const written = JSON.parse(await readFile(path, "utf8")) as { providers?: Record<string, unknown>; lastUsedProvider?: string }
    expect(written.lastUsedProvider).toBe("cline")
    expect(written.providers?.cline).toBeTruthy()
  })
})
