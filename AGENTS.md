# Repository Guidelines

## Project Overview

`ohmypi-clinepass` is an Oh My Pi (OMP) provider extension that adds **ClinePass** as an AI model provider. It authenticates users via a WorkOS OAuth device-code flow tied to Cline accounts, fetches Cline's recommended model list from `api.cline.bot`, caches it locally, and maps those models into the `@oh-my-pi/pi-ai` `Model` schema. The extension is consumed by OMP through the `package.json` `omp.extensions` / `pi.extensions` entry pointing at `./src/index.ts`.

## Architecture & Data Flow

```mermaid
OMP startup
  └─ src/index.ts
       ├─ freshCachedModels()  ── fast path if disk cache is fresh
       └─ fetchClinePassModelsPayload() / discoverClinePassModels()
             ├─ fetchWithTimeout + backoff retry  ── GET /api/v1/ai/cline/recommended-models
             ├─ parseClinePassModelEntries()       ── validate/dedupe "cline-pass/*" entries
             ├─ buildClinePassModels()             ── map to pi-ai Model configs
             └─ writeCachedModels()                ── persist raw payload
       └─ registerProvider({ baseUrl, models, oauth })

OAuth login
  └─ loginClinePass() / createClinePassOAuthProvider()
       ├─ startClineDeviceAuth()   ── WorkOS /authorize/device
       ├─ pollWorkOsDeviceToken()  ── WorkOS /authenticate
       ├─ registerWorkOsTokens()   ── Cline /auth/register
       └─ validateClinePassToken() ── Cline /users/me (Bearer workos:<token>)
```

