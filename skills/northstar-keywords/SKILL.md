---
name: northstar-keywords
description: Inspect Apple App Store keywords with the North Star CLI for country-specific popularity, competition estimates, related reported terms, and weekly or monthly reporting periods. Use for ASO keyword research or checking North Star's Apple Ads connection.
---

# North Star keyword inspector

Use the local CLI for read-only keyword research. It calls Apple directly; no website or HTTP server needs to be running. Installing this skill installs instructions, not the CLI or credentials.

## Locate and set up the CLI

First check `command -v northstar`. If it is unavailable, locate an existing `north-star-core` checkout and run `node /absolute/path/north-star-core/scripts/inspect.mjs`. Use absolute paths: agent shells may not load the user's aliases.

If neither is available, authenticate Git access to the private `eilonkr/north-star-core` repo, clone it to an appropriate workspace, then run `npm ci` there (builds the CLI's library). Node 22.18+ is required. Optionally install the command with `npm install -g .` from that checkout. A GitHub login with repo access is required; never request passwords or tokens in chat.

For credentials, prefer an existing file with `--config /absolute/path/to/.env` or `NORTH_STAR_ENV_FILE`. Otherwise the CLI checks the checkout's `.env`, then `~/.config/north-star/.env`. Existing process environment variables take precedence over file values. No arbitrary working-directory `.env` is loaded. Without credentials, competition still works and popularity is `not_configured`.

If credentials need configuring, ask for the existing file's path only. Follow `docs/APPLE_ADS_SETUP.md` in the checkout for a genuinely new setup. Never regenerate an existing key. Keep Apple credentials out of source control, command arguments, logs, and browser code.

## Run an inspection

```sh
northstar "habit tracker" "mood journal" --summary
northstar "plant identifier" --country US --range month --summary
northstar "notes" --country DE --store mac --summary
northstar --connection
northstar --countries
```

Replace `northstar` with the absolute Node invocation when needed. Prefer `--summary`; full results include up to 30 apps per keyword.

| Option | Values |
| --- | --- |
| `-c, --country` | Supported two-letter storefront code; defaults to `US`. `--countries` lists codes. |
| `-s, --store` | `iphone` (default), `ipad`, `mac` |
| `-r, --range` | `week` (default), `previous_week`, `month`, `previous_month` |
| `--config` | Explicit credential file; use a path, never secret values |

Keywords are positional; quote multi-word terms. Weekly/monthly choices select one published bucket, not a rolling 7/30-day average. Latest week becomes available Monday 07:00 UTC; latest complete month becomes available on the fifth UTC. Competition always uses the current App Store sample, regardless of popularity period.

Keyword output is a JSON array, one result per keyword in input order. Summary fields are `keyword`, `country`, `store`, `popularity`, `popularityStatus`, optional `popularityMessage`, `period`, optional `relatedTerms`, `competition`, `competitionConfidence`, `topApps` (first five), and optional `searchError`. Full output uses the package's `Inspection` type. `--connection` returns one status/message object and exits 0 only when connected. `--countries` returns a code/name object. Usage failures exit 1 on stderr; per-keyword provider failures are represented in JSON and do not fail the command.

## Interpret evidence

- `available`: Apple's country-wide 1–100 relative popularity index, not search counts. iPhone and iPad share it.
- `not_reported`: Apple omitted this exact term from the country's eligible top-terms report for the selected period. Popularity is **unknown**, never zero or low demand. Try another period if useful. `relatedTerms` are separate keywords with their own scores; never substitute one for the requested term.
- `unsupported`: Mac has no popularity data; competition can still work.
- `not_configured` / `error`: inspect `popularityMessage` and, when appropriate, `--connection`. Connection success proves token/account access, not Insights access or keyword coverage.
- Competition is North Star's uncalibrated 1–100 estimate, never an official Apple score or interchangeable with Appfigures/Astro. Confidence is at most `limited`; fewer than three results yield `null`. See `docs/RESEARCH.md` in the checkout for the formula.
- `searchError`: public App Store search failed; empty apps and null competition are unavailable evidence, not an easy keyword.

Report the exact keyword, country, store, returned period, scores, and material limitations. Avoid implying absent data proves weak demand. Use small, deliberate batches; keywords execute sequentially but that alone does not enforce Apple's roughly 20-searches/minute limit. Do not bulk-crawl. If rate-limited, stop repeated retries and wait before a small retry. The integration is read-only: never create campaigns, bids, or spend to obtain data.
