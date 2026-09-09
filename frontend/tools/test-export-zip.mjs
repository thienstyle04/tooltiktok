import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), {chromium}=require('playwright'), esbuild=require('esbuild');
const root=path.resolve(import.meta.dirname,'..');
const bundle=await esbuild.build({stdin:{contents:"export {generateExportZip} from './lib/exportZip.js'; export {default as JSZip} from 'jszip';",resolveDir:root},bundle:true,write:false,format:'iife',globalName:'ZipTest'});
const executablePath=[process.env.PROGRAMFILES+'/Google/Chrome/Application/chrome.exe',process.env['PROGRAMFILES(X86)']+'/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
try {
 const reports=[];
 for(const mode of ['baseline','new']) {
  const page=await browser.newPage(); await page.addScriptTag({content:bundle.outputFiles[0].text});
  const report=await page.evaluate(async mode=>{
   const {JSZip,generateExportZip}=ZipTest;
   const small=new JSZip(); small.file('ảnh/01.png',new Uint8Array([1,4,8,16]),{date:new Date(2020,0,1)});small.file('caption.txt','Đà Lạt');
   const old=await small.generateAsync({type:'uint8array',compression:'STORE',streamFiles:true});
   const output=await generateExportZip(small);
   const bytes=new Uint8Array(await output.arrayBuffer());
   if(bytes.length!==old.length||bytes.some((value,i)=>value!==old[i]))throw new Error('ZIP byte regression');
   const loaded=await JSZip.loadAsync(bytes,{checkCRC32:true});
   if(await loaded.file('caption.txt').async('string')!=='Đà Lạt')throw new Error('Broken Unicode');
   const zip=new JSZip(), block=new Uint8Array(1024*1024);
   for(let i=0;i<block.length;i++)block[i]=i%251;
   for(let i=0;i<100;i++)zip.file(i+'.png',new Blob([block,block,block]),{compression:'STORE'});
   let updates=0,last=0; const start=performance.now();
   const progress=meta=>{updates++;last=meta.percent;};
   const archive=mode==='new'?await generateExportZip(zip,progress):await zip.generateAsync({type:'blob',compression:'STORE',streamFiles:true},progress);
   if(last!==100)throw new Error('Missing completion progress');
   return {mode,bytes:archive.size,elapsedMs:Math.round(performance.now()-start),updates};
  },mode);
  reports.push(report);await page.close();
 }
 assert.equal(reports[0].bytes,reports[1].bytes);
 assert.ok(reports[1].updates<reports[0].updates/10);
 console.log('PASS ZIP integrity and 300 MiB benchmark',JSON.stringify(reports));
}finally{await browser.close();}
