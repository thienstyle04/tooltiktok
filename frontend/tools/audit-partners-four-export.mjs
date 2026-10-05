import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {coverApprovalToken} from '../lib/spotlightCoverReview.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright'), esbuild = require('esbuild');
const front = path.resolve(import.meta.dirname, '..');
const root = path.resolve(process.env.AUDIT_ROOT);
const generation = JSON.parse(fs.readFileSync(path.join(root, 'generation.json')));
// Explicitly exercise the manual-review export path in disposable fixtures.
// This does not label source images or approve any user list.
if(process.env.AUDIT_CONFIRM_COVERS==='1') for(const deck of generation.decks) for(const list of deck.lists) {
  const cover=list.pages.find(page=>page.type==='cover');
  if(cover&&list.spotlightDesignRevision===1) cover.coverApproval=coverApprovalToken(cover);
}
let colorEdit;
if (process.env.AUDIT_COLOR_EDIT === '1') {
  const backend = path.resolve(front, '../backend');
  const backendRequire = createRequire(path.join(backend, 'package.json'));
  backendRequire('ts-node').register({ project: path.join(backend, 'tsconfig.json'), transpileOnly: true });
  colorEdit = backendRequire(path.join(backend, 'src/modules/guide/color-edit.ts')).getColorEditAsset;
}
async function serveColorEdit(route, url) {
  if (!colorEdit || url.pathname !== '/assets/color-edit') return false;
  const source = new URL(url.searchParams.get('source'), 'http://audit.local');
  const id = source.searchParams.get('id');
  if (source.pathname !== '/assets/drive-file' || !/^[\w-]+$/.test(id || '')) throw Error('Unexpected test image source');
  const body = await colorEdit(fs.readFileSync(path.join(root, 'data/drive-file-cache', id + '.bin')), path.join(root, 'data'), url.searchParams.get('preset'));
  await route.fulfill({ body, contentType: 'image/png' });
  return true;
}
if (process.env.AUDIT_SKIP_FIRST) generation.decks = generation.decks.slice(Number(process.env.AUDIT_SKIP_FIRST));
let source = fs.readFileSync(path.join(front, 'lib/exportClient.js'), 'utf8')
  .replace('function downloadBlobFile(', 'function originalDownloadBlobFile(')
  + '\nfunction downloadBlobFile(blob,name){window.__downloads.push({blob,name});return true;}\nexport {JSZip,collectPartnerNames,addListMetadataFiles};';
// Optional small raster proof: same layout/images/export flow, lower output
// resolution only. XLSX/TXT bytes and partner collection are not changed.
if (process.env.AUDIT_FAST_RENDER === '1') source = source.replace('function exportQualityProfile(', 'function originalExportQualityProfile(')
  + '\nfunction exportQualityProfile(...args){return {...originalExportQualityProfile(...args),pixelRatio:0.65,sourceImageMaxDimension:640};}';
