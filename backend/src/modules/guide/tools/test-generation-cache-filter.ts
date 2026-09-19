import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { GuideService } from '../guide.service';
import { configureDriveFileDiskCache } from '../sync/drive-images';
import { hasSyncPermit, withLocalDataOnly, withSyncPermit, syncFetch } from '../sync/night-sync-policy';

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-generation-filter-'));
  configureDriveFileDiskCache(dir);
  const body = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#abc' } }).png().toBuffer();
  fs.writeFileSync(path.join(dir, 'good_image_id.bin'), body);
  fs.writeFileSync(path.join(dir, 'good_image_id.json'), JSON.stringify({ contentType: 'image/png', contentLength: body.length }));
  const good = '/assets/drive-file?id=good_image_id', bad = '/assets/drive-file?id=bad_image_id';
  const context: any = { itemsBySection: { quan_an: [{ id: 'owner-a', imageUrl: bad, candidateImageUrls: [bad, good], mapImageUrl: bad, mapCandidateImageUrls: [bad] }] }, imageUrls: [bad, good], coverImageUrls: [bad], hinhNenImagePools: { random: [bad, good] }, imageLibraryEntries: [], decks: [{ lists: [{ pages: [{ backgroundImage: bad }] }] }] };
  const service: any = Object.create(GuideService.prototype);
  service.buildDatasetContext = () => context;
  service.cloneJson = (value: any) => JSON.parse(JSON.stringify(value));
  const original = JSON.stringify(context);
  const filtered = await service.buildLocallyVerifiedGenerationContext();
  assert.equal(JSON.stringify(context), original);
  assert.deepEqual(filtered.imageUrls, [good]);
  assert.equal(filtered.itemsBySection.quan_an[0].imageUrl, good);
  assert.equal(filtered.itemsBySection.quan_an[0].id, 'owner-a');
  assert.equal(filtered.itemsBySection.quan_an[0].mapImageUrl, '');
  assert.equal(filtered.decks[0].lists[0].pages[0].backgroundImage, bad, 'Saved list must remain unchanged');
  await withSyncPermit({ manual: true, signal: new AbortController().signal, waitForIdle: async () => {} }, () => withLocalDataOnly(async () => {
    assert.equal(hasSyncPermit(), false);
    await assert.rejects(syncFetch('https://example.invalid'), /cục bộ/);
  }));
  fs.rmSync(dir, { recursive: true });
  console.log('PASS: common pool cache filter, owner retained, Maps missing pair, snapshots unchanged, local-only overrides sync permit');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
