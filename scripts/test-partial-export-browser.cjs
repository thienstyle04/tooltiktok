// Isolated browser harness: reads source snapshots/cache, never writes user data.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..'), front = path.join(root, 'frontend');
const esbuild = require('../backend/node_modules/esbuild');
const cache = path.join(root, 'backend/data/drive-file-cache');
const output = path.join(root, 'outputs/partial-export-test');
fs.mkdirSync(output, { recursive: true });
const diary = JSON.parse(fs.readFileSync(path.join(root, 'outputs/low-resource-test/stress-lists.json'))).lists[0];
const maps = JSON.parse(fs.readFileSync(path.join(root, 'backend/data/generated-caption-lists.dalat.json'))).decks['spotlight-v6-maps'][0];
async function main() {
  const bundle = await esbuild.build({ stdin: { contents: `
    export { exportBatch } from './exportClient'; export { default as JSZip } from 'jszip';
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import Modal from '../components/ExportImageErrorsModal';
    export function ask(inspection) { return new Promise(resolve => {
      const node = document.createElement('div'); document.body.appendChild(node); const root = createRoot(node);
      root.render(React.createElement(Modal, {inspection, onAnswer: value => { root.unmount(); node.remove(); resolve(value); }}));
    }); }
  `, resolveDir: path.join(front, 'lib') }, loader: { '.js': 'jsx' }, jsx: 'automatic', bundle: true, write: false, format: 'iife', globalName: 'TestExport' });
  const css = [...fs.readFileSync(path.join(front, 'app/globals.css'), 'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m => fs.readFileSync(path.join(front, 'app', m[1]), 'utf8')).join('\n');
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (value, type = 'application/json') => { res.setHeader('Content-Type', type); res.end(type === 'application/json' ? JSON.stringify(value) : value); };
    if (url.pathname === '/artifact') {
      const mode = url.searchParams.get('mode');
      if (!['mixed', 'missing', 'late', 'scheduled'].includes(mode)) { res.statusCode = 400; return res.end(); }
      const stream = fs.createWriteStream(path.join(output, mode + '.zip')); req.pipe(stream); stream.on('finish', () => send({ ok: true })); return;
    }
    let body = ''; for await (const chunk of req) body += chunk;
    if (url.pathname === '/bundle.js') return send(bundle.outputFiles[0].text, 'text/javascript');
    if (url.pathname === '/fixture') return send({ decks: [{ id: 'spotlight-v6-diary', lists: [diary] }, { id: 'spotlight-v6-maps', lists: [maps] }], source: { destinationId: 'dalat' } });
    if (url.pathname === '/result') { const report = JSON.parse(body); fs.writeFileSync(path.join(output, report.mode + '.json'), body); return send({ ok: true }); }
    if (url.pathname === '/api/health') return send({ status: 'ok', sessionId: 'isolated-partial', appVersion: '0.6.08' });
    if (url.pathname === '/api/drive-cache/status') return send({ ready: true, phase: 'ready', destinationId: 'dalat', total: 100, cached: 100, completed: 100, failed: 0, percent: 100 });
    if (url.pathname.includes('runtime-performance')) return send({ mode: 'modern', totalMemoryBytes: 32 * 1024 ** 3, freeMemoryBytes: 8 * 1024 ** 3, cpuCount: 8 });
    if (url.pathname === '/api/drive-files/cache-status') { const ids = JSON.parse(body).fileIds; const missing = ids.filter(id => id !== 'late_image_000' && !fs.existsSync(path.join(cache, id + '.bin'))); return send({ missing, total: ids.length, cached: ids.length - missing.length }); }
    if (url.pathname.includes('prefetch')) { res.statusCode = 500; return send({ error: 'Forbidden network warm-up during export' }); }
    if (url.pathname === '/assets/drive-file') {
      const id = url.searchParams.get('id');
      if (!/^[\w-]+$/.test(id || '') || !fs.existsSync(path.join(cache, id + '.bin'))) { res.statusCode = 404; return res.end(); }
      const image = fs.readFileSync(path.join(cache, id + '.bin')); return send(image, image[0] === 137 ? 'image/png' : image[0] === 255 ? 'image/jpeg' : 'image/webp');
    }
    if (url.pathname.startsWith('/fonts/')) { const file = path.join(front, 'public/fonts', path.basename(url.pathname)); if (fs.existsSync(file)) return send(fs.readFileSync(file), 'font/woff2'); }
    if (url.pathname !== '/') { res.statusCode = 404; return res.end(); }
    send(`<!doctype html><meta charset="utf-8"><style>${css}</style><h1>Kiểm thử batch biệt lập</h1>${['mixed','missing','cancel','allbad','late','scheduled'].map(mode => '<button id="'+mode+'">'+mode+'</button>').join(' ')}<pre id="result">Sẵn sàng</pre><script src="/bundle.js"></script><script>
      for (const mode of ['mixed','missing','cancel','allbad','late','scheduled']) document.getElementById(mode).onclick = async () => {
        const out = document.getElementById('result'); document.querySelectorAll('button').forEach(b => b.disabled = true);
        let prompts = 0, archives = 0, pngs = 0, dimensions = {}, metadata = 0, crc = false;
        try {
          const dataset = await (await fetch('/fixture')).json();
          if (mode !== 'mixed') {
            const bad = '/assets/drive-file?id=' + (mode === 'late' ? 'late_image_000' : 'missing_image_000');
            dataset.decks[0].lists[0].pages[0].backgroundImage = bad;
            if (mode === 'allbad') dataset.decks[1].lists[0].pages.forEach(page => { page.backgroundImage = bad; if (page.items) page.items.forEach(item => item.imageUrl = bad); });
          }
          const snapshot = JSON.stringify(dataset);
          const result = await TestExport.exportBatch({ dataset, selectedListIds: new Set(dataset.decks.flatMap(d => d.lists.map(l => l.id))), quality: 'optimized', skipImageErrors: mode === 'scheduled',
            confirmSkipImages: async info => { prompts++; return mode === 'cancel' ? false : await TestExport.ask(info); },
            onArchive: async (blob, name, outcome) => {
              archives++; const zip = await TestExport.JSZip.loadAsync(await blob.arrayBuffer(), { checkCRC32: true }); crc = true;
              for (const f of Object.values(zip.files).filter(f => f.name.endsWith('.png'))) { const b = await createImageBitmap(new Blob([await f.async('uint8array')], { type:'image/png' })); const key = b.width+'x'+b.height; dimensions[key] = (dimensions[key] || 0)+1; b.close(); pngs++; }
              metadata = Object.keys(zip.files).filter(name => /\\.(xlsx|txt)$/.test(name)).length;
              if (outcome.skippedLists.length && !zip.file('BAO-CAO-LIST-BO-QUA.json')) throw Error('Missing skipped report');
              await fetch('/artifact?mode='+mode, { method:'POST', body:blob });
            }
          }, { setStatus: text => out.textContent = text });
          if (JSON.stringify(dataset) !== snapshot) throw Error('Snapshot mutated');
          const report = { mode, result, prompts, archives, pngs, dimensions, metadata, crc }; out.textContent = JSON.stringify(report, null, 2); await fetch('/result', {method:'POST',body:JSON.stringify(report)});
        } catch (error) { out.textContent = String(error); }
        document.querySelectorAll('button').forEach(b => b.disabled = false);
      };
    </script>`, 'text/html');
  });
  server.listen(3100, '127.0.0.1', () => console.log('Partial export harness http://127.0.0.1:3100'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