const suffix = process.env.AUDIT_SKIP_FIRST ? '-remaining' : '';
const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: path.join(front, 'lib') }, bundle: true, write: false, format: 'iife', globalName: 'Audit' });
const css = [...fs.readFileSync(path.join(front, 'app/globals.css'), 'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m => fs.readFileSync(path.join(front, 'app', m[1]), 'utf8')).join('\n');
const executablePath = [process.env.PROGRAMFILES + '/Google/Chrome/Application/chrome.exe', process.env['PROGRAMFILES(X86)'] + '/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser = await chromium.launch({ headless: true, executablePath });
if (process.env.AUDIT_MATRIX === '1') {
  const jpgOnly=process.env.AUDIT_JPG_ONLY==='1';
  const results=[], jobs=generation.decks.filter(d=>d.lists.length), output=path.join(root,'matrix-zips');
  fs.mkdirSync(output,{recursive:true}); let next=0;
  // One browser page per template: native batch of four saved lists, with
  // separate JS heaps and three parallel workers. No user backend is called.
  async function worker() {
    while(next<jobs.length) {
      const deck=jobs[next++], page=await browser.newPage();
      try {
        await installRoutes(page);
        await page.goto('http://audit.local/'); await page.addScriptTag({content:bundle.outputFiles[0].text});
        const row=await page.evaluate(async ({deck,source,jpgOnly})=>{
          window.__downloads=[]; const errors=[];
          if(jpgOnly){
            const list=deck.lists[0],samples=[];
            for(const selectedPageIndex of [0,1]){
              await Audit.exportSelectedPagePng({dataset:{source,decks:[deck]},deck,list,selectedPageIndex,format:'jpg',quality:'optimized'},{failProgress:message=>errors.push(message)});
              const file=window.__downloads.at(-1);
              if(!file?.name.endsWith('.jpg'))throw Error('Missing JPG download');
              const bytes=new Uint8Array(await file.blob.arrayBuffer());
              if(bytes[0]!==255||bytes[1]!==216)throw Error('Invalid JPEG signature');
              const bitmap=await createImageBitmap(file.blob);
              samples.push({page:selectedPageIndex,width:bitmap.width,height:bitmap.height,bytes:bytes.length});bitmap.close();
            }
            return {deckId:deck.id,jpgSamples:samples,errors};
          }
          const result=await Audit.exportBatch({dataset:{source,decks:[deck]},deck,list:deck.lists[0],selectedListIds:new Set(deck.lists.map(l=>l.id)),quality:'optimized',confirmSkipImages:async()=>false},{failProgress:msg=>errors.push(msg)});
          const download=window.__downloads.find(d=>d.name.endsWith('.zip'));
          if(!download)return {deckId:deck.id,result,errors,archives:0};
          window.__batchBlob=download.blob;
          const zip=await Audit.JSZip.loadAsync(await download.blob.arrayBuffer(),{checkCRC32:true});
          const books=[];
          for(const entry of Object.values(zip.files))if(entry.name.endsWith('.xlsx')){
            const workbook=await Audit.JSZip.loadAsync(await entry.async('uint8array'),{checkCRC32:true});
            const xml=await workbook.file('xl/worksheets/sheet1.xml').async('string');
            books.push({file:entry.name,names:[...xml.matchAll(/<t(?:\s[^>]*)?>([^<]+)<\/t>/g)].map(m=>m[1])});
          }
          return {deckId:deck.id,result,errors,archives:1,books,bytes:download.blob.size,pngs:Object.keys(zip.files).filter(f=>f.endsWith('.png')).length,crc:true};
        },{deck,source:generation.source,jpgOnly});
        if(row.archives){
          const pending=page.waitForEvent('download',{timeout:120000});
          await page.evaluate(()=>{const a=document.createElement('a');a.href=URL.createObjectURL(window.__batchBlob);a.download='audit.zip';document.body.append(a);a.click();a.remove();});
          await(await pending).saveAs(path.join(output,deck.id+'.zip'));
        }
        results.push(row); fs.writeFileSync(path.join(root,jpgOnly?'jpg-results.json':'matrix-results.json'),JSON.stringify(results,null,2));
        console.log('MATRIX '+JSON.stringify({deck:deck.id,lists:row.result?.exportedLists?.length,books:row.books?.map(b=>b.names.length),errors:row.errors,archives:row.archives,pngs:row.pngs}));
      }catch(e){results.push({deckId:deck.id,error:e.message});fs.writeFileSync(path.join(root,jpgOnly?'jpg-results.json':'matrix-results.json'),JSON.stringify(results,null,2));console.log('MATRIX FAIL '+deck.id+' '+e.message);}
      finally{await page.close();}
    }
  }
  try{await Promise.all([worker(),worker(),worker()]);}finally{await browser.close();}
  process.exit(0);
}
async function installRoutes(page) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()), json = value => route.fulfill({ json: value });
    if (await serveColorEdit(route, url)) return;
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<style>${css}</style>` });
    if (url.pathname === '/api/health') return json({ status: 'ok', sessionId: 'audit', appVersion: '0.9.03' });
    if (url.pathname === '/api/drive-cache/status') return json({ ready: true, phase: 'ready', destinationId: 'dalat' });
    if (url.pathname === '/api/night-sync/export-lease') return json({ ok: true });
    if (url.pathname.includes('runtime-performance')) return json({ mode: 'modern', totalMemoryBytes: 32*1024**3, freeMemoryBytes:8*1024**3, logicalCpuCount:8 });
    if (url.pathname === '/api/drive-files/cache-status') {const ids=route.request().postDataJSON().fileIds;const missing=ids.filter(id=>!fs.existsSync(path.join(root,'data/drive-file-cache',id+'.bin')));return json({total:ids.length,cached:ids.length-missing.length,missing});}
    if (url.pathname === '/assets/drive-file') {const id=url.searchParams.get('id');if(/^[\w-]+$/.test(id||'')){const file=path.join(root,'data/drive-file-cache',id+'.bin');if(fs.existsSync(file)){const body=fs.readFileSync(file);return route.fulfill({body,contentType:body[0]===137?'image/png':body[0]===255?'image/jpeg':'image/webp'});}}return route.fulfill({status:404,body:'missing'});}
    if(url.pathname.startsWith('/fonts/')){const file=path.join(front,'public/fonts',path.basename(url.pathname));if(fs.existsSync(file))return route.fulfill({body:fs.readFileSync(file)});}
    return route.abort();
  });
}
try {
  const page = await browser.newPage();
  page.on('console', m => { if (m.text().startsWith('AUDIT ')) console.log(m.text()); });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url()), json = value => route.fulfill({ json: value });
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<style>${css}</style>` });
    if (url.pathname === '/api/health') return json({ status: 'ok', sessionId: 'audit', appVersion: '0.9.03' });
    if (url.pathname === '/api/drive-cache/status') return json({ ready: true, phase: 'ready', destinationId: 'dalat' });
    if (url.pathname === '/api/night-sync/export-lease') return json({ ok: true });
    if (url.pathname.includes('runtime-performance')) return json({ mode: 'modern', totalMemoryBytes: 32 * 1024 ** 3, freeMemoryBytes: 8 * 1024 ** 3, logicalCpuCount: 8 });
    if (url.pathname === '/api/drive-files/cache-status') {
      const ids = route.request().postDataJSON().fileIds;
      const missing = ids.filter(id => !fs.existsSync(path.join(root, 'data/drive-file-cache', id + '.bin')));
      return json({ total: ids.length, cached: ids.length - missing.length, missing });
    }
    if (url.pathname === '/assets/drive-file') {
      const id = url.searchParams.get('id');
      if (/^[\w-]+$/.test(id || '')) {
        const file = path.join(root, 'data/drive-file-cache', id + '.bin');
        if (fs.existsSync(file)) { const body = fs.readFileSync(file); return route.fulfill({ body, contentType: body[0] === 137 ? 'image/png' : body[0] === 255 ? 'image/jpeg' : 'image/webp' }); }
      }
      return route.fulfill({ status: 404, body: 'missing' });
    }
    if (url.pathname.startsWith('/fonts/')) {
      const file = path.join(front, 'public/fonts', path.basename(url.pathname));
      if (fs.existsSync(file)) return route.fulfill({ body: fs.readFileSync(file) });
    }
    return route.abort();
  });
  await page.goto('http://audit.local/'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  // Audit the production metadata writer independently so one bad template
  // cannot hide all later results by aborting the full batch.
  const metadata = await page.evaluate(async generation => {
    const zip = new Audit.JSZip(), rows = [];
    for (const deck of generation.decks) for (const list of deck.lists) {
      const row = { deckId: deck.id, listId: list.id, collected: Audit.collectPartnerNames(list) };
      const folder = zip.folder(deck.id + '/' + list.id);
      try {
        await Audit.addListMetadataFiles(folder, list, undefined, deck.id);
        const file = Object.values(zip.files).find(f => f.name.startsWith(folder.root) && f.name.endsWith('.xlsx'));
        if (file) {
          const book = await Audit.JSZip.loadAsync(await file.async('uint8array'), { checkCRC32: true });
          row.sheetXml = await book.file('xl/worksheets/sheet1.xml').async('string');
          row.xlsx = file.name;
          row.nonEmptyCells = [...row.sheetXml.matchAll(/<t(?:\s[^>]*)?>([^<]+)<\/t>/g)].map(m => m[1]);
          const decode = value => value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'");
          row.xlsxNames = row.nonEmptyCells.map(decode);
          const dataNames = [...new Set(list.pages.flatMap(p => (p.items || []).filter(x => x.isPartner).map(x => String(x.rawName || x.name || '').replace(/^[^:]{1,30}:\s*/, '').trim()).filter(Boolean)))];
          row.dataNames = dataNames;
          row.missing = dataNames.filter(name => !row.xlsxNames.includes(name));
          row.unexpected = row.xlsxNames.filter(name => !dataNames.includes(name));
        } else row.error = 'No XLSX';
      } catch(e) { row.error = e.message; }
      rows.push(row);
    }
    window.__metadataBlob = await zip.generateAsync({type:'blob'});
    return rows;
  }, generation);
  fs.writeFileSync(path.join(root, 'metadata-results'+suffix+'.json'), JSON.stringify(metadata, null, 2));
  const metadataPending = page.waitForEvent('download', {timeout:120000});
  await page.evaluate(() => {
    const anchor=document.createElement('a'); anchor.href=URL.createObjectURL(window.__metadataBlob);
    anchor.download='metadata.zip'; document.body.append(anchor); anchor.click(); anchor.remove();
  });
  await (await metadataPending).saveAs(path.join(root, 'partners-metadata-batch'+suffix+'.zip'));
  await page.evaluate(() => { window.__metadataBlob=null; });
  console.log('METADATA ' + JSON.stringify(metadata.map(r => ({deck:r.deckId,list:r.listId,count:r.collected.length,cells:r.nonEmptyCells?.length,error:r.error}))));
  if (process.env.AUDIT_METADATA_ONLY === '1') { await browser.close(); process.exit(0); }
  const outcome = await page.evaluate(async generation => {
    window.__downloads = []; const errors = [];
    const dataset = { source: generation.source, decks: generation.decks };
    const result = await Audit.exportBatch({ dataset, deck: dataset.decks[0], list: dataset.decks[0].lists[0], selectedListIds: new Set(dataset.decks.flatMap(d => d.lists.map(l => l.id))), quality: 'optimized', confirmSkipImages: async () => false }, {
      failProgress: msg => errors.push(msg), updateProgress: (pct,msg) => { if (Math.floor(pct) % 10 === 0) console.log('AUDIT ' + pct.toFixed(1) + ' ' + msg); }
    });
    const download = window.__downloads.find(d => d.name.endsWith('.zip'));
    if (!download) return { result, errors, archives:0 };
    window.__batchBlob = download.blob;
    const zip = await Audit.JSZip.loadAsync(await download.blob.arrayBuffer(), {checkCRC32:true});
    return { result, errors, archives:1, bytes:download.blob.size, files:Object.keys(zip.files), crc:true };
  }, generation);
  fs.writeFileSync(path.join(root, 'batch-result'+suffix+'.json'), JSON.stringify({ ...outcome, reducedRasterResolution: process.env.AUDIT_FAST_RENDER === '1' }, null, 2));
  if (outcome.archives) {
    const pending = page.waitForEvent('download', {timeout:120000});
    await page.evaluate(() => {
      const anchor=document.createElement('a'); anchor.href=URL.createObjectURL(window.__batchBlob);
      anchor.download='audit.zip'; document.body.append(anchor); anchor.click(); anchor.remove();
    });
    const download=await pending;
    await download.saveAs(path.join(root, 'full-export-batch'+suffix+'.zip'));
  }
  console.log('BATCH ' + JSON.stringify({...outcome,files:outcome.files?.length}));
} finally { await browser.close(); }
