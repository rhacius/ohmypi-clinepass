# Repo Maintenance Audit — `ohmypi-clinepass`

**Status:** Cleanup completed. All proposed removals from the audit were applied, and the commands below now return no matches outside this report file. `bun run typecheck` and `bun test` still pass.

**Scope:** Audit for dead code, unused dependencies, and stale files in the tracked source tree, tests, and package metadata. No destructive edits were made; this report is a PR-ready justification list.

**Baseline (verified before/after this audit):**

- `bun run typecheck` — passes (no errors)
- `bun test` — 22 pass, 0 fail
- `bunx depcheck --json` — `dependencies: []`, `devDependencies: []` (no unused dependencies)

---

## Findings

| # | Category | Item | Location | Why it is unused / stale | Evidence / verification | Proposed PR action | Risk |
|---|----------|------|----------|--------------------------|------------------------|-------------------|------|
| 1 | Dead code | `TokenFileError` | `src/errors.ts:3` | Exported but never imported or raised anywhere in `src/` or `test/`. | `grep -R -n --include='*.ts' --include='*.md' --exclude-dir=node_modules 'TokenFileError' .` returns only `src/errors.ts` and `AGENTS.md`. | Remove `TokenFileError` from `src/errors.ts`; update `AGENTS.md` if it is kept. | Low — only documentation references it. |
| 2 | Dead code | `CLINE_CHAT_URL` | `src/config.ts:5` | Exported URL constant never referenced. | `grep -R -n --include='*.ts' --include='*.md' --exclude-dir=node_modules 'CLINE_CHAT_URL' .` returns only `src/config.ts`. | Remove unused constant. | Low — not imported anywhere. |
| 3 | Dead code | `defaultProviderSettingsPath()` | `src/config.ts:26` | Exported function never called or imported. | `grep -R -n --include='*.ts' --include='*.md' --exclude-dir=node_modules 'defaultProviderSettingsPath' .` returns only `src/config.ts`. | Remove unused function. | Low — leftover from upstream fork. |
| 4 | Dead code | `fetchClinePassModelsPayload()` | `src/discovery.ts:133` | Exported but never called in `src/` or `test/`. The active cache path uses the local `fetchClinePassModelsPayloadForCache` in `src/index.ts` instead. | `grep -R -P -n --include='*.ts' --include='*.md' --exclude-dir=node_modules '\bfetchClinePassModelsPayload\b' . | grep -v 'src/discovery.ts' | grep -v 'AGENTS.md'` returns no matches. | Remove function; if external consumers need it, expose the cache helper consistently. | Low — the active code path duplicates its behavior. |
| 5 | Dead code | `discoverClinePassModels()` | `src/discovery.ts:221` | Exported but never called in `src/` or `test/`. | `grep -R -P -n --include='*.ts' --include='*.md' --exclude-dir=node_modules '\bdiscoverClinePassModels\b' . | grep -v 'src/discovery.ts' | grep -v 'AGENTS.md'` returns no matches. | Remove function. | Low — superseded by `index.ts` cache/network flow. |
| 6 | Over-exported internal API | `startClineDeviceAuth()` | `src/pi-oauth.ts:126` | Exported, but only called inside `src/pi-oauth.ts` by `loginClinePass()`. No external references. | `grep -R -P -n --include='*.ts' --include='*.md' --exclude-dir=node_modules '\bstartClineDeviceAuth\b' . | grep -v 'src/pi-oauth.ts' | grep -v 'AGENTS.md'` returns no matches. | Drop `export` keyword to keep it module-private. | Low — purely visibility change. |
| 7 | Over-exported internal API | `pollWorkOsDeviceToken()` | `src/pi-oauth.ts:147` | Exported, but only called inside `src/pi-oauth.ts` by `loginClinePass()`. | `grep -R -P -n --include='*.ts' --include='*.md' --exclude-dir=node_modules '\bpollWorkOsDeviceToken\b' . | grep -v 'src/pi-oauth.ts' | grep -v 'AGENTS.md'` returns no matches. | Drop `export` keyword. | Low — purely visibility change. |
| 8 | Over-exported internal API | `registerWorkOsTokens()` | `src/pi-oauth.ts:220` | Exported, but only called inside `src/pi-oauth.ts` by `loginClinePass()`. | `grep -R -P -n --include='*.ts' --include='*.md' --exclude-dir=node_modules '\bregisterWorkOsTokens\b' . | grep -v 'src/pi-oauth.ts' | grep -v 'AGENTS.md'` returns no matches. | Drop `export` keyword. | Low — purely visibility change. |
| 9 | Stale file | `assets/ohmypi-clinepass-hero.png` | `assets/` | Listed in `package.json` `files`, but not referenced in `README.md`, `package.json`, tests, or source. Git history (`git log`) shows it was intentionally removed from the README. | `grep -R -P -n --include='*.md' --include='*.ts' --include='*.json' --exclude-dir=node_modules 'ohmypi-clinepass-hero' .` returns no matches outside `assets/` and `AGENTS.md`. | Remove the image and delete `assets` from `package.json` `files`, or remove the image and keep the directory if other assets are planned. | Low — possibly a marketplace/store asset; confirm with product before deleting. |
| 10 | Stale documentation | `AGENTS.md` references | `AGENTS.md` | Mentions `TokenFileError`, `fetchClinePassModelsPayload`, `discoverClinePassModels`, `startClineDeviceAuth`, `pollWorkOsDeviceToken`, `registerWorkOsTokens`, and the hero image, all of which are unused or over-exported. | Verified by the same grep runs above. | Update `AGENTS.md` to match the actual active architecture once dead code is removed. | Low — context file, not runtime. |
| 11 | Working-tree artifact | `.commandcode/taste/taste.md` | `.commandcode/` | Untracked file that is not in `package.json` `files`, not referenced by the project, and appears to be a tool-generated placeholder. | `git ls-files .commandcode/` returns empty. | Delete the file or add `.commandcode/` to `.gitignore` if the tool is expected to keep writing here. | Low — not part of the repo. |

