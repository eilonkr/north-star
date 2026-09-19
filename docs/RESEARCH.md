# ASO keyword inspectors: research and North Star's model

Researched 2026-09-17. Public descriptions explain inputs; they do not let us reproduce competitors' exact algorithms.

## Live coverage finding

Live checks on 2026-09-17 UTC confirmed that the weekly Insights dataset is insufficient for comprehensive keyword lookup. In the US week of September 6–12, the exact term `plant identifier` was absent, while `plant identifier free` returned 60/100. The exact term was also absent from the August monthly report. Missing data cannot establish low demand. North Star now states this coverage gap explicitly and shows related reported terms separately, without substituting their scores.

The documented keyword-suggestions endpoint was also tested with an owned app. It returned identical multilingual lists and scores for US and GB requests, despite country filters, and did not reliably honor seed terms. Phrase SEARCH returned no matches. These results were not integrated as country-specific popularity. Broader reliable coverage remains unresolved; the live integration should not be described as equivalent to a full ASO keyword database.

## What the named tools disclose

| Tool       | Popularity                                                                                                                                              | Competition / difficulty                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Appfigures | Apple Search Ads data combined with other collected information, normalized to an index. Documentation uses differing range labels depending on report. | Proprietary model of the first 10 ranking apps, including downloads, rank, ratings, age, update activity and keyword placement.                         |
| Astro      | Its documentation identifies Apple Ads as its popularity source.                                                                                        | Proprietary ranking-factor model; coefficients and calibration are undisclosed.                                                                         |
| Kickstart  | Advertises search popularity across country/platform keyword workflows.                                                                                 | Advertises difficulty and competing-app views. The reviewed public product page does not disclose a formula or enough sourcing detail to reproduce it.  |
| ASOApp     | Describes demand as inferred signals rather than exact search counts.                                                                                   | Publishes parts of a heuristic, including log-scaled rating counts of leading apps; useful as an example of a model, not evidence of Apple's algorithm. |

Sources:

- [Appfigures keyword intelligence overview](https://appfigures.com/support/kb/654/)
- [Appfigures competitiveness](https://help.appfigures.com/en/article/whats-keyword-competitiveness-how-is-it-calculated-and-why-is-it-important-to-know-nsdl1q/)
- [Astro keyword data overview](https://tryastro.app/docs/data-overview-keywords/)
- [Kickstart product page](https://www.kickstart.tools/)
- [ASOApp methodology](https://aso-app.com/en/data-methodology)

## Apple's current direct route

The official Platform API v1 exposes `POST /v1/insights/apps/search-term-popularity/query` on `api.ads.apple.com`. It supports country and search-term filters plus a fixed reporting period. Explicitly request `searchPopularity1to100`; this field is the country-wide index. `searchPopularityInGenre` is a different metric and must never silently replace it. None of these values is raw monthly volume.

Coverage is limited to up to 500 qualifying terms per country and genre, with minimum search/impression thresholds. Long-tail terms can legitimately be absent. Apple documents availability in approximately 90 markets, excluding Russia and Belarus. North Star does not equate missing coverage with low demand. It does not derive popularity from app ratings, result counts, or arbitrary random values.

Apple's docs were fetched directly from `https://developer.apple.com/tutorials/data/documentation/apple-ads-platform-api/` when the HTML documentation could not be rendered by the research browser.

See [Apple connection guide](./APPLE_ADS_SETUP.md) for exact account requirements, endpoint references, fields, and reporting schedule.

## North Star competition v0.1

The first 10 apps returned by Apple's public iTunes Search API are used as a **search sample**, not guaranteed on-device App Store rankings. The public API supports country, software, iPadSoftware and macSoftware entities. It does not expose downloads or actual query volume.

For sample position i (one-based), weight `w_i = 1 / log2(i + 1)`. Each component is a weighted mean:

- Rating volume (55%): `min(1, log10(1 + ratings) / 6)`.
- Title relevance (30%): 1 for a normalized whole-phrase match; otherwise 0.6 times the fraction of query tokens present in title tokens. NFKC Unicode normalization and case folding are applied; punctuation collapses to spaces. This is lexical matching, not a language-specific relevance model.
- Rating strength (10%): `(stars / 5) × ratings / (ratings + 100)`.
- Update recency (5%): `exp(-daysSinceUpdate / 180)`. Missing dates contribute zero to this small component.

`score = round(1 + 99 × weightedComponentSum)`.

Fewer than three apps yields insufficient evidence. Three to nine yields low confidence; ten yields limited confidence. No sample yields high confidence in this uncalibrated version. Category ranks, estimated downloads, rating velocity, subtitle and hidden keyword fields are not available in this data path and are not invented. The 40/70 presentation thresholds are provisional.

Country-specific response metadata may still contain provider-level localization/aggregation limitations. Result order may differ by device, personalization, and Apple's search surface. A keyword containing a brand is not explicitly classified; a strong brand moat can be understated. Rating volume is a proxy for incumbent strength, not query demand.

This is a useful, transparent first-pass comparison, not a validated probability of reaching the top 10 or a clone of an Appfigures/Astro score. Calibration would require a historical dataset of actual keyword ranks and app outcomes. Public search results are cached up to 15 minutes in the current server instance; official popularity up to an hour for its reporting week. Caches are bounded and not durable.

[Apple Search API documentation](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html) documents an approximate 20-call-per-minute limit, subject to change. This private single-user version is not designed for bulk crawling or public high-volume use.

## Scope

One inspector: keyword, country, Apple store, two metrics, signal breakdown and app sample. No rank tracker, app analytics, ad creation, billing, keyword suggestions API, or estimated downloads feature. Google Play is outside the agreed first version.
