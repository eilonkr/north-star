import { sign } from "node:crypto";
import type { Popularity } from "./types.ts";
import { z } from "zod";
import { resolveReportingPeriod, type ReportingRange, type ReportingPeriod } from "./reporting.ts";
export { latestPublishedWeek } from "./reporting.ts";
const keywordKey = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ")
    .trim();
export type AppleConfig = {
  APPLE_ADS_CLIENT_ID?: string;
  APPLE_ADS_TEAM_ID?: string;
  APPLE_ADS_KEY_ID?: string;
  APPLE_ADS_AD_ACCOUNT_ID?: string;
  APPLE_ADS_PRIVATE_KEY?: string;
};
export const requiredKeys = [
  "APPLE_ADS_CLIENT_ID",
  "APPLE_ADS_TEAM_ID",
  "APPLE_ADS_KEY_ID",
  "APPLE_ADS_AD_ACCOUNT_ID",
  "APPLE_ADS_PRIVATE_KEY",
] as const;
export function configured(c: AppleConfig) {
  return requiredKeys.every(
    (k) => typeof c[k] === "string" && c[k]!.trim().length > 0,
  );
}
export class AppleError extends Error {
  status: number;
  constructor(status: number) {
    super(
      status === 401
        ? "Apple Ads authentication failed. Check the API key and IDs."
        : status === 403
          ? "Apple Ads denied access. Check API permissions and the ad account ID."
          : status === 429
            ? "Apple Ads is rate limiting requests. Please try again later."
            : "Apple Ads could not complete this request. Check the connection or try again later.",
    );
    this.status = status;
  }
}
let tokenCache:
  | { identity: string; value: string; expires: number }
  | undefined;
export function clientSecret(
  c: AppleConfig,
  now = Math.floor(Date.now() / 1000),
) {
  const base64 = (v: object) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const input = `${base64({ alg: "ES256", kid: c.APPLE_ADS_KEY_ID, typ: "JWT" })}.${base64({ iss: c.APPLE_ADS_TEAM_ID, sub: c.APPLE_ADS_CLIENT_ID, aud: "https://appleid.apple.com", iat: now, exp: now + 3600 })}`;
  // Pass PEM directly: Workers' sign() does not accept a Node PrivateKeyObject.
  const key = c.APPLE_ADS_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const signature = sign("sha256", Buffer.from(input), {
    key,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `${input}.${signature}`;
}
async function accessToken(c: AppleConfig) {
  const identity = [
    c.APPLE_ADS_CLIENT_ID,
    c.APPLE_ADS_TEAM_ID,
    c.APPLE_ADS_KEY_ID,
  ].join(":");
  if (
    tokenCache &&
    tokenCache.identity === identity &&
    tokenCache.expires > Date.now()
  )
    return tokenCache.value;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: c.APPLE_ADS_CLIENT_ID!,
    client_secret: clientSecret(c),
    scope: "searchadsorg",
  });
  const r = await fetch("https://appleid.apple.com/auth/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new AppleError(r.status);
  const d = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!d.access_token) throw new AppleError(502);
  tokenCache = {
    identity,
    value: d.access_token,
    expires: Date.now() + (Math.min(d.expires_in || 3600, 3600) - 60) * 1000,
  };
  return d.access_token;
}
export async function appleRequest<T>(
  c: AppleConfig,
  path: string,
  body?: object,
) {
  const token = await accessToken(c);
  const r = await fetch(`https://api.ads.apple.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-AP-Context": `adAccountId=${c.APPLE_ADS_AD_ACCOUNT_ID}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    if (r.status === 401) tokenCache = undefined;
    throw new AppleError(r.status);
  }
  return r.json() as Promise<T>;
}
export type PopularityRow = {
  searchTerm: string;
  countryOrRegion: string;
  week?: string;
  month?: string;
  genre: string;
  searchPopularity1to100?: number;
  searchPopularityInGenre?: number;
  rankInGenre?: number;
};
export function readPopularity(
  rows: PopularityRow[],
  keyword: string,
  country: string,
  period: ReportingPeriod,
): Popularity {
  // Live Platform API responses identify a weekly bucket by its starting Sunday.
  const matchesPeriod = (row: PopularityRow) => period.granularity === "MONTHLY"
    ? row.month === period.start.slice(0, 7)
    : row.week === period.start;
  const found = rows.filter(
    (r) =>
      keywordKey(r.searchTerm) === keywordKey(keyword) &&
      r.countryOrRegion === country &&
      matchesPeriod(r),
  );
  if (!found.length) {
    const related = new Map<string, { keyword: string; score: number }>();
    for (const row of rows) {
      if (
        row.countryOrRegion === country && matchesPeriod(row) &&
        keywordKey(row.searchTerm).includes(keywordKey(keyword)) &&
        Number.isInteger(row.searchPopularity1to100) &&
        row.searchPopularity1to100! >= 1 && row.searchPopularity1to100! <= 100
      ) related.set(keywordKey(row.searchTerm), {
        keyword: row.searchTerm, score: row.searchPopularity1to100!,
      });
    }
    return {
      status: "not_reported",
      score: null,
      period,
      message:
        `This exact keyword is missing from Apple’s ${period.granularity === "MONTHLY" ? "monthly" : "weekly"} top-terms report. Try another reporting period. North Star’s source does not cover every keyword—even popular ones can be absent. Popularity is unknown; this is not a low-demand score.`,
      relatedTerms: [...related.values()].sort((a, b) => b.score - a.score).slice(0, 5),
    };
  }
  const scores = found.map((r) => r.searchPopularity1to100);
  if (
    scores.some(
      (n) => !Number.isInteger(n) || typeof n !== "number" || n < 1 || n > 100,
    ) ||
    new Set(scores).size !== 1
  )
    throw new AppleError(502);
  return {
    status: "available",
    score: scores[0]!,
    period,
    message:
      "Relative search demand across all genres in this country. Higher means more popular; this is not a monthly search count.",
    genres: found.map((r) => ({
      genre: r.genre,
      rank: r.rankInGenre ?? 0,
      score: r.searchPopularityInGenre ?? 0,
    })),
  };
}
const popularityCache = new Map<
  string,
  { expires: number; value: Popularity }
