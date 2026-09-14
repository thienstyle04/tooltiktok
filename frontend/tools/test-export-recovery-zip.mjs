// Reuse the real-cache smoke in a clean browser; fail image GET fetches only.
import fs from 'node:fs';
import path from 'node:path';
const p = path.resolve(import.meta.dirname, 'test-v6-export-cache.mjs');
let s = fs.readFileSync(p, 'utf8');
s = s.replaceAll('import.meta.url', JSON.stringify(new URL('./test-v6-export-cache.mjs', import.meta.url).href)).replaceAll('import.meta.dirname', JSON.stringify(path.dirname(p)));
s = s.replace("['spotlight-v6-green', 'spotlight-v6']", "['spotlight-v4', 'spotlight-v6']").replace('decks[0].lists[0]?.pages.length !== 11', 'decks[0].lists[0]?.pages.length !== 14');
s = s.replace("const id=url.searchParams.get('id');", "const id=url.searchParams.get('id'); const preflightIds=decks.map(d=>new URL(d.lists[0].pages[0].backgroundImage,'http://localhost').searchParams.get('id')); if(route.request().resourceType()==='fetch' && !preflightIds.includes(id)) return route.abort('failed');");
s = s.replace('return route.fulfill({body:fs.readFileSync(file)});', "return route.fulfill({contentType:'image/jpeg',body:fs.readFileSync(file)});");
s = s.replace('if(!/spotlight[\\s_-]*v6/i.test(file.name) && files.length!==11)continue;', '');
s = s.replaceAll('bitmap.width!==1080||bitmap.height!==1920', 'bitmap.width<=0||bitmap.height<=0');
s = s.replace('Smoke.JSZip.loadAsync(await blob.arrayBuffer())', 'Smoke.JSZip.loadAsync(await blob.arrayBuffer(), {checkCRC32:true})');
s = s.replace('result.results[1].pages,11', 'result.results[1].pages,14').replace('result.results[2].v6Checked,25', 'result.results[2].v6Checked,28');
s = s.replace('PASS cached V6 Green single/list + V6 mixed batch', 'PASS recovered V4 single/list and V4+V6 ZIP; image fetch GETs fail, CRC/PNG checked');
if (process.argv.includes('--stress')) {
  s = s.replace('lists: saved.decks[id]?.slice(0, 1) || []', "lists: Array.from({length:4},(_,i)=>({...structuredClone(saved.decks[id][0]),id:id+'-caption-'+(i+1)+'-stress',navTitle:'AI '+(i+1)}))");
  s = s.replace("await Smoke.exportSelectedPagePng({deck,list,selectedPageIndex:0,quality:'optimized',dataset},callbacks);", '');
  s = s.replace("await Smoke.exportActiveList({deck,list,quality:'optimized',dataset},callbacks);", '');
  s = s.replace('result.results.length,3', 'result.results.length,1').replace('result.results[1].pages,14', 'result.results[0].pages,112').replace('result.results[2].v6Checked,28', 'result.results[0].v6Checked,112');
  s = s.replace('PASS recovered V4 single/list and V4+V6 ZIP; image fetch GETs fail, CRC/PNG checked', 'PASS 112-page stress ZIP; image fetch GETs fail, all PNGs and CRC checked');
}
try {
  await import('data:text/javascript;base64,' + Buffer.from(s).toString('base64'));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
