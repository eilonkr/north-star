import { z } from "zod";
import { inspect, inspectionInput } from "./inspect.ts";
import type { AppleConfig } from "./apple-ads.ts";
import type { Inspection } from "./types.ts";
import {
  appId,
  competitorMetadata,
  type CompetitorMetadata,
} from "./competitor-metadata.ts";
import {
  keywordCandidates,
  type KeywordCandidate,
} from "./keyword-candidates.ts";

export const competitorInput = inspectionInput.omit({ keyword: true }).extend({
  app: z
    .string()
    .trim()
    .max(2048)
    .superRefine((value, context) => {
      try {
        appId(value);
      } catch (error) {
        context.addIssue({ code: "custom", message: (error as Error).message });
      }
    }),
  limit: z.number().int().min(1).max(30).default(10),
  keywords: z.array(inspectionInput.shape.keyword).max(100).default([]),
  discoverOnly: z.boolean().default(false),
});
export type CompetitorInput = z.input<typeof competitorInput>;
export type CompetitorKeyword = KeywordCandidate & {
  evidence: {
    status: "observed" | "not_observed" | "search_error" | "not_checked";
    samplePosition: number | null;
    sampleSize: number | null;
    checkedAt: string | null;
    message?: string;
  };
  inspection: Inspection | null;
};
export type CompetitorDiscovery = {
  method: "metadata-phrases-v0.1";
  app: CompetitorMetadata;
  reportingRange: z.infer<typeof inspectionInput>["reportingRange"];
  candidatesFound: number;
  results: CompetitorKeyword[];
  status: "discovery_only" | "complete" | "partial";
  warnings: string[];
};
export type CompetitorProgress = {
  completed: number;
  total: number;
  keyword: string;
};

/** Server API for the CLI. Always validates input; no website wiring in this release. */
export async function discoverCompetitorKeywords(
  config: AppleConfig,
  input: CompetitorInput,
  options: { onProgress?: (progress: CompetitorProgress) => void } = {},
): Promise<CompetitorDiscovery> {
  const parsed = competitorInput.parse(input);
  const metadata = await competitorMetadata(
    appId(parsed.app),
    parsed.country,
    parsed.store,
  );
  const candidates = keywordCandidates(metadata, parsed.keywords);
  const results: CompetitorKeyword[] = candidates
    .slice(0, parsed.limit)
    .map((candidate) => ({
      ...candidate,
      evidence: {
        status: "not_checked",
        samplePosition: null,
        sampleSize: null,
        checkedAt: null,
      },
      inspection: null,
    }));
  const warnings = [
    ...metadata.warnings,
    "Experimental English-oriented phrase extraction from public metadata; suggestions may include brands or irrelevant phrases. It does not reveal hidden App Store keywords or all terms an app ranks for.",
    "Evidence is a current public Search API sample (up to 30 apps), not a native App Store rank. Absence from the sample does not prove the app is unranked.",
    "Missing exact popularity is unknown. Competition is the uncalibrated North Star estimate; neither score measures discovery accuracy.",
  ];
  let status: CompetitorDiscovery["status"] = parsed.discoverOnly
    ? "discovery_only"
    : "complete";
  if (!parsed.discoverOnly) {
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      options.onProgress?.({
        completed: i,
        total: results.length,
        keyword: result.keyword,
      });
      // Leave room below Apple's approximate 20 requests/minute ceiling, including the lookup.
      await new Promise<void>((resolve) => setTimeout(resolve, 4000));
      const inspection = await inspect(config, {
        keyword: result.keyword,
        country: parsed.country,
        store: parsed.store,
        reportingRange: parsed.reportingRange,
      });
      result.inspection = inspection;
      const index = inspection.apps.findIndex((app) => app.id === metadata.id);
      result.evidence = {
        status: inspection.searchError
          ? "search_error"
          : index >= 0
            ? "observed"
            : "not_observed",
        samplePosition: index >= 0 ? index + 1 : null,
        sampleSize: inspection.searchError ? null : inspection.apps.length,
        checkedAt: inspection.fetchedAt,
        ...(inspection.searchError ? { message: inspection.searchError } : {}),
      };
      if (inspection.popularity.status === "error") status = "partial";
      if (inspection.searchError) {
        status = "partial";
        warnings.push(
          "Verification stopped after a search failure; remaining candidates are not_checked. Retry a small batch later.",
        );
        break;
      }
    }
  }
  return {
    method: "metadata-phrases-v0.1",
    app: metadata,
    reportingRange: parsed.reportingRange,
    candidatesFound: candidates.length,
    results,
    status,
    warnings,
  };
}
