import { z } from "zod";
import { markets } from "./markets.ts";
import { competition } from "./scoring.ts";
import { popularity, type AppleConfig } from "./apple-ads.ts";
import { searchApps } from "./store-search.ts";
import type { Inspection } from "./types.ts";
export const inspectionInput = z.object({
  keyword: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(
      (s) => /[\p{L}\p{N}]/u.test(s),
      "Enter a keyword with letters or numbers.",
    ),
  country: z.string().refine((c) => markets.some((m) => m[0] === c)),
  store: z.enum(["iphone", "ipad", "mac"]),
  reportingRange: z
    .enum(["week", "previous_week", "month", "previous_month"])
    .default("week"),
});
export type InspectionInput = z.infer<typeof inspectionInput>;
// Shared by the website API route and the local CLI so both return one shape.
export async function inspect(
  c: AppleConfig,
  { keyword, country, store, reportingRange }: InspectionInput,
): Promise<Inspection> {
  const [search, demand] = await Promise.allSettled([
    searchApps(keyword, country, store),
    popularity(c, keyword, country, store, reportingRange),
  ]);
  const apps = search.status === "fulfilled" ? search.value.apps : [];
  return {
    keyword,
    country,
    store,
    reportingRange,
    fetchedAt:
      search.status === "fulfilled"
        ? search.value.fetchedAt
        : new Date().toISOString(),
    apps,
    competition: competition(apps, keyword),
    popularity:
      demand.status === "fulfilled"
        ? demand.value
        : {
            status: "error",
            score: null,
            message: "Popularity is temporarily unavailable.",
          },
    ...(search.status === "rejected"
      ? {
          searchError:
            search.reason instanceof Error
              ? search.reason.message
              : "Search is temporarily unavailable.",
        }
      : {}),
  };
}
