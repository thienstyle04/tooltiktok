#!/usr/bin/env node
// Run on the Windows release machine after committing and testing the source.
// The public ZIP is made from HEAD, never from backend/data or the dirty worktree.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const JSZip = require('../frontend/node_modules/jszip');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs', 'update-release');
const privateKeyPath = process.env.DALAT_RELEASE_SIGNING_KEY
  || path.join(process.env.LOCALAPPDATA || '', 'DalatStudioReleaseSigning', 'private.pem');

function git(...args) { return execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 }); }
function included(file) {
  if (file.startsWith('backend/src/modules/guide/tools/')) return false;
  if (/^(?:backend\/data\/|backend\/node_modules\/|backend\/reports\/|backend\/test\/|frontend\/node_modules\/|frontend\/\.next\/|frontend\/tools\/|\.githooks\/|\.cursor\/|docs\/)/.test(file)) return false;
  if (/\/(?:\.env|\.env\..+)$/.test(file) && !file.endsWith('.env.example')) return false;
  return /^(?:backend\/(?:src\/|\.env\.example$|package(?:-lock)?\.json$|tsconfig(?:\.build)?\.json$)|frontend\/(?:app\/|components\/|lib\/|public\/|next\.config\.js$|package(?:-lock)?\.json$)|scripts\/|start\.bat$|VERSION$|package(?:-lock)?\.json$|README\.md$)/.test(file);
}

async function main() {
  if (process.platform !== 'win32') throw Error('Gói cập nhật Windows phải được đóng gói/kiểm thử trên Windows.');
  if (!fs.existsSync(privateKeyPath)) throw Error('Chưa có khóa ký phát hành ngoài repository.');
  const commit = git('rev-parse', 'HEAD').toString('utf8').trim();
  const rawVersion = git('show', 'HEAD:VERSION').toString('utf8').trim();
  const parts = rawVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!parts) throw Error('VERSION trong commit không hợp lệ.');
  const version = `${Number(parts[1])}.${Number(parts[2])}.${String(Number(parts[3])).padStart(2, '0')}`;
  // The package is assembled strictly from HEAD. Untracked local scripts are
  // never packaged, so they must not force users to stage or delete their work.
  const changedCode = git('status', '--porcelain', '--untracked-files=no').toString('utf8').split(/\r?\n/).filter(Boolean)
    .map(line => line.slice(3).replace(/\\/g, '/')).filter(included);
  if (changedCode.length) throw Error(`Chưa commit code của bản phát hành: ${changedCode.slice(0, 8).join(', ')}`);
  const files = git('ls-tree', '-r', '--name-only', 'HEAD').toString('utf8').split(/\r?\n/).filter(included);
  if (!files.includes('scripts/update-client.js') || !files.includes('scripts/update-protocol.js')) throw Error('Commit chưa có trình cập nhật.');
  const zip = new JSZip();
  for (const file of files) {
    const source = git('show', `HEAD:${file}`);
    // cmd.exe needs CRLF in a batch extracted from a Git LF-normalized blob.
    const packaged = file.endsWith('.bat')
      ? Buffer.from(source.toString('utf8').replace(/\r?\n/g, '\r\n'))
      : source;
    zip.file(file, packaged, { binary: true });
  }
  zip.file('build-manifest.json', JSON.stringify({ version, commit, userDataIncluded: false }));
  const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const archiveName = `dalat-studio-${version}-${commit.slice(0, 8)}.zip`;
  const artifact = { path: `releases/${archiveName}`, sha256: crypto.createHash('sha256').update(archive).digest('hex'), size: archive.length };
  const notes = process.argv.slice(2).filter(Boolean);
  if (!notes.length) throw Error('Cần ghi chú phát hành làm tham số, tối đa 20 dòng.');
  const payload = Buffer.from(JSON.stringify({ schema: 1, channel: 'stable', platform: 'win32-x64', version, commit, releasedAt: new Date().toISOString(), notes, artifact }));
  const signature = crypto.sign(null, payload, fs.readFileSync(privateKeyPath)).toString('base64');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, archiveName), archive, { flag: 'wx' });
  fs.writeFileSync(path.join(output, 'latest.json'), JSON.stringify({ payload: payload.toString('base64'), signature }, null, 2));
  console.log(`Release ${version} ${commit.slice(0, 8)}: ${archiveName} (${archive.length} bytes, SHA-256 ${artifact.sha256})`);
}
main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
