#!/usr/bin/env node
// Local keyword inspector. Uses the same public package API as the website.
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";
import {
  inspect,
  inspectionInput,
  connection,
  discoverCompetitorKeywords,
  competitorInput,
} from "../dist/index.js";
import { markets } from "../dist/browser.js";
import { homedir } from "node:os";
import { join } from "node:path";

const competitorMode = process.argv[2] === "competitors";
const usage = `Usage: northstar <keyword> [<keyword> ...] [options]
       northstar competitors <app-id-or-url> [options]

Options:
  -c, --country <code>   Storefront country code (default US)
  -s, --store <store>    iphone | ipad | mac (default iphone)
  -r, --range <range>    week | previous_week | month | previous_month (default week)
      --config <path>  Credential file (or NORTH_STAR_ENV_FILE)
      --summary          Compact result per keyword instead of the full inspection
      --connection       Check Apple Ads credentials and exit
      --countries        List supported country codes and exit
  -h, --help             Show this help

Competitor options:
      --limit <n>        Candidates to check, 1–30 (default 10)
      --discover-only    Extract candidates without search or popularity checks
      --keyword <term>   Prioritize a supplied keyword; repeatable
      --keywords-file <path>  UTF-8 file: one keyword per line, or JSON string array

Competitor mode prints one JSON object. Checks are sequential, with a 4-second
pause before each search; a failed search stops further checks. --summary omits
raw descriptions and full app lists. Supplied terms come first and count toward
--limit. Discovery is English-oriented and experimental; sample positions are
not native App Store ranks. No credentials are needed except for popularity.

Prints a JSON array with one result per keyword, in the order given.
Quote multi-word keywords: northstar "habit tracker" "mood journal"
To inspect the literal keyword competitors: northstar -- competitors`;

const fail = (message) => {
  console.error(`${message}\n\n${usage}`);
  process.exit(1);
};

let args;
try {
  args = parseArgs({
    args: process.argv.slice(competitorMode ? 3 : 2),
    allowPositionals: true,
    options: {
      country: { type: "string", short: "c", default: "US" },
      store: { type: "string", short: "s", default: "iphone" },
      range: { type: "string", short: "r", default: "week" },
      config: { type: "string" },
      summary: { type: "boolean" },
      connection: { type: "boolean" },
      countries: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      ...(competitorMode
        ? {
            limit: { type: "string", default: "10" },
            "discover-only": { type: "boolean" },
            keyword: { type: "string", multiple: true },
            "keywords-file": { type: "string" },
          }
        : {}),
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
if (competitorMode && values.connection)
  fail("--connection is a standalone keyword-inspector option.");

const explicitEnv = values["config"] ?? process.env.NORTH_STAR_ENV_FILE;
const repoEnv = fileURLToPath(new URL("../.env", import.meta.url));
const envFile =
  explicitEnv ??
  (existsSync(repoEnv)
    ? repoEnv
    : join(homedir(), ".config", "north-star", ".env"));
try {
  if (explicitEnv || existsSync(envFile)) {
    for (const [key, value] of Object.entries(
      parseEnv(readFileSync(envFile, "utf8")),
    )) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
} catch {
  fail(
    "Cannot read the credential file. Check --config or NORTH_STAR_ENV_FILE.",
  );
}
const config = process.env;
if (values.connection) {
  const result = await connection(config);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === "connected" ? 0 : 1);
}

if (competitorMode) {
  if (keywords.length !== 1)
    fail("Provide exactly one competitor app ID or App Store URL.");
  let supplied = [...(values.keyword ?? [])];
  if (values["keywords-file"]) {
    try {
      if (statSync(values["keywords-file"]).size > 65536) throw new Error();
      const text = readFileSync(values["keywords-file"], "utf8")
        .replace(/^\uFEFF/, "")
        .trim();
      const terms = text.startsWith("[")
        ? JSON.parse(text)
        : text
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
      if (
        !Array.isArray(terms) ||
        !terms.every((term) => typeof term === "string")
      )
        throw new Error();
      supplied.push(...terms);
    } catch {
      fail(
        "Cannot read keywords file. Use up to 64 KiB of UTF-8 lines or a JSON array of strings.",
      );
    }
  }
  const input = {
    app: keywords[0],
    country: values.country.toUpperCase(),
    store: values.store.toLowerCase(),
    reportingRange: values.range,
    limit: Number(values.limit),
    keywords: supplied,
    discoverOnly: Boolean(values["discover-only"]),
  };
  const validation = competitorInput.safeParse(input);
  if (!validation.success)
    fail(
      validation.error.issues
        .map((i) => `Invalid ${i.path.join(".")}: ${i.message}`)
        .join("\n"),
    );
  try {
    const result = await discoverCompetitorKeywords(config, input, {
      onProgress: ({ completed, total, keyword }) =>
        console.error(
          `[${completed + 1}/${total}] Checking ${JSON.stringify(keyword)}…`,
        ),
    });
    const output = values.summary
      ? {
          ...result,
          app: { ...result.app, description: undefined },
          results: result.results.map(({ inspection, ...candidate }) => ({
            ...candidate,
            popularity: inspection?.popularity ?? null,
            competition: inspection?.competition ?? null,
          })),
        }
      : result;
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = result.status === "partial" ? 2 : 0;
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Competitor discovery failed.",
    );
    process.exitCode = 1;
  }
} else {
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
    ...(r.popularity.status === "available"
      ? {}
      : { popularityMessage: r.popularity.message }),
    period: r.popularity.period,
    relatedTerms: r.popularity.relatedTerms,
    competition: r.competition.score,
    competitionConfidence: r.competition.confidence,
    topApps: r.apps
      .slice(0, 5)
      .map((a) => ({
        name: a.name,
        developer: a.developer,
        ratings: a.ratings,
        stars: a.stars,
      })),
    ...(r.searchError ? { searchError: r.searchError } : {}),
  });

  // Sequential to avoid concurrent provider requests. Callers must still respect rate limits.
  const results = [];
  for (const input of inputs) {
    const result = await inspect(config, input);
    results.push(values.summary ? summarize(result) : result);
  }
  console.log(JSON.stringify(results, null, 2));
}
