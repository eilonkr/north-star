# Apple Ads setup

Popularity requires your own Apple Ads Platform API credentials. App Store Connect keys and an ordinary App Store login are not substitutes. Public app search and competition work without credentials.

## 1. Create or reuse a key

If you already have credentials, point the CLI at their file with `--config /path/to/credentials.env`. Reuse the registered key.

For a new setup, use a North Star repository checkout with dependencies installed as described in [the skill's CLI setup instructions](../SKILL.md#locate-and-set-up-the-cli). The installed skill contains this guide, not the CLI or key-generation script. Run this from the checkout root:

```sh
npm run setup:apple
```

This generates an EC P-256 key pair in `.secrets/` and an ignored `.env` file. The private key and `.env` have restricted file permissions. The script refuses to overwrite an existing private key or `.env`.

Register only `.secrets/apple-ads-public.pem` with Apple. Keep `.secrets/apple-ads-private.pem` and `.env` private. Never commit them or paste their contents into an issue.

## 2. Register the public key

Follow Apple's [API access guide](https://developer.apple.com/documentation/apple-ads-platform-api/access-overview) and [OAuth setup instructions](https://developer.apple.com/documentation/apple-ads-platform-api/implementing-oauth-for-the-apple-ads-platform-api). An account administrator must grant an API user access to the relevant ad account. Use the least-privileged role that permits the read-only account and Insights requests.

As the API user, register the complete public key in Apple Ads' API settings. Save the returned client ID, team ID, and key ID in the generated `.env` file.

## 3. Configure credentials

| Variable | Value |
| --- | --- |
| `APPLE_ADS_CLIENT_ID` | Apple Ads client ID. |
| `APPLE_ADS_TEAM_ID` | Apple Ads team ID. |
| `APPLE_ADS_KEY_ID` | ID of the registered public key. |
| `APPLE_ADS_AD_ACCOUNT_ID` | Platform API ad account ID, not the legacy organization ID. |
| `APPLE_ADS_PRIVATE_KEY` | PEM private key; populated by the setup script. Literal newlines and escaped `\n` are supported. |

If you do not know the ad account ID, the Platform API's authenticated `GET https://api.ads.apple.com/v1/acls` response lists accessible accounts under `result.acls[].adAccount.id`. The connection check verifies access to the configured account.

The CLI selects a file using `--config`, then `NORTH_STAR_ENV_FILE`, then its checkout's `.env`, otherwise `~/.config/north-star/.env`. It does not load an arbitrary working-directory `.env`. Existing environment variables take precedence.

When embedding the library in a server, pass these values through the server environment. Never expose them in client components or public environment variables.

## 4. Verify access

Run these commands from the same checkout root:

```sh
node scripts/inspect.mjs --connection
node scripts/inspect.mjs "habit tracker" --country US --range month --summary
```

For a credential file outside the checkout, add `--config /path/to/credentials.env` to either command. The CLI reads credentials at startup.

A successful connection proves token exchange and account access. A keyword request separately exercises Insights permissions. `not_reported` is a valid response: it means Apple omitted the exact keyword from that country/period's dataset, not that authentication failed or demand is zero.

## Authentication and reporting

North Star signs an ES256 client assertion and exchanges it for an OAuth access token. Requests use `X-AP-Context: adAccountId=<id>`. The token stays in the CLI/server process. Only OAuth, read-only account access, and popularity Insights requests are used; no campaign mutations or spending are implemented.

Weekly periods cover Sunday–Saturday and become eligible Monday at 07:00 UTC. Monthly periods become eligible on the fifth of the following month UTC. North Star selects the latest or previous published period and never averages scores across periods. Apple may omit a keyword or market; switching periods does not guarantee coverage. Mac popularity is unsupported.

Apple references: [search-term popularity](https://developer.apple.com/documentation/apple-ads-platform-api/query-app-search-term-popularity-data), [popularity fields](https://developer.apple.com/documentation/apple-ads-platform-api/searchtermpopularityrow), and [reporting periods](https://developer.apple.com/documentation/apple-ads-platform-api/searchtermpopularitytimerange).
