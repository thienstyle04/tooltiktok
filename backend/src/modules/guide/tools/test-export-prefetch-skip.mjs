/**
 * Sau toi uu export: cache-status nhanh + prefetch bo qua khi du disk cache.
 *   node backend/src/modules/guide/tools/test-export-prefetch-skip.mjs
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

function sampleCachedIds(limit = 80) {
  if (!existsSync(CACHE_DIR)) return [];
  return readdirSync(CACHE_DIR)
    .filter((name) => name.endsWith('.bin'))
    .slice(0, limit)
    .map((name) => name.replace(/\.bin$/i, ''));
}

function sampleManifestIds(limit = 80) {
  let dest = 'dalat';
  try {
    const raw = JSON.parse(readFileSync(join(ROOT, 'backend', 'data', 'active-destination.json'), 'utf8'));
    dest = String(raw?.destinationId || raw?.id || 'dalat').trim() || 'dalat';
  } catch {
    // default
  }
  const manifestPath = join(ROOT, 'backend', 'data', `sheet-drive-images.${dest}.json`);
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const ids = [];
  for (const entry of Object.values(manifest.items || {})) {
    const id = String(entry?.fileId || '').trim();
    if (id) ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

async function waitHealth() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return true;
    } catch {
      // retry
    }
    await sleep(1500);
  }
  return false;
}

async function postJson(path, body) {
  const t0 = Date.now();
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  const ms = Date.now() - t0;
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ms, data };
}

async function main() {
  const report = { ok: true, failures: [], checks: [] };
  if (!(await waitHealth())) {
    console.log(JSON.stringify({ ok: false, failures: ['backend chua san sang'] }, null, 2));
    process.exit(2);
  }

  const cachedIds = sampleCachedIds(60);
  const manifestIds = sampleManifestIds(60);
  const ids = cachedIds.length >= 20 ? cachedIds : manifestIds;
  report.sampleCount = ids.length;
  report.cacheBins = existsSync(CACHE_DIR)
    ? readdirSync(CACHE_DIR).filter((n) => n.endsWith('.bin')).length
    : 0;

  if (ids.length < 10) {
    report.ok = false;
    report.failures.push('Khong du fileId de test');
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const status1 = await postJson('/api/drive-files/cache-status', { fileIds: ids });
  report.checks.push({
    name: 'cache-status HTTP nhanh',
    ok: status1.ok && status1.ms < 5000,
    ms: status1.ms,
    total: status1.data?.total,
    cached: status1.data?.cached,
    missing: Array.isArray(status1.data?.missing) ? status1.data.missing.length : null,
  });
  if (!report.checks[report.checks.length - 1].ok) {
    report.ok = false;
    report.failures.push(`cache-status cham/loi: ${status1.ms}ms status=${status1.status}`);
  }

  const prefetch = await postJson('/api/drive-files/prefetch', { fileIds: ids });
  const missingCount = Array.isArray(status1.data?.missing) ? status1.data.missing.length : ids.length;
  const expectSkipHeavy = missingCount === 0;
  report.checks.push({
    name: expectSkipHeavy
      ? 'prefetch bo qua khi du cache (nhanh, skipped ~ total)'
      : 'prefetch chi tai phan thieu',
    ok: prefetch.ok && (
      expectSkipHeavy
        ? (prefetch.ms < 3000 && Number(prefetch.data?.skipped || 0) >= ids.length * 0.95 && Number(prefetch.data?.ok || 0) === 0)
        : Number(prefetch.data?.ok || 0) + Number(prefetch.data?.skipped || 0) + Number(prefetch.data?.fail || 0) >= ids.length * 0.8
    ),
    ms: prefetch.ms,
    body: prefetch.data,
    expectSkipHeavy,
  });
  if (!report.checks[report.checks.length - 1].ok) {
    report.ok = false;
    report.failures.push(`prefetch khong dung ky vong: ${JSON.stringify(prefetch.data)} ms=${prefetch.ms}`);
  }

  const status2 = await postJson('/api/drive-files/cache-status', { fileIds: ids });
  report.checks.push({
    name: 'cache-status lan 2 on dinh',
    ok: status2.ok && status2.ms < 5000,
    ms: status2.ms,
    cached: status2.data?.cached,
    missing: Array.isArray(status2.data?.missing) ? status2.data.missing.length : null,
  });
  if (!report.checks[report.checks.length - 1].ok) {
    report.ok = false;
    report.failures.push('cache-status lan 2 fail');
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
