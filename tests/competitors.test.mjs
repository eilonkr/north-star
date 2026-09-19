import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { discoverCompetitorKeywords, competitorInput } from "../dist/index.js";
import { keywordCandidates } from "../dist/keyword-candidates.js";
import {
  appId,
  subtitleFromHtml,
  competitorMetadata,
} from "../dist/competitor-metadata.js";

const app = {
  trackId: 1342608792,
  trackName: "My Row Counter, Knit & Crochet",
  kind: "software",
  supportedDevices: ["iPhone17", "iPad13"],
  description:
    "VOICE CONTROL\nKeep count while knitting.\nCreate crochet charts.\nPDF patterns.\nPrivacy policy: https://example.org\nSubscription payment auto renewal.",
};
const metadata = {
  id: app.trackId,
  name: app.trackName,
  subtitle: "Row Counter with PDF Import",
  description: app.description,
};
const input = {
  app: String(app.trackId),
  country: "US",
  store: "iphone",
  limit: 3,
};
function installFetch(t, searches = []) {
  let index = 0;
  return t.mock.method(globalThis, "fetch", async (url) => {
    url = new URL(url);
    if (url.pathname === "/lookup") return Response.json({ results: [app] });
    if (url.hostname === "apps.apple.com")
      return new Response(
        '<p class="subtitle test">Row Counter with PDF Import</p>',
      );
    assert.equal(url.pathname, "/search");
    assert.equal(url.searchParams.get("country"), "us");
    assert.equal(url.searchParams.get("limit"), "30");
    const result = searches[index++];
    return result instanceof Response
      ? result
      : Response.json({ results: result ?? [] });
  });
}
function fastTimers(t) {
  const delays = [];
  t.mock.method(globalThis, "setTimeout", (callback, delay) => {
    delays.push(delay);
    queueMicrotask(callback);
    return 0;
  });
  return delays;
}
const resultApp = (id) => ({
  trackId: id,
  trackName: "Counter",
  trackViewUrl: `https://apps.apple.com/app/id${id}`,
  userRatingCount: 100,
});

test("app IDs and URLs are strict; country comes from explicit input", () => {
  assert.equal(
    appId("https://apps.apple.com/gb/app/counter/id1342608792?l=en"),
    app.trackId,
  );
  for (const value of [
    "0",
    "-12",
    "1.5",
    "9007199254740993",
    "https://evil.com/id123",
    "http://apps.apple.com/app/id123",
    "https://apps.apple.com@evil.com/id123",
    "https://apps.apple.com:8080/app/id123",
    "https://apps.apple.com/app/name",
  ])
    assert.throws(() => appId(value));
  for (const override of [
    { limit: 0 },
    { limit: 31 },
    { country: "XX" },
    { keywords: [""] },
    { keywords: Array(101).fill("bird") },
  ])
    assert.equal(
      competitorInput.safeParse({ ...input, ...override }).success,
      false,
    );
  assert.equal(
    subtitleFromHtml(
      '<p class="subtitle other">Bird &amp; &#x66;lower <b>ID</b></p>',
    ),
    "Bird & flower ID",
  );
  assert.equal(subtitleFromHtml("<p>Not a subtitle</p>"), null);
});

test("discovery preserves provenance, prioritizes supplied terms, deduplicates, and excludes legal text", () => {
  const candidates = keywordCandidates(metadata, [
    "  PDF   Patterns ",
    "pdf patterns",
    "voice controlled row counter",
  ]);
  assert.equal(candidates[0].keyword, "pdf patterns");
  assert.equal(candidates[0].kind, "provided");
  assert.ok(candidates[0].sources.some((s) => s.field === "description"));
  assert.equal(
    candidates.filter((c) => c.keyword === "pdf patterns").length,
    1,
  );
  assert.ok(
    candidates.some(
      (c) =>
        c.keyword === "row counter voice control" &&
        c.kind === "metadata_combination" &&
        c.sources.some((s) => s.field === "title") &&
        c.sources.some((s) => s.field === "description"),
    ),
  );
  assert.ok(
    candidates.some(
      (c) => c.keyword === "pdf import" && c.sources[0].field === "subtitle",
    ),
  );
  assert.ok(
    !candidates.some((c) =>
      /privacy|subscription|renewal|https/.test(c.keyword),
    ),
  );
});

