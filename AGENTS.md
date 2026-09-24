# North Star

TypeScript library and CLI for Apple App Store keyword research. This repository owns the inspection API, scoring, authentication, and command-line interface. Operational CLI instructions live in [skills/northstar-keywords/SKILL.md](skills/northstar-keywords/SKILL.md), installable with the skills CLI. `CLAUDE.md` points here.

## Layout

- `lib/index.ts`: public server API (`inspect`, `inspectionInput`, `connection`, types).
- `lib/browser.ts`: browser-safe API (markets, reporting periods, search recovery, types). Never transitively import authentication or Node modules here.
- `lib/inspect.ts`: orchestrates search and popularity, with partial-failure handling.
- `lib/apple-ads.ts`, `lib/connection.ts`: Apple Ads JWT/OAuth, ACL check, Insights popularity, one-hour cache.
- `lib/scoring.ts`: competition formula v0.1. `lib/store-search.ts`: validated public Apple search, 15-minute cache.
- `lib/reporting.ts`, `lib/markets.ts`, `lib/types.ts`: periods, storefronts, contracts.
- `scripts/inspect.mjs`: CLI adapter over the compiled public API; JSON summarization and credential-file loading.
- `tests/`: domain, API/CLI, browser graph, and Cloudflare Worker authentication tests.
- `skills/northstar-keywords/`: agent usage instructions; `references/` contains the bundled Apple credential setup guide.
- `dist/`: generated JavaScript and declarations, ignored by Git and included in package archives.

## Development

Node 22.18+; run `npm ci`, then `npm test`, `npm run typecheck`, and `npm run build` before calling a change done. CI runs these checks without owner credentials. `npm pack` builds an installable archive. Consumers use versioned packages. Keep changes within this repository; updating or deploying an external consumer is a separate task.

Use relative `.ts` extensions for all internal imports. TypeScript rewrites them to `.js` in distribution; do not ship TypeScript sources as executable code under `node_modules`. Avoid enums and parameter properties so source tests remain compatible with Node's type stripping. Keep public APIs in the two entrypoints; no consumer imports of private files.

Treat API/CLI output as a contract. On shape changes, update CLI `summarize()`, skill guidance, consumer integration tests, and the package version. Bump the package version for each release; preserve the competition version unless the formula actually changes. Formula changes require a new label and README scoring documentation update.

## Invariants

- Missing exact popularity stays null with an honest status. Never substitute a related term or `searchPopularityInGenre` for `searchPopularity1to100`.
- Preserve country/period/granularity in cache keys. A popularity period does not change competition's current sample.
- Competition confidence never exceeds `limited` while the formula is uncalibrated. Keep the minimum evidence threshold.
- Keep the browser retry working for hosted iTunes rate limits, preserving popularity unchanged.
- Credentials stay server-side. Never log/commit `.env`, `.secrets/`, or PEM files. Do not run `setup:apple` on an existing setup; it is first-time key generation only.
- Pass the PEM string directly to `sign()` in `lib/apple-ads.ts`; Cloudflare Workers do not support the alternative KeyObject path. Preserve the Worker test.
- Apple Ads integration is read-only: OAuth exchange, ACL lookup, Insights query only. No campaign/spend endpoints.
- Do not run live provider calls in automated tests. Use a few deliberate CLI checks when live verification is needed, respecting rate limits.
