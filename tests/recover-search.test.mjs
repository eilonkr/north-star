import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

test("a failed hosted search recovers the same keyword, market and store without changing popularity", async (t) => {
  const bundle = await build({ entryPoints: ["lib/recover-search.ts"], bundle: true, format: "esm", write: false });
  const { recoverSearch } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  const result = {
    keyword: "ai video generator", country: "US", store: "iphone",
    apps: [], competition: { score: null, sampleSize: 0, confidence: "low", factors: [] },
    popularity: { status: "available", score: 62 }, fetchedAt: "2026-09-17T00:00:00Z",
    searchError: "Apple’s Search API is busy. Wait a moment and try again.",
  };
  const fetchMock = t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url.origin, "https://itunes.apple.com");
    assert.equal(url.searchParams.get("term"), result.keyword);
    assert.equal(url.searchParams.get("country"), "us");
    assert.equal(url.searchParams.get("entity"), "software");
    return Response.json({ results: Array.from({ length: 10 }, (_, i) => ({
      trackId: i + 1, trackName: "AI Video Generator", trackViewUrl: `https://apps.apple.com/us/app/id${i + 1}`,
      userRatingCount: 1000, averageUserRating: 4.5,
    })) });
  });
  const recovered = await recoverSearch(result);
  assert.equal(recovered.apps.length, 10);
  assert.ok(recovered.competition.score > 0);
  assert.equal(recovered.searchError, undefined);
  assert.deepEqual(recovered.popularity, result.popularity);
  await recoverSearch(recovered);
  assert.equal(fetchMock.mock.callCount(), 1);

  fetchMock.mock.mockImplementation(async () => new Response(null, { status: 429 }));
  const unavailable = { ...result, country: "GB" };
  assert.equal(await recoverSearch(unavailable), unavailable);
  assert.equal(fetchMock.mock.callCount(), 2);
});
