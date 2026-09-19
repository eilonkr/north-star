import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { competition, titleMatch } from "../lib/scoring.ts";
import { resolveReportingPeriod } from "../lib/reporting.ts";
import {
  latestPublishedWeek,
  readPopularity,
  clientSecret,
  popularity,
  configured,
} from "../lib/apple-ads.ts";
const app = {
  id: 1,
  name: "Habit Tracker",
  developer: "Example",
  icon: "",
  url: "",
  ratings: 1000,
  stars: 4.5,
  updated: "2026-09-01T00:00:00Z",
  genre: "Productivity",
};
test("Apple reporting weeks obey the Monday 07:00 UTC publication boundary", () => {
  assert.deepEqual(latestPublishedWeek(new Date("2026-09-14T06:59:59Z")), {
    start: "2026-08-30",
    end: "2026-09-05",
  });
  assert.deepEqual(latestPublishedWeek(new Date("2026-09-14T07:00:00Z")), {
    start: "2026-09-06",
    end: "2026-09-12",
  });
  assert.deepEqual(latestPublishedWeek(new Date("2026-09-20T12:00:00Z")), {
    start: "2026-09-06",
    end: "2026-09-12",
  });
});
test("missing popularity is unknown and cannot become zero or a different market/week", () => {
  const period = { start: "2026-09-06", end: "2026-09-12" };
  const row = {
    searchTerm: "Habit Tracker",
    countryOrRegion: "US",
    week: "2026-09-06",
    genre: "PRODUCTIVITY_UTILITIES",
    searchPopularity1to100: 55,
  };
  assert.equal(readPopularity([row], "habit tracker", "US", period).score, 55);
  assert.equal(
    readPopularity([row], "habit tracker", "GB", period).score,
    null,
  );
  assert.equal(
    readPopularity(
      [{ ...row, week: "2026-08-30" }],
      "habit tracker",
      "US",
      period,
    ).status,
    "not_reported",
  );
  assert.equal(readPopularity([], "unknown", "US", period).score, null);
  assert.throws(() =>
    readPopularity(
      [{ ...row, searchPopularity1to100: 0 }],
      "habit tracker",
      "US",
      period,
    ),
  );
  assert.throws(() =>
    readPopularity(
      [row, { ...row, genre: "LIFESTYLE", searchPopularity1to100: 88 }],
      "habit tracker",
      "US",
      period,
    ),
  );
});
test("monthly periods respect publication day, year rollover and leap years", () => {
  assert.deepEqual(resolveReportingPeriod("month", new Date("2026-09-04T23:59:59Z")), {
    start: "2026-07-01", end: "2026-07-31", granularity: "MONTHLY",
  });
  assert.deepEqual(resolveReportingPeriod("month", new Date("2026-09-05T00:00:00Z")), {
    start: "2026-08-01", end: "2026-08-31", granularity: "MONTHLY",
  });
  assert.equal(resolveReportingPeriod("previous_month", new Date("2026-01-10T12:00:00Z")).start, "2025-11-01");
  assert.equal(resolveReportingPeriod("month", new Date("2024-03-10T12:00:00Z")).end, "2024-02-29");
  assert.deepEqual(resolveReportingPeriod("previous_week", new Date("2026-09-18T12:00:00Z")), {
    start: "2026-08-30", end: "2026-09-05", granularity: "WEEKLY_SUN_SAT",
  });
});
test("monthly parsing selects the exact month and never mixes weekly scores", () => {
  const period = { start: "2026-08-01", end: "2026-08-31", granularity: "MONTHLY" };
  const row = { searchTerm: "plant identifier", countryOrRegion: "US", month: "2026-08", genre: "EDUCATION", searchPopularity1to100: 55 };
  assert.equal(readPopularity([row, { ...row, month: "2026-07", searchPopularity1to100: 80 }], row.searchTerm, "US", period).score, 55);
  assert.equal(readPopularity([{ ...row, month: undefined, week: "2026-08-01" }], row.searchTerm, "US", period).score, null);
  assert.equal(readPopularity([row], row.searchTerm, "GB", period).score, null);
  assert.match(readPopularity([], row.searchTerm, "US", period).message, /monthly/);
});
test("related terms never become the exact keyword's popularity or cross markets/weeks", () => {
  const period = { start: "2026-09-06", end: "2026-09-12" };
  const row = { searchTerm: "plant identifier free", countryOrRegion: "US", week: period.start, genre: "PRODUCTIVITY_UTILITIES", searchPopularity1to100: 60 };
  const missing = readPopularity([
    row, { ...row, genre: "EDUCATION" },
    { ...row, searchTerm: "plant identifier uk", countryOrRegion: "GB", searchPopularity1to100: 99 },
    { ...row, searchTerm: "plant identifier old", week: "2026-08-30", searchPopularity1to100: 98 },
  ], "plant identifier", "US", period);
  assert.equal(missing.status, "not_reported");
  assert.equal(missing.score, null);
  assert.deepEqual(missing.relatedTerms, [{ keyword: "plant identifier free", score: 60 }]);
  assert.equal(readPopularity([row], row.searchTerm, "US", period).score, 60);
});
test("no credentials and Mac data have distinct statuses without network requests", async () => {
  assert.equal(configured({}), false);
  assert.equal(
    (await popularity({}, "habit", "US", "iphone")).status,
    "not_configured",
  );
  assert.equal(
    (await popularity({}, "habit", "US", "mac")).status,
    "unsupported",
  );
});
test("competition has minimum evidence, bounded scores, and stronger incumbents increase it", () => {
  assert.equal(competition([app, app], "habit tracker").score, null);
  const weak = Array.from({ length: 10 }, () => ({ ...app, ratings: 10 }));
  const strong = weak.map((a) => ({ ...a, ratings: 1000000 }));
  const a = competition(weak, "habit tracker"),
    b = competition(strong, "habit tracker");
  assert.ok(a.score >= 1 && b.score <= 100 && b.score > a.score);
  assert.equal(
    competition([...strong, ...weak], "habit tracker").score,
    b.score,
  );
  assert.ok(Math.abs(b.factors.reduce((s, f) => s + f.weight, 0) - 1) < 1e-10);
});
test("title matching respects word boundaries and Unicode", () => {
  assert.equal(titleMatch("Habit Tracker: Goals", "habit tracker"), 1);
  assert.equal(titleMatch("Runway", "run"), 0);
  assert.equal(titleMatch("לוח שנה", "לוח שנה"), 1);
});
test("OAuth JWT uses verifiable ES256 signature and proper Apple claims", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
    publicKeyEncoding: { format: "pem", type: "spki" },
  });
  const jwt = clientSecret(
    {
      APPLE_ADS_PRIVATE_KEY: privateKey,
      APPLE_ADS_CLIENT_ID: "client",
      APPLE_ADS_TEAM_ID: "team",
      APPLE_ADS_KEY_ID: "key",
    },
    1000,
  );
  const [header, payload, sig] = jwt.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url"));
  assert.equal(claims.aud, "https://appleid.apple.com");
  assert.equal(claims.exp, 4600);
  assert.equal(claims.sub, "client");
  assert.equal(JSON.parse(Buffer.from(header, "base64url")).kid, "key");
  assert.ok(
    verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(sig, "base64url"),
    ),
  );
});
