import type { CompetitorMetadata } from "./competitor-metadata.ts";

export type CandidateSource = {
  field: "title" | "subtitle" | "description" | "provided";
  text: string;
};
export type KeywordCandidate = {
  keyword: string;
  kind: "metadata_phrase" | "metadata_combination" | "provided";
  sources: CandidateSource[];
};

export const normalizeKeyword = (text: string) =>
  text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

// English phrase boundaries, not a keyword database or a demand model.
const stops = new Set(
  `a an the and or but of for to from with in on at by as is are be been being was were it its this that these those your you yours my our ours their they them we us i can could will would should may might must have has had do does did not no all any each every more most other such than then also just very so up out into over under through about how what when where who which while new best great easy simple use using used get lets let make makes need needs want now app apps free premium feature features download available only without there here within several keep add set see access directly optimized`.split(
    " ",
  ),
);
const boilerplate =
  /\b(subscription|subscribe|privacy|terms|refund|renewal|renew|payment|charged|itunes|copyright|rights reserved|price|prices|pricing|usd|https?|www|email|watchos|ios|devices|supporting|google drive|dropbox|apple watch)\b/i;
const weakEdges = new Set(
  "create specific beautiful basic follow followup increment speak touch users import annotate supporting optimized patterns".split(
    " ",
  ),
);

export function keywordCandidates(
  metadata: CompetitorMetadata,
  provided: string[] = [],
): KeywordCandidate[] {
  const entries = new Map<
    string,
    KeywordCandidate & { priority: number; order: number }
  >();
  function add(keyword: string, source: CandidateSource, priority: number) {
    keyword = normalizeKeyword(keyword);
    if (
      source.field !== "provided" &&
      (keyword.length < 2 || keyword.length > 100 || !/[\p{L}]/u.test(keyword))
    )
      return;
    const existing = entries.get(keyword);
    if (existing) {
      existing.priority = Math.max(existing.priority, priority);
      if (
        !existing.sources.some(
          (s) => s.field === source.field && s.text === source.text,
        )
      )
        existing.sources.push(source);
    } else
      entries.set(keyword, {
        keyword,
        kind: source.field === "provided" ? "provided" : "metadata_phrase",
        sources: [source],
        priority,
        order: entries.size,
      });
  }
  for (const keyword of provided)
    add(keyword, { field: "provided", text: keyword.trim() }, 1000);
  for (const [field, text, base] of [
    ["title", metadata.name, 100],
    ["subtitle", metadata.subtitle ?? "", 90],
    ["description", metadata.description, 30],
  ] as const) {
    for (const line of text.split(/[\n.!?;]+/)) {
      if (field === "description" && boilerplate.test(line.replace(/_/g, " ")))
        continue;
      const heading =
        field === "description" &&
        /[A-Z]/.test(line) &&
        line === line.toUpperCase();
      const segments = line.replace(/[-–—_&,():/#|+]+/g, " | ").split(/\|/);
      for (const segment of segments) {
        const words =
          normalizeKeyword(segment).match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ??
          [];
        const chunks: string[][] = [[]];
        for (const word of words) {
          if (stops.has(word) || /^\d+$/.test(word)) {
            if (chunks.at(-1)!.length) chunks.push([]);
          } else chunks.at(-1)!.push(word);
        }
        for (const chunk of chunks.filter((c) => c.length)) {
          // Description singles are too noisy. Long prose is not silently turned into every possible n-gram.
          if (chunk.length > 5 || (field === "description" && chunk.length < 2))
            continue;
          if (field === "description" && chunk.includes("mistake")) continue;
          if (
            field === "description" &&
            (weakEdges.has(chunk[0]) || weakEdges.has(chunk.at(-1)!))
          ) {
            // Trim repetitive leading words, but keep useful nouns such as "pdf patterns".
            while (chunk.length > 2 && weakEdges.has(chunk[0])) chunk.shift();
            if (
              weakEdges.has(chunk[0]) ||
              (weakEdges.has(chunk.at(-1)!) && chunk.at(-1) !== "patterns")
            )
              continue;
          }
          const phrase = chunk.join(" ");
          const source = { field, text: phrase };
          add(
            phrase,
            source,
            base + (heading ? 15 : 0) + Math.min(chunk.length, 3),
          );
          // Shorter contiguous alternatives give long titles a chance to match actual queries.
          if (field !== "description" && chunk.length > 2) {
            for (let i = 0; i < chunk.length - 1; i++)
              add(chunk.slice(i, i + 2).join(" "), source, base);
          }
        }
      }
    }
  }
  // Interleave subjects, features, and combinations so titles cannot exhaust the budget.
  const sorted = [...entries.values()].sort(
    (a, b) => b.priority - a.priority || a.order - b.order,
  );
  const supplied = sorted.filter((e) =>
    e.sources.some((s) => s.field === "provided"),
  );
  const title = sorted.filter(
    (e) =>
      !supplied.includes(e) &&
      e.sources.some((s) => s.field === "title" || s.field === "subtitle"),
  );
  const features = sorted.filter(
    (e) => !supplied.includes(e) && !title.includes(e),
  );
  // Clearly labelled recombinations attach a feature to an app subject, rather than treating
  // a broad feature such as "voice control" as niche evidence on its own.
  const anchor = sorted.find(
    (e) =>
      e.sources.some((s) => s.field === "title" || s.field === "subtitle") &&
      e.keyword.split(" ").length >= 2 &&
      e.keyword.split(" ").length <= 3,
  );
  const combined = anchor
    ? features
        .filter((e) => e.keyword.split(" ").length <= 3)
        .slice(0, 8)
        .map((feature) => ({
          keyword: `${anchor.keyword} ${feature.keyword}`,
          kind: "metadata_combination" as const,
          sources: [...anchor.sources, ...feature.sources],
        }))
        .filter((e) => e.keyword.length <= 100 && !entries.has(e.keyword))
    : [];
  const balanced: KeywordCandidate[] = [...supplied];
  for (let i = 0; i < Math.max(title.length, features.length); i++) {
    if (title[i]) balanced.push(title[i]);
    if (features[i]) balanced.push(features[i]);
    if (combined[i]) balanced.push(combined[i]);
  }
  return balanced.map(({ keyword, kind, sources }) => ({
    keyword,
    kind,
    sources,
  }));
}
