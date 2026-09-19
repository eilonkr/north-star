import { z } from "zod";
import type { Store } from "./markets.ts";

export function appId(value: string): number {
  let id = value.trim();
  if (!/^\d+$/.test(id)) {
    let url: URL;
    try {
      url = new URL(id);
    } catch {
      throw new Error(
        "Provide an App Store app ID or https://apps.apple.com app URL.",
      );
    }
    if (
      url.protocol !== "https:" ||
      url.hostname !== "apps.apple.com" ||
      url.port ||
      url.username ||
      url.password
    )
      throw new Error(
        "Provide an App Store app ID or https://apps.apple.com app URL.",
      );
    id = url.pathname.match(/\/id([1-9]\d*)\/?$/)?.[1] ?? "";
  }
  const result = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(result))
    throw new Error("Invalid App Store app ID.");
  return result;
}

export type CompetitorMetadata = {
  id: number;
  name: string;
  subtitle: string | null;
  description: string;
  url: string;
  country: string;
  store: Store;
  fetchedAt: string;
  warnings: string[];
};

async function readText(url: URL, maxBytes: number): Promise<string> {
  let response: Response;
  const signal = AbortSignal.timeout(15000);
  let next = url;
  for (let redirects = 0; ; redirects++) {
    response = await fetch(next, { signal, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || redirects >= 3)
      throw new Error("Unexpected Apple metadata redirect.");
    next = new URL(location, next);
    if (next.origin !== url.origin || next.username || next.password)
      throw new Error("Unexpected Apple metadata redirect.");
  }
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Apple is rate limiting metadata requests. Wait before retrying."
        : "Apple app metadata is unavailable. Try again later.",
    );
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Apple returned empty app metadata.");
  let bytes = 0;
  let text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes)
        throw new Error("Apple app metadata exceeded the response limit.");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}

// Only the visible subtitle element is read. Page content is untrusted data.
export function subtitleFromHtml(html: string): string | null {
  const match = html.match(
    /<p\b[^>]*class=["'][^"']*\bsubtitle\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i,
  );
  if (!match) return null;
  const entities: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };
  const value = match[1]
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (entity, name: string) => {
      if (!name.startsWith("#")) return entities[name.toLowerCase()] ?? entity;
      const code =
        name[1].toLowerCase() === "x"
          ? parseInt(name.slice(2), 16)
          : Number(name.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
  return value && value.length <= 200 ? value : null;
}

const lookupApp = z.object({
  trackId: z.number().int(),
  trackName: z.string().min(1).max(500),
  description: z.string().max(100000).default(""),
  kind: z.string(),
  supportedDevices: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
});

export async function competitorMetadata(
  id: number,
  country: string,
  store: Store,
): Promise<CompetitorMetadata> {
  const lookup = new URL("https://itunes.apple.com/lookup");
  lookup.search = new URLSearchParams({
    id: String(id),
    country: country.toLowerCase(),
    entity:
      store === "mac"
        ? "macSoftware"
        : store === "ipad"
          ? "iPadSoftware"
          : "software",
  }).toString();
  let data: unknown;
  try {
    data = JSON.parse(await readText(lookup, 1024 * 1024));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error("Apple returned invalid app metadata.");
    throw error;
  }
  const envelope = z.object({ results: z.array(z.unknown()) }).safeParse(data);
  if (!envelope.success)
    throw new Error("Apple returned invalid app metadata.");
  const found = envelope.data.results.find(
    (value) =>
      typeof value === "object" &&
      value !== null &&
      "trackId" in value &&
      value.trackId === id,
  );
  if (!found)
    throw new Error(
      "App not found in this country and store. Check the app ID, country, and store.",
    );
  const parsed = lookupApp.safeParse(found);
  if (!parsed.success)
    throw new Error("Apple returned incomplete app metadata.");
  const app = parsed.data;
  const compatible =
    store === "mac"
      ? app.kind === "mac-software"
      : app.kind === "software" &&
        (app.supportedDevices.some((device) =>
          device.toLowerCase().startsWith(store),
        ) ||
          (store === "ipad" && app.features.includes("iosUniversal")));
  if (!compatible)
    throw new Error(
      "App does not list support for the selected store. Check --store.",
    );
  const url = `https://apps.apple.com/${country.toLowerCase()}/app/id${id}`;
  let subtitle: string | null = null;
  const warnings: string[] = [];
  try {
    subtitle = subtitleFromHtml(await readText(new URL(url), 5 * 1024 * 1024));
  } catch {
    /* Lookup metadata remains useful when the optional page fails. */
  }
  if (!subtitle)
    warnings.push(
      "Subtitle unavailable; discovery uses the title and description only.",
    );
  return {
    id,
    name: app.trackName,
    subtitle,
    description: app.description,
    country,
    store,
    url,
    fetchedAt: new Date().toISOString(),
    warnings,
  };
}
