import assert from 'node:assert/strict';
import { GuideService } from '../guide.service';

async function main() {
  const service: any = Object.create(GuideService.prototype);
  service.assertDriveCacheReady = () => {};
  service.ensureGeneratedListsLoaded = () => {};
  service.generatedListsByDeckId = new Map();
  service.getDataset = async () => ({ decks: [{ id: 'spotlight-v4', lists: [{ id: 'test', pages: [] }] }] });
  service.getUsedCaptionTitles = () => [];
  service.buildDeepSeekPrompt = () => 'isolated test';
  service.prepareV4CaptionDeck = async () => ({ id: 'spotlight-v4', lists: [{ id: 'preflight', pages: [] }] });
  service.generateDeckFromCaption = () => { throw Error('Must not create or save lists on API failure'); };
  const previous = process.env.DEEPSEEK_API_KEY;
  try {
    delete process.env.DEEPSEEK_API_KEY;
    await assert.rejects(service.generateBatchLists({ deckId: 'spotlight-v4', count: 2 }), /Thiếu DEEPSEEK_API_KEY/);
    process.env.DEEPSEEK_API_KEY = 'isolated-test-not-a-real-key';
    let calls = 0;
    service.fetchDeepSeekChat = async () => { calls++; return new Response('TEST authentication failed', { status: 401 }); };
    const result = await service.generateBatchLists({ deckId: 'spotlight-v4', count: 2 });
    assert.equal(result.successCount, 0);
    assert.equal(result.failCount, 2);
    assert.equal(calls, 2);
    assert.match(result.errors[0].message, /DeepSeek HTTP 401/);
    console.log('PASS V4 batch diagnosis: missing key rejects; mocked API 401 reproduces 0/2 without saving or network.');
    calls = 0;
    service.getDataset = async () => ({ decks: [{
      id: 'spotlight-v4', lists: [],
      description: 'Chưa thể dựng list mẫu: Mẫu Spotlight V4 không tìm được ảnh riêng, không trùng.',
    }] });
    const recovered = await service.generateBatchLists({ deckId: 'spotlight-v4', count: 4 });
    assert.equal(calls, 4, 'Rebuilt preflight bypasses empty cached preview');
    assert.ok(recovered.errors.every((error: any) => /DeepSeek HTTP 401/.test(error.message)));
    calls = 0;
    let preflightCalls = 0;
    service.prepareV4CaptionDeck = async () => { preflightCalls++; throw Error('Không thể tạo Spotlight V4: thiếu ảnh riêng'); };
    await assert.rejects(service.generateBatchLists({ deckId: 'spotlight-v4', count: 4 }), /thiếu ảnh riêng/);
    assert.equal(preflightCalls, 1);
    assert.equal(calls, 0);
    const probe: any = Object.create(GuideService.prototype);
    probe.prepareWorkbookForDataset = async () => {};
    probe.buildLocallyVerifiedGenerationContext = async () => ({
      decks: [{ id: 'spotlight-v4', lists: [] }], itemsBySection: {}, imageUrls: [],
      imageLibraryEntries: [], coverImageUrls: [], hinhNenImagePools: {},
    });
    await assert.rejects(probe.prepareV4CaptionDeck(), /Không thể tạo Spotlight V4:.*6 ảnh Hinh_nen/);
    console.log('PASS empty preview recovery, single preflight failure, no API calls on missing data, real builder reason retained.');
  } finally {
    if (previous === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previous;
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
