/**
 * Giả lập máy mới: cache disk TRỐNG + storm fetch Drive giống lúc tạo/xuất list.
 * Đo lỗi body `terminated` / ảnh fallback / tỷ lệ OK.
 *
 * Không cần frontend. Có thể chạy độc lập (import drive-images qua ts-node) hoặc
 * qua backend đang chạy (TEST_MODE=http).
 *
 *   node backend/src/modules/guide/tools/test-drive-terminated-sim.mjs
 *   SAMPLE=40 CONCURRENCY=12 node ...
 *   TEST_MODE=http API=http://127.0.0.1:3000 node ...
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../../../..');
const DATA = join(ROOT, 'backend', 'data');
const CACHE_DIR = process.env.DALAT_DRIVE_FILE_CACHE_DIR
  || join(DATA, 'drive-file-cache-sim-othermachine');
const OUT_DIR = join(__dirname, 'export-quality-test-output', 'drive-terminated-sim');
const SAMPLE = Math.max(8, Number(process.env.SAMPLE || 36) || 36);
const CONCURRENCY = Math.min(Math.max(Number(process.env.CONCURRENCY || 12), 1), 24);
const ROUNDS = Math.max(1, Number(process.env.ROUNDS || 2) || 2);
const TEST_MODE = String(process.env.TEST_MODE || 'module').trim().toLowerCase();
const API = process.env.API || process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const KEEP_CACHE = process.env.KEEP_CACHE === '1';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectFileIds() {
  const path = join(DATA, 'sheet-drive-images.dalat.json');
  if (!existsSync(path)) throw new Error(`Thiếu manifest: ${path}`);
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  const ids = [];
  for (const entry of Object.values(manifest.items || {})) {
    const id = String(entry?.fileId || '').trim();
    if (id) ids.push(id);
  }
  for (const cover of (manifest.coverImages || []).slice(0, 80)) {
    const id = String(cover?.fileId || '').trim();
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

function resetCacheDir() {
  if (existsSync(CACHE_DIR) && !KEEP_CACHE) {
    rmSync(CACHE_DIR, { recursive: true, force: true });
  }
  mkdirSync(CACHE_DIR, { recursive: true });
}

function countBins() {
  if (!existsSync(CACHE_DIR)) return 0;
  return readdirSync(CACHE_DIR).filter((name) => name.endsWith('.bin')).length;
}

function looksLikeFallbackSvg(buf, contentType = '') {
  if (!buf?.length) return true;
  const type = String(contentType || '').toLowerCase();
  if (type.includes('svg')) return true;
  const head = buf.subarray(0, Math.min(buf.length, 400)).toString('utf8');
  return head.includes('Drive image unavailable') || head.includes('<svg');
}

async function mapPool(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function runHttpStorm(fileIds) {
  const warnings = [];
  const results = await mapPool(fileIds, CONCURRENCY, async (fileId) => {
    const t0 = Date.now();
    try {
      const response = await fetch(`${API}/assets/drive-file?id=${encodeURIComponent(fileId)}`, {
        signal: AbortSignal.timeout(60000),
      });
      const buf = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || '';
      const fallback = looksLikeFallbackSvg(buf, contentType);
      return {
        fileId,
        ok: response.ok && !fallback && buf.length > 1500,
        fallback,
        status: response.status,
        bytes: buf.length,
        ms: Date.now() - t0,
        error: null,
      };
    } catch (error) {
      const message = String(error?.message || error);
      if (/terminated|aborted|timeout|econnreset/i.test(message)) warnings.push({ fileId, message });
      return {
        fileId,
        ok: false,
        fallback: true,
        status: 0,
        bytes: 0,
        ms: Date.now() - t0,
        error: message,
      };
    }
  });
  return { results, warnings };
}

function runModuleStorm(fileIds) {
  const runner = join(OUT_DIR, '_module-storm-runner.cjs');
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(runner, `
const path = require('path');
const fs = require('fs');
process.chdir(${JSON.stringify(join(ROOT, 'backend'))});
require('ts-node/register/transpile-only');
const {
  configureDriveFileDiskCache,
  fetchDriveFileAsset,
} = require(${JSON.stringify(join(ROOT, 'backend/src/modules/guide/sync/drive-images.ts'))});

const cacheDir = ${JSON.stringify(CACHE_DIR)};
const fileIds = ${JSON.stringify(fileIds)};
const concurrency = ${CONCURRENCY};
configureDriveFileDiskCache(cacheDir);

function looksLikeFallback(asset) {
  if (!asset?.body?.length) return true;
  if (asset.isFallback) return true;
  const type = String(asset.contentType || '').toLowerCase();
  if (type.includes('svg')) return true;
  const head = asset.body.subarray(0, Math.min(asset.body.length, 400)).toString('utf8');
  return head.includes('Drive image unavailable');
}

async function mapPool(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

(async () => {
  const stderrChunks = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    const line = args.map(String).join(' ');
    stderrChunks.push(line);
    originalWarn(...args);
  };
  const results = await mapPool(fileIds, concurrency, async (fileId) => {
    const t0 = Date.now();
    try {
      const asset = await fetchDriveFileAsset(fileId);
      const fallback = looksLikeFallback(asset);
      return {
        fileId,
        ok: !fallback && asset.body.length > 1500,
        fallback,
        status: 200,
        bytes: asset.body.length,
        ms: Date.now() - t0,
        error: null,
      };
    } catch (error) {
      return {
        fileId,
        ok: false,
        fallback: true,
        status: 0,
        bytes: 0,
        ms: Date.now() - t0,
        error: String(error && error.message || error),
      };
    }
  });
  console.warn = originalWarn;
  const payload = {
    results,
    warnings: stderrChunks.filter((line) => /terminated|ngat ket noi|Doc noi dung anh loi/i.test(line)),
  };
  fs.writeFileSync(${JSON.stringify(join(OUT_DIR, '_module-storm-result.json'))}, JSON.stringify(payload));
  const ok = results.filter((r) => r.ok).length;
  const fallback = results.filter((r) => r.fallback).length;
  console.log(JSON.stringify({ ok, fallback, total: results.length, warnLines: payload.warnings.length }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
`, 'utf8');

  const proc = spawnSync(process.execPath, [runner], {
    cwd: join(ROOT, 'backend'),
    encoding: 'utf8',
    env: {
      ...process.env,
      DALAT_DRIVE_FILE_CACHE_DIR: CACHE_DIR,
      DALAT_DRIVE_FETCH_MAX_CONCURRENCY: process.env.DALAT_DRIVE_FETCH_MAX_CONCURRENCY || '3',
    },
    timeout: 15 * 60 * 1000,
    maxBuffer: 20 * 1024 * 1024,
  });

  if (proc.status !== 0) {
    throw new Error(`module storm failed: ${proc.stderr || proc.stdout || proc.error}`);
  }
  const resultPath = join(OUT_DIR, '_module-storm-result.json');
  if (!existsSync(resultPath)) {
    throw new Error(`Không có result file. stdout=${proc.stdout}\nstderr=${proc.stderr}`);
  }
  return JSON.parse(readFileSync(resultPath, 'utf8'));
}

function summarize(label, payload, binsBefore, binsAfter) {
  const results = payload.results || [];
  const ok = results.filter((r) => r.ok).length;
  const fallback = results.filter((r) => r.fallback).length;
  const errors = results.filter((r) => r.error).length;
  const terminatedLike = [
    ...(payload.warnings || []),
    ...results.filter((r) => /terminated|aborted|econnreset/i.test(String(r.error || ''))).map((r) => r.error),
  ];
  const avgMs = results.length
    ? Math.round(results.reduce((sum, r) => sum + (r.ms || 0), 0) / results.length)
    : 0;
  const okRate = results.length ? ok / results.length : 0;
  // Pass nếu >=70% ảnh thật (Drive công khai không 100%) và không storm terminated hàng loạt ở client.
  const clientTerminated = results.filter((r) => /terminated/i.test(String(r.error || ''))).length;
  const pass = okRate >= 0.7 && clientTerminated === 0 && fallback <= Math.ceil(results.length * 0.35);
  return {
    label,
    total: results.length,
    ok,
    fallback,
    errors,
    okRate: Number(okRate.toFixed(3)),
    avgMs,
    clientTerminated,
    warnLines: (payload.warnings || []).length,
    warnSample: (payload.warnings || []).slice(0, 5),
    binsBefore,
    binsAfter,
    pass,
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  resetCacheDir();
  const allIds = collectFileIds();
  const sampleIds = allIds.slice(0, SAMPLE);
  console.log('=== DRIVE TERMINATED SIM (máy mới) ===');
  console.log(JSON.stringify({
    mode: TEST_MODE,
    cacheDir: CACHE_DIR,
    sample: sampleIds.length,
    concurrency: CONCURRENCY,
    rounds: ROUNDS,
    pool: allIds.length,
  }, null, 2));

  const roundSummaries = [];
  for (let round = 1; round <= ROUNDS; round += 1) {
    // Round 1: cache trống. Round 2+: cache đã có một phần (giống xuất sau khi warm một ít).
    if (round === 1) resetCacheDir();
    const binsBefore = countBins();
    console.log(`\n[round ${round}] bins=${binsBefore} — storm ${sampleIds.length} ids x concurrency=${CONCURRENCY}`);
    const t0 = Date.now();
    const payload = TEST_MODE === 'http'
      ? await runHttpStorm(sampleIds)
      : runModuleStorm(sampleIds);
    const binsAfter = countBins();
    const summary = summarize(`round${round}`, payload, binsBefore, binsAfter);
    summary.durationSec = Number(((Date.now() - t0) / 1000).toFixed(1));
    roundSummaries.push(summary);
    console.log('[round summary]', JSON.stringify(summary, null, 2));
    await sleep(500);
  }

  const pass = roundSummaries.every((s) => s.pass);
  const report = {
    testedAt: new Date().toISOString(),
    simulation: 'other-machine-empty-cache-drive-storm',
    mode: TEST_MODE,
    cacheDir: CACHE_DIR,
    concurrency: CONCURRENCY,
    sample: sampleIds.length,
    rounds: roundSummaries,
    ok: pass,
  };
  writeFileSync(join(OUT_DIR, 'terminated-sim-report.json'), JSON.stringify(report, null, 2));
  console.log('\n=== TỔNG KẾT ===');
  console.log(JSON.stringify({
    ok: pass,
    rounds: roundSummaries.map((s) => ({
      label: s.label,
      okRate: s.okRate,
      fallback: s.fallback,
      clientTerminated: s.clientTerminated,
      warnLines: s.warnLines,
      binsAfter: s.binsAfter,
      pass: s.pass,
    })),
    out: join(OUT_DIR, 'terminated-sim-report.json'),
  }, null, 2));
  process.exit(pass ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
