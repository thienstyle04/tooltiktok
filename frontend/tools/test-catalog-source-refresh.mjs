import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const bundle = await build({
  stdin: {
    contents: `export { needsTemplateCatalogRefresh } from './components/studio/catalog';
      export { STUDIO_CATALOG_REVISION, STUDIO_CATALOG_REVISION_KEY } from './lib/utils';`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, format: 'cjs', platform: 'node',
});
const mod = { exports: {} };
new Function('exports', 'module', bundle.outputFiles[0].text)(mod.exports, mod);
const { needsTemplateCatalogRefresh, STUDIO_CATALOG_REVISION, STUDIO_CATALOG_REVISION_KEY } = mod.exports;
const oldWindow = globalThis.window;
globalThis.window = { localStorage: { getItem: key => key === STUDIO_CATALOG_REVISION_KEY ? STUDIO_CATALOG_REVISION : null } };
try {
  const cherry = 'spotlight-v6-cherry-blossom';
  const cached = { source: { destinationId: 'dalat-test', allowedDeckIds: [] }, decks: [] };
  const active = { id: 'dalat-test', allowedDeckIds: [cherry] };
  assert.equal(needsTemplateCatalogRefresh(cached), false, 'Reproduce cache blind spot: current revision hides missing newly allowed template');
  assert.equal(needsTemplateCatalogRefresh(cached, active), true, 'Fresh permissions must invalidate old same-source cache immediately');
  const fresh = { source: { destinationId: 'dalat-test', allowedDeckIds: [cherry] }, decks: [{ id: cherry }] };
  assert.equal(needsTemplateCatalogRefresh(fresh, active), false);
  assert.equal(needsTemplateCatalogRefresh(fresh, { id: 'dalat-test', allowedDeckIds: [] }), true, 'Revoked permissions invalidate too');
  assert.equal(needsTemplateCatalogRefresh(fresh, { id: 'dalat', allowedDeckIds: [cherry] }), true, 'Never reuse another source cache');
  assert.equal(needsTemplateCatalogRefresh(cached, { id: 'dalat-test' }), false, 'Unavailable fresh permissions preserve valid offline cache');
  const ordered = { source: { destinationId: 'dalat-test', allowedDeckIds: [cherry, 'local-fixture'] }, decks: [{ id: cherry }, { id: 'local-fixture' }] };
  assert.equal(needsTemplateCatalogRefresh(ordered, { id: 'dalat-test', allowedDeckIds: ['local-fixture', cherry] }), false, 'Compare sets, not array order');
  globalThis.window.localStorage.getItem = key => key === STUDIO_CATALOG_REVISION_KEY ? '2026-10-15-cherry-blossom' : null;
  assert.equal(needsTemplateCatalogRefresh(fresh, active), true, 'An old layout revision must reload even when source permissions are unchanged');
  const studio = readFileSync(new URL('../components/DeckStudio.js', import.meta.url), 'utf8');
  assert.match(studio, /needsTemplateCatalogRefresh\(cached\.dataset, destinations\?\.active\)/);
  assert.match(studio, /loadDataset\('Đang nạp lại thư viện mẫu\.\.\.', stored, false, \{ silent: true \}\)/, 'Catalog-only fetch must not request remote sync');
  const nonAi = studio.slice(studio.indexOf('const isNonAiTemplate ='), studio.indexOf('const festivalProvidesCover ='));
  assert.ok(nonAi.includes(`activeDeck.id === '${cherry}'`), 'Cherry template uses its source hook without requiring an AI cover');
  console.log('PASS catalog refresh: stale permissions/current revision, grants/revocations, source isolation, stable sets, offline fallback, local-only fetch and cherry non-AI creation');
} finally {
  if (oldWindow === undefined) delete globalThis.window;
  else globalThis.window = oldWindow;
}
