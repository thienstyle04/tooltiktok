#!/usr/bin/env node
// Bản phát hành và gói bàn giao sạch không được chứa link Google Sheet/Docs/Drive.
// Link của từng máy nằm trong <data>/source-links.json và custom-destinations.json.
//   node scripts/check-no-source-links.cjs            quét file phát hành trong cây làm việc
//   node scripts/check-no-source-links.cjs <thư mục>  quét mọi file văn bản trong thư mục (gói đã dựng)
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { included, findSourceLinks } = require('./release-files.cjs');

const root = path.resolve(__dirname, '..');
const TEXT = /\.(?:[cm]?[jt]sx?|json|css|html?|md|txt|bat|ps1|cmd|ya?ml|env|example|svg)$/i;
const SKIP_DIRS = new Set(['node_modules', '.next', '.git']);

function releaseFiles() {
  const listed = execFileSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard'], { maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8').split(/\r?\n/).filter(Boolean);
  return listed.filter(included).filter(file => fs.existsSync(path.join(root, file))).map(file => ({ name: file, full: path.join(root, file) }));
}

function folderFiles(dir) {
  const files = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(full); } else if (entry.isFile() && (TEXT.test(entry.name) || !path.extname(entry.name))) {
        files.push({ name: path.relative(dir, full).replace(/\\/g, '/'), full });
      }
    }
  };
  walk(dir);
  return files;
}

function scan(files) {
  const hits = [];
  for (const file of files) {
    if (fs.statSync(file.full).size > 20 * 1024 * 1024) continue;
    hits.push(...findSourceLinks(file.name, fs.readFileSync(file.full)));
  }
  return hits;
}

if (require.main === module) {
  const target = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const files = target ? folderFiles(target) : releaseFiles();
  const hits = scan(files);
  if (hits.length) {
    console.error(`Có ${hits.length} link/mã Google trong ${target ? 'gói' : 'code phát hành'} (link phải nằm trong cấu hình của từng máy):`);
    for (const hit of hits.slice(0, 40)) console.error(`  ${hit.file}:${hit.line}  ${hit.kind}`);
    process.exit(1);
  }
  console.log(`PASS check-no-source-links: ${files.length} file, không có link Google Sheet/Docs/Drive.`);
}

module.exports = { scan, folderFiles, releaseFiles };
