#!/usr/bin/env node
// Local keyword inspector. Uses the same public package API as the website.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import { inspect, inspectionInput, connection } from "../dist/index.js";
import { markets } from "../dist/browser.js";
import { homedir } from "node:os";
import { join } from "node:path";

const usage = `Usage: northstar <keyword> [<keyword> ...] [options]

Options:
  -c, --country <code>   Storefront country code (default US)
  -s, --store <store>    iphone | ipad | mac (default iphone)
  -r, --range <range>    week | previous_week | month | previous_month (default week)
      --config <path>  Credential file (or NORTH_STAR_ENV_FILE)
      --summary          Compact result per keyword instead of the full inspection
      --connection       Check Apple Ads credentials and exit
      --countries        List supported country codes and exit
  -h, --help             Show this help

Prints a JSON array with one result per keyword, in the order given.
Quote multi-word keywords: northstar "habit tracker" "mood journal"`;

const fail = (message) => {
  console.error(`${message}\n\n${usage}`);
  process.exit(1);
};

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      country: { type: "string", short: "c", default: "US" },
      store: { type: "string", short: "s", default: "iphone" },
      range: { type: "string", short: "r", default: "week" },
      "config": { type: "string" },
      summary: { type: "boolean" },
      connection: { type: "boolean" },
      countries: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
} catch (e) {
  fail(e.message);
}
const { values, positionals: keywords } = args;
if (values.help) {
  console.log(usage);
  process.exit(0);
}
if (values.countries) {
  console.log(JSON.stringify(Object.fromEntries(markets), null, 2));
  process.exit(0);
}

const explicitEnv = values["config"] ?? process.env.NORTH_STAR_ENV_FILE;
const repoEnv = fileURLToPath(new URL("../.env", import.meta.url));
const envFile = explicitEnv ?? (existsSync(repoEnv) ? repoEnv : join(homedir(), ".config", "north-star", ".env"));
try {
  if (explicitEnv || existsSync(envFile)) {
    for (const [key, value] of Object.entries(parseEnv(readFileSync(envFile, "utf8")))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
} catch {
  fail("Cannot read the credential file. Check --config or NORTH_STAR_ENV_FILE.");
}
const config = process.env;
if (values.connection) {
  const result = await connection(config);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === "connected" ? 0 : 1);
}

if (!keywords.length) fail("Provide at least one keyword.");
const inputs = keywords.map((keyword) => {
  const parsed = inspectionInput.safeParse({
    keyword,
    country: values.country.toUpperCase(),
    store: values.store.toLowerCase(),
    reportingRange: values.range,
  });
  if (!parsed.success)
    fail(
      `Invalid ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")} for "${keyword}".`,
    );
  return parsed.data;
});

const summarize = (r) => ({
  keyword: r.keyword,
  country: r.country,
  store: r.store,
  popularity: r.popularity.score,
  popularityStatus: r.popularity.status,
  ...(r.popularity.status === "available" ? {} : { popularityMessage: r.popularity.message }),
  period: r.popularity.period,
  relatedTerms: r.popularity.relatedTerms,
  competition: r.competition.score,
  competitionConfidence: r.competition.confidence,
  topApps: r.apps
    .slice(0, 5)
    .map((a) => ({ name: a.name, developer: a.developer, ratings: a.ratings, stars: a.stars })),
  ...(r.searchError ? { searchError: r.searchError } : {}),
});

// Sequential to avoid concurrent provider requests. Callers must still respect rate limits.
const results = [];
for (const input of inputs) {
  const result = await inspect(config, input);
  results.push(values.summary ? summarize(result) : result);
}
console.log(JSON.stringify(results, null, 2));
