import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDriveImageProxyUrl,
  preferDiskCachedDriveProxyUrls,
  rankFullBleedDriveProxyUrls,
  isFrameCollageFileName,
} from '../sync/drive-images.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sheetPath = path.resolve(__dirname, '../../../../data/sheet-drive-images.dalat.json');
const outPath = path.resolve(__dirname, '../../../../reports/frame-dl-rank.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const sheet = JSON.parse(fs.readFileSync(sheetPath, 'utf8'));
const hits = Object.entries(sheet.items || {}).filter(([, entry]) =>
  JSON.stringify(entry).includes('frame_dl') || /Quang Trung/i.test(JSON.stringify(entry)),
);

const report = hits.map(([key, entry]) => {
  const cands = entry.candidateImages || [];
  const ranked = rankFullBleedDriveProxyUrls(
    preferDiskCachedDriveProxyUrls(cands.map((c) => getDriveImageProxyUrl(c.fileId))),
    cands,
  );
  const order = ranked.map((url) => {
    const id = decodeURIComponent(String(url).split('id=')[1] || '');
    const name = cands.find((c) => c.fileId === id)?.fileName || id;
    return { name, frame: isFrameCollageFileName(name) };
  });
  return {
    key,
    name: entry.name,
    address: entry.address,
    primary: entry.fileName,
    first: order[0] || null,
    ok: order[0] ? !order[0].frame : true,
    frameCount: order.filter((row) => row.frame).length,
    order,
  };
});

fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
const failed = report.filter((row) => row.frameCount > 0 && !row.ok);
console.log(`wrote ${outPath}`);
console.log(`hits=${report.length} failed=${failed.length}`);
if (failed.length) process.exit(1);
