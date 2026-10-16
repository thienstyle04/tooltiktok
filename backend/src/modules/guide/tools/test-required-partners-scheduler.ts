// Đối tác bắt buộc: chuẩn hóa yêu cầu, lịch hẹn giờ lưu/chuyển tiếp/thử lại đúng.
// Không mạng, không ghi dữ liệu thật; mẫu riêng giả lập nằm trong thư mục TEMP.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const localRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'required-partners-local-'));
fs.mkdirSync(path.join(localRoot, 'local-demo'));
fs.writeFileSync(path.join(localRoot, 'local-demo', 'template.json'), JSON.stringify({ id: 'local-demo', version: 1, name: 'Mẫu riêng thử', description: '', allowedSourceIds: ['dalat'], builder: 'builder.cjs', assets: [] }));
process.env.DALAT_LOCAL_TEMPLATES_DIR = localRoot;

async function main() {
  const { AutomationSchedulerService } = require('../automation-scheduler.service') as typeof import('../automation-scheduler.service');
  const rp = require('../logic/required-partners') as typeof import('../logic/required-partners');
  // Normalization: trimmed, deduped by identity (case/diacritics), order kept.
  assert.deepEqual(rp.normalizeRequiredPartners([' Mê Lá ', 'mê lá', 'ME LA', 'Cổ Làng Mơ', '']), ['Mê Lá', 'Cổ Làng Mơ']);
  assert.deepEqual(rp.normalizeRequiredPartners(undefined), []);
  assert.throws(() => rp.normalizeRequiredPartners('Mê Lá'), /không hợp lệ/);
  assert.throws(() => rp.normalizeRequiredPartners([1]), /không hợp lệ/);
  assert.throws(() => rp.normalizeRequiredPartners(Array.from({ length: 13 }, (_, i) => `Đối tác ${i}`)), /tối đa 12/);
  assert.deepEqual(rp.missingRequiredPartners(['Mê Lá', '1/2 Circle Coffee'], ['me la', 'Cổ Làng Mơ', '1/2 circle coffee']), ['Cổ Làng Mơ']);
  rp.setRequiredPartnerContext(['Mê Lá']);
  assert.equal(rp.isRequiredPartner({ isPartner: true, name: 'MÊ LÁ' }), true);
  assert.equal(rp.isRequiredPartner({ isPartner: false, name: 'Mê Lá' }), false, 'Only partners can be required');
  assert.deepEqual(rp.requiredPartnersFirst([{ isPartner: true, name: 'A' }, { isPartner: true, name: 'Mê Lá' }]).map(i => i.name), ['Mê Lá', 'A']);
  assert.equal(rp.requiredPartnersSatisfied([{ isPartner: true, name: 'A' }]), false);
  rp.clearRequiredPartnerContext();
  assert.equal(rp.isRequiredPartner({ isPartner: true, name: 'Mê Lá' }), false);
  assert.equal(rp.requiredPartnersSatisfied([]), true);

  const scheduler: any = Object.create(AutomationSchedulerService.prototype);
  const validate = (templates: any[]) => scheduler.validateTemplates(templates);
  assert.deepEqual(validate([{ deckId: 'grid-6', count: 3, requiredPartners: [' Mê Lá ', 'mê lá', 'Cổ Làng Mơ'] }, { deckId: 'grid-8', count: 4, requiredPartners: [] }]),
    [{ deckId: 'grid-6', count: 3, requiredPartners: ['Mê Lá', 'Cổ Làng Mơ'] }, { deckId: 'grid-8', count: 4 }]);
  assert.throws(() => validate([{ deckId: 'local-demo', count: 3, requiredPartners: ['Mê Lá'] }]), /Mẫu riêng không hỗ trợ/);
  assert.deepEqual(validate([{ deckId: 'local-demo', count: 3 }]), [{ deckId: 'local-demo', count: 3 }], 'Private templates still schedule without partners');
  assert.throws(() => validate([{ deckId: 'grid-6', count: 3, requiredPartners: 'Mê Lá' }]), /không hợp lệ/);

  // Scheduled generation forwards each template's own selection.
  const requests: any[] = [];
  Object.assign(scheduler, { manualExportUntil: 0, waitForExistingSync: async () => {}, assertOutputDirectory: () => {}, findBrowser: () => ({}), assertHookSelectionReady: () => {},
    assertFrontendReady: async () => {}, waitForDriveCache: async () => {}, touch: () => {}, closeBrowser: async () => {}, persist: () => {}, launchRenderer: async (run: any) => { run.status = 'completed'; },
    guideService: { isGenerationBusy: () => false, getDestinations: () => ({ active: { id: 'dalat' } }), enqueueGeneration: async (fn: any) => fn(), assertTemplateAllowed: () => {},
      generateBatchLists: async (request: any) => { requests.push(request); return { successCount: request.count, failCount: 0, lists: Array.from({ length: request.count }, (_, i) => ({ listId: `${request.deckId}-${i}` })), errors: [] }; } } });
  const run: any = { id: 'isolated-required', scheduleId: 'schedule-1', scheduleName: 'Thử', templates: [{ deckId: 'grid-6', count: 3, requiredPartners: ['Mê Lá'] }, { deckId: 'grid-8', count: 3 }],
    destinationId: 'dalat', hook: { mode: 'normal' }, outputDir: 'mock-no-write', generated: [], listIds: [], errors: [], status: 'queued', createdAt: new Date().toISOString() };
  await scheduler.executeWithAi(run);
  assert.equal(run.status, 'completed');
  assert.deepEqual(requests.map(r => r.requiredPartners), [['Mê Lá'], undefined]);

  // Retry keeps the selection for the templates that still need lists.
  const enqueued: any[] = [];
  Object.assign(scheduler, { state: { schedules: [], runs: [] }, requireRun: () => ({ ...run, status: 'failed', generated: [{ deckId: 'grid-8', listId: 'x' }, { deckId: 'grid-8', listId: 'y' }, { deckId: 'grid-8', listId: 'z' }] }),
    assertTemplatesAllowed: () => {}, enqueue: (next: any) => enqueued.push(next), getState: () => ({}) });
  scheduler.retry(run.id);
  assert.deepEqual(enqueued[0].templates, [{ photoPreset: undefined, deckId: 'grid-6', count: 3, requiredPartners: ['Mê Lá'] }]);
  console.log('PASS required partners: normalization/identity, builder context, scheduler validation (private templates rejected), per-template forwarding and retry.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(localRoot, { recursive: true, force: true }));
