import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { inspect, inspectionInput, connection } from '../dist/index.js';

test('compiled API preserves partial results when a provider fails', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 429 }));
  const result = await inspect({}, inspectionInput.parse({ keyword: 'test partial failure', country: 'US', store: 'iphone' }));
  assert.equal(result.reportingRange, 'week');
  assert.equal(result.popularity.status, 'not_configured');
  assert.equal(result.popularity.score, null);
  assert.equal(result.competition.score, null);
  assert.deepEqual(result.apps, []);
  assert.match(result.searchError, /busy/i);
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal((await connection({})).status, 'not_configured');
});

test('browser entrypoint bundles without Node or credential code', async () => {
  const result = await build({ entryPoints: ['dist/browser.js'], bundle: true, platform: 'browser', format: 'esm', metafile: true, write: false });
  assert.ok(!Object.keys(result.metafile.inputs).some(p => /apple-ads|connection|inspect\.js/.test(p)));
  assert.doesNotMatch(result.outputFiles[0].text, /APPLE_ADS_PRIVATE_KEY|node:crypto/);
});

test('CLI works outside its checkout and rejects invalid input without credentials or network', () => {
  const dir = mkdtempSync(join(tmpdir(), 'north-star-cli-'));
  const cli = resolve('scripts/inspect.mjs');
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('APPLE_ADS_') && k !== 'NORTH_STAR_ENV_FILE'));
  const run = args => spawnSync(process.execPath, [cli, ...args], { cwd: dir, env, encoding: 'utf8' });
  try {
    const file = join(dir, 'empty.env');
    writeFileSync(file, '');
    const countries = run(['--countries']);
    assert.equal(countries.status, 0);
    assert.equal(JSON.parse(countries.stdout).US, 'United States');
    const status = run(['--config', file, '--connection']);
    assert.equal(status.status, 1);
    assert.equal(JSON.parse(status.stdout).status, 'not_configured');
    const invalid = run(['--config', file, 'notes', '--country', 'XX']);
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Invalid country/);
    assert.equal(invalid.stdout, '');
    const missing = run(['--config', join(dir, 'missing.env'), '--connection']);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Cannot read the credential file/);
    // Exercise an actual JSON inspection through the compiled CLI, with no live network.
    const mock = join(dir, 'fetch.mjs');
    writeFileSync(mock, `globalThis.fetch = async () => Response.json({ results: [1,2,3].map(id => ({ trackId: id, trackName: 'Notes', trackViewUrl: 'https://apps.apple.com/app/id'+id, userRatingCount: 1000, averageUserRating: 4.5 })) });`);
    const output = execFileSync(process.execPath, ['--import', mock, cli, '--config', file, 'notes', '--store', 'mac', '--summary'], { cwd: dir, env, encoding: 'utf8' });
    const [summary] = JSON.parse(output);
    assert.equal(summary.popularityStatus, 'unsupported');
    assert.equal(summary.popularity, null);
    assert.equal(summary.topApps.length, 3);
    assert.ok(summary.competition > 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
