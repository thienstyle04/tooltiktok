/**
 * Test: bat tool nhieu lan — anh Drive tai lai hay chi warm 1 lan (skip neu da cache)?
 *
 * Chay (tu root, khong can server san):
 *   node backend/src/modules/guide/tools/test-startup-reload-vs-cache.mjs
 *
 * Env:
 *   ROUNDS=2
 *   BOOT_TIMEOUT_MS=180000
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../../../..');
const OUT_DIR = join(__dirname, 'export-quality-test-output', 'startup-reload');
const CACHE_DIR = process.env.DALAT_DRIVE_FILE_CACHE_DIR
  || join(ROOT, 'backend', 'data', 'drive-file-cache');
const API = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const FRONTEND = process.env.FRONTEND_URL || 'http://127.0.0.1:3001';
const ROUNDS = Math.max(2, Number(process.env.ROUNDS || 2));
const BOOT_TIMEOUT_MS = Math.max(60000, Number(process.env.BOOT_TIMEOUT_MS || 180000));
const BACKEND_PORT = 3000;
const FRONTEND_PORT = 3001;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function countCacheBins(dir) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((name) => name.endsWith('.bin')).length;
}

function waitPortFree(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise(async (resolve, reject) => {
    while (Date.now() < deadline) {
      const free = await new Promise((res) => {
        const sock = createConnection({ host: '127.0.0.1', port }, () => {
          sock.destroy();
          res(false);
        });
        sock.on('error', () => res(true));
      });
      if (free) return resolve(true);
      await sleep(500);
    }
    reject(new Error(`Port ${port} van dang mo`));
  });
}

async function killPort(port) {
  try {
    const { execFileSync } = await import('node:child_process');
    if (process.platform === 'win32') {
      const out = execFileSync('cmd.exe', ['/c', `netstat -ano | findstr :${port} | findstr LISTENING`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const pids = [...new Set(
        out.split(/\r?\n/)
          .map((line) => line.trim().split(/\s+/).pop())
          .filter((pid) => /^\d+$/.test(pid) && pid !== '0'),
      )];
      for (const pid of pids) {
        try {
          execFileSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' });
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // nothing listening
  }
  await waitPortFree(port).catch(() => null);
}

function classifyWarmLogs(text) {
  const skip = /\[drive-cache\] Đủ cache disk \((\d+)\/(\d+)\), bỏ qua warm/i.exec(text)
    || /\[drive-cache\] Du cache disk \((\d+)\/(\d+)\), bo qua warm/i.exec(text);
  const start = /\[drive-cache\] Bắt đầu tự tạo cache: cần tải (\d+)\/(\d+)/i.exec(text)
    || /\[drive-cache\] Bat dau tu tao cache: can tai (\d+)\/(\d+)/i.exec(text);
  const done = /\[drive-cache\] Xong warm: ok=(\d+) fail=(\d+) skip=(\d+) total=(\d+)/i.exec(text);
  const warmupReady = /\[warmup\] Sẵn sàng phục vụ \/api\/guide-data \(mất (\d+)ms\)/i.exec(text)
    || /\[warmup\] San sang phuc vu \/api\/guide-data \(mat (\d+)ms\)/i.exec(text);
  return {
    skippedAll: Boolean(skip),
    skippedCount: skip ? Number(skip[1]) : null,
    totalIds: skip ? Number(skip[2]) : (start ? Number(start[2]) : null),
    pendingDownload: start ? Number(start[1]) : (skip ? 0 : null),
    warmDone: done
      ? { ok: Number(done[1]), fail: Number(done[2]), skip: Number(done[3]), total: Number(done[4]) }
      : null,
    sheetWarmMs: warmupReady ? Number(warmupReady[1]) : null,
    rawHits: {
      skipLine: skip?.[0] || null,
      startLine: start?.[0] || null,
      doneLine: done?.[0] || null,
    },
  };
}

async function waitHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const [fe, be] = await Promise.all([
        fetch(FRONTEND, { signal: AbortSignal.timeout(4000) }),
        fetch(`${API}/api/health`, { signal: AbortSignal.timeout(4000) }),
      ]);
      if (fe.ok && be.ok) return true;
    } catch {
      // retry
    }
    await sleep(1500);
  }
  return false;
}

async function timeGuideData() {
  const t0 = Date.now();
  const response = await fetch(`${API}/api/guide-data`, { signal: AbortSignal.timeout(180000) });
  const ms = Date.now() - t0;
  const ok = response.ok;
  let decks = 0;
  let images = 0;
  if (ok) {
    const data = await response.json();
    decks = (data?.decks || []).length;
    images = data?.source?.imageCount || 0;
  }
  return { ok, ms, decks, images, status: response.status };
}

async function bootRound(round) {
  const logs = [];
  const pushLog = (chunk) => {
    const text = String(chunk || '');
    if (!text) return;
    logs.push(text);
    process.stdout.write(`[r${round}] ${text}`);
  };

  await killPort(BACKEND_PORT);
  await killPort(FRONTEND_PORT);

  const binsBefore = countCacheBins(CACHE_DIR);
  const child = spawn(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'dev'],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        DALAT_OPEN_BROWSER: '0',
        FORCE_COLOR: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    },
  );

  child.stdout.on('data', pushLog);
  child.stderr.on('data', pushLog);

  const healthy = await waitHealth(BOOT_TIMEOUT_MS);
  // Cho warm Drive log kip in (skip nhanh; neu tai se thay start)
  await sleep(8000);
  const joined = logs.join('');
  const warm = classifyWarmLogs(joined);
  const binsAfterBoot = countCacheBins(CACHE_DIR);

  const guide1 = healthy ? await timeGuideData() : { ok: false, ms: 0, decks: 0, images: 0, status: 0 };
  const guide2 = healthy ? await timeGuideData() : { ok: false, ms: 0, decks: 0, images: 0, status: 0 };

  // dung process
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    // ignore
  }
  await sleep(2500);
  await killPort(BACKEND_PORT);
  await killPort(FRONTEND_PORT);

  return {
    round,
    healthy,
    binsBefore,
    binsAfterBoot,
    binsDelta: binsAfterBoot - binsBefore,
    warm,
    guideFirst: guide1,
    guideSecondSameProcess: guide2,
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const report = {
    ok: true,
    failures: [],
    cacheDir: CACHE_DIR,
    rounds: [],
  };

  console.log(`[startup-reload] cache bins hien tai: ${countCacheBins(CACHE_DIR)}`);
  console.log(`[startup-reload] chay ${ROUNDS} lan bat tool...`);

  for (let i = 1; i <= ROUNDS; i += 1) {
    console.log(`\n======== ROUND ${i}/${ROUNDS} ========`);
    const result = await bootRound(i);
    report.rounds.push(result);

    if (!result.healthy) {
      report.ok = false;
      report.failures.push(`round ${i}: server khong healthy`);
    }
    if (!result.guideFirst.ok || !result.guideSecondSameProcess.ok) {
      report.ok = false;
      report.failures.push(`round ${i}: guide-data fail`);
    }

    // Lan sau (va lan 1 neu cache da day): expect skip warm, khong tai hang loat
    if (result.warm.pendingDownload != null && result.warm.pendingDownload > 50 && result.binsBefore > 1000) {
      report.ok = false;
      report.failures.push(
        `round ${i}: cache da co ${result.binsBefore} file nhung van tai ${result.warm.pendingDownload} anh`,
      );
    }
    if (i >= 2 && result.binsDelta > 50) {
      report.ok = false;
      report.failures.push(`round ${i}: bins tang ${result.binsDelta} — nghi tai lai hang loat`);
    }
    if (i >= 2 && result.warm.skippedAll !== true && result.binsBefore > 1000) {
      // soft: neu khong bat duoc log skip nhung bins khong tang thi van OK
      if (result.binsDelta > 20) {
        report.ok = false;
        report.failures.push(`round ${i}: khong thay skip warm va bins van tang`);
      }
    }
  }

  // Tong ket: lan 2 khong tai lai neu lan 1 da skip/day cache
  const r1 = report.rounds[0];
  const r2 = report.rounds[1];
  report.verdict = {
    sheetWarmEachBoot: report.rounds.every((r) => r.warm.sheetWarmMs != null),
    driveCacheSkippedOnLaterBoots: Boolean(r2?.warm?.skippedAll) || (r2 && r2.binsDelta <= 5 && r2.binsBefore > 1000),
    guideDataStableSameProcess: Boolean(
      r1?.guideFirst?.ok
      && r1?.guideSecondSameProcess?.ok
      && r1.guideSecondSameProcess.ms <= Math.max(r1.guideFirst.ms * 1.5, r1.guideFirst.ms + 5000),
    ),
  };

  if (!report.verdict.driveCacheSkippedOnLaterBoots && r2?.binsBefore > 1000) {
    report.ok = false;
    report.failures.push('Lan bat thu 2 van co ve tai lai Drive cache');
  }

  const outPath = join(OUT_DIR, `startup-reload-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('\n======== REPORT ========');
  console.log(JSON.stringify(report, null, 2));
  console.log(`[startup-reload] wrote ${outPath}`);
  process.exit(report.ok ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
