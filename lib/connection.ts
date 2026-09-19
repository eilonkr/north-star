import { configured, appleRequest, AppleError, type AppleConfig } from "./apple-ads.ts";
export type Connection = { status: "connected" | "not_configured" | "error"; message: string };
/** Read-only token and account access check; does not prove Insights access. */
export async function connection(c: AppleConfig): Promise<Connection> {
  if (!configured(c)) return {
    status: "not_configured",
    message: "Apple Ads is not connected yet. Add the five Apple Ads server secrets listed in the setup guide.",
  };
  try {
    const d = await appleRequest<{ result?: { acls?: { adAccount?: { id?: number | string } }[] } }>(c, "acls");
    if (!Array.isArray(d.result?.acls)) throw new AppleError(502);
    const found = d.result.acls.some(a => String(a.adAccount?.id) === c.APPLE_ADS_AD_ACCOUNT_ID);
    return {
      status: found ? "connected" : "error",
      message: found
        ? "Apple Ads credentials verified. The selected ad account is accessible. Inspect a keyword to test Insights access."
        : "Credentials work, but the selected ad account is not accessible. Check the ad account ID and API user role.",
    };
  } catch (e) {
    return { status: "error", message: e instanceof AppleError ? e.message : "Apple Ads could not authenticate. Check your private key and the API IDs." };
  }
}
