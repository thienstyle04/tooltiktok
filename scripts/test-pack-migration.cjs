#!/usr/bin/env node
// Gói chuyển máy đầu-cuối, toàn bộ trong TEMP (không ghi dữ liệu thật):
// dựng gói → kiểm tra nội dung → cài như máy mới (bootstrap thật, LOCALAPPDATA giả)
// → dữ liệu người dùng giống hệt bản gốc → backend đọc được list/nguồn/ảnh.
// Chạy tay (dùng dữ liệu thật của máy này): node scripts/test-pack-migration.cjs
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const dataDir = fs.realpathSync(fs.existsSync(path.join(root, 'shared', 'data')) ? path.join(root, 'shared', 'data') : path.join(root, 'backend', 'data'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const USER_FILE = /^(generated-caption-lists\..+|page-text-overrides\..+|used-inventory.*|automation-schedules|hook-sources\..+|premade-hooks|custom-destinations|night-sync|.*-hooks)\.json$|^workbook-cache\..+\.xlsx$/;

const pack = spawnSync(process.execPath, [path.join(__dirname, 'pack-migration.cjs'), '--staging-only', '--with-image-cache', '--link-cache', '--allow-running'], { encoding: 'utf8' });
assert.equal(pack.status, 0, pack.stdout + pack.stderr);
const staging = (pack.stdout.match(/^STAGING=(.+)$/m) || [])[1].trim();
const fakeLocal = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-migration-local-'));
const install = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pack-migration-install-')), path.basename(root));
try {
  // ── 1. Package contents ──
  for (const absent of ['shared', 'releases', 'node_modules', '.git', 'outputs', path.join('backend', 'node_modules'), path.join('frontend', 'node_modules'), path.join('backend', '.env'), path.join('backend', 'data', 'photo-preset-cache')]) {
    assert.ok(!fs.existsSync(path.join(staging, absent)), `Package must not contain ${absent}`);
  }
  const stagedData = path.join(staging, 'backend', 'data');
  assert.ok(!(fs.lstatSync(stagedData).isSymbolicLink()), 'backend\\data is a real folder, not a junction');
  const userFiles = fs.readdirSync(dataDir).filter(name => USER_FILE.test(name));
  assert.ok(userFiles.length >= 5, `user data present on this machine (${userFiles})`);
  for (const name of userFiles) assert.equal(hash(path.join(stagedData, name)), hash(path.join(dataDir, name)), `user file identical in package: ${name}`);
  if (fs.existsSync(path.join(dataDir, 'source-snapshots'))) assert.ok(fs.existsSync(path.join(stagedData, 'source-snapshots')), 'workbook snapshots travel');
  const manifest = JSON.parse(fs.readFileSync(path.join(staging, 'build-manifest.json'), 'utf8'));
  assert.equal(manifest.version, fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim());
  assert.equal(manifest.userDataIncluded, true);
  const cachedImages = fs.readdirSync(path.join(stagedData, 'drive-file-cache')).filter(n => n.endsWith('.bin')).length;
  assert.ok(cachedImages > 100, `image cache travels (${cachedImages} images)`);
  const templates = fs.existsSync(path.join(staging, 'migration', 'local-templates')) ? fs.readdirSync(path.join(staging, 'migration', 'local-templates')) : [];
  for (const name of templates) assert.ok(!fs.existsSync(path.join(staging, 'migration', 'local-templates', name, 'test-output')), 'template test-output left behind');
  assert.ok(fs.readFileSync(path.join(staging, 'HUONG_DAN_MAY_MOI.txt'), 'utf8').includes('start.bat'));

  // ── 2. Install as a new machine (real bootstrap, isolated) ──
  fs.renameSync(staging, install);
  const boot = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(install, 'scripts', 'bootstrap-updates.ps1'),
    '-InstallRoot', install, '-PackageRoot', install, '-IsolatedTest'], { encoding: 'utf8', env: { ...process.env, LOCALAPPDATA: fakeLocal } });
  assert.equal(boot.status, 0, boot.stdout + boot.stderr);
  const current = JSON.parse(fs.readFileSync(path.join(install, 'shared', 'current.json'), 'utf8'));
  assert.equal(current.release, `${current.version}-${manifest.commit ? manifest.commit.slice(0, 8) : '00000000'}`, 'release named after the packaged commit');
  assert.ok(fs.existsSync(path.join(install, 'releases', current.release, 'scripts', 'update-client.js')));
  assert.ok(!fs.existsSync(path.join(install, 'releases', current.release, 'migration')), 'migration payload is not part of the release');
  const installedData = path.join(install, 'shared', 'data');
  for (const name of userFiles) assert.equal(hash(path.join(installedData, name)), hash(path.join(dataDir, name)), `installed user file identical: ${name}`);
  assert.ok(fs.lstatSync(path.join(install, 'backend', 'data')).isSymbolicLink() || (fs.statSync(path.join(install, 'backend', 'data')).isDirectory()), 'backend\\data points to shared\\data');
  for (const name of templates) assert.ok(fs.existsSync(path.join(fakeLocal, 'DalatTikTokCarouselTool', 'local-templates', name, 'template.json')), `local template installed: ${name}`);

  // ── 3. The backend reads the moved data (lists, sources, photos) ──
  const probe = `
    process.env.DALAT_DATA_DIR=${JSON.stringify(installedData)};process.env.DALAT_DRIVE_FILE_CACHE_DIR=${JSON.stringify(path.join(installedData, 'drive-file-cache'))};
    process.env.DALAT_AUTO_SYNC_SHEET='false';process.env.DALAT_AUTO_WARM_DRIVE_CACHE='false';process.env.DALAT_SESSION_ID='pack-migration';
    process.env.DALAT_LOCAL_TEMPLATES_DIR=${JSON.stringify(path.join(fakeLocal, 'DalatTikTokCarouselTool', 'local-templates'))};
    globalThis.fetch=async()=>{throw Error('offline');};
    (async()=>{const {NestFactory}=require('@nestjs/core');const {AppModule}=require('./src/app.module');const {GuideService}=require('./src/modules/guide/guide.service');
      const app=await NestFactory.create(AppModule,{logger:false});await app.listen(0,'127.0.0.1');const s=app.get(GuideService);
      while(s.destinationDataLoading)await new Promise(r=>setTimeout(r,50));
      const lists=[...s.generatedListsByDeckId.values()].reduce((n,l)=>n+l.length,0);const st=s.getDriveCacheWarmStatus();const ds=await s.getDataset();
      console.log('PROBE '+JSON.stringify({active:s.activeDestinationId,lists,decks:ds.decks.length,ready:st.ready,imagesMissing:Boolean(st.imagesMissing),templates:ds.decks.filter(d=>d.localTemplate).map(d=>d.id)}));
      await app.close();})().catch(e=>{console.error(e);process.exit(1);});`;
  const backend = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', '-e', probe], { cwd: path.join(root, 'backend'), encoding: 'utf8', timeout: 600000 });
  const result = JSON.parse((backend.stdout.match(/^PROBE (.+)$/m) || [, 'null'])[1]);
  assert.ok(result, backend.stdout.slice(-1500) + backend.stderr.slice(-1500));
  const originalActive = JSON.parse(fs.readFileSync(path.join(dataDir, 'active-destination.json'), 'utf8')).id;
  assert.equal(result.active, originalActive, 'same active source as the old machine');
  assert.ok(result.decks > 0 && result.ready, 'catalog loads and is usable');
  assert.equal(result.imagesMissing, false, 'with the image cache, photos are present');
  console.log(`PASS pack-migration: ${userFiles.length} user files identical, ${cachedImages} images, templates [${templates.join(', ')}] installed, release ${current.release}; backend: source ${result.active}, ${result.lists} saved lists, ${result.decks} templates, photos present.`);
} finally {
  // Only the three folders this test created, each under TEMP with its own prefix.
  const tempRoot = fs.realpathSync(os.tmpdir());
  for (const dir of [path.dirname(staging), path.dirname(install), fakeLocal]) {
    const resolved = path.resolve(dir), name = path.basename(resolved);
    if (path.dirname(resolved).toLowerCase() !== tempRoot.toLowerCase()
      || !/^(dalat-migrate|pack-migration-install|pack-migration-local)-[A-Za-z0-9]+$/.test(name)) {
      console.error(`Từ chối xóa thư mục không phải của test: ${resolved}`);
      continue;
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
