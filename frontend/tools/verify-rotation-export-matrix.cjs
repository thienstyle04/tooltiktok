// Reopen all isolated archives, including the corrected legacy partner-folder
// collision regression. No application/user store is accessed.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.resolve(__dirname, '../../backend/package.json'));
const XLSX = backendRequire('xlsx'), JSZip = require('jszip');
async function main() {
  const [matrixRoot, regressionRoot] = process.argv.slice(2);
  assert.ok(matrixRoot && regressionRoot, 'Pass the original matrix root and corrected regression root');
  const report = [];
  for (const source of ['dalat', 'dalat-test', 'greenland', 'dalat-threads']) {
    const full = JSON.parse(fs.readFileSync(path.join(matrixRoot, source, 'generation.json')));
    const corrected = source === 'dalat-threads' ? full : JSON.parse(fs.readFileSync(path.join(regressionRoot, source, 'generation.json')));
    let images = 0, lists = 0, workbooks = 0;
    for (const deckId of [...new Set(full.lists.map(entry => entry.deckId))]) {
      const regression = deckId === 'spotlight-partner';
      const fixture = regression ? corrected : full;
      const entries = fixture.lists.filter(entry => entry.deckId === deckId);
      const archive = path.join(regression ? regressionRoot : matrixRoot, source, regression ? 'exports-selected' : 'exports', deckId + '.zip');
      const zip = await JSZip.loadAsync(fs.readFileSync(archive), { checkCRC32: true });
      const files = Object.values(zip.files).filter(file => !file.dir);
      const xlsx = files.filter(file => file.name.endsWith('.xlsx'));
      assert.equal(xlsx.length, 4, `${source}/${deckId}: each list must retain its own XLSX, not overwrite another list`);
      const actual = [];
      for (const file of xlsx) {
        const workbook = XLSX.read(await file.async('nodebuffer'), { type: 'buffer' });
        const names = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }).flat().filter(Boolean);
        actual.push(JSON.stringify(names.sort()));
      }
      assert.deepEqual(actual.sort(), entries.map(entry => JSON.stringify([...entry.expectedPartnerNames].sort())).sort(), `${source}/${deckId}: actual names`);
      const packageImages = ['threads-food-local', 'threads-cafe-local', 'threads-mix-local'].includes(deckId);
      const expectedImages = entries.reduce((sum, entry) => sum + (deckId === 'threads-mix-text' ? 0 : packageImages ? 6 : entry.list.pages.length), 0);
      const actualImages = files.filter(file => /\.(png|jpg|webp)$/i.test(file.name)).length;
      assert.equal(actualImages, expectedImages, `${source}/${deckId}: no image filename/folder collision`);
      lists += entries.length; workbooks += xlsx.length; images += actualImages;
    }
    report.push({ source, templates: new Set(full.lists.map(entry => entry.deckId)).size, lists, workbooks, images });
  }
  assert.equal(report.reduce((sum, entry) => sum + entry.lists, 0), 372);
  const target = path.join(matrixRoot, 'final-export-matrix.json');
  fs.writeFileSync(target, JSON.stringify({ result: 'PASS', matrixRoot, regressionRoot, report }, null, 2));
  console.log('PASS 372 independent XLSX / exact partners / complete image counts / CRC ZIP; REPORT=' + target);
  console.log(JSON.stringify(report));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
