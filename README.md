# pi-clinepass

Local ClinePass OpenAI-compatible proxy for Pi and Hermes.

Default token file is shared with local Cline:

```text
~/.cline/data/settings/providers.json
```

No tokens are printed. Token refresh uses Cline's refresh endpoint, then writes `providers.json` with mode `0600`.

## Install

```bash
bun install
```

## Commands

```bash
bun run src/cli.ts login
bun run src/cli.ts status
bun run src/cli.ts models
bun run src/cli.ts test --model cline-pass/glm-5.2
bun run src/cli.ts serve --port 48752
```

Use an isolated token file with either:

```bash
bun run src/cli.ts status --token-file ~/.hermes/clinepass/providers.json
CLINE_PROVIDER_SETTINGS_PATH=~/.hermes/clinepass/providers.json bun run src/cli.ts status
```

If linked/installed as bin:

```bash
clinepass-proxy serve --port 48752
```

## Login

`login` starts WorkOS device auth, prints the approval URL and user code, polls until approval/expiry, registers the WorkOS tokens with Cline, then stores Cline OAuth tokens.

```bash
clinepass-proxy login
```

Tokens are never printed.

## Pi config

Configure Pi as OpenAI-compatible:

- Base URL: `http://127.0.0.1:48752/v1`
- API key: any dummy value, e.g. `dummy`
- Model: `cline-pass/glm-5.2`

Proxy endpoints:

- `GET /v1/models` returns ClinePass model IDs.
- `POST /v1/chat/completions` forwards to Cline with OAuth auth.

For `cline-pass/*` models, proxy defaults to:

```json
{"reasoning":{"exclude":true}}
```

unless caller already supplied top-level `reasoning`.

## Hermes path A: proxy on Hermes VPS

No workstation token copy needed. Authorize directly on the VPS with a Hermes-owned token file:

```bash
clinepass-proxy login --token-file ~/.hermes/clinepass/providers.json
clinepass-proxy serve --token-file ~/.hermes/clinepass/providers.json --port 48752
```

Then configure Hermes as custom/OpenAI-compatible:

- Base URL: `http://127.0.0.1:48752/v1`
- API key: `dummy`
- Model: `cline-pass/glm-5.2`

This keeps Hermes tokens separate from workstation Cline tokens while using the same ClinePass subscription.

## Notes

- WorkOS device auth endpoint: `https://api.workos.com/user_management/authorize/device`
- Cline token registration endpoint: `https://api.cline.bot/api/v1/auth/register`
- Cline chat endpoint: `https://api.cline.bot/api/v1/chat/completions`
- ClinePass models endpoint: `https://api.cline.bot/api/v1/ai/cline/recommended-models`
- Auth header sent upstream: `Authorization: Bearer workos:<accessToken>`
