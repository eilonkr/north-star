# Competitor discovery beta

`northstar competitors <app-id-or-url>` is an experimental discovery and verification workflow. It operates entirely in the CLI/core package; the website remains on its existing release.

## Method

1. Resolve a numeric app ID or an HTTPS `apps.apple.com` app URL. Construct an Apple lookup request using the explicitly selected country/store, and check device compatibility. URL query parameters and storefront segments do not override CLI options.
2. Read the title/description from Apple's lookup response. Attempt to read the visible subtitle from the public app page; follow at most three same-origin redirects. Subtitle failure is a warning, not a failed lookup. These sources are public metadata, never the private App Store Connect keyword field.
3. Normalize phrases, split English stopwords and punctuation, remove legal/payment lines, and preserve short metadata phrases. Titles/subtitles contribute shorter contiguous alternatives. Interleave title phrases, descriptive features, and subject/feature combinations; supplied keywords come first. `kind` distinguishes `metadata_phrase`, `metadata_combination`, and `provided`. Each candidate retains source fields and normalized source phrases. Method version: `metadata-phrases-v0.1`.
4. Check at most `--limit` candidates (default 10, maximum 30). Pause four seconds before every inspection, then use the existing public search, Apple popularity, and competition pipeline. Stop after a search error without discarding earlier results. No automatic retry or campaign creation.

The extraction is deterministic, with no LLM dependency, API key, or paid ASO service. It is English-oriented even in other storefronts: choosing a country selects Apple data, not a translation model. It can miss good synonyms, retain poor phrases or brands, and construct combinations that nobody searches for. Supplied niche keywords are useful for checking ideas the extraction misses. A phrase's presence in a description is a discovery clue, not evidence that Apple indexes it.

Apple documents [ID-based lookups](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/index.html) and an [approximate 20 calls/minute search limit](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html). The four-second pause is per command; simultaneous commands share the provider limit. Keep batches small. The optional subtitle parser depends on Apple's public HTML and may lose coverage if its markup changes.

## Input and output

Common `--country`, `--store`, `--range`, `--config`, and `--summary` options are supported. New options:

| Option | Behavior |
| --- | --- |
| `--limit 10` | Return and optionally verify 1–30 candidates. |
| `--discover-only` | Fetch metadata and suggest candidates; no keyword search or popularity requests. |
| `--keyword 'phrase'` | Repeatable supplied term, ahead of generated candidates. |
| `--keywords-file path` | UTF-8 lines or JSON string array, at most 64 KiB. No CSV/header detection. |

At most 100 supplied entries, each 1–100 characters, are accepted before deduplication. Repeated `--keyword` values precede file entries. Deduplication normalizes Unicode, whitespace, and case. Supplied entries count toward `--limit`; excess entries are not checked. `candidatesFound` is the size of the combined candidate pool, not a count of keywords the app ranks for. To check only supplied terms, set the limit to their unique count (maximum 30).

Output is one JSON object with `app`, `method`, `status`, `reportingRange`, `candidatesFound`, `warnings`, and `results`. Each result has `keyword`, `kind`, `sources`, `evidence`, and a nullable `inspection`. Full inspections retain the existing reporting period, popularity statuses, related terms, current competition estimate, and search sample. `--summary` omits the description and full inspections, retaining per-candidate `popularity` and `competition` objects. A null score or inspection is never converted to zero.

| `evidence.status` | Meaning |
| --- | --- |
| `observed` | Target app ID appeared in this public search sample. |
| `not_observed` | Search succeeded but did not contain the target app. This does not prove it is unranked. |
| `search_error` | Search failed; sample size and position are unknown. |
| `not_checked` | Discovery-only, or verification stopped before this candidate. |

`samplePosition` is one-based, nullable, and **not a native App Store rank**. `sampleSize` reports actual returned unique apps (up to 30); successful empty search is zero, failed/unattempted search is null. `checkedAt` is the underlying sample timestamp (the existing search cache can be up to 15 minutes old). Popularity may be for a different published week/month; its own `period` remains attached. Missing exact popularity is unknown; competition remains the uncalibrated North Star estimate from [RESEARCH.md](RESEARCH.md).

Progress goes to stderr; stdout remains machine-readable JSON. Exit 0 means discovery-only or completed verification, including legitimate `not_reported`, `not_configured`, and `unsupported` popularity. Exit 2 returns partial JSON after a search/popularity provider error. Exit 1 covers invalid input, unreadable input files, or failed metadata lookup. A disconnected terminal can interrupt a command before final JSON is emitted.

The first literal positional word `competitors` selects this command. To inspect that word as an ordinary keyword use `northstar -- competitors`. Existing keyword invocations and their JSON-array contract remain unchanged.

## Benchmark boundary

The pre-implementation US/iPhone benchmark checked 30 manually chosen phrases across five apps: 20 returned the target app in the public search sample, and 2 had exact Apple popularity. Seven of ten hand-picked niche rewrites returned the app. These figures supported building a discovery-and-verification workflow; they are **not accuracy figures for this automatic extractor**, native-store rank accuracy, or coverage against Astro. This release does not claim to reproduce Astro's reverse keyword database.

## Release smoke check

On 2026-09-19 at 14:22 UTC, the beta CLI automatically generated and checked its first six candidates for My Row Counter (1342608792), US/iPhone, with the monthly popularity option and existing Apple Ads credentials. No keywords were supplied manually. All six inspections completed; exact popularity was `not_reported` for all six.

| Candidate | Kind | Target sample position | North Star competition |
| --- | --- | --- | --- |
| row counter | Metadata phrase | 1/30 | 55 |
| voice control | Metadata phrase | Not observed in 28 results | 42 |
| row counter voice control | Combination | 1/30 | 48 |
| knit | Metadata phrase | 16/30 | 66 |
| crochet charts | Metadata phrase | 13/29 | 29 |
| row counter crochet charts | Combination | 2/30 | 46 |

This is a one-app integration smoke check, not a representative accuracy estimate or proof of demand. Tests additionally exercise failed search, absent target, skipped verification, input validation, metadata fallback, and installation from a packed archive without making live calls.
