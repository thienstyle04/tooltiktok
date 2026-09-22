const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const JSZip = require('../frontend/node_modules/jszip');
const sharp = require('../backend/node_modules/sharp');
(async () => {
  const state = await (await fetch('http://127.0.0.1:3210/api/automation')).json();
  const run = state.runs.find(r => r.scheduleName === 'AUDIT configured proxy ZIP');
  assert.equal(run.status, 'completed');
  const archivePath = path.resolve(run.outputPath);
  const allowed = path.resolve(__dirname, '../outputs/studio-audit-runtime/scheduled-export');
  assert.ok(archivePath.startsWith(allowed + path.sep));
  const zip = await JSZip.loadAsync(fs.readFileSync(archivePath), { checkCRC32: true });
  const images = [], captions = [], workbooks = [];
  for (const [name, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    if (name.endsWith('.png')) {
      const data = await file.async('nodebuffer');
      const { info } = await sharp(data).raw().toBuffer({ resolveWithObject: true });
      assert.equal(info.width, 1080); assert.equal(info.height, 1440);
      images.push({ name, width: info.width, height: info.height });
    } else if (name.endsWith('.xlsx')) {
      await JSZip.loadAsync(await file.async('nodebuffer'), { checkCRC32: true }); workbooks.push(name);
    } else if (name.endsWith('.txt') && /caption/i.test(name)) {
      assert.ok((await file.async('string')).trim()); captions.push(name);
    }
  }
  assert.equal(images.length, 36); assert.equal(workbooks.length, 3); assert.equal(captions.length, 3);
  const evidence = { run, archivePath, bytes: fs.statSync(archivePath).size, crc: true, images, workbooks, captions };
  fs.writeFileSync(path.join(allowed, 'verification.json'), JSON.stringify(evidence, null, 2));
  console.log('PASS scheduled real ZIP: 3 lists, 36 decoded PNGs 1080x1440, 3 captions, 3 Excel files, CRC valid');
})().catch(e => { console.error(e); process.exitCode = 1; });
