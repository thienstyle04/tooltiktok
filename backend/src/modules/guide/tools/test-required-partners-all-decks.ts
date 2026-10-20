// Kiểm thử thật "đối tác bắt buộc" trên mọi mẫu dựng sẵn của từng nguồn, dùng
// bản sao dữ liệu tách biệt (không mạng, không ghi vào dữ liệu thật). Với mỗi mẫu:
// tạo 1 list nền, rồi bắt buộc 1–2 đối tác KHÔNG có trong list nền và kiểm tra
// chúng hiển thị trong mọi list (kể cả list liền sau), hoặc lỗi được báo rõ.
// Chạy: npx ts-node -T src/modules/guide/tools/test-required-partners-all-decks.ts [nguồn,...]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module';
import { GuideService } from '../guide.service';
import { requiredPartnerKey } from '../logic/required-partners';

const SOURCES = (process.argv[2] || 'dalat-test,dalat-threads').split(',');
const ONLY = process.env.ONLY_DECKS ? new Set(process.env.ONLY_DECKS.split(',')) : null;

async function main() {
  const original = path.resolve(__dirname, '../../../../data');
  const root = path.resolve(original, '../../outputs', `required-partners-${Date.now()}`);
  const data = path.join(root, 'data'), cache = path.join(data, 'drive-file-cache');
  fs.mkdirSync(cache, { recursive: true });
  const hashes = new Map<string, string>();
  const hash = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  for (const name of fs.readdirSync(original)) {
    const file = path.join(original, name);
    const stat = fs.statSync(file);
    if (stat.isFile()) { hashes.set(file, hash(file)); fs.copyFileSync(file, path.join(data, name)); }
    else if (['source-snapshots', 'source-hooks'].includes(name)) fs.cpSync(file, path.join(data, name), { recursive: true });
  }
  for (const name of fs.readdirSync(path.join(original, 'drive-file-cache'))) {
    const from = path.join(original, 'drive-file-cache', name), to = path.join(cache, name);
    if (!fs.statSync(from).isFile()) continue;
    if (name.endsWith('.json')) fs.copyFileSync(from, to);
    else fs.linkSync(from, to);
  }
  Object.assign(process.env, { DALAT_DATA_DIR: data, DALAT_DRIVE_FILE_CACHE_DIR: cache,
    DALAT_AUTO_SYNC_SHEET: 'false', DALAT_AUTO_WARM_DRIVE_CACHE: 'false', DALAT_SESSION_ID: 'required-partners-isolated',
    DALAT_LOCAL_TEMPLATES_DIR: path.join(root, 'no-local-templates') });
  globalThis.fetch = (async () => { throw Error('Test: external network disabled'); }) as typeof fetch;
  const app = await NestFactory.create(AppModule, { logger: false });
  const report: any[] = [];
  const out = path.join(root, 'report.json');
  try {
    await app.listen(0, '127.0.0.1');
    const service: any = app.get(GuideService);
    const settle = async () => { while (service.destinationDataLoading) await new Promise(r => setTimeout(r, 50)); };
    await settle();
    const caption = (i: number) => ({ coverTitle: `Đà Lạt thử ${i}`, headline: 'Đi Đà Lạt', body: 'List kiểm thử độc lập.', hashtags: [] });
    const partnersOf = (list: any) => service.renderedPartnerNames(list) as string[];
    for (const source of SOURCES) {
      await service.setActiveDestination({ id: source });
      await settle();
      const dataset = await service.getDataset();
      const all: any[] = await service.getPartnerList();
      const partners = [...new Map(all.map(p => [requiredPartnerKey(p.name), p])).values()];
      for (const deck of dataset.decks) {
        if (deck.creationDisabled || deck.localTemplate || deck.id === 'spotlight-partner') continue;
        if (ONLY && !ONLY.has(deck.id)) continue;
        const row: any = { source, deckId: deck.id, cases: [] };
        const started = Date.now();
        const generate = async (requiredPartners: string[], i: number) => {
          const t0 = Date.now();
          try {
            const r = await service.generateDeckFromCaption({ deckId: deck.id, caption: caption(i), hookSelection: { mode: 'normal' }, requiredPartners });
            const list = service.generatedListsByDeckId.get(deck.id).find((l: any) => l.id === r.listId);
            return { ok: true, ms: Date.now() - t0, partners: partnersOf(list) };
          } catch (e: any) { return { ok: false, ms: Date.now() - t0, error: String(e?.message || e), requiredError: e?.constructor?.name === 'RequiredPartnersError' }; }
        };
        const base = await generate([], 1);
        row.base = base;
        if (!base.ok) { report.push(row); console.log(JSON.stringify({ source, deck: deck.id, base: base.error })); continue; }
        // Control: a second list WITHOUT required partners shows template/data limits
        // (e.g. photo exhaustion) that are not caused by this feature.
        row.control = await generate([], 2);
        const baseKeys = new Set(base.partners!.map(requiredPartnerKey));
        const baseSections = new Set(all.filter(p => baseKeys.has(requiredPartnerKey(p.name))).map(p => p.section));
        const candidates = partners.filter(p => !baseKeys.has(requiredPartnerKey(p.name)) && baseSections.has(p.section));
        const pickedNames = candidates.sort((a, b) => crypto.createHash('md5').update(deck.id + a.name).digest('hex').localeCompare(crypto.createHash('md5').update(deck.id + b.name).digest('hex'))).slice(0, 3).map(p => p.name);
        const cases: string[][] = [...pickedNames.slice(0, 2).map(n => [n]), ...(pickedNames.length >= 2 ? [pickedNames.slice(0, 2)] : [])];
        for (const [index, required] of cases.entries()) {
          // Two consecutive lists: the second must also show the partner (new photo/position).
          for (const repeat of [0, 1]) {
            const result: any = await generate(required, 10 + index * 2 + repeat);
            const missing = result.ok ? required.filter(n => !result.partners.map(requiredPartnerKey).includes(requiredPartnerKey(n))) : required;
            row.cases.push({ required, repeat, ...result, missing });
            if (!result.ok) break;
          }
        }
        // Unknown partner must be rejected before generation, with a clear message.
        const unknown: any = await generate(['Đối tác không tồn tại 123'], 99);
        row.unknownRejected = !unknown.ok && /không có trong dữ liệu nguồn/.test(unknown.error || '');
        row.ms = Date.now() - started;
        report.push(row);
        fs.writeFileSync(out, JSON.stringify({ root, report }, null, 2));
        console.log(JSON.stringify({ source, deck: deck.id, ms: row.ms, unknownRejected: row.unknownRejected, control: row.control.ok ? 'ok' : 'ERR ' + row.control.error.slice(0, 120),
          cases: row.cases.map((c: any) => `${c.required.join('+')}#${c.repeat}:${c.ok ? (c.missing.length ? 'MISSING ' + c.missing : 'ok') : 'ERR ' + (c.requiredError ? '[required] ' : '') + c.error.slice(0, 160)}`) }));
      }
    }
    const changed = [...hashes].filter(([file, before]) => hash(file) !== before).map(([file]) => file);
    if (changed.length) throw Error('Original data changed: ' + changed.join(','));
    const bad = report.flatMap(r => r.cases.filter((c: any) => c.ok && c.missing.length).map((c: any) => `${r.source}/${r.deckId}: ${c.required}`));
    console.log(`REPORT=${out}`);
    if (bad.length) { console.log('SAVED WITHOUT REQUIRED PARTNER (must never happen):\n' + bad.join('\n')); process.exitCode = 1; }
  } finally { await app.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
