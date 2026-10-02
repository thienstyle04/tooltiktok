import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module';
import { GuideService } from '../guide.service';

async function main() {
  const originalData = path.resolve(__dirname, '../../../../data');
  const appVersion = JSON.parse(fs.readFileSync(path.join(originalData, '..', 'package.json'), 'utf8')).version;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-startup-refresh-'));
  const fixture = path.join(root, 'data');
  fs.mkdirSync(fixture);
  // Copy source metadata/workbook only; never reuse the user's saved lists/settings.
  const hashes = new Map<string, string>();
  const hash = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  for (const name of fs.readdirSync(originalData)) {
    const from = path.join(originalData, name);
    if (!fs.statSync(from).isFile()) continue;
    hashes.set(from, hash(from));
    if (/^(workbook-cache|sheet-drive-images|spotlight-v3-hooks|.*-hook-cache)/.test(name)) {
      fs.copyFileSync(from, path.join(fixture, name));
    }
  }
  const cache = path.join(fixture, 'drive-file-cache');
  fs.mkdirSync(cache);
  // Hard-link immutable image bytes to avoid copying 12GB. Metadata is copied,
  // and the network is disabled, so downloads cannot overwrite linked bytes.
  const originalCache = path.join(originalData, 'drive-file-cache');
  for (const name of fs.readdirSync(originalCache)) {
    const from = path.join(originalCache, name), to = path.join(cache, name);
    if (!fs.statSync(from).isFile()) continue;
    if (name.endsWith('.json')) fs.copyFileSync(from, to);
    else if (name.endsWith('.bin')) fs.linkSync(from, to);
  }
  Object.assign(process.env, {
    DALAT_DATA_DIR: fixture, DALAT_DRIVE_FILE_CACHE_DIR: cache,
    DALAT_AUTO_SYNC_SHEET: 'false', DALAT_AUTO_WARM_DRIVE_CACHE: 'false',
    DALAT_APP_VERSION: appVersion, DALAT_SESSION_ID: 'isolated-startup-regression',
  });
  let networkCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { networkCalls++; throw Error('Test: external network disabled'); }) as typeof fetch;
  const oldDark = { id: 'itinerary-note-dark-caption-test', title: 'Đã duyệt', coverTitle: '',
    navTitle: 'List thử', description: '', postCaption: 'Caption thử', templateVersion: 3,
    pages: [{ type: 'list', title: '', subtitle: '', layoutVariant: 'itinerary-note-dark-day',
      items: [{ id: 'saved-test', name: 'Địa điểm thử đã duyệt', rawName: 'Địa điểm thử đã duyệt',
        metaPrimary: 'Xuân Hương - Đà Lạt', metaSecondary: '', imageUrl: '', isPartner: true }] }] };
  const currentV3 = { id: 'spotlight-v3-caption-test', navTitle: 'List thử', title: 'Hook đã duyệt',
    coverTitle: 'Hook đã duyệt', postCaption: '', description: '',
    captionBody: 'Lưu list này để có lịch đi Đà Lạt gọn hơn, dễ chọn điểm theo buổi và đỡ mất thời gian mò từng nơi.',
    captionHashtags: ['#riviudalat', '#dalat', '#dalatreview', '#spotlightdalat', '#hookdalat'], templateVersion: 2,
    pages: [{ type: 'cover', title: 'Hook đã duyệt', subtitle: '', backgroundImage: '' }] };
  const store = path.join(fixture, 'generated-caption-lists.dalat.json');
  const snapshots = { 'itinerary-note-dark': [oldDark], 'spotlight-v3': [currentV3] };
  fs.writeFileSync(store, JSON.stringify({ version: 1, decks: snapshots }));
  const starts: number[] = [];
  try {
    for (let iteration = 0; iteration < 4; iteration++) {
      if (iteration === 2) {
        fs.writeFileSync(store, JSON.stringify({ version: 1, decks: {
          ...snapshots, 'spotlight-v3': [{ ...currentV3, templateVersion: 1 }],
        } }));
      }
      const started = Date.now();
      const app = await NestFactory.create(AppModule, { logger: false });
      try {
        const service: any = app.get(GuideService);
        let builds = 0;
        const build = service.buildWorkbookDerivedCacheNow.bind(service);
        service.buildWorkbookDerivedCacheNow = () => { builds++; return build(); };
        await app.listen(0, '127.0.0.1');
        const origin = await app.getUrl();
        const health = await originalFetch(`${origin}/api/health`, { signal: AbortSignal.timeout(5000) });
        assert.equal(health.status, 200);
        assert.equal((await health.json() as any).appVersion, appVersion);
        const until = Date.now() + 60000;
        while (service.destinationDataLoading && Date.now() < until) await new Promise(r => setTimeout(r, 50));
        assert.equal(service.destinationDataLoading, false);
        assert.equal(service.destinationDataError, '');
        for (let reload = 0; reload < 2; reload++) {
          const response = await originalFetch(`${origin}/api/guide-data`, { signal: AbortSignal.timeout(15000) });
          assert.equal(response.status, 200);
          const data: any = await response.json();
          assert.ok(data.decks?.some((d: any) => d.id === 'itinerary-note-dark'));
        }
        assert.equal(builds, 1, 'Each startup builds once, reload uses cache');
        assert.deepEqual(service.generatedListsByDeckId.get('itinerary-note-dark'), snapshots['itinerary-note-dark'], 'Old Note snapshot unchanged');
        if (iteration < 2) assert.deepEqual(service.generatedListsByDeckId.get('spotlight-v3'), snapshots['spotlight-v3']);
        else {
          assert.equal(service.generatedListsByDeckId.get('spotlight-v3')[0].templateVersion, 2);
          assert.equal(service.hasGeneratedListsNeedingTemplateRefresh(), false);
        }
        starts.push(Date.now() - started);
        assert.ok(starts[iteration] < 60000, 'Startup must finish within 60s');
      } finally { await app.close(); }
    }
    for (const [file, before] of hashes) assert.equal(hash(file), before, 'Original data must remain unchanged');
    console.log(`PASS isolated real Nest startup x4: ${starts.join('/')}ms including dataset/reloads; old Note unchanged, stale V3 refresh/restart succeeds; original files unchanged; external network blocked (${networkCalls} attempted). Fixture: ${root}`);
  } finally {
    globalThis.fetch = originalFetch;
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('dalat-startup-refresh-'));
    // Removing fixture hard-links leaves original image files intact.
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
