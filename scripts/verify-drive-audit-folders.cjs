// Supplement the read-only audit: open?id may point to a folder, not a file.
const fs = require('node:fs'), path = require('node:path');
const { get, check } = require('./audit-drive-links.cjs');
const out = path.resolve(__dirname, '../outputs/drive-audit');
const reportPath = path.join(out, 'report.json');
async function verify(entry) {
  if (['image_ok', 'folder_has_verified_image', 'folder_link_points_to_image'].includes(entry.status)) return entry;
  const response = await get(`https://drive.google.com/embeddedfolderview?id=${entry.id}#list`);
  const ids = [...new Set([...(response.text || '').matchAll(/\/file\/d\/([\w-]+)\/view/g)].map(m => m[1]))];
  if (!ids.length) {
    const fileCheck = entry.folder ? await check({ id: entry.id, folder: false, refs: [] }) : null;
    return { ...entry, status: fileCheck?.status === 'image_ok' ? 'folder_link_points_to_image' : entry.status, fileCheck,
      folderRecheck: { status: response.status, error: response.error } };
  }
  const children = [];
  for (const id of ids) {
    const result = await check({ id, folder: false, refs: [] });
    children.push({ id, status: result.status, attempts: result.attempts });
    if (result.status === 'image_ok') return { ...entry, folder: true, status: 'folder_has_verified_image', listedFiles: ids.length, children };
  }
  return { ...entry, folder: true, status: children.some(c => c.status === 'network_error') ? 'folder_image_check_inconclusive' : 'folder_files_no_downloadable_image', listedFiles: ids.length, children };
}
(async () => {
  while (!fs.existsSync(reportPath)) await new Promise(resolve => setTimeout(resolve, 5000));
  const previous = path.join(out, 'verified-report.json');
  const report = JSON.parse(fs.readFileSync(fs.existsSync(previous) ? previous : reportPath));
  const results = []; let index = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (index < report.results.length) {
      results.push(await verify(report.results[index++]));
      if (results.length % 25 === 0) {
        fs.writeFileSync(path.join(out, 'folder-progress.json'), JSON.stringify({ completed: results.length, total: report.results.length }));
        console.log('Verified', results.length);
      }
    }
  }));
  const counts = {};
  for (const result of results) counts[result.status] = (counts[result.status] || 0) + 1;
  fs.writeFileSync(path.join(out, 'verified-report.json'), JSON.stringify({ checkedAt: new Date().toISOString(), counts, results }, null, 2));
  console.log(counts);
})().catch(error => { console.error(error); process.exitCode = 1; });