- **Effect-TS** is used for typed error handling (`Effect.gen`, `Effect.tryPromise`, `Effect.flatMap`, `Effect.catchTag`).
- **Fetch injection** is the primary test seam: most network functions accept `fetcher: typeof fetch = fetch`.
- **Retry/backoff** is applied only to transient failures (429, 5xx, network errors).
- **On-disk cache** is best-effort: failures are swallowed and never block startup.

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/` | All source. Flat structure — no subdirectories. |
| `test/` | `bun:test` test suites mirroring `src/` modules. |
| `assets/` | Project images (e.g. `pi-clinepass-hero.png`). |
| project root | `package.json`, `tsconfig.json`, `bun.lock`, `README.md`. |

## Development Commands

Use **Bun** exclusively. No Node.js/npm configs are present.

```bash
bun install
bun run typecheck    # tsc --noEmit
bun test             # bun:test
omp install .        # install extension into local OMP workspace
```

There is no build or bundle step. Bun resolves `.ts` files at runtime, and TypeScript is configured with `noEmit: true`.

## Code Conventions & Common Patterns

### TypeScript & imports
- `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`.
- Strict mode is on. `allowImportingTsExtensions: true` means `.ts` imports can be used without extension.
- Prefer `import type` for type-only dependencies.
- Export concrete types/interfaces from the module that owns the value; avoid `ReturnType<typeof fn>`.

### Structure & naming
- Keep `src/` flat. No subdirectories.
- One concept per file: `http.ts`, `backoff.ts`, `errors.ts`, `config.ts`, etc.
- Functions are named after the action they perform (e.g. `fetchClinePassModelEntries`, `validateClinePassToken`).
- Use Effect for async/await pipelines; keep plain Promise-based helpers only where independent (e.g. `backoff()`).

### Error handling
- All domain errors are `Data.TaggedError` from `effect` (`src/errors.ts`):
  - `TokenFileError` — token file I/O.
  - `AuthError` — OAuth/auth failures (optional `status`).
  - `UpstreamError` — Cline API failures (optional `status`, `body`).
- Catch specific tags with `Effect.catchTag(...)` rather than broad catches.

### Network calls
- Use `fetchWithTimeout(input, timeoutMs, init?, fetcher?)` from `src/http.ts` for any HTTP request.
- It combines an `AbortController` timeout with any caller `signal` via `AbortSignal.any`.
- Retry transient failures with `backoff(fn, { retries, delayMs, shouldRetry })` from `src/backoff.ts`.
- Default retry settings are in `src/config.ts`: 4 retries, 1s delay, 15s timeouts.

### Dependency injection
- Network functions accept `fetcher: typeof fetch = fetch` so tests can inject mocks without touching `globalThis.fetch`.
- OAuth provider factory `createClinePassOAuthProvider({ modifyModels?, fetcher? })` also accepts the fetcher.

### State & caching
- `src/models-cache.ts` persists the raw recommended-models payload to `~/.cline/data/cache/clinepass-models.json` by default.
- Environment overrides: `CLINEPASS_MODELS_CACHE_PATH`, `CLINEPASS_MODELS_CACHE_TTL_MS`.
- `updateInFlight` singleton prevents concurrent background refreshes.
- Use `resetModelsCacheForTests()` in `afterEach` when testing cache behavior.

### Promise construction
- Use `Promise.withResolvers()` instead of `new Promise((resolve, reject) => …)` when creating promises manually.

### Version strings
- Cline client headers in `src/constants.ts` should match the upstream VS Code extension release (currently `4.0.4`).
- `X-PLATFORM` is dynamic (`process.platform`); `X-PLATFORM-VERSION: "unknown"` is the intentional fallback when no host IDE is present.

## Important Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Extension entry point. Cache fast-path, network fetch, provider registration. |
| `src/discovery.ts` | Model fetch, parse, dedupe, and mapping to pi-ai `Model` configs. |
| `src/pi-oauth.ts` | WorkOS device-code OAuth and Cline token registration/refresh. |
| `src/models-cache.ts` | Disk cache read/write/TTL/background refresh. |
| `src/http.ts` | `fetchWithTimeout` and `safeJson`. |
| `src/backoff.ts` | Linear retry helper. |
| `src/errors.ts` | `Data.TaggedError` classes. |
| `src/config.ts` | URLs, timeouts, retry defaults, cache settings, env-driven path helpers. |
| `src/constants.ts` | Provider IDs, model specs, Cline client headers. |
| `package.json` | `omp.extensions` / `pi.extensions` → `./src/index.ts`. |
| `tsconfig.json` | Strict ES2022/ESNext/Bundler config. |

## Runtime/Tooling Preferences

- **Runtime:** Bun only. TypeScript is resolved at runtime; no transpile/bundle step.
- **Package manager:** Bun (see `bun.lock`). No npm/yarn/pnpm configs.
- **TypeScript:** `latest` (dev dependency), strict mode.
- **Effect library:** `effect ^4.0.0-beta.66` is the only runtime dependency.
- **Peer dependencies:** `@oh-my-pi/pi-ai` and `@oh-my-pi/pi-coding-agent` must be provided by the OMP host.
- **No formatter/linter config** is present in the repo; follow existing style and conventions.

## Testing & QA

- **Framework:** `bun:test` (`describe`, `it`, `expect`, `mock`, `afterEach`).
- **Run:** `bun test`.
- **Mocking fetch:**
  - Prefer injecting a mock `fetcher` into the function under test (most functions accept `fetcher: typeof fetch = fetch`).
  - For `src/index.ts`, replace `globalThis.fetch` directly before invoking the extension.
- **Mocking filesystem:** create a per-test temp directory and pass custom paths to cache helpers.
- **Testing Effect code:** wrap in `await Effect.runPromise(...)`.
- **Cleanup:** use `afterEach` to restore `globalThis.fetch` and call `resetModelsCacheForTests()`.
- **Avoid real timers:** await the actual promise/event under test. Use `pendingModelsRefresh()` to await the cache background refresh instead of sleeping.
- **Coverage gaps:** `src/config.ts` and `src/errors.ts` are currently not covered by dedicated tests; any changes there should be accompanied by tests.
