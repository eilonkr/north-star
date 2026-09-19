import { searchApps } from "./store-search.ts";
import { competition } from "./scoring.ts";
import type { Inspection } from "./types.ts";

// Apple's public Search API supports browser requests. If the hosting service
// cannot retrieve results, make one direct request with the same market/store.
// Apple Ads credentials and popularity requests remain entirely server-side.
export async function recoverSearch(result: Inspection): Promise<Inspection> {
  if (!result.searchError) return result;
  try {
    const search = await searchApps(result.keyword, result.country, result.store);
    return {
      ...result,
      ...search,
      competition: competition(search.apps, result.keyword),
      searchError: undefined,
    };
  } catch {
    return result;
  }
}
