import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module';
import { GuideService } from '../guide.service';

async function main() {
  const original = path.resolve(__dirname, '../../../../data');
  const root = path.resolve(original, '../../outputs', `partners-audit-${Date.now()}`);
  const data = path.join(root, 'data'), cache = path.join(data, 'drive-file-cache');
  fs.mkdirSync(cache, { recursive: true });
  const hashes = new Map<string, string>();
  const hash = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  for (const name of fs.readdirSync(original)) {
    const file = path.join(original, name);
    if (!fs.statSync(file).isFile()) continue;
    hashes.set(file, hash(file));
    if (/^(workbook-cache|workbook-source-meta|sheet-drive-images|image-mapping|.*hooks|hook-sources)/.test(name)) fs.copyFileSync(file, path.join(data, name));
  }
  for (const name of fs.readdirSync(path.join(original, 'drive-file-cache'))) {
    const from = path.join(original, 'drive-file-cache', name), to = path.join(cache, name);
    if (!fs.statSync(from).isFile()) continue;
    if (name.endsWith('.json')) fs.copyFileSync(from, to);
    else if (name.endsWith('.bin')) fs.linkSync(from, to);
  }
  Object.assign(process.env, { DALAT_DATA_DIR: data, DALAT_DRIVE_FILE_CACHE_DIR: cache,
    DALAT_AUTO_SYNC_SHEET: 'false', DALAT_AUTO_WARM_DRIVE_CACHE: 'false', DALAT_SESSION_ID: 'partners-four-isolated' });
  globalThis.fetch = (async () => { throw Error('Audit: external network disabled'); }) as typeof fetch;
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    await app.listen(0, '127.0.0.1');
    const service: any = app.get(GuideService);
    while (service.destinationDataLoading) await new Promise(r => setTimeout(r, 50));
    if (service.destinationDataError) throw Error(service.destinationDataError);
    const initial = await service.getDataset();
    const results: any[] = [], decks: any[] = [];
    for (const deck of initial.decks) {
      if (process.env.AUDIT_ONLY_DECKS && !process.env.AUDIT_ONLY_DECKS.split(',').includes(deck.id)) continue;
      if (process.env.AUDIT_ONLY_DECK && deck.id !== process.env.AUDIT_ONLY_DECK) continue;
      const row: any = { deckId: deck.id, title: deck.title, lists: [], errors: [] };
      const refs: string[] = [];
      for (let i = 0; i < 4; i++) {
        try {
          const result = deck.id === 'spotlight-partner'
            ? await service.generatePartnerSpotlight({ partnerId: (await service.getPartnerList())[i]?.id })
            : await service.generateDeckFromCaption({ deckId: deck.id, caption: { coverTitle: `Đà Lạt thử ${i + 1}`, headline: 'Đi Đà Lạt', body: 'List kiểm thử độc lập, lưu lại để tham khảo.', hashtags: [] }, hookSelection: { mode: 'normal' } });
          refs.push(result.listId);
        } catch (e: any) { row.errors.push({ index: i + 1, message: e.message }); }
      }
      const after = await service.getDataset();
      const lists = after.decks.find((d: any) => d.id === deck.id)?.lists.filter((l: any) => refs.includes(l.id)) || [];
      for (const list of lists) {
        const names = [...new Set(list.pages.flatMap((p: any) => (p.items || []).filter((x: any) => x.isPartner).map((x: any) => x.rawName || x.name)))];
        row.lists.push({ id: list.id, pages: list.pages.length, partners: names });
      }
      decks.push({ ...deck, lists }); results.push(row);
      fs.writeFileSync(path.join(root, 'generation.json'), JSON.stringify({ root, source: initial.source, results, decks }, null, 2));
      console.log(JSON.stringify({ deck: deck.id, generated: lists.length, partners: row.lists.map((l: any) => l.partners.length), errors: row.errors }));
    }
    const changed = [...hashes].filter(([file, before]) => hash(file) !== before).map(([file]) => file);
    fs.writeFileSync(path.join(root, 'original-integrity.json'), JSON.stringify({ changed }));
    if (changed.length) throw Error('Original data changed: ' + changed.join(','));
    console.log('AUDIT_ROOT=' + root);
  } finally { await app.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