>();
export async function popularity(
  c: AppleConfig,
  keyword: string,
  country: string,
  store: string,
  reportingRange: ReportingRange = "week",
): Promise<Popularity> {
  if (store === "mac")
    return {
      status: "unsupported",
      score: null,
      message:
        "Apple Ads reports iPhone and iPad search demand, not Mac App Store popularity. Competition can still be inspected.",
    };
  if (!configured(c))
    return {
      status: "not_configured",
      score: null,
      message:
        "Connect your Apple Ads API credentials to see official country-level search popularity.",
    };
  const period = resolveReportingPeriod(reportingRange);
  const key = [
    c.APPLE_ADS_AD_ACCOUNT_ID,
    country,
    keywordKey(keyword),
    period.start,
    period.end,
    period.granularity,
  ].join(":");
  const cached = popularityCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  try {
    const rows: PopularityRow[] = [];
    let offset = 0;
    // CONTAINS is documented as case-insensitive. Filter to the exact term below.
    // Avoid optional sorting fields to preserve API compatibility.
    for (let page = 0; page < 3; page++) {
      const d = await appleRequest<{ result?: { rows?: PopularityRow[] } }>(
        c,
        "insights/apps/search-term-popularity/query",
        {
          fields: [
            "rankInGenre",
            "searchPopularityInGenre",
            "searchPopularity1to100",
            "searchPopularity1to5",
          ],
          filters: [
            { field: "countryOrRegion", operator: "EQUALS", value: country },
            { field: "searchTerm", operator: "CONTAINS", value: keyword },
          ],
          timeRange: period,
          pagination: { offset, pageSize: 5000 },
        },
      );
      if (!Array.isArray(d.result?.rows)) throw new AppleError(502);
      const pageRows = z
        .array(
          z.object({
            searchTerm: z.string(),
            countryOrRegion: z.string(),
            week: z.string().optional(),
            month: z.string().optional(),
            genre: z.string(),
            searchPopularity1to100: z.number().int().min(1).max(100),
            searchPopularityInGenre: z
              .number()
              .int()
              .min(1)
              .max(100)
              .optional(),
            rankInGenre: z.number().int().min(1).max(500).optional(),
          }).refine((row) => period.granularity === "MONTHLY" ? !!row.month : !!row.week),
        )
        .parse(d.result!.rows!);
      rows.push(...pageRows);
      offset += pageRows.length;
      if (pageRows.length < 5000) break;
      if (page === 2) throw new AppleError(502);
    }
    const result = readPopularity(rows, keyword, country, period);
    if (popularityCache.size >= 200)
      popularityCache.delete(popularityCache.keys().next().value!);
    popularityCache.set(key, { expires: Date.now() + 3600000, value: result });
    return result;
  } catch (e) {
    return {
      status: "error",
      score: null,
      message:
        e instanceof AppleError
          ? e.message
          : "Could not read Apple Ads popularity. Check your server credentials and try the connection check.",
    };
  }
}
