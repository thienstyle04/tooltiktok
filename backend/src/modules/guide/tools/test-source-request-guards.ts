import assert from 'node:assert/strict';
import { GuideController } from '../guide.controller';
import { isDeckAllowedForSource, sourceTemplateError } from '../sync/destination-config';
let sourceId = 'dalat', queued: (() => any) | undefined, generations = 0, queueCalls = 0;
const guide: any = {
  setSyncBusyProbe() {}, getDestinations: () => ({ active: { id: sourceId } }),
  assertTemplateAllowed(deck: unknown, source = sourceId) {
    if (!isDeckAllowedForSource(source, String(deck))) throw Error(sourceTemplateError(source, String(deck)));
  },
  enqueueGeneration(task: () => any) { queueCalls++; queued = task; return Promise.resolve({}); },
  generateBatchLists() { generations++; return Promise.resolve({}); },
  generateDeckFromCaption() { generations++; return Promise.resolve({}); },
  generatePartnerSpotlight() { generations++; return Promise.resolve({}); },
};
const controller = new GuideController(guide, {} as any, { assertUserMutationAllowed() {}, isDataSyncBusy: () => false } as any);
for (const call of [() => controller.generateBatchLists({ deckId: 'threads-food-local' }), () => controller.generateDeckFromCaption({ deckId: 'itinerary-note-dark' })]) assert.throws(call, /Đà Lạt Threads/);
assert.equal(queueCalls, 0);
sourceId = 'dalat-threads'; assert.throws(() => controller.generatePartnerSpotlight({}), /chỉ dành cho Threads và Note/);
assert.equal(queueCalls, 0);
controller.generateBatchLists({ deckId: 'threads-food-local', count: 4 });
sourceId = 'dalat'; assert.throws(() => queued!(), /Nguồn dữ liệu đã thay đổi/); assert.equal(generations, 0);
controller.generateDeckFromCaption({ deckId: 'grid-4' }); sourceId = 'dalat-test';
assert.throws(() => queued!(), /Nguồn dữ liệu đã thay đổi/); assert.equal(generations, 0);
sourceId = 'dalat-threads'; controller.generateDeckFromCaption({ deckId: 'threads-food-local' }); queued!();
assert.equal(generations, 1);
console.log('PASS controller guards: wrong source rejected before queue; queued request cannot move to a different source; valid request proceeds.');
