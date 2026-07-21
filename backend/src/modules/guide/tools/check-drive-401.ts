import * as XLSX from 'xlsx';
import { getDestinationConfig } from '../sync/destination-config';
import { fetchWorkbookFromSheet } from '../sync/workbook-source';
import { resolveSectionKeyFromSheetName } from '../sync/sheet-section';
import { firstValue, normalizeText } from '../logic/image-resolver';

const H = {
  Referer: 'https://drive.google.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

function preferredLink(row: Record<string, string>): string {
  return firstValue(
    row,
    'link_drive__hyperlink', 'link_drive',
    'link_anh__hyperlink', 'link_anh',
    'anh__hyperlink', 'anh',
    'hinh_anh__hyperlink', 'hinh_anh',
  ).replace(/&amp;/g, '&');
}

function extractId(link: string): string {
  try {
    const id = new URL(link).searchParams.get('id');
    if (id) return id;
  } catch {
    // ignore
  }
  return link.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] || '';
}

async function main(): Promise<void> {
  const targets = process.argv.slice(2);
  const names = targets.length > 0
    ? targets
    : ['Cà Phê Capulus', 'Payon Villa Dalat', 'Nhà An 1', 'Waken Beans Coffee', 'OLLIN Coffee'];

  const source = await fetchWorkbookFromSheet(getDestinationConfig('dalat'));
  const found: Record<string, string> = {};

  for (const sheetName of source.workbook.SheetNames) {
    const sectionKey = resolveSectionKeyFromSheetName(sheetName);
    if (!sectionKey) continue;
    const sheet = source.workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
    const headers = (rows[0] || []).map((h) => normalizeText(h));
    for (let i = 1; i < rows.length; i += 1) {
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = String(rows[i][idx] || '').trim();
        const ref = XLSX.utils.encode_cell({ r: i, c: idx });
        const cell = sheet[ref];
        if (cell?.l?.Target) row[`${h}__hyperlink`] = String(cell.l.Target).trim();
      });
      const name = firstValue(row, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten');
      if (!names.includes(name)) continue;
      found[name] = preferredLink(row);
    }
  }

  console.log('Found links:', Object.keys(found).length);

  // Burst test on first folder id to see rate-limit 401
  const firstId = extractId(Object.values(found)[0] || '');
  if (firstId) {
    console.log('\n=== Burst 30 parallel embeddedfolderview (rate-limit test) ===');
    const statuses = await Promise.all(Array.from({ length: 30 }, async () => {
      try {
        const response = await fetch(`https://drive.google.com/embeddedfolderview?id=${firstId}#list`, {
          headers: H,
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        });
        return response.status;
      } catch {
        return -1;
      }
    }));
    const counts = statuses.reduce<Record<string, number>>((acc, status) => {
      acc[String(status)] = (acc[String(status)] || 0) + 1;
      return acc;
    }, {});
    console.log(counts);
  }

  for (const [name, link] of Object.entries(found)) {
    const id = extractId(link);
    console.log(`\n=== ${name} ===`);
    console.log('link:', link);
    console.log('id:', id);
    if (!id) continue;

    const emb = await fetch(`https://drive.google.com/embeddedfolderview?id=${id}#list`, {
      headers: H,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    const html = await emb.text();
    const files = [...new Set([...html.matchAll(/\/file\/d\/([a-zA-Z0-9_-]+)\//g)].map((m) => m[1]))];
    console.log('embeddedfolderview:', emb.status, '| child files:', files.length);

    if (files[0]) {
      const img = await fetch(`https://drive.google.com/uc?export=view&id=${files[0]}`, {
        headers: H,
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
      const body = Buffer.from(await img.arrayBuffer());
      const jpeg = body.length >= 3 && body[0] === 0xff && body[1] === 0xd8;
      console.log('child jpeg:', img.status, jpeg ? 'OK' : 'FAIL', files[0]);
    } else if (emb.status === 401) {
      console.log('>> 401: Google từ chối list folder (rate-limit hoặc folder không public embed)');
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
