# Connect Apple Ads to North Star

North Star uses the official Apple Ads **Platform API v1**. App Store Connect API keys and ordinary App Store sign-in are not substitutes. No password, session cookies, campaign creation, or advertising spend is requested by this app.

## 1. Prepare a key pair

Run `npm run setup:apple` once. This generates an EC P-256 key pair locally, with a restricted-permission private key in `.secrets/apple-ads-private.pem`, a public key in `.secrets/apple-ads-public.pem`, and an ignored `.env` file containing the private key plus empty IDs. The script refuses to overwrite an existing `.env` or private key. `.secrets/`, `.env`, and PEM files are excluded from Git. Never send the private key in chat or commit it.

If you already have North Star credentials, point the CLI at that existing file with `--config` or `NORTH_STAR_ENV_FILE`. Reuse the registered key; do not generate another unless rotating intentionally.

## 2. Enable API access in Apple Ads

An Apple Ads account administrator opens **Account Settings → User Management** and invites a dedicated API user. Use the least-privileged read-only API role that can access your App Store ad account and Insights. The user accepts Apple's invitation themselves.

Signed in as the API user, open **Account Settings → API**. Paste the entire public key from `.secrets/apple-ads-public.pem`, including the BEGIN and END lines, and save. Apple shows a **clientId**, **teamId**, and **keyId**. These are Apple Ads IDs, not the similarly named App Store Connect credentials.

## 3. Set the server environment

Fill the existing ignored `.env` values:

| Variable                  | Value                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `APPLE_ADS_CLIENT_ID`     | Apple's clientId, typically prefixed SEARCHADS.                                        |
| `APPLE_ADS_TEAM_ID`       | Apple's teamId, typically prefixed SEARCHADS.                                          |
| `APPLE_ADS_KEY_ID`        | Apple's keyId                                                                          |
| `APPLE_ADS_AD_ACCOUNT_ID` | The Platform API ad account ID, **not** the legacy organization ID                     |
| `APPLE_ADS_PRIVATE_KEY`   | Already populated by the local setup script; supports literal newlines or escaped `\n` |

For a hosted North Star site, configure these same names using the hosting provider's **server secret** environment settings. Do not use NEXT_PUBLIC/VITE_PUBLIC variables. Local `.env` values are never bundled or pushed to the hosted site. Hosted setup is a separate step.

If the ad account ID is unknown, `GET https://api.ads.apple.com/v1/acls` with an Apple Ads OAuth access token lists accessible accounts under `result.acls[].adAccount.id`. North Star's connection check verifies the configured account appears there. An account administrator may need to enable API access or associate the API user with the correct account.

The CLI reads credentials when it starts. Restart a consuming local website after editing its `.env`; redeploy after configuring hosted runtime secrets as required by hosting. Open **Apple Ads connection → Check connection**, then inspect a keyword. The connection check proves token exchange and account access; only a successful keyword lookup proves Insights endpoint access.

## How authentication works

North Star signs an ES256 JWT with the private key, using `iss=teamId`, `sub=clientId`, and `aud=https://appleid.apple.com`. It exchanges this short-lived client assertion at `https://appleid.apple.com/auth/oauth2/token` with `grant_type=client_credentials` and `scope=searchadsorg`. The bearer token remains on the server and expires in about an hour. Insights requests include `X-AP-Context: adAccountId=<id>`.

Only token exchange, read-only ACL discovery, and an Insights query are implemented. There are no campaign mutation endpoints.

## Coverage limits

Apple reports up to 500 qualifying search terms per country/genre; terms need at least 500 searches and 10 impressions in the reporting period. Country-wide popularity is a relative 1–100 index, not raw searches. iPhone/iPad share the signal. Mac is unsupported. Missing terms are displayed as **not reported**, never zero.

The latest weekly snapshot is published Mondays at 07:00 UTC for the prior Sunday–Saturday. Live responses identify the `week` by its starting Sunday (verified against the Platform API on 2026-09-17). North Star observes that boundary and requests the latest published period. Country selection does not guarantee Apple publishes popularity for that country.

The popularity-period selector supports the latest two published weeks and calendar months. Monthly snapshots publish on the 5th of the following month UTC and return `month` as YYYY-MM. Before the 5th, the latest published month is two calendar months ago. Each request selects exactly one bucket; scores are never averaged across weeks or months. Cache keys include both dates and granularity. Competition remains a current search snapshot. A monthly period may improve coverage but does not guarantee the exact keyword is reported.

## Verification status

OAuth token exchange, account discovery, and the Insights endpoint were verified live on 2026-09-17 using the registered key. Live responses also revealed that the weekly bucket uses its starting Sunday; the parser and regression test now follow the observed response. Hosted credentials are stored separately as server secrets.

## Official sources

- [OAuth setup](https://developer.apple.com/documentation/apple-ads-platform-api/implementing-oauth-for-the-apple-ads-platform-api)
- [Ad accounts and API access](https://developer.apple.com/documentation/apple-ads-platform-api/access-overview)
- [Search-term popularity query](https://developer.apple.com/documentation/apple-ads-platform-api/query-app-search-term-popularity-data)
- [Popularity fields and coverage](https://developer.apple.com/documentation/apple-ads-platform-api/searchtermpopularityrow)
- [Reporting schedule](https://developer.apple.com/documentation/apple-ads-platform-api/searchtermpopularitytimerange)

Researched 2026-09-17 against Apple's documentation JSON as well as its documentation pages.
