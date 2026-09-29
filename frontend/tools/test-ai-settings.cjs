const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const esbuild=require('../../backend/node_modules/esbuild');
const puppeteer=require('../../backend/node_modules/puppeteer-core');
const front=path.resolve(__dirname,'..');
(async()=>{
 const bundle=esbuild.buildSync({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import AiSettingsPanel from './components/AiSettingsPanel';createRoot(document.getElementById('root')).render(React.createElement(AiSettingsPanel));",resolveDir:front},loader:{'.js':'jsx'},jsx:'automatic',bundle:true,write:false,format:'iife'});
 const browser=await puppeteer.launch({executablePath:process.env.TEST_BROWSER_PATH,headless:true});
 try {
  const page=await browser.newPage();await page.setViewport({width:1024,height:768});
  const css=[...fs.readFileSync(path.join(front,'app/globals.css'),'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m=>fs.readFileSync(path.join(front,'app',m[1]),'utf8')).join('\n');
  await page.setContent('<style>'+css+'</style><main id="root"></main>');
  await page.evaluate(()=>{
   window.calls=[];window.state={active:'deepseek',profiles:{deepseek:{model:'deepseek-chat',hasKey:true,keySource:'environment'},gemini:{model:'',hasKey:false,keySource:'none'}}};
   window.fetch=async(url,options)=>{
    const body=options.body?JSON.parse(options.body):{};window.calls.push({url,body,method:options.method});
    if(String(url).endsWith('/models'))return Response.json({models:[{id:'test-flash',name:'Test Flash'}]});
    if(String(url).endsWith('/test'))return Response.json({ok:true});
    if(options.method==='PUT'){if(body.activate)window.state.active=body.provider;window.state.profiles[body.provider]={model:body.model,hasKey:true,keySource:'saved'};}
    return Response.json(window.state);
   };
  });
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.waitForFunction(()=>!document.querySelector('fieldset').disabled);
  await page.select('select','gemini');
  await page.type('input[type=password]','fake-ui-key');
  const buttons=await page.$$('button');await buttons[0].click();
  await page.waitForFunction(()=>document.querySelector('select[aria-label="Model"]').options.length===2);
  assert.equal(await page.$eval('select[aria-label="Model"]',n=>n.value),'');
  await page.select('select[aria-label="Model"]','test-flash');
  await buttons[3].click();await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('Đã lưu cấu hình'));
  assert.equal(await page.evaluate(()=>window.state.active),'deepseek');
  await page.select('select','deepseek');await page.select('select','gemini');
  assert.equal(await page.$eval('select[aria-label="Model"]',n=>n.value),'test-flash');
  await buttons[1].click();
  await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('hợp lệ'));
  await buttons[2].click();await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('Đã lưu'));
  assert.equal(await page.$eval('input[type=password]',n=>n.value),'');
  assert.equal(await page.evaluate(()=>window.state.active),'gemini');
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.method==='PUT').length),2);
  for(const width of [600,1024]){await page.setViewport({width,height:800});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.screenshot({path:path.resolve(front,'../outputs/ai-settings-test.png'),fullPage:true});
  console.log('PASS: settings UI load, provider/model/key entry, test, manual activation, key cleared, 600/1024 widths. API mocked.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