## Unused dependencies

No unused dependencies were found.

**Tool:** `bunx depcheck --json`

**Result:**

```json
{
  "dependencies": [],
  "devDependencies": [],
  "missing": { "bun:test": [ ... ] },
  ...
}
```

The `missing: bun:test` entry is a false positive — `bun:test` is provided by the Bun runtime, not a package dependency.

## Verification commands

Re-run the following to confirm the findings before and after any cleanup PR:

```bash
# Baseline correctness
bun run typecheck
bun test

# Unused dependency check
bunx depcheck --json

# Dead-code checks (each should return no matches outside the definition file and AGENTS.md)
grep -R -P -n --include='*.ts' --include='*.md' --exclude-dir=node_modules '\bTokenFileError\b' . | grep -v 'src/errors.ts' | grep -v 'AGENTS.md'
grep -R -P -n --include='*.ts' --include='*.md' --exclude-dir=node_modules '\bCLINE_CHAT_URL\b' . | grep -v 'src/config.ts' | grep -v 'AGENTS.md'
grep -R -P -n --include='*.ts' --include='*.md' --exclude-dir=node_modules '\bdefaultProviderSettingsPath\b' . | grep -v 'src/config.ts' | grep -v 'AGENTS.md'
grep -R -P -n --include='*.ts' --include='*.md' --exclude-dir=node_modules '\bfetchClinePassModelsPayload\b' . | grep -v 'src/discovery.ts' | grep -v 'AGENTS.md'
grep -R -P -n --include='*.ts' --include='*.md' --exclude-dir=node_modules '\bdiscoverClinePassModels\b' . | grep -v 'src/discovery.ts' | grep -v 'AGENTS.md'
grep -R -P -n --include='*.ts' --include='*.md' --exclude-dir=node_modules '\bstartClineDeviceAuth\b' . | grep -v 'src/pi-oauth.ts' | grep -v 'AGENTS.md'
grep -R -P -n --include='*.ts' --include='*.md' --exclude-dir=node_modules '\bpollWorkOsDeviceToken\b' . | grep -v 'src/pi-oauth.ts' | grep -v 'AGENTS.md'
grep -R -P -n --include='*.ts' --include='*.md' --exclude-dir=node_modules '\bregisterWorkOsTokens\b' . | grep -v 'src/pi-oauth.ts' | grep -v 'AGENTS.md'

# Stale asset check
grep -R -P -n --include='*.md' --include='*.ts' --include='*.json' --exclude-dir=node_modules 'ohmypi-clinepass-hero' . | grep -v 'assets/' | grep -v 'AGENTS.md'

# Working-tree artifact check
git ls-files .commandcode/
```

## Risks & follow-ups

- Removing the hero image may affect OMP marketplace/store rendering if the asset is consumed by the OMP CLI rather than by this repo. Confirm with product before deleting it.
- Dropping exports from `src/pi-oauth.ts` is safe for the current package surface (only the default export from `src/index.ts` is exposed to OMP), but any external consumers importing these helpers directly would break. There is no evidence of such consumers in this repository.
- After the cleanup PR, `AGENTS.md` should be updated to match the active code paths so future agents are not misled.
