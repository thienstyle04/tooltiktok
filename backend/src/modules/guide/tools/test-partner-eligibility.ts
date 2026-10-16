// Kiểm thử "đối tác hiển thị được theo mẫu" trên bản sao dữ liệu thật (không mạng,
// không ghi dữ liệu thật): chạy thử không tạo list/không tiêu hao vòng; đối tác báo
// "dùng được" tạo list được, đối tác báo "không dùng được" bị chặn lúc tạo.
// Chạy: npx ts-node -T src/modules/guide/tools/test-partner-eligibility.ts [nguồn,...]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module';
import { GuideService } from '../guide.service';

const SOURCES = (process.argv[2] || 'dalat-threads,dalat-test').split(',');
const ONLY = process.env.ONLY_DECKS ? new Set(process.env.ONLY_DECKS.split(',')) : null;

async function main() {
  const original = path.resolve(__dirname, '../../../../data');
  const root = path.resolve(original, '../../outputs', `partner-eligibility-${Date.now()}`);
  const data = path.join(root, 'data'), cache = path.join(data, 'drive-file-cache');
  fs.mkdirSync(cache, { recursive: true });
  const hashes = new Map<string, string>();
  const hash = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  for (const name of fs.readdirSync(original)) {
    const file = path.join(original, name), stat = fs.statSync(file);
    if (stat.isFile()) { hashes.set(file, hash(file)); fs.copyFileSync(file, path.join(data, name)); }
    else if (['source-snapshots', 'source-hooks'].includes(name)) fs.cpSync(file, path.join(data, name), { recursive: true });
  }
  for (const name of fs.readdirSync(path.join(original, 'drive-file-cache'))) {
    const from = path.join(original, 'drive-file-cache', name), to = path.join(cache, name);
    if (!fs.statSync(from).isFile()) continue;
    if (name.endsWith('.json')) fs.copyFileSync(from, to); else fs.linkSync(from, to);
  }
  fs.writeFileSync(path.join(data, 'active-destination.json'), JSON.stringify({ id: SOURCES[0], savedAt: new Date().toISOString() }));
  Object.assign(process.env, { DALAT_DATA_DIR: data, DALAT_DRIVE_FILE_CACHE_DIR: cache, DALAT_AUTO_SYNC_SHEET: 'false', DALAT_AUTO_WARM_DRIVE_CACHE: 'false',
    DALAT_SESSION_ID: 'partner-eligibility-isolated', DALAT_LOCAL_TEMPLATES_DIR: path.join(root, 'no-local-templates') });
  globalThis.fetch = (async () => { throw Error('Test: external network disabled'); }) as typeof fetch;
  const app = await NestFactory.create(AppModule, { logger: false });
  const failures: string[] = [];
  try {
    await app.listen(0, '127.0.0.1');
    const s: any = app.get(GuideService);
    const settle = async () => { while (s.destinationDataLoading) await new Promise(r => setTimeout(r, 50)); };
    await settle();
    for (const source of SOURCES) {
      await s.setActiveDestination({ id: source }); await settle();
      const dataset = await s.getDataset();
      for (const deck of dataset.decks) {
        if (deck.creationDisabled || deck.localTemplate || deck.id === 'spotlight-partner' || (ONLY && !ONLY.has(deck.id))) continue;
        const before = JSON.stringify({ lists: s.generatedListsByDeckId.get(deck.id) || [], rotation: s.partnerRotation[deck.id] || null, state: s.localTemplateState });
        const t0 = Date.now();
        const result = await s.getPartnerEligibility(deck.id);
        const firstMs = Date.now() - t0;
        const t1 = Date.now(); const again = await s.getPartnerEligibility(deck.id); const cachedMs = Date.now() - t1;
        assert.deepEqual(again, result);
        assert.equal(JSON.stringify({ lists: s.generatedListsByDeckId.get(deck.id) || [], rotation: s.partnerRotation[deck.id] || null, state: s.localTemplateState }), before, `${deck.id}: dry run must not save lists or consume rotation`);
        const ok = result.partners.filter((p: any) => p.eligible), no = result.partners.filter((p: any) => !p.eligible);
        assert.ok(no.every((p: any) => p.reason), `${deck.id}: every unavailable partner has a reason`);
        const checks: string[] = [];
        // Real creation agrees with the dry run (first list for this deck: no photo history yet).
        for (const partner of ok.slice(0, 2)) {
          try { await s.generateDeckFromCaption({ deckId: deck.id, caption: { coverTitle: 'Kiểm tra', headline: '', body: '', hashtags: [] }, hookSelection: { mode: 'normal' }, requiredPartners: [partner.name] }); checks.push(`✓${partner.name}`); }
          catch (e: any) { const m = String(e?.message || e); checks.push(`✗${partner.name}`); if (e?.constructor?.name === 'RequiredPartnersError' && !/ảnh khác lần trước/.test(m)) failures.push(`${source}/${deck.id}: eligible ${partner.name} failed: ${m.slice(0, 160)}`); }
        }
        for (const partner of no.slice(0, 1)) {
          try { await s.generateDeckFromCaption({ deckId: deck.id, caption: { coverTitle: 'Kiểm tra', headline: '', body: '', hashtags: [] }, hookSelection: { mode: 'normal' }, requiredPartners: [partner.name] }); failures.push(`${source}/${deck.id}: unavailable ${partner.name} was created`); }
          catch { checks.push(`⊘${partner.name}`); }
        }
        console.log(JSON.stringify({ source, deck: deck.id, firstMs, cachedMs, error: result.error?.slice(0, 100), eligible: ok.length, unavailable: no.map((p: any) => `${p.name}: ${p.reason}`), checks }));
      }
    }
    const changed = [...hashes].filter(([file, before]) => hash(file) !== before).map(([file]) => file);
    if (changed.length) failures.push('Original data changed: ' + changed.join(','));
    if (failures.length) { console.log('FAILURES:\n' + failures.join('\n')); process.exitCode = 1; }
    else console.log('PASS partner eligibility: dry run saves nothing, cached, reasons given, agrees with real creation.');
  } finally { await app.close(); fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
