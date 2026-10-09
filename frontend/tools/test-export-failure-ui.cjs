// Isolated browser tests. Fault injection exists only in this test bundle;
// production export functions, ZIP assembly and React progress hook are used.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { createRequire } = require('node:module');
const front = path.resolve(__dirname, '..');
const backRequire = createRequire(path.resolve(front, '../backend/package.json'));
const esbuild = backRequire('esbuild'), { chromium } = require('playwright');

async function main() {
  const instrumented = fs.readFileSync(path.join(front, 'lib/exportClient.js'), 'utf8') + `
    const actualCapture = renderPageBlobWithRetry;
    renderPageBlobWithRetry = async (node, options) => {
      if (window.injectLateFailure && node.dataset.listId === 'summary-note-caption-01-bad' && Number(node.dataset.pageIndex) === 1)
        throw new ExportImageError('Ảnh bị hỏng ở trang thứ hai (kiểm thử)');
      return actualCapture(node, options);
    };
    export { JSZip };
  `;
  const plugin = { name: 'isolated-export-fault', setup(build) {
    build.onLoad({ filter: /[\\/]exportClient\.js$/ }, () => ({ contents: instrumented, loader: 'js', resolveDir: path.join(front, 'lib') }));
  } };
  const bundle = await esbuild.build({ stdin: { contents: `
    export { exportBatch, exportActiveList, exportSelectedPagePng, JSZip } from './exportClient';
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import useExportProgress from '../components/useExportProgress';
    import ProgressBar from '../components/ProgressBar';
    function Harness() {
      const control = useExportProgress(); const [busy, setBusy] = React.useState(false); const [status, setStatus] = React.useState('');
      window.exportUI = { ...control, busy, status, setBusy, setStatus };
      return React.createElement('div', null, React.createElement(ProgressBar, {progress:control.progress}),
        React.createElement('button', {id:'other-action', disabled:busy}, 'Công việc khác'), React.createElement('p', {id:'status'}, status));
    }
    export function mount() { createRoot(document.getElementById('ui')).render(React.createElement(Harness)); }
  `, resolveDir: path.join(front, 'lib') }, plugins: [plugin], loader: { '.js': 'jsx' }, jsx: 'automatic', bundle: true, write: false, format: 'iife', globalName: 'TestExport' });
  const css = [...fs.readFileSync(path.join(front, 'app/globals.css'), 'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m => fs.readFileSync(path.join(front, 'app', m[1]), 'utf8')).join('\n');
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (body, type = 'application/json') => { res.setHeader('Content-Type', type); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
    if (url.pathname === '/') return send('<!doctype html><meta charset="utf-8"><style>' + css + '</style><div id="ui"></div><script src="/bundle.js"></script><script>TestExport.mount()</script>', 'text/html');
    if (url.pathname === '/bundle.js') return send(bundle.outputFiles[0].text, 'text/javascript');
    if (url.pathname === '/api/health') return send({ status:'ok', sessionId:'isolated-failure', appVersion:backRequire('./package.json').version });
    if (url.pathname === '/api/drive-files/cache-status') return send({missing:[]});
    if (url.pathname === '/api/drive-cache/status') return send({ready:true});
    if (url.pathname.includes('runtime-performance')) return send({mode:'legacy'});
    if (url.pathname.startsWith('/fonts/')) {
      const file = path.join(front, 'public/fonts', path.basename(url.pathname));
      if (fs.existsSync(file)) return send(fs.readFileSync(file), 'font/woff2');
    }
    if (url.pathname === '/api/night-sync/export-lease') return send({ok:true});
    res.statusCode=404; res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const executablePath = [`${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`, `${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe`].find(fs.existsSync);
  const browser = await chromium.launch({ headless:true, ...(executablePath ? {executablePath} : {}) });
  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => window.exportUI);
    const result = await page.evaluate(async () => {
      const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
      const callbacks = () => { const {setStatus,setBusy,showProgress,updateProgress,completeProgress,failProgress} = window.exportUI; return {setStatus,setBusy,showProgress,updateProgress,completeProgress,failProgress}; };
      const state = () => ({visible:window.exportUI.progress.visible,busy:window.exportUI.busy,status:window.exportUI.status,
        otherEnabled:!document.getElementById('other-action').disabled, emptyRender:!document.querySelector('.batch-export-root')?.textContent});
      const threads = {id:'threads-mix-text-caption-01-valid',navTitle:'List hợp lệ',postCaption:'Hook',pages:[{type:'list',items:Array.from({length:12},(_,i)=>({name:'Quán '+i,rawName:'Quán '+i,isPartner:i<6,metaPrimary:'Xuân Hương - Đà Lạt',sourceSectionKey:['quan_an','cafe','check_in','choi_dem'][i%4],imageUrl:''}))}]};
      const deck = {id:'threads-mix-text',navTitle:'Threads Tổng hợp chữ',lists:[threads]};
      const dataset = {decks:[deck]};
      let archives = 0;
      const before = JSON.stringify(dataset);
      // Error before the attempt's local try/finally must still stop the UI.
      window.exportUI.showProgress('Previous progress',20); window.exportUI.setBusy(true);
      const early = await TestExport.exportSelectedPagePng({deck,list:threads,dataset,selectedPageIndex:0,quality:'original'},callbacks());
      await pause(20); const earlyState = state();
      // Upload/storage callback fails after ZIP assembly: no successful outcome.
      const upload = await TestExport.exportBatch({dataset,selectedListIds:new Set([threads.id]),quality:'original',onArchive:()=>{throw new Error('Mất kết nối khi lưu ZIP');}},callbacks());
      await pause(20); const uploadState = state();
      // Retry in the same browser/queue without reloading succeeds.
      const retry = await TestExport.exportBatch({dataset,selectedListIds:new Set([threads.id]),quality:'original',onArchive:async blob=>{
        archives++; await TestExport.JSZip.loadAsync(await blob.arrayBuffer(),{checkCRC32:true});
      }},callbacks());
      await pause(20);
      // A previous completion timer must not close the next active export.
      window.exportUI.showProgress('Next export',12); await pause(1700); const timerState = state();
      window.exportUI.failProgress('Failed'); window.exportUI.updateProgress(75,'Late update'); await pause(20); const lateState = state();
      const summary = id => ({id,navTitle:id.endsWith('bad')?'List ảnh lỗi':'List ảnh tốt',title:'Fixture',postCaption:'Fixture',pages:Array.from({length:3},()=>({type:'list',layoutVariant:'summary-note-page',canvasPreset:'tiktok-9x16',title:'Danh sách',items:[{name:'Đối tác thử',rawName:'Đối tác thử',isPartner:true,metaPrimary:'Xuân Hương - Đà Lạt',imageUrl:''}]}))});
      const bad=summary('summary-note-caption-01-bad'),good=summary('summary-note-caption-02-good');
      const mixed={decks:[{id:'summary-note',navTitle:'Tổng hợp địa điểm',lists:[bad,good]}]};
      const mixedBefore=JSON.stringify(mixed); let filenames=[],skipReport=''; window.injectLateFailure=true;
      const partial=await TestExport.exportBatch({dataset:mixed,selectedListIds:new Set([bad.id,good.id]),quality:'original',skipImageErrors:true,
        onArchive:async blob=>{const zip=await TestExport.JSZip.loadAsync(await blob.arrayBuffer(),{checkCRC32:true});filenames=Object.values(zip.files).filter(f=>!f.dir).map(f=>f.name);skipReport=await zip.file('BAO-CAO-LIST-BO-QUA.json').async('string');}},callbacks());
      await pause(20); const partialState=state();
      // All late failures: never hand off an archive and allow another retry.
      let invalidArchives=0;
      const allBad=await TestExport.exportBatch({dataset:mixed,selectedListIds:new Set([bad.id]),quality:'original',skipImageErrors:true,onArchive:()=>invalidArchives++},callbacks());
      await pause(20); const allBadState=state();
      return {early,earlyState,upload,uploadState,retry,archives,timerState,lateState,partial,partialState,filenames,skipReport,allBad,allBadState,invalidArchives,unchanged:before===JSON.stringify(dataset)&&mixedBefore===JSON.stringify(mixed)};
    });
    assert.equal(result.early.success,false); assert.equal(result.upload.success,false);
    for(const state of [result.earlyState,result.uploadState,result.allBadState]) { assert.equal(state.visible,false);assert.equal(state.busy,false);assert.equal(state.otherEnabled,true);assert.equal(state.emptyRender,true); }
    assert.equal(result.retry.success,true);assert.equal(result.archives,1);
    assert.equal(result.timerState.visible,true);assert.equal(result.lateState.visible,false);
    assert.equal(result.partial.success,true, JSON.stringify({partial:result.partial,state:result.partialState}));assert.equal(result.partial.exportedLists.length,1);assert.equal(result.partial.skippedLists.length,1);
    assert.ok(result.partial.skippedLists[0].discardedFiles>=3, 'Earlier PNG plus TXT/XLSX of failed list were discarded');
    const listFiles=result.filenames.filter(name=>!name.startsWith('BAO-CAO'));
    assert.ok(listFiles.length>=3,JSON.stringify(result.filenames));assert.ok(listFiles.every(name=>name.startsWith('set2 ')), 'Failed list folder, PNG and metadata must not remain');
    assert.match(result.skipReport,/List ảnh lỗi/);assert.match(result.partialState.status,/Đã loại bỏ.*file xuất dở/);
    assert.equal(result.allBad.success,false);assert.equal(result.invalidArchives,0);assert.equal(result.unchanged,true);
    console.log('PASS browser: errors before render / saving archive / all failed close progress, unlock actions, allow retry; old timers/late progress ignored; partial ZIP discards failed PNG/TXT/XLSX folder; valid ZIP CRC and list snapshots preserved.');
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
