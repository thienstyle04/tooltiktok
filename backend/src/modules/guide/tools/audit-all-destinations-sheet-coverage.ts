/**
 * Kiểm tra 3 destination: tool đã lấy đủ dữ liệu Google Sheet chưa.
 * Chạy: npx ts-node --transpile-only src/modules/guide/tools/audit-all-destinations-sheet-coverage.ts
 */
import * as XLSX from 'xlsx';
import { DESTINATION_LIST, DestinationId } from '../sync/destination-config';
import { fetchWorkbookFromSheet } from '../sync/workbook-source';
import { resolveSectionKeyFromSheetName } from '../sync/sheet-section';
import { resolveDriveLinkToEntries } from '../sync/drive-images';
import { firstValue, normalizeText } from '../logic/image-resolver';

const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const PROBE_DRIVE = process.env.PROBE_DRIVE !== '0';
const DRIVE_SAMPLE_LIMIT = Number(process.env.DRIVE_SAMPLE_LIMIT || 40);
const CONC = 6;

function preferredImageLink(row: Record<string, string>): string {
  return firstValue(
    row,
    'link_drive__hyperlink',
    'link_drive',
    'link_anh__hyperlink',
    'link_anh',
    'link_hinh__hyperlink',
    'link_hinh',
    'link_hinh_anh__hyperlink',
    'link_hinh_anh',
    'hinh_anh__hyperlink',
    'hinh_anh',
    'anh__hyperlink',
    'anh',
    'image_link__hyperlink',
    'image_link',
  ).replace(/&amp;/g, '&');
}

function workbookRows(sheet: XLSX.WorkSheet): Array<Record<string, string>> {
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false, defval: '' });
  if (rows.length === 0) return [];
  const headers = (rows[0] ?? []).map((header) => normalizeText(header));
  const results: Array<Record<string, string>> = [];

  for (const [rowOffset, rawRow] of rows.slice(1).entries()) {
    const rowMap: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      const rawValue = String(rawRow[columnIndex] ?? '').trim();
      const cellRef = XLSX.utils.encode_cell({ r: rowOffset + 1, c: columnIndex });
      const cell = sheet[cellRef];
      const hyperlink = typeof cell?.l?.Target === 'string' ? cell.l.Target.trim() : '';
      const isLinkHeader = header.includes('link') || header.includes('anh') || header.includes('hinh');
      rowMap[header] = hyperlink && isLinkHeader ? hyperlink : rawValue;
      if (hyperlink) rowMap[`${header}__hyperlink`] = hyperlink;
    });
    results.push(rowMap);
  }
  return results;
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]);
    }
  }));
  return results;
}

