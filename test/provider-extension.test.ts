import { afterEach, describe, expect, it, mock } from "bun:test"
import extension from "../src/index.ts"
import { buildClinePassModels, parseClinePassModelEntries, toClinePassModelConfig } from "../src/discovery.ts"
import { CLINEPASS_BASE_URL, CLINEPASS_PROVIDER_ID } from "../src/constants.ts"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function jsonResponse(value: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(value), { status: 200, ...init, headers: { "content-type": "application/json" } })
}

describe("ClinePass model discovery/config", () => {
  it("parses clinePass model entries only", () => {
    expect(parseClinePassModelEntries({ clinePass: [{ id: "cline-pass/glm-5.2" }, { id: "openai/gpt" }] })).toEqual([
      { id: "cline-pass/glm-5.2" },
    ])
  })

  it("builds OpenAI completions model config with Cline gateway compat", () => {
    const model = toClinePassModelConfig({ id: "cline-pass/glm-5.2" })
    expect(model).toMatchObject({
      id: "cline-pass/glm-5.2",
      provider: CLINEPASS_PROVIDER_ID,
      baseUrl: CLINEPASS_BASE_URL,
      api: "openai-completions",
      reasoning: true,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 8192,
      headers: {
        "User-Agent": "Cline/4.0.0",
        "X-CLIENT-TYPE": "vscode",
      },
      compat: {
        thinkingFormat: "openrouter",
        cacheControlFormat: "anthropic",
        supportsUsageInStreaming: true,
        maxTokensField: "max_tokens",
      },
    })
    expect(model.compat?.thinkingFormat).not.toBe("zai")
  })

  it("dedupes discovered models", () => {
    expect(buildClinePassModels([{ id: "cline-pass/glm-5.2" }, { id: "cline-pass/glm-5.2" }])).toHaveLength(1)
  })
})

describe("Pi provider extension", () => {
  it("registers ClinePass provider with models and OAuth object", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse({ clinePass: [{ id: "cline-pass/glm-5.2", name: "GLM 5.2" }, { id: "cline-pass/qwen3.7-max" }] }),
    ) as unknown as typeof fetch
    const registerProvider = mock(() => undefined)

    await extension({ registerProvider } as never)

    expect(registerProvider).toHaveBeenCalledTimes(1)
    const [providerId, config] = registerProvider.mock.calls[0] as unknown as [string, { baseUrl: string; models: Array<Record<string, unknown>>; oauth: Record<string, unknown> }]
    expect(providerId).toBe(CLINEPASS_PROVIDER_ID)
    expect(config.baseUrl).toBe(CLINEPASS_BASE_URL)
    expect(config.models.map((model) => model.id)).toEqual(["cline-pass/glm-5.2", "cline-pass/qwen3.7-max"])
    expect(config.models[0]).toMatchObject({
      api: "openai-completions",
      headers: { "X-CORE-VERSION": "4.0.0" },
      compat: { thinkingFormat: "openrouter", cacheControlFormat: "anthropic" },
    })
    expect(typeof config.oauth.login).toBe("function")
    expect(typeof config.oauth.refreshToken).toBe("function")
    expect(typeof config.oauth.getApiKey).toBe("function")
  })
})
