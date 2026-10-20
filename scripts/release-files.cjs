// Danh sách file thuộc bản phát hành / gói bàn giao sạch. Dùng chung cho
// build-update-release.js, pack-migration.cjs --clean và check-no-source-links.cjs.
const crypto = require('node:crypto');

function included(file) {
  if (file.startsWith('backend/src/modules/guide/tools/')) return false;
  if (/^(?:backend\/data\/|backend\/node_modules\/|backend\/reports\/|backend\/test\/|frontend\/node_modules\/|frontend\/\.next\/|frontend\/tools\/|\.githooks\/|\.cursor\/|docs\/)/.test(file)) return false;
  if (/\/(?:\.env|\.env\..+)$/.test(file) && !file.endsWith('.env.example')) return false;
  return /^(?:backend\/(?:src\/|\.env\.example$|package(?:-lock)?\.json$|tsconfig(?:\.build)?\.json$)|frontend\/(?:app\/|components\/|lib\/|public\/|next\.config\.js$|package(?:-lock)?\.json$)|scripts\/|start\.bat$|VERSION$|package(?:-lock)?\.json$|README\.md$)/.test(file);
}

// Link Google Sheet/Docs/Drive thư mục của từng máy không được nằm trong code phát hành.
const LINK_PATTERNS = [
  { name: 'Google Sheet/Docs', re: /docs\.google\.com\/(?:spreadsheets|document|presentation|forms)\/d\/(?!e\/)[A-Za-z0-9_-]{25,}/g },
  { name: 'Google Drive', re: /drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders|file\/d)\/[A-Za-z0-9_-]{25,}/g },
  { name: 'mã Sheet/Doc', re: /\b[A-Z0-9_]*(?:SHEET|DOC|FOLDER|SPREADSHEET)_ID\s*[:=]\s*['"`][A-Za-z0-9_-]{25,}['"`]/g },
];
// SHA-256 của mã các Sheet/Doc nội bộ từng nằm trong code (chỉ lưu dấu băm).
const KNOWN_ID_HASHES = new Set([
  'f97e8402926eecbf8cec0ce5ff3a0c974896af9e04a1083bdb2d2864c50792a8',
  '02d105cc6f285790f3de4a2de3454d6bb8a36a570c9e58fcce2ebc196daa53bd',
  'ff65c79b0671af1673ec39328d6fb128a2776dfd12f5bfae3122fcb83ac9ec5e',
  '4b9a406c8486e014de206f2b72003310e3916993015536108c282fc8174febd9',
  'ddaeaa1eb0a576441f56df6de8a217c74d3933433e7dda698b2d16b9f4fdb7c2',
  '591ea27e0c5984c44159226e03d77b9ac1863f03b845958e19e8e877bf16b0e8',
  '4fe90822641568bc755300aaed01d7016bec956adc2fec62049bbca60b777366',
]);

function findSourceLinks(file, content) {
  const text = Buffer.isBuffer(content) ? content.toString('utf8') : String(content);
  const hits = [];
  for (const { name, re } of LINK_PATTERNS) {
    re.lastIndex = 0;
    for (const match of text.matchAll(re)) hits.push({ file, kind: name, line: text.slice(0, match.index).split('\n').length });
  }
  for (const match of text.matchAll(/[A-Za-z0-9_-]{28,48}/g)) {
    if (KNOWN_ID_HASHES.has(crypto.createHash('sha256').update(match[0]).digest('hex'))) {
      hits.push({ file, kind: 'mã Sheet/Doc nội bộ', line: text.slice(0, match.index).split('\n').length });
    }
  }
  return hits;
}

module.exports = { included, findSourceLinks };