test("discovery-only performs no keyword or Ads queries and has no fabricated scores", async (t) => {
  const fetch = installFetch(t);
  const result = await discoverCompetitorKeywords(
    {},
    competitorInput.parse({ ...input, discoverOnly: true }),
  );
  assert.equal(fetch.mock.callCount(), 2);
  assert.equal(result.status, "discovery_only");
  assert.equal(result.results.length, 3);
  for (const candidate of result.results) {
    assert.equal(candidate.evidence.status, "not_checked");
    assert.equal(candidate.evidence.samplePosition, null);
    assert.equal(candidate.inspection, null);
  }
});

test("explicitly supplied short and numeric keywords are never silently discarded", () => {
  const result = keywordCandidates(metadata, ["X", "2048"]);
  assert.deepEqual(
    result.slice(0, 2).map((r) => r.keyword),
    ["x", "2048"],
  );
});

test("lookup honors explicit country/store and follows Apple's named app redirect", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (value) => {
    const url = new URL(value);
    requests.push(url);
    if (url.hostname === "itunes.apple.com") {
      assert.equal(url.searchParams.get("country"), "gb");
      assert.equal(url.searchParams.get("entity"), "iPadSoftware");
      return Response.json({ results: [app] });
    }
    if (url.pathname === `/gb/app/id${app.trackId}`)
      return new Response(null, {
        status: 301,
        headers: { location: `/gb/app/counter/id${app.trackId}` },
      });
    return new Response('<p class="subtitle">Row Counter &amp; PDF</p>');
  });
  const result = await discoverCompetitorKeywords(
    {},
    {
      ...input,
      app: `https://apps.apple.com/us/app/id${app.trackId}`,
      country: "GB",
      store: "ipad",
      discoverOnly: true,
    },
  );
  assert.equal(result.app.subtitle, "Row Counter & PDF");
  assert.equal(result.app.country, "GB");
  assert.equal(requests.length, 3);
});

test("verification distinguishes target presence, successful empty sample, and failed search; stops remaining work", async (t) => {
  const fetch = installFetch(t, [
    [resultApp(44), resultApp(app.trackId), resultApp(45)],
    [],
    new Response(null, { status: 429 }),
  ]);
  const delays = fastTimers(t);
  const result = await discoverCompetitorKeywords(
    {},
    {
      ...input,
      limit: 4,
      keywords: [
        "test presence",
        "test absence",
        "test failure",
        "test unattempted",
      ],
    },
  );
  assert.equal(result.status, "partial");
  const [present, absent, failed, unattempted] = result.results;
  assert.deepEqual(present.evidence, {
    status: "observed",
    samplePosition: 2,
    sampleSize: 3,
    checkedAt: present.inspection.fetchedAt,
  });
  assert.equal(present.inspection.popularity.score, null);
  assert.equal(present.inspection.popularity.status, "not_configured");
  assert.ok(present.inspection.competition.score > 0);
  assert.equal(absent.evidence.status, "not_observed");
  assert.equal(absent.evidence.sampleSize, 0);
  assert.equal(failed.evidence.status, "search_error");
  assert.equal(failed.evidence.sampleSize, null);
  assert.equal(unattempted.evidence.status, "not_checked");
  assert.equal(fetch.mock.callCount(), 5);
  assert.deepEqual(delays, [4000, 4000, 4000]);
});

