import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-partner-spotlight-'));
process.env.DALAT_DATA_DIR = root;
process.env.DALAT_DRIVE_FILE_CACHE_DIR = path.join(root, 'cache');
const { GuideService } = require('../guide.service');
const { AutomationSchedulerService } = require('../automation-scheduler.service');
const { getAllowedDeckIds } = require('../sync/destination-config');
const service: any = Object.create(GuideService.prototype);
service.generatedListsByDeckId = new Map();
service.loadPageTextOverrides = () => ({ version: 1, savedAt: '', decks: {} });
// Saved snapshot fixture only: no constructor, workbook, user data or writes.
const saved = { id: 'partner-user-1', navTitle: 'Đã duyệt', title: 'Quán thử', description: '',
  photoPreset: 'iphone-color-edit-v1', partnerRotationVersion: 1,
  pages: [{ type: 'list', layoutVariant: 'spotlight-partner', title: 'Quán thử',
    subtitle: '', chipText: '', chipTone: 'slate', backgroundImage: '',
    items: [{ id: 'test-venue', name: 'Quán thử', rawName: 'Quán thử', isPartner: true,
      imageUrl: '/assets/drive-file?id=own-test-photo', label: '', metaPrimary: 'Xuân Hương - Đà Lạt', metaSecondary: '' }] }] };
const oldBytes = JSON.stringify(saved);
service.generatedListsByDeckId.set('spotlight-partner', [saved]);
const archive = service.mergeGeneratedLists([]);
assert.equal(archive.length, 1);
assert.equal(archive[0].creationDisabled, true);
assert.deepEqual(archive[0].lists, [saved]);
assert.equal(JSON.stringify(saved), oldBytes);
const { collectPartnerNames } = require(path.resolve(__dirname, '../../../../../frontend/lib/partnerNames.mjs'));
assert.deepEqual(collectPartnerNames(archive[0].lists[0]), ['Quán thử']);
archive[0].lists[0].pages[0].title = 'Chỉ chỉnh bản trả về';
assert.equal(JSON.stringify(saved), oldBytes, 'Archive response must not mutate storage');
service.generatedListsByDeckId.clear();
assert.deepEqual(service.mergeGeneratedLists([]), [], 'No empty archive or default example');

async function main() {
  for (const source of ['dalat', 'dalat-test', 'dalat-threads', 'greenland']) {
    service.activeDestinationId = source;
    assert(!getAllowedDeckIds(source).includes('spotlight-partner'));
    assert.throws(() => service.assertTemplateAllowed('spotlight-partner'), /đã ngừng sử dụng/);
    await assert.rejects(service.generatePartnerSpotlight({}), /đã ngừng sử dụng/);
    await assert.rejects(service.generateDeckFromCaption({ deckId: 'spotlight-partner' }), /đã ngừng sử dụng/);
    await assert.rejects(service.generateBatchLists({ deckId: 'spotlight-partner', count: 4 }), /đã ngừng sử dụng/);
    const scheduler: any = Object.create(AutomationSchedulerService.prototype);
    scheduler.guideService = service;
    assert.throws(() => scheduler.submitManualGeneration({ kind: 'partner', destinationId: source,
      requestId: 'test', request: {} }), /đã ngừng sử dụng/);
    assert.throws(() => scheduler.assertTemplatesAllowed(source, [{ deckId: 'spotlight-partner', count: 1 }]), /đã ngừng sử dụng/);
  }
  assert.equal(fs.readdirSync(root).length, 0, 'Rejected creation must not write history/list/hook');
  console.log('PASS retired Spotlight Đối tác: all sources/API/queue/scheduler blocked before work; saved snapshots preserved and still recognized for XLSX; no writes.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