async function probeJpeg(fileId: string): Promise<boolean> {
  try {
    const response = await fetch(`https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`, {
      headers: {
        Referer: 'https://drive.google.com/',
        'User-Agent': 'Mozilla/5.0',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return false;
    const body = Buffer.from(await response.arrayBuffer());
    return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8;
  } catch {
    return false;
  }
}

interface SheetRow {
  sectionKey: string;
  name: string;
  address: string;
  folderLink: string;
}

async function auditDestination(id: DestinationId) {
  const config = DESTINATION_LIST.find((entry) => entry.id === id)!;
  console.log(`\n========== ${config.label.toUpperCase()} (${id}) ==========`);
  console.log(`Sheet: ${config.sheetUrl}`);

  const source = await fetchWorkbookFromSheet(config);
  console.log(`Workbook: ${source.workbookName} | ${source.bytes} bytes`);

  const bySection: Record<string, { named: number; withLink: number }> = {};
  const rows: SheetRow[] = [];

  for (const sheetName of source.workbook.SheetNames) {
    const sectionKey = resolveSectionKeyFromSheetName(sheetName);
    if (!sectionKey) {
      console.log(`  [skip sheet] ${sheetName}`);
      continue;
    }
    bySection[sectionKey] ??= { named: 0, withLink: 0 };
    const sheet = source.workbook.Sheets[sheetName];
    if (!sheet) continue;

    for (const row of workbookRows(sheet)) {
      const name = firstValue(row, 'ten_quan', 'ten_dia_diem', 'hoat_dong', 'ten');
      if (!name) continue;
      bySection[sectionKey].named += 1;
      const folderLink = preferredImageLink(row);
      if (folderLink) {
        bySection[sectionKey].withLink += 1;
        rows.push({
          sectionKey,
          name,
          address: firstValue(row, 'dia_chi'),
          folderLink,
        });
      }
    }
  }

  const namedTotal = Object.values(bySection).reduce((sum, value) => sum + value.named, 0);
  const linkTotal = Object.values(bySection).reduce((sum, value) => sum + value.withLink, 0);

  console.log('\n--- Sheet raw ---');
  for (const [section, stats] of Object.entries(bySection).sort((a, b) => b[1].named - a[1].named)) {
    console.log(`  ${section.padEnd(14)} named=${String(stats.named).padStart(3)}  withDriveLink=${String(stats.withLink).padStart(3)}`);
  }
  console.log(`  TOTAL          named=${namedTotal}  withDriveLink=${linkTotal}`);

  // Switch live API destination and compare pool size
  let apiItems = 0;
  let apiDecks = 0;
  let apiError = '';
  try {
    await fetch(`${API}/api/destination`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
      signal: AbortSignal.timeout(60000),
    });
    const dataset = await fetch(`${API}/api/guide-data?refresh=1`, { signal: AbortSignal.timeout(180000) }).then((r) => r.json());
    apiDecks = Array.isArray(dataset.decks) ? dataset.decks.length : 0;
    // Prefer destination stats if present
    const dest = Array.isArray(dataset.destinations)
      ? dataset.destinations.find((entry: { id?: string }) => entry.id === id)
      : null;
    apiItems = Number(dest?.totalItems || dataset.totalItems || 0);
    if (!apiItems && dataset.sections) {
      apiItems = Object.values(dataset.sections as Record<string, unknown[]>).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0);
    }
    // Fallback: count unique names in main lists
    if (!apiItems) {
      const names = new Set<string>();
      for (const deck of dataset.decks || []) {
        const list = (deck.lists || []).find((entry: { id?: string }) => /-main$/.test(entry.id || '')) || deck.lists?.[0];
        for (const page of list?.pages || []) {
          for (const item of page.items || []) {
            if (item?.name) names.add(String(item.name));
          }
        }
      }
      apiItems = names.size;
    }
    console.log(`\n--- Live API (${API}) ---`);
    console.log(`  decks=${apiDecks}  totalItems(reported)=${apiItems}`);
  } catch (error) {
    apiError = error instanceof Error ? error.message : String(error);
    console.log(`\n--- Live API --- FAIL: ${apiError}`);
  }

  let driveResolved = 0;
  let driveEmpty = 0;
  let driveJpegOk = 0;
  let driveJpegFail = 0;
  const failSamples: string[] = [];

  if (PROBE_DRIVE) {
    const sample = rows.slice(0, Math.min(DRIVE_SAMPLE_LIMIT, rows.length));
    console.log(`\n--- Drive resolve sample (${sample.length}/${rows.length}, code moi) ---`);
    await mapLimit(sample, CONC, async (row) => {
      try {
        const entries = await resolveDriveLinkToEntries(row.folderLink, row.name, row.address, 3);
        if (entries.length === 0) {
          driveEmpty += 1;
          if (failSamples.length < 8) failSamples.push(`${row.sectionKey}|${row.name}: resolve=0`);
          return;
        }
        driveResolved += 1;
        const ok = await probeJpeg(entries[0].fileId);
        if (ok) driveJpegOk += 1;
        else {
          driveJpegFail += 1;
          if (failSamples.length < 8) failSamples.push(`${row.sectionKey}|${row.name}: jpegFail file=${entries[0].fileId}`);
        }
      } catch (error) {
        driveEmpty += 1;
        if (failSamples.length < 8) {
          failSamples.push(`${row.sectionKey}|${row.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    });
    console.log(`  resolveOK=${driveResolved} resolveEmpty=${driveEmpty} jpegOK=${driveJpegOk} jpegFail=${driveJpegFail}`);
    for (const sampleLine of failSamples) console.log(`  - ${sampleLine}`);
  }

  const coveragePct = namedTotal > 0 && apiItems > 0
    ? Math.min(100, Math.round((apiItems / namedTotal) * 100))
    : 0;

  return {
    id,
    label: config.label,
    namedTotal,
    linkTotal,
    apiItems,
    apiDecks,
    apiError,
    driveSample: PROBE_DRIVE ? {
      sampleSize: Math.min(DRIVE_SAMPLE_LIMIT, rows.length),
      resolveOK: driveResolved,
      resolveEmpty: driveEmpty,
      jpegOK: driveJpegOk,
      jpegFail: driveJpegFail,
    } : null,
    bySection,
    coveragePct,
  };
}

async function main() {
  console.log('=== AUDIT 3 GOOGLE SHEET DESTINATIONS ===');
  console.log(`API=${API} | PROBE_DRIVE=${PROBE_DRIVE} | sample=${DRIVE_SAMPLE_LIMIT}`);

  const results = [];
  for (const destination of DESTINATION_LIST) {
    results.push(await auditDestination(destination.id));
  }

  console.log('\n\n========== TONG KET ==========');
  console.log(
    'destination'.padEnd(12),
    'sheetNamed'.padStart(10),
    'withLink'.padStart(9),
    'apiItems'.padStart(9),
    'decks'.padStart(6),
    'driveSample'.padStart(18),
  );
  for (const row of results) {
    const drive = row.driveSample
      ? `${row.driveSample.jpegOK}/${row.driveSample.sampleSize} jpeg`
      : 'skip';
    console.log(
      row.id.padEnd(12),
      String(row.namedTotal).padStart(10),
      String(row.linkTotal).padStart(9),
      String(row.apiItems || '-').padStart(9),
      String(row.apiDecks || '-').padStart(6),
      drive.padStart(18),
    );
  }

  console.log('\nGiai thich:');
  console.log('- sheetNamed: so dong co ten tren Google Sheet (cac tab section hop le)');
  console.log('- withLink: so dong co link Drive');
  console.log('- apiItems: so dia diem tool build vao dataset sau sync');
  console.log('- driveSample: mau resolve+tai anh (code moi resolve open?id= folder)');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
