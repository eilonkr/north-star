# North Star

Private reusable API and CLI for App Store keyword inspection. Apple Ads supplies country-wide popularity when the exact term is reported; North Star computes an explicitly uncalibrated competition estimate from current public search results. The React website is a separate consumer. The GitHub repository is `eilonkr/north-star`; the package identifier remains `@eilonkr/north-star-core` for compatibility. Existing local checkouts may still be named `north-star-core`.

## Install and run

Requires Node 22.18+ and GitHub access to this private repository.

```sh
gh repo clone eilonkr/north-star
cd north-star
npm ci
npm run --silent inspect -- "habit tracker" --summary
```

For a command available from any directory, run `npm install -g .`, then `northstar "habit tracker" --summary`. The install contains compiled JavaScript and needs no website server.

Use `--config /path/to/.env` or `NORTH_STAR_ENV_FILE` for existing Apple Ads credentials. Otherwise the CLI loads the checkout's `.env`, then `~/.config/north-star/.env`. Existing environment variables take precedence. See [Apple Ads setup](docs/APPLE_ADS_SETUP.md); do not regenerate a registered key. Public search and competition work without credentials.

## Install the agent skill

```sh
npx skills add eilonkr/north-star --skill northstar-keywords
```

This follows the [skills CLI format](https://github.com/vercel-labs/skills). Private-repo Git/GitHub authentication is required. Add `--global` to install across projects, and `--agent codex` or `--agent claude-code` to select agents. Skill installation provides instructions; install the CLI separately using the steps above. The full [CLI workflow and output interpretation](skills/northstar-keywords/SKILL.md) live in the skill, while [AGENTS.md](AGENTS.md) covers development.

## Competitor keyword discovery (CLI beta)

```sh
# Public metadata → candidates → live search-sample evidence and existing scores.
northstar competitors 1342608792 --country US --range month --limit 10 --summary
northstar competitors 'https://apps.apple.com/us/app/id1342608792' --discover-only --summary
# Include niche ideas or terms copied from another research tool (one per line).
northstar competitors 1342608792 --keywords-file keywords.txt --limit 20 --summary
northstar competitors 1342608792 --keyword 'voice controlled row counter' --limit 1 --summary
```

This experimental command reads the app's public title, optional subtitle, and description, extracts English-oriented phrases, and constructs labelled subject/feature combinations. It checks whether the app appears among up to 30 public Search API results for each candidate. It is not a reverse ranking database, and does not expose a competitor's private App Store keyword field. Automatic candidates still need editorial review; the prior hand-curated benchmark does not measure this extractor's accuracy.

Default 10 candidates, maximum 30; approximately 4 seconds plus provider time per candidate. Supplied terms are prioritized and count toward the limit. `--discover-only` makes only metadata requests. Existing Apple Ads credentials are used for popularity; without them, discovery and competition still work. Country comes from `--country`, even when an input URL names another storefront. See [method, evidence fields, and limitations](docs/COMPETITOR_DISCOVERY.md).

To test this branch without changing an existing installation:

```sh
gh repo clone eilonkr/north-star north-star-cli-beta -- --branch codex/competitor-keyword-cli
cd north-star-cli-beta
npm ci
node scripts/inspect.mjs competitors 1342608792 --country US --limit 5 --summary
```

Add `--config /absolute/path/to/existing/.env` for popularity. This beta does not update the website or its pinned package.

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

// Reusable server function behind the competitor CLI; no HTTP service required.
import { discoverCompetitorKeywords } from '@eilonkr/north-star-core';
const discovered = await discoverCompetitorKeywords(serverEnvironment, {
  app: '1342608792', country: 'US', store: 'iphone', limit: 10,
});

// Browser-safe helpers, including hosted-search recovery; no secrets or Node crypto.
import { markets, reportingRanges, recoverSearch } from '@eilonkr/north-star-core/browser';
import type { Inspection } from '@eilonkr/north-star-core/browser';
```

Validate external input with `inspectionInput` before calling `inspect`. Its returned fields use the `Inspection` contract; provider failures are represented in that result. `discoverCompetitorKeywords` validates its own input (also exposed as `competitorInput`) and returns `CompetitorDiscovery`; each checked candidate contains an `Inspection`. The host application owns HTTP routing, authentication, request limits, and secrets. There is no separately hosted API service.

The website keeps a pinned `.tgz` release and source provenance so its hosting build does not need a GitHub token. To release an update: bump `package.json` and the lockfile version, run checks, commit and push the core, then run the website's `npm run core:update -- /absolute/path/to/library-checkout`. Review and deploy the website's resulting dependency update separately. Never edit generated archives in place.

## Development and evidence

```sh
npm test
npm run typecheck
npm run build
npm pack --dry-run
```

Tests cover report boundaries and matching, scoring, partial failures, CLI behavior, browser isolation, and signing in the Cloudflare Worker runtime. [Research and limitations](docs/RESEARCH.md) explain why missing popularity is unknown and why competition is an estimate. iPhone/iPad share popularity; Mac does not have an Apple Ads popularity score.
