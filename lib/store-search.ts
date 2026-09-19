import { z } from "zod";
import type { Store } from "./markets.ts";
import type { StoreApp } from "./scoring.ts";
const appSchema = z.object({
  trackId: z.number(),
  trackName: z.string(),
  artistName: z.string().optional(),
  sellerName: z.string().optional(),
  artworkUrl100: z.string().url().optional(),
  artworkUrl60: z.string().url().optional(),
  trackViewUrl: z.string().url(),
  userRatingCount: z.number().nonnegative().optional(),
  averageUserRating: z.number().min(0).max(5).optional(),
  currentVersionReleaseDate: z.string().optional(),
  releaseDate: z.string().optional(),
  primaryGenreName: z.string().optional(),
});
const cache = new Map<
  string,
  { expires: number; apps: StoreApp[]; fetchedAt: string }
>();
export async function searchApps(
  keyword: string,
  country: string,
  store: Store,
) {
  const key = JSON.stringify([keyword, country, store]);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now())
    return { apps: hit.apps, fetchedAt: hit.fetchedAt };
  const url = new URL("https://itunes.apple.com/search");
  url.search = new URLSearchParams({
    term: keyword,
    country: country.toLowerCase(),
    lang: country === "JP" ? "ja_jp" : "en_us",
    entity:
      store === "mac"
        ? "macSoftware"
        : store === "ipad"
          ? "iPadSoftware"
          : "software",
    limit: "30",
  }).toString();
  const r = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok)
    throw new Error(
      r.status === 429
        ? "Apple’s Search API is busy. Wait a moment and try again."
        : "Apple’s Search API is unavailable. Please try again.",
    );
  const d = (await r.json()) as { results?: unknown[] };
  if (!Array.isArray(d.results))
    throw new Error("Apple returned an unexpected search response.");
  const seen = new Set<number>();
  const apps: StoreApp[] = [];
  for (const value of d.results) {
    const parsed = appSchema.safeParse(value);
    if (!parsed.success)
      throw new Error("Apple returned incomplete app data. Please try again.");
    const a = parsed.data;
    if (seen.has(a.trackId)) continue;
    seen.add(a.trackId);
    const updated = a.currentVersionReleaseDate || a.releaseDate || "";
    apps.push({
      id: a.trackId,
      name: a.trackName,
      developer: a.artistName || a.sellerName || "",
      icon: a.artworkUrl100 || a.artworkUrl60 || "",
      url: a.trackViewUrl,
      ratings: a.userRatingCount ?? 0,
      stars: a.averageUserRating ?? 0,
      updated: Number.isFinite(Date.parse(updated)) ? updated : "",
      genre: a.primaryGenreName || "—",
    });
  }
  const fetchedAt = new Date().toISOString();
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, { expires: Date.now() + 900000, apps, fetchedAt });
  return { apps, fetchedAt };
}
