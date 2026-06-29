# pi-clinepass

Pi provider extension for ClinePass subscription models, especially `cline-pass/glm-5.2`.

Primary integration is a real Pi provider registered through `pi.registerProvider`. The older local proxy remains as an optional dev/Hermes fallback.

## What it registers

- Provider id: `clinepass`
- Base URL: `https://api.cline.bot/api/v1`
- API: `openai-completions`
- Auth: Pi `/login` OAuth device-code flow
- Model discovery: live `https://api.cline.bot/api/v1/ai/cline/recommended-models`, using `clinePass[]`
- Model IDs: upstream IDs such as `cline-pass/glm-5.2`

## Pi install/dev

```bash
bun install
bun run typecheck
bun test
```

Package metadata exposes:

```json
{
  "pi": { "extensions": ["./src/index.ts"] }
}
```

After installing/loading extension in Pi:

1. Run `/login`
2. Choose subscription/provider flow for **ClinePass**
3. Open browser URL shown by device flow and enter user code
4. Run `/model` and pick `cline-pass/glm-5.2`

## OAuth behavior

The extension uses Cline's production WorkOS client id:

```text
client_01K3A541FN8TA3EPPHTD2325AR
```

Flow:

1. `login(callbacks)` starts WorkOS device auth.
2. Calls Pi callbacks `onDeviceCode` and `onAuth`; no tokens logged.
3. Polls WorkOS until approved.
4. Registers WorkOS tokens with Cline `/api/v1/auth/register`.
5. Returns Pi `OAuthCredentials` with Cline `access`, `refresh`, `expires`, plus account metadata.
6. `getApiKey(credentials)` returns `workos:<access>`.
7. `refreshToken(credentials)` calls Cline `/api/v1/auth/refresh`.

## Model compat

Each discovered ClinePass model is registered with:

- `api: "openai-completions"`
- `input: ["text"]`
- context window `128000`
- max tokens `8192`
- zero subscription display cost including cache read/write
- Cline client headers:
  - `User-Agent: Cline/4.0.0`
  - `X-PLATFORM: linux`
  - `X-PLATFORM-VERSION: unknown`
  - `X-CLIENT-TYPE: vscode`
  - `X-CLIENT-VERSION: 4.0.0`
  - `X-CORE-VERSION: 4.0.0`

Compat flags include:

```ts
{
  thinkingFormat: "together",
  cacheControlFormat: "anthropic",
  supportsUsageInStreaming: true,
  maxTokensField: "max_tokens",
  supportsReasoningEffort: true,
  supportsStore: false,
  supportsDeveloperRole: false
}
```

Rationale: ClinePass gateway accepts top-level `reasoning` objects. Live tests showed `{ reasoning: { exclude: true } }` and `{ reasoning: { enabled: false } }` suppress GLM reasoning, while z.ai-native `thinking: { type: "disabled" }` is ignored. Pi's `openrouter` compat emits `{ reasoning: { effort: "none" } }` when thinking is off, which ClinePass does **not** suppress. Therefore this extension uses `thinkingFormat: "together"`: thinking off emits `{ reasoning: { enabled: false } }`; thinking on emits `{ reasoning: { enabled: true }, reasoning_effort: "low" | "medium" | "high" }`. It does **not** use `thinkingFormat: "zai"` or `"openrouter"` for ClinePass GLM.

Prompt caching uses Pi's OpenAI-compatible `cacheControlFormat: "anthropic"` flag. This asks Pi to emit Anthropic-style cache-control markers where supported by its provider implementation; cache pricing is zero for subscription display.

## Optional proxy/dev fallback

The proxy is not the primary Pi integration. It is useful for curl testing or Hermes/custom OpenAI-compatible clients.

Uses existing Cline OAuth credentials from:

```text
~/.cline/data/settings/providers.json
```

Commands:

```bash
bun run src/cli.ts status
bun run src/cli.ts models
bun run src/cli.ts test --model cline-pass/glm-5.2
bun run src/cli.ts serve --port 48752
```

Proxy config:

- Base URL: `http://127.0.0.1:48752/v1`
- API key: dummy
- Model: `cline-pass/glm-5.2`

No tokens are printed. Token refresh writes files mode `0600`.
