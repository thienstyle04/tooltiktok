const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:3210';
async function api(route, body) {
  const r = await fetch(base + route, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const value = await r.json(); if (!r.ok) throw new Error(value.message || JSON.stringify(value)); return value;
}
(async () => {
  assert.equal((await api('/api/health')).sessionId, 'studio-audit-isolated');
  // Two V4 batches plus partner generation; guard caps all AI attempts at four.
  const initial = (await api('/api/destinations')).active.id;
  const results = [];
  try {
    for (const source of ['dalat', 'greenland']) {
      await api('/api/destination', { id: source });
      const batch = await api('/api/decks/generate-batch', { deckId: 'spotlight-v4', count: 1, requestId: `audit-v4-${source}-${Date.now()}`, hookSelection: { mode: 'normal' } });
      results.push({ source, test: 'V4 real AI batch', status: batch.successCount === 1 ? 'PASS' : 'FAIL', result: batch });
      console.log(JSON.stringify(results.at(-1)));
      const partners = await api('/api/partners');
      const partner = partners.find(p => p.imageCount >= 6) || partners[0];
      assert.ok(partner);
      try {
        const result = await api('/api/decks/generate-partner-spotlight', { partnerId: partner.id, partnerName: partner.name });
        assert.ok(result.listId);
        results.push({ source, test: 'Partner spotlight', status: 'PASS', result });
      } catch (error) { results.push({ source, test: 'Partner spotlight', status: 'FAIL', error: error.message }); }
      console.log(JSON.stringify(results.at(-1)));
      fs.writeFileSync('outputs/studio-audit-runtime/live-generation-results.json', JSON.stringify(results, null, 2));
    }
  } finally { await api('/api/destination', { id: initial }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