test("metadata follows only same-origin redirects; optional page failure preserves lookup", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    calls.push(String(url));
    if (new URL(url).pathname === "/lookup")
      return Response.json({ results: [app] });
    return new Response(null, {
      status: 301,
      headers: { location: "https://example.org/steal" },
    });
  });
  const result = await competitorMetadata(app.trackId, "US", "iphone");
  assert.equal(result.subtitle, null);
  assert.equal(result.warnings.length, 1);
  assert.equal(calls.length, 2);
  await assert.rejects(
    competitorMetadata(app.trackId, "US", "mac"),
    /selected store/,
  );
});

test("metadata reports unavailable app, malformed lookup, and oversized response", async (t) => {
  for (const [response, message] of [
    [Response.json({ results: [] }), /not found/],
    [Response.json({ results: [{ trackId: app.trackId }] }), /incomplete/],
    [new Response("invalid"), /invalid/],
    [new Response("x".repeat(1024 * 1024 + 1)), /response limit/],
  ]) {
    const mocked = t.mock.method(globalThis, "fetch", async () => response);
    await assert.rejects(
      competitorMetadata(app.trackId, "US", "iphone"),
      message,
    );
    mocked.mock.restore();
  }
});

test("CLI subcommand, summary, imports, partial exit, and legacy keyword escape work outside checkout", () => {
  const dir = mkdtempSync(join(tmpdir(), "northstar-competitor-"));
  const cli = resolve("scripts/inspect.mjs");
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) => !k.startsWith("APPLE_ADS_") && k !== "NORTH_STAR_ENV_FILE",
    ),
  );
  try {
    const config = join(dir, "empty.env"),
      mock = join(dir, "fetch.mjs"),
      terms = join(dir, "terms.txt");
    writeFileSync(config, "");
    writeFileSync(terms, "voice controlled row counter\npdf patterns\n");
    writeFileSync(
      mock,
      `globalThis.setTimeout = fn => {queueMicrotask(fn);return 0};
      globalThis.fetch = async u => new URL(u).pathname === '/lookup' ? Response.json({results:[${JSON.stringify(app)}]}) :
      new URL(u).hostname === 'apps.apple.com' ? new Response('<p class="subtitle">PDF Import</p>') : new Response(null,{status:429});`,
    );
    const run = (args) =>
      spawnSync(
        process.execPath,
        ["--import", mock, cli, ...args, "--config", config],
        { cwd: dir, env, encoding: "utf8" },
      );
    const discovery = run([
      "competitors",
      String(app.trackId),
      "--keywords-file",
      terms,
      "--discover-only",
      "--summary",
      "--limit",
      "2",
    ]);
    assert.equal(discovery.status, 0, discovery.stderr);
    const result = JSON.parse(discovery.stdout);
    assert.equal(result.app.description, undefined);
    assert.deepEqual(
      result.results.map((r) => r.keyword),
      ["voice controlled row counter", "pdf patterns"],
    );
    assert.equal(result.results[0].popularity, null);
    const partial = run([
      "competitors",
      String(app.trackId),
      "--keyword",
      "voice controlled row counter",
      "--summary",
      "--limit",
      "2",
    ]);
    assert.equal(partial.status, 2, partial.stderr);
    assert.equal(
      JSON.parse(partial.stdout).results[0].evidence.status,
      "search_error",
    );
    assert.match(partial.stderr, /Checking/);
    for (const args of [
      ["competitors", "https://evil.com/id12"],
      ["competitors", "12", "--limit", "0"],
      ["competitors", "12", "34"],
    ]) {
      const invalid = run(args);
      assert.equal(invalid.status, 1);
      assert.equal(invalid.stdout, "");
    }
    writeFileSync(terms, '["bird",42]');
    assert.equal(
      run(["competitors", "12", "--keywords-file", terms]).status,
      1,
    );
    const legacy = spawnSync(
      process.execPath,
      ["--import", mock, cli, "--config", config, "--", "competitors"],
      { cwd: dir, env, encoding: "utf8" },
    );
    assert.equal(legacy.status, 0, legacy.stderr);
    assert.equal(JSON.parse(legacy.stdout)[0].keyword, "competitors");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
