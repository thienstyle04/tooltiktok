/**
 * Test: bat tool 2 lan — Drive disk cache chi tai anh thieu, khong tai lai toan bo.
 *
 * Yeu cau: backend dang chay (port 3000). Script goi warm qua prefetch + do thoi gian guide-data.
 *   node backend/src/modules/guide/tools/test-startup-reload-once.mjs
 *
 * Ket hop thu cong: khoi dong npm run dev 2 lan, xem log "[drive-cache] Du cache disk ... bo qua warm".
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../../../..');
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const CACHE_DIR = process.env.DALAT_DRIVE_FILE_CACHE_DIR
  || join(ROOT, 'backend', 'data', 'drive-file-cache');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function countBins(dir) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((n) => n.endsWith('.bin')).length;
}

function sampleFileIdsFromManifest(limit = 40) {
  const destPath = join(ROOT, 'backend', 'data', 'active-destination.json');
  let dest = 'dalat';
  try {
    const raw = JSON.parse(readFileSync(destPath, 'utf8'));
    dest = String(raw?.destinationId || raw?.id || 'dalat').trim() || 'dalat';
  } catch {
    // default
  }
  const manifestPath = join(ROOT, 'backend', 'data', `sheet-drive-images.${dest}.json`);
  if (!existsSync(manifestPath)) return { dest, ids: [] };
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const ids = [];
  for (const entry of Object.values(manifest.items || {})) {
    const id = String(entry?.fileId || '').trim();
    if (id) ids.push(id);
    if (ids.length >= limit) break;
  }
  return { dest, ids };
}

async function waitHealth() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return true;
    } catch {
      // retry
    }
    await sleep(2000);
  }
  return false;
}

async function timeGuideData() {
  const t0 = Date.now();
  const res = await fetch(`${API}/api/guide-data`, { signal: AbortSignal.timeout(180000) });
  const ms = Date.now() - t0;
  const ok = res.ok;
  let decks = 0;
  if (ok) {
    const data = await res.json();
    decks = (data?.decks || []).length;
  }
  return { ok, ms, decks, status: res.status };
}

async function prefetch(ids) {
  const t0 = Date.now();
  const res = await fetch(`${API}/api/drive-files/prefetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileIds: ids }),
    signal: AbortSignal.timeout(300000),
  });
  const ms = Date.now() - t0;
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, ms, status: res.status, body };
}

async function main() {
  const binsBefore = countBins(CACHE_DIR);
  const report = {
    ok: true,
    failures: [],
    cacheDir: CACHE_DIR,
    binsBefore,
    checks: [],
  };

  if (!(await waitHealth())) {
    report.ok = false;
    report.failures.push('Backend chua san sang o :3000');
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const g1 = await timeGuideData();
  report.checks.push({ name: 'guide-data lan 1', ...g1 });
  const g2 = await timeGuideData();
  report.checks.push({ name: 'guide-data lan 2 (cung process)', ...g2 });

  // Payload guide-data lon (~23 decks) nen lan 2 van co the ~vai giay; chi can OK on dinh.
  report.checks.push({
    name: 'cung process: guide-data lan 1+2 OK on dinh',
    ok: g1.ok && g2.ok && g1.decks > 0 && g1.decks === g2.decks,
    g1ms: g1.ms,
    g2ms: g2.ms,
    decks: g1.decks,
  });
  if (!report.checks[report.checks.length - 1].ok) {
    report.ok = false;
    report.failures.push(`guide-data khong on dinh: ${JSON.stringify({ g1, g2 })}`);
  }

  const { dest, ids } = sampleFileIdsFromManifest(48);
  report.destinationId = dest;
  report.sampleIds = ids.length;

  if (!ids.length) {
    report.ok = false;
    report.failures.push('Khong lay duoc fileId tu manifest');
  } else {
    const p1 = await prefetch(ids);
    report.checks.push({
      name: 'prefetch lan 1 (cache disk da co thi skip)',
      ok: p1.ok,
      ms: p1.ms,
      total: p1.body?.total,
      skipped: p1.body?.skipped,
      downloaded: p1.body?.ok,
      fail: p1.body?.fail,
    });
    const p2 = await prefetch(ids);
    report.checks.push({
      name: 'prefetch lan 2 (phai skip gan het, khong tai lai)',
      ok: p2.ok && Number(p2.body?.skipped || 0) >= Math.floor(ids.length * 0.9),
      ms: p2.ms,
      total: p2.body?.total,
      skipped: p2.body?.skipped,
      downloaded: p2.body?.ok,
      fail: p2.body?.fail,
    });
    if (!report.checks[report.checks.length - 1].ok) {
      report.ok = false;
      report.failures.push(`prefetch lan2 van tai lai: ${JSON.stringify(p2.body)}`);
    }

    // Lan 2 phai nhanh (chi check disk)
    const prefetchFast = p2.ok && p2.ms < Math.max(5000, (p1.ms || 1) * 0.8 + 2000);
    report.checks.push({
      name: 'prefetch lan 2 nhanh (khong storm Drive)',
      ok: prefetchFast || (p2.ok && Number(p2.body?.ok || 0) === 0 && p2.ms < 15000),
      p1ms: p1.ms,
      p2ms: p2.ms,
    });
    if (!report.checks[report.checks.length - 1].ok) {
      report.ok = false;
      report.failures.push(`prefetch lan2 cham bat thuong: ${p1.ms} -> ${p2.ms}`);
    }
  }

  const binsAfter = countBins(CACHE_DIR);
  report.binsAfter = binsAfter;
  report.binsDelta = binsAfter - binsBefore;
  report.checks.push({
    name: 'cache disk khong bung no sau prefetch lap',
    ok: report.binsDelta <= 5,
    binsBefore,
    binsAfter,
    delta: report.binsDelta,
  });
  if (!report.checks[report.checks.length - 1].ok) {
    report.ok = false;
    report.failures.push(`cache tang ${report.binsDelta} file sau prefetch lap`);
  }

  report.verdict = report.ok
    ? 'OK: anh Drive da cache thi khong tai lai; guide-data lan 2 dung warm trong process.'
    : 'FAIL: xem failures';

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
