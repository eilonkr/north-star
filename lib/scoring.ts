export type StoreApp = {
  id: number;
  name: string;
  developer: string;
  icon: string;
  url: string;
  ratings: number;
  stars: number;
  updated: string;
  genre: string;
};
export type Competition = {
  score: number | null;
  sampleSize: number;
  confidence: "limited" | "low";
  factors: {
    name: string;
    value: number;
    weight: number;
    description: string;
  }[];
};
export function normalize(text: string) {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export function titleMatch(title: string, keyword: string) {
  const t = normalize(title),
    k = normalize(keyword);
  if (!k) return 0;
  if (` ${t} `.includes(` ${k} `)) return 1;
  const tokens = k.split(" ");
  return (
    (tokens.filter((x) => t.split(" ").includes(x)).length / tokens.length) *
    0.6
  );
}
// Transparent, uncalibrated proxy. This is not Apple's ranking algorithm.
export function competition(
  apps: StoreApp[],
  keyword: string,
  now = Date.now(),
): Competition {
  const sample = apps.slice(0, 10);
  if (sample.length < 3)
    return {
      score: null,
      sampleSize: sample.length,
      confidence: "low",
      factors: [],
    };
  const weighted = (fn: (app: StoreApp) => number) => {
    const weights = sample.map((_, i) => 1 / Math.log2(i + 2));
    return (
      sample.reduce((s, a, i) => s + fn(a) * weights[i], 0) /
      weights.reduce((a, b) => a + b, 0)
    );
  };
  const factors = [
    {
      name: "Rating volume",
      value: weighted((a) =>
        Math.min(1, Math.log10(1 + Math.max(0, a.ratings)) / 6),
      ),
      weight: 0.55,
      description:
        "Log-scaled rating counts; 1 million ratings reaches the ceiling.",
    },
    {
      name: "Title relevance",
      value: weighted((a) => titleMatch(a.name, keyword)),
      weight: 0.3,
      description: "Exact phrase and token overlap in app titles.",
    },
    {
      name: "Rating strength",
      value: weighted((a) => (a.stars / 5) * (a.ratings / (a.ratings + 100))),
      weight: 0.1,
      description: "Star rating, discounted when there are fewer ratings.",
    },
    {
      name: "Update recency",
      value: weighted((a) => {
        const days = (now - Date.parse(a.updated)) / 86400000;
        return Number.isFinite(days) ? Math.exp(-Math.max(0, days) / 180) : 0;
      }),
      weight: 0.05,
      description: "Recent updates contribute a small part of the estimate.",
    },
  ];
  return {
    score: Math.round(
      1 + 99 * factors.reduce((s, f) => s + f.value * f.weight, 0),
    ),
    sampleSize: sample.length,
    confidence: sample.length >= 10 ? "limited" : "low",
    factors,
  };
}
