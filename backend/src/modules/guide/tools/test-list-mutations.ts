import assert from 'node:assert/strict';
import { GuideService } from '../guide.service';
process.env.DALAT_SHOW_HIDDEN_DECKS = '1'; // Spotlight V4 đang tạm ẩn khỏi thư viện nhưng vẫn là mẫu thử của test này.

async function testAtomicDelete(): Promise<void> {
  const service = new GuideService() as any;
  service.generatedListsLoaded = true;
  service.persistGeneratedLists = () => undefined;
  service.deletePageTextOverrides = () => undefined;
  service.generatedListsByDeckId = new Map([
    ['deck-a', [{ id: 'main', generated: false }, { id: 'ai-1', generated: true }, { id: 'ai-2', generated: true }]],
  ]);

  const result = service.deleteGeneratedLists([
    { deckId: 'deck-a', listIds: ['ai-1', 'ai-2', 'ai-2'] },
  ]);

  assert.deepEqual(result, { requestedCount: 2, deletedCount: 2, remainingIds: [] });
  assert.deepEqual(service.generatedListsByDeckId.get('deck-a').map((list: { id: string }) => list.id), ['main']);
}

async function testBatchIdempotency(): Promise<void> {
  const service = new GuideService() as any;
  // generateBatchLists chỉ nhận mẫu được phép trên nguồn đang chọn.
  service.activeDestinationId = 'dalat';
  let calls = 0;
  service.generateBatchListsOnce = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { deckId: 'spotlight-v4', requestedCount: 2, successCount: 2, failCount: 0, lists: [] };
  };

  const request = { deckId: 'spotlight-v4', count: 2, requestId: 'same-click' };
  const [first, second] = await Promise.all([
    service.generateBatchLists(request),
    service.generateBatchLists(request),
  ]);
  const third = await service.generateBatchLists(request);

  assert.equal(calls, 1, 'Cùng requestId chỉ được chạy tạo list một lần');
  assert.deepEqual(first, second);
  assert.deepEqual(first, third);
}

async function main(): Promise<void> {
  await testAtomicDelete();
  await testBatchIdempotency();
  console.log('PASS list mutation regressions: atomic delete + idempotent batch create');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
