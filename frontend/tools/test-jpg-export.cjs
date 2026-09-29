const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const esbuild = require('../../backend/node_modules/esbuild');
const puppeteer = require('../../backend/node_modules/puppeteer-core');
const root = path.resolve(__dirname, '../..');
(async () => {
 const source = fs.readFileSync(path.join(root, 'frontend/lib/exportClient.js'), 'utf8');
 const bundle = esbuild.buildSync({stdin:{contents:source+'\nexport {exportQualityProfile,renderPageBlobWithRetry,exportNameWithExtension};',resolveDir:path.join(root,'frontend/lib')},bundle:true,write:false,format:'iife',globalName:'JpgTest'});
 const browser = await puppeteer.launch({executablePath:process.env.TEST_BROWSER_PATH,headless:true});
 try {
  const page = await browser.newPage();
  await page.setContent('<div id="sample" style="width:120px;height:160px;color:black">JPG export test</div>');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const results = await page.evaluate(async () => {
   const results=[];
   for(const quality of ['optimized','original']) for(const mode of ['modern','legacy']) for(const format of ['png','jpg']) {
    const profile=JpgTest.exportQualityProfile(quality,'summary-note',mode,format);
    const node=document.getElementById('sample');node.dataset.exportName='01-test.png';
    const blob=await JpgTest.renderPageBlobWithRetry(node,{...profile,imagesReady:true,embedFonts:false,preferHtml2Canvas:true,pixelRatio:1});
    const bytes=[...new Uint8Array(await blob.arrayBuffer()).slice(0,3)];
    const bitmap=await createImageBitmap(blob);
    const canvas=document.createElement('canvas');canvas.width=120;canvas.height=160;
    const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);
    results.push({format,mime:blob.type,bytes,width:bitmap.width,height:bitmap.height,pixel:[...ctx.getImageData(110,150,1,1).data],name:JpgTest.exportNameWithExtension(node,0,profile.imageExtension)});
    bitmap.close();
   }
   return results;
  });
  for(const r of results){assert.equal(r.width,120);assert.equal(r.height,160);assert(r.name.endsWith('.'+r.format));assert.equal(r.mime,r.format==='jpg'?'image/jpeg':'image/png');if(r.format==='jpg'){assert.deepEqual(r.bytes,[255,216,255]);assert.deepEqual(r.pixel,[255,255,255,255]);}}
  console.log('PASS: 8 PNG/JPG captures, both quality modes and runtime profiles; signatures, dimensions, extensions and white JPG background.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
