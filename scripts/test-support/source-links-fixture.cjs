// Cấu hình nguồn GIẢ cho test: code không còn link Sheet/Doc, mỗi máy giữ link trong
// <data>/source-links.json. Runner gieo file này vào thư mục dữ liệu tạm của mỗi test
// để 4 nguồn dựng sẵn tồn tại như trên máy đang dùng (mã giả, không phải Sheet thật).
const fs = require('node:fs');
const path = require('node:path');

const SHEET_IDS = {
  dalat: 'fixture-dalat-sheet-0001',
  greenland: 'fixture-greenland-sheet-02',
  'dalat-test': 'fixture-dalat-test-sheet-3',
  'dalat-threads': 'fixture-dalat-threads-004',
};
const HOOK_DOC_IDS = { spotlight: 'fixture-spotlight-hook-doc', sections: 'fixture-sections-hook-doc' };
const sheet = id => `https://docs.google.com/spreadsheets/d/${id}`;

function sourceLinksFixture() {
  const builtins = {};
  for (const [source, id] of Object.entries(SHEET_IDS)) builtins[source] = { sheetUrl: `${sheet(id)}/edit`, exportUrl: `${sheet(id)}/export?format=xlsx` };
  return { version: 1, builtins, hookDocs: { ...HOOK_DOC_IDS }, createdAt: '2026-01-01T00:00:00.000Z', recoveredFrom: ['test-fixture'] };
}

function seedSourceLinks(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'source-links.json'), JSON.stringify(sourceLinksFixture(), null, 2));
}

module.exports = { SHEET_IDS, HOOK_DOC_IDS, sourceLinksFixture, seedSourceLinks };
