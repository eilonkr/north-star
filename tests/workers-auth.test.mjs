import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { build } from "esbuild";
import { Miniflare } from "miniflare";

test("Apple client assertions sign and verify inside the hosting Worker runtime", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
    publicKeyEncoding: { format: "pem", type: "spki" },
  });
  const output = await build({
    stdin: {
      contents: `import { clientSecret } from './lib/apple-ads.ts';
        export default { fetch(request, env) {
          return new Response(clientSecret(env));
        } };`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: "esm",
    external: ["node:crypto"],
    write: false,
  });
  const worker = new Miniflare({
    modules: true,
    script: output.outputFiles[0].text,
    compatibilityDate: "2026-05-15",
    compatibilityFlags: ["nodejs_compat"],
    bindings: {
      APPLE_ADS_PRIVATE_KEY: privateKey,
      APPLE_ADS_CLIENT_ID: "client",
      APPLE_ADS_TEAM_ID: "team",
      APPLE_ADS_KEY_ID: "key",
    },
  });
  try {
    const response = await worker.dispatchFetch("http://localhost");
    assert.equal(response.status, 200);
    const [header, payload, signature] = (await response.text()).split(".");
    assert.ok(verify("sha256", Buffer.from(`${header}.${payload}`), {
      key: publicKey,
      dsaEncoding: "ieee-p1363",
    }, Buffer.from(signature, "base64url")));
  } finally {
    await worker.dispose();
  }
});
