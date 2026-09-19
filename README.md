# North Star Core

Private reusable API and CLI for App Store keyword inspection. Apple Ads supplies country-wide popularity when the exact term is reported; North Star computes an explicitly uncalibrated competition estimate from current public search results. The React website is a separate consumer.

## Install and run

Requires Node 22.18+ and GitHub access to this private repository.

```sh
gh repo clone eilonkr/north-star-core
cd north-star-core
npm ci
npm run --silent inspect -- "habit tracker" --summary
```

For a command available from any directory, run `npm install -g .`, then `northstar "habit tracker" --summary`. The install contains compiled JavaScript and needs no website server.

Use `--config /path/to/.env` or `NORTH_STAR_ENV_FILE` for existing Apple Ads credentials. Otherwise the CLI loads the checkout's `.env`, then `~/.config/north-star/.env`. Existing environment variables take precedence. See [Apple Ads setup](docs/APPLE_ADS_SETUP.md); do not regenerate a registered key. Public search and competition work without credentials.

## Install the agent skill

```sh
npx skills add eilonkr/north-star-core --skill northstar-keywords
```

This follows the [skills CLI format](https://github.com/vercel-labs/skills). Private-repo Git/GitHub authentication is required. Add `--global` to install across projects, and `--agent codex` or `--agent claude-code` to select agents. Skill installation provides instructions; install the CLI separately using the steps above. The full [CLI workflow and output interpretation](skills/northstar-keywords/SKILL.md) live in the skill, while [AGENTS.md](AGENTS.md) covers development.

## Public library API

Install a versioned archive produced by `npm pack`, or install a pinned Git commit from the private repo. Git installs require GitHub access at install time and build via `prepare`; packed releases already contain JavaScript and declarations.

```ts
// Server only: never import this entrypoint from browser components.
import { inspect, inspectionInput, connection } from '@eilonkr/north-star-core';
const input = inspectionInput.parse({
  keyword: 'habit tracker', country: 'US', store: 'iphone', reportingRange: 'month',
});
const result = await inspect(serverEnvironment, input);
const status = await connection(serverEnvironment);

// Browser-safe helpers, including hosted-search recovery; no secrets or Node crypto.
import { markets, reportingRanges, recoverSearch } from '@eilonkr/north-star-core/browser';
import type { Inspection } from '@eilonkr/north-star-core/browser';
```

Validate external input with `inspectionInput` before calling `inspect`. All returned fields use the `Inspection` contract; provider failures are represented in that result. The host application owns HTTP routing, authentication, request limits, and secrets. There is no separately hosted API service.

The website keeps a pinned `.tgz` release and source provenance so its private hosting build does not need a GitHub token. To release an update: bump `package.json` and the lockfile version, run checks, commit and push the core, then run the website's `npm run core:update -- /absolute/path/to/north-star-core`. Review and deploy the website's resulting dependency update separately. Never edit generated archives in place.

## Development and evidence

```sh
npm test
npm run typecheck
npm run build
npm pack --dry-run
```

Tests cover report boundaries and matching, scoring, partial failures, CLI behavior, browser isolation, and signing in the Cloudflare Worker runtime. [Research and limitations](docs/RESEARCH.md) explain why missing popularity is unknown and why competition is an estimate. iPhone/iPad share popularity; Mac does not have an Apple Ads popularity score.
