import type { Store } from "./markets.ts";
import type { Competition, StoreApp } from "./scoring.ts";
import type { ReportingPeriod, ReportingRange } from "./reporting.ts";
export type Popularity = {
  status:
    | "available"
    | "not_configured"
    | "not_reported"
    | "unsupported"
    | "error";
  score: number | null;
  message: string;
  period?: ReportingPeriod;
  genres?: { genre: string; rank: number; score: number }[];
  relatedTerms?: { keyword: string; score: number }[];
};
export type Inspection = {
  keyword: string;
  country: string;
  store: Store;
  reportingRange: ReportingRange;
  fetchedAt: string;
  apps: StoreApp[];
  competition: Competition;
  popularity: Popularity;
  searchError?: string;
};
