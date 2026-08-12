import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadPremadeHookPool } from '../sync/premade-hook-source';
import { loadSpotlightV3Hooks } from '../sync/spotlight-hook-source';

async function main(): Promise<void> {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-offline-'));
  const failFetch = async (): Promise<string> => { throw new Error('offline'); };

  const sectionHooks = await loadSpotlightV3Hooks({
    dataRoot,
    docId: 'offline-section-doc',
    cacheFileName: 'missing-section.json',
    sectionHeadingIncludes: ['Hook 4', 'Feed 8'],
    fallbackKey: 'hook-4',
    forceRefresh: true,
    fetchDocument: failFetch,
  });
  const spotlightHooks = await loadSpotlightV3Hooks({
    dataRoot,
    docId: 'offline-spotlight-doc',
    cacheFileName: 'missing-spotlight.json',
    forceRefresh: true,
    fetchDocument: failFetch,
  });
  const premadeHooks = loadPremadeHookPool('highlight', dataRoot);

  assert.ok(sectionHooks.length >= 5, 'Mẫu dùng Doc chia nhóm phải có hook mặc định');
  assert.ok(spotlightHooks.length >= 5, 'Spotlight/Mẫu 1 phải có hook mặc định');
  assert.ok(premadeHooks.length >= 5, 'Mẫu premade phải có hook mặc định');
  assert.ok(sectionHooks.every((hook) => !hook.includes(' t ')), 'Hook mặc định không dùng đại từ t');
  console.log('PASS offline hook fallbacks: sectioned + spotlight + premade');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
