#!/usr/bin/env node
// Gói bàn giao sạch đầu-cuối, toàn bộ trong TEMP (không đọc/ghi dữ liệu thật):
// dựng gói --clean → không dữ liệu/link/mẫu riêng/.env → cài như máy mới (bootstrap thật,
// LOCALAPPDATA giả) → backend của bản ĐÃ CÀI khởi động với 0 nguồn → thêm nguồn bằng link.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { scan, folderFiles } = require('./check-no-source-links.cjs');

const root = path.resolve(__dirname, '..');
const pack = spawnSync(process.execPath, [path.join(__dirname, 'pack-migration.cjs'), '--clean', '--staging-only'], { encoding: 'utf8' });
assert.equal(pack.status, 0, pack.stdout + pack.stderr);
const staging = (pack.stdout.match(/^STAGING=(.+)$/m) || [])[1].trim();
const fakeLocal = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-clean-local-'));
const install = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pack-clean-install-')), path.basename(root));
try {
  // ── 1. Nội dung gói: chỉ code phát hành ──
  for (const absent of ['shared', 'releases', 'migration', 'docs', '.git', 'node_modules', path.join('backend', '.env'), path.join('backend', 'resources'),
    path.join('backend', 'src', 'modules', 'guide', 'tools'), path.join('frontend', 'tools')]) {
    assert.ok(!fs.existsSync(path.join(staging, absent)), `Gói sạch không được chứa ${absent}`);
  }
  assert.deepEqual(fs.readdirSync(path.join(staging, 'backend', 'data')), [], 'backend\\data rỗng');
  const manifest = JSON.parse(fs.readFileSync(path.join(staging, 'build-manifest.json'), 'utf8'));
  assert.equal(manifest.userDataIncluded, false);
  assert.equal(manifest.clean, true);
  assert.deepEqual(scan(folderFiles(staging)), [], 'không có link Google Sheet/Docs/Drive');
  for (const file of ['start.bat', 'scripts/bootstrap-updates.ps1', 'backend/src/main.ts', 'frontend/components/FirstSourceSetup.js']) {
    assert.ok(fs.existsSync(path.join(staging, file)), `thiếu ${file}`);
  }
  assert.match(fs.readFileSync(path.join(staging, 'HUONG_DAN_MAY_MOI.txt'), 'utf8'), /Them nguon du lieu dau tien/);

  // ── 2. Cài như máy mới ──
  fs.renameSync(staging, install);
  const boot = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(install, 'scripts', 'bootstrap-updates.ps1'),
    '-InstallRoot', install, '-PackageRoot', install, '-IsolatedTest'], { encoding: 'utf8', env: { ...process.env, LOCALAPPDATA: fakeLocal } });
  assert.equal(boot.status, 0, boot.stdout + boot.stderr);
  const current = JSON.parse(fs.readFileSync(path.join(install, 'shared', 'current.json'), 'utf8'));
  const release = path.join(install, 'releases', current.release);
  assert.ok(fs.existsSync(path.join(release, 'backend', 'src', 'main.ts')));
  assert.ok(!fs.existsSync(path.join(fakeLocal, 'DalatTikTokCarouselTool', 'local-templates')), 'không cài mẫu riêng');
  const installedData = path.join(install, 'shared', 'data');

  // ── 3. Backend của bản đã cài: 0 nguồn, thêm nguồn bằng link Sheet ──
  const backendModules = path.join(root, 'backend', 'node_modules');
  const probe = `
    process.env.DALAT_DATA_DIR=${JSON.stringify(installedData)};process.env.DALAT_DRIVE_FILE_CACHE_DIR=${JSON.stringify(path.join(installedData, 'drive-file-cache'))};
    process.env.DALAT_AUTO_SYNC_SHEET='false';process.env.DALAT_AUTO_WARM_DRIVE_CACHE='false';process.env.DALAT_SESSION_ID='pack-clean';
    process.env.DALAT_LOCAL_TEMPLATES_DIR=${JSON.stringify(path.join(fakeLocal, 'DalatTikTokCarouselTool', 'local-templates'))};
    const XLSX=require('xlsx');const requests=[];
    const book=()=>{const wb=XLSX.utils.book_new();const rows=[['ten_quan','dia_chi','doi_tac']];for(let i=0;i<5;i++)rows.push(['Quán '+i,i+' Đường A','x']);XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Quan_an');return XLSX.write(wb,{type:'buffer',bookType:'xlsx'});};
    globalThis.fetch=async(u)=>{requests.push(String(u));if(/spreadsheets\\/d\\/fixture-clean-sheet-0001\\/export/.test(String(u)))return new Response(new Uint8Array(book()),{status:200});throw Error('offline '+u);};
    (async()=>{const {NestFactory}=require('@nestjs/core');const {AppModule}=require('./src/app.module');const {GuideService}=require('./src/modules/guide/guide.service');
      const app=await NestFactory.create(AppModule,{logger:false});await app.listen(0,'127.0.0.1');const s=app.get(GuideService);
      while(s.destinationDataLoading)await new Promise(r=>setTimeout(r,50));
      const before=s.getDestinations();const status=s.getDriveCacheWarmStatus();let dataset='';try{await s.getDataset();}catch(e){dataset=JSON.stringify(e.getResponse?e.getResponse():e.message);}
      const added=await s.addDestination({label:'Sài Gòn',sheetUrl:'https://docs.google.com/spreadsheets/d/fixture-clean-sheet-0001/edit',kind:'standard',dalatContent:false});
      console.log('PROBE '+JSON.stringify({code:require.resolve('./src/modules/guide/guide.service'),before,ready:status.ready,dataset,created:added.created,needsFirstSync:added.needsFirstSync,requests,links:require('fs').readFileSync(${JSON.stringify(path.join(installedData, 'source-links.json'))},'utf8')}));
      await app.close();})().catch(e=>{console.error(e);process.exit(1);});`;
  const backend = spawnSync(process.execPath, ['-r', path.join(backendModules, 'ts-node', 'register', 'transpile-only'), '-e', probe],
    { cwd: path.join(release, 'backend'), encoding: 'utf8', timeout: 300000, env: { ...process.env, NODE_PATH: backendModules, TS_NODE_PROJECT: path.join(release, 'backend', 'tsconfig.json') } });
  const result = JSON.parse((backend.stdout.match(/^PROBE (.+)$/m) || [, 'null'])[1]);
  assert.ok(result, backend.stdout.slice(-2000) + backend.stderr.slice(-2000));
  assert.ok(path.resolve(result.code).toLowerCase().startsWith(path.resolve(release).toLowerCase()), `chạy code của bản đã cài: ${result.code}`);
  assert.deepEqual(result.before, { active: null, destinations: [] }, 'máy mới không có nguồn nào');
  assert.equal(result.ready, true, 'không khóa giao diện bằng màn chờ ảnh');
  assert.match(result.dataset, /NO_SOURCE/);
  assert.deepEqual(JSON.parse(result.links).builtins, {}, 'không khôi phục link nào trên máy mới');
  assert.equal(result.needsFirstSync, true);
  assert.equal(result.created.kind, 'standard');
  assert.deepEqual(result.requests, ['https://docs.google.com/spreadsheets/d/fixture-clean-sheet-0001/export?format=xlsx'], 'chỉ tải đúng Sheet người dùng nhập');
  console.log(`PASS pack-clean: gói chỉ có code (không dữ liệu, link, mẫu riêng, .env); cài như máy mới → release ${current.release} chạy với 0 nguồn, thêm nguồn bằng link Sheet.`);
} finally {
  const tempRoot = fs.realpathSync(os.tmpdir());
  for (const dir of [path.dirname(staging), path.dirname(install), fakeLocal]) {
    const resolved = path.resolve(dir), name = path.basename(resolved);
    if (path.dirname(resolved).toLowerCase() !== tempRoot.toLowerCase()
      || !/^(dalat-migrate|pack-clean-install|pack-clean-local)-[A-Za-z0-9]+$/.test(name)) {
      console.error(`Từ chối xóa thư mục không phải của test: ${resolved}`);
      continue;
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
