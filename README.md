# ohmypi-clinepass

> Fork of [codewithkenzo/pi-clinepass](https://github.com/codewithkenzo/pi-clinepass), updated to work with Oh My Pi (OMP).

ClinePass models inside Oh My Pi through OMP's native provider system.

`ohmypi-clinepass` registers a real `clinepass` provider with OAuth device login, live ClinePass model discovery, OMP-compatible OpenAI chat transport, prompt cache markers, and reasoning controls tuned for GLM/Qwen/Kimi/DeepSeek-style models.

## What works

- Provider id: `clinepass`
- Primary model: `cline-pass/glm-5.2`
- Auth: OMP `/login` OAuth flow using the Cline/WorkOS device-code flow
- Model list: live Cline recommended-models endpoint, filtered to `clinePass[]`
- Transport: `openai-completions` against `https://api.cline.bot/api/v1`
- Token handling: OMP stores OAuth credentials; this package returns `workos:<access>` only to OMP's provider auth path
- Reasoning: OMP thinking levels map to ClinePass-compatible `reasoning` params
- Prompt caching: OMP emits Anthropic-style cache-control markers where supported

No API key required. No tokens printed.

## Install locally

From a checkout:

```bash
bun install
bun run typecheck
bun test
omp install .
```

From GitHub after pushing this fork:

```bash
omp install github:<user>/ohmypi-clinepass
```

Or install a local checkout explicitly:

```bash
omp plugin install ./path/to/ohmypi-clinepass
```

Then restart OMP or run the extension reload flow if available.

## Login + use

In OMP:

1. Run `/login`
2. Choose **ClinePass**
3. Open the browser/device URL and enter the shown code
4. Run `/model`
5. Pick `clinepass/cline-pass/glm-5.2`

Exact model string for CLI/non-interactive runs:

```bash
omp --model clinepass/cline-pass/glm-5.2 "Say OK"
```

## Model discovery

The extension fetches:

```text
https://api.cline.bot/api/v1/ai/cline/recommended-models
```

It reads `clinePass[]`, dedupes model ids, and falls back to a small built-in list if discovery is unavailable.

Known models include:

- `cline-pass/glm-5.2` — 1M context, 131K output
- `cline-pass/qwen3.7-max` — 1M context, 66K output
- `cline-pass/qwen3.7-plus` — 1M context, 66K output
- `cline-pass/kimi-k2.7-code` — 256K context
- `cline-pass/deepseek-v4-pro` — 1M context, 384K output
- `cline-pass/deepseek-v4-flash` — 1M context, 384K output
- `cline-pass/minimax-m3` — 1M context, 512K output

## OAuth behavior

Flow:

1. Start WorkOS device auth with Cline's production client id.
2. Show the OMP browser callback with the Cline device code instructions.
3. Poll WorkOS until approved.
4. Register WorkOS tokens with Cline `/api/v1/auth/register`.
5. Return OMP `OAuthCredentials` with Cline access/refresh/expires metadata.
6. Refresh through Cline `/api/v1/auth/refresh` when needed.
7. Send requests with `Authorization: Bearer workos:<access>`.

Token rule: this repo never logs access or refresh tokens.

## ClinePass compatibility

Each model is registered with:

```ts
{
  api: "openai-completions",
  input: ["text"],
  contextWindow: 1_000_000, // per-model from vendor docs
  maxTokens: 131_072,       // per-model from vendor docs
  reasoning: true,
  compat: {
    thinkingFormat: "openrouter",
    reasoningDisableMode: "openrouter-enabled-false",
    cacheControlFormat: "anthropic",
    supportsUsageInStreaming: true,
    supportsReasoningEffort: true,
    supportsStore: false,
    supportsDeveloperRole: false,
    maxTokensField: "max_tokens"
  }
}
```

Why `thinkingFormat: "openrouter"` plus `reasoningDisableMode: "openrouter-enabled-false"`:

- ClinePass accepts top-level `reasoning` objects.
- `{ reasoning: { enabled: false } }` suppresses GLM reasoning.
- OMP's default OpenRouter off state can emit `{ reasoning: { effort: "none" } }`, which ClinePass does not suppress.
- z.ai-native `thinking: { type: "disabled" }` is also ignored by ClinePass.

## Development

```bash
bun install
bun run typecheck
bun test
```

Useful smoke test after local install:

```bash
omp --model clinepass/cline-pass/glm-5.2 -p "Reply exactly OK"
```

If it says `No API key found for clinepass`, the extension loaded correctly; run `/login`.

## Package surface

OMP loads this package through either manifest field:

```json
{
  "omp": {
    "extensions": ["./src/index.ts"]
  },
  "pi": {
    "extensions": ["./src/index.ts"]
  }
}
```

Runtime entrypoint: `src/index.ts`.

