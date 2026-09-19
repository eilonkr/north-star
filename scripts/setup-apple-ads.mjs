import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const dir = path.join(root, ".secrets");
if (
  existsSync(path.join(dir, "apple-ads-private.pem")) ||
  existsSync(path.join(root, ".env"))
) {
  console.error(
    "Existing private key or .env found. Nothing was overwritten. Use the existing setup.",
  );
  process.exit(1);
}
mkdirSync(dir, { recursive: true, mode: 0o700 });
const { publicKey, privateKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
writeFileSync(path.join(dir, "apple-ads-private.pem"), privateKey, {
  mode: 0o600,
  flag: "wx",
});
writeFileSync(path.join(dir, "apple-ads-public.pem"), publicKey, {
  mode: 0o644,
  flag: "wx",
});
writeFileSync(
  path.join(root, ".env"),
  `APPLE_ADS_CLIENT_ID=\nAPPLE_ADS_TEAM_ID=\nAPPLE_ADS_KEY_ID=\nAPPLE_ADS_AD_ACCOUNT_ID=\nAPPLE_ADS_PRIVATE_KEY='${privateKey.replace(/\n/g, "\\n")}'\n`,
  { mode: 0o600, flag: "wx" },
);
console.log("Created a local P-256 key pair and an ignored .env template.");
console.log(
  "Register only .secrets/apple-ads-public.pem with Apple Ads. Keep the private key local.",
);
