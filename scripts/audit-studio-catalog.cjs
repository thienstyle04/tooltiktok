const fs = require('node:fs');
const assert = require('node:assert/strict');
const origin = 'http://127.0.0.1:3210';
async function api(route, body) {
  const response = await fetch(origin + route, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await response.json();
  if (!response.ok) throw new Error(json.message || JSON.stringify(json));
  return json;
}
(async () => {
  const health = await api('/api/health');
  assert.equal(health.sessionId, 'studio-audit-isolated');
  const initial = (await api('/api/destinations')).active.id;
  const results = [];
  try {
    for (const source of ['dalat', 'greenland']) {
      await api('/api/destination', { id: source });
      const dataset = await api('/api/guide-data');
      for (const deck of dataset.decks) {
        const result = { source, deckId: deck.id, previewLists: deck.lists.length };
        if (deck.id === 'spotlight-partner') { result.status = 'NOT_RUN'; result.reason = 'Requires explicit partner selection; not caption generation'; }
        else {
          try {
            const created = await api('/api/decks/generate-from-caption', { deckId: deck.id,
              caption: { coverTitle: 'Bài kiểm thử độc lập', headline: 'Kiểm thử', body: 'Nội dung kiểm thử, không gọi AI.', hashtags: [] }, hookSelection: { mode: 'normal' } });
            assert.ok(created.listId); result.status = 'PASS'; result.listId = created.listId;
          } catch (error) { result.status = 'FAIL_OR_DATA_SHORTAGE'; result.reason = error.message; }
        }
        results.push(result); console.log(JSON.stringify(result));
        fs.writeFileSync('outputs/studio-audit-runtime/catalog-results.json', JSON.stringify(results, null, 2));
      }
    }
  } finally { await api('/api/destination', { id: initial }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
