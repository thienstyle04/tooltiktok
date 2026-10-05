import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),esbuild=require('esbuild'),{chromium}=require('playwright');
const source=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import CaptionTools from './components/CaptionTools';
const decks=['itinerary-3n2d','spotlight-v5','threads-toplist-dalat','spotlight-partner'].map(id=>({id,navTitle:id,lists:[{id:id+'-main',navTitle:'List chính',pages:[]},{id:id+'-caption-01',navTitle:'Mẫu 01',title:'List đã tạo',pages:[{},{}]}]}));
function App(){const[deck,setDeck]=useState(decks[0]),[caption,setCaption]=useState({coverTitle:'',headline:'',body:'',hashtags:''}),[busy,setBusy]=useState(false),[ready,setReady]=useState(true),[preset,setPreset]=useState(null);
 window.toggleBusy=setBusy;window.toggleReady=setReady;
 return <CaptionTools dataset={{decks}} activeDeck={deck} activeList={deck.lists[0]} caption={caption} setCaption={setCaption} busy={busy} cacheReady={ready} photoPreset={preset} onPhotoPresetChange={setPreset} tone="gen_z" setTone={value=>window.events.push(['tone',value])} partners={[{id:'partner-1',name:'Quán một',section:'Quán ăn',address:'Xuân Hương'},{id:'partner-2',name:'Cafe hai',section:'Cà phê',address:'Cam Ly'}]} onDeckSelect={setDeck} onListSelect={list=>window.events.push(['source',list.id])} onCreateList={()=>window.events.push(['single'])} onCreateBatchLists={count=>window.events.push(['batch',count])} onCreatePartnerSpotlight={partner=>window.events.push(['partner',partner.id])} onRequestCaption={target=>window.events.push(['caption',target])} onCopy={text=>window.events.push(['copy',text])} onGeneratedListSelect={list=>window.events.push(['open',list.id])}/>;}
 createRoot(document.getElementById('root')).render(<App/>);`;
const bundle=await esbuild.build({stdin:{contents:source,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',loader:{'.js':'jsx'},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const browser=await chromium.launch({headless:true,executablePath:[process.env.PROGRAMFILES+'/Google/Chrome/Application/chrome.exe',process.env['PROGRAMFILES(X86)']+'/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)});
try{
 const page=await browser.newPage();await page.goto('about:blank');await page.setContent('<div id="root"></div>');await page.evaluate(()=>window.events=[]);await page.addScriptTag({content:bundle.outputFiles[0].text});
 const event=()=>page.evaluate(()=>window.events.at(-1));
 assert.equal(await page.locator('#captionCoverTitle').isVisible(),false);assert.equal(await page.locator('#captionTone').isVisible(),false);
 await page.locator('#nonAiBatchCountSelect').selectOption('1');await page.locator('#createDeckFromCaptionBtn').click();assert.deepEqual(await event(),['batch',1]);
 await page.locator('#nonAiBatchCountSelect').selectOption('4');await page.locator('#createDeckFromCaptionBtn').click();assert.deepEqual(await event(),['batch',4]);
 await page.locator('.list-create-advanced summary').click();await page.locator('#captionCoverTitle').fill('Hook riêng tuiiiii');
 await page.locator('#nonAiBatchCountSelect').selectOption('1');await page.locator('#createDeckFromCaptionBtn').click();assert.deepEqual(await event(),['single']);
 await page.locator('#generateCaptionBtn').click();assert.deepEqual(await event(),['caption','full']);
 await page.locator('#captionHeadline').fill('Caption thử');await page.locator('#copyFullCaptionBtn').click();assert.deepEqual(await event(),['copy','Caption thử']);
 await page.locator('#captionDeckSelect').selectOption('spotlight-v5');assert.equal(await page.locator('.list-create-advanced').count(),0);
 await page.locator('#createDeckFromCaptionBtn').click();assert.deepEqual(await event(),['single']);
 await page.getByRole('button',{name:/Mẫu 01.*Mở/}).click();assert.deepEqual(await event(),['open','spotlight-v5-caption-01']);
 await page.evaluate(()=>window.toggleReady(false));assert(await page.locator('#createDeckFromCaptionBtn').isDisabled());
 await page.locator('#captionDeckSelect').selectOption('threads-toplist-dalat');assert(await page.locator('#createDeckFromCaptionBtn').isEnabled());assert.equal(await page.locator('.photo-preset-picker').count(),0);
 await page.evaluate(()=>window.toggleReady(true));await page.locator('#captionDeckSelect').selectOption('spotlight-partner');assert.equal(await page.locator('.list-create-advanced').count(),0);assert.equal(await page.locator('#nonAiBatchCountSelect').count(),0);
 await page.locator('#createPartnerSearch').fill('Cafe');assert.equal(await page.locator('.list-create-partner-grid button').count(),1);await page.locator('.list-create-partner-grid button').click();assert.deepEqual(await event(),['partner','partner-2']);
 await page.getByRole('button',{name:'Bảng màu: Ảnh gốc',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('radio').count(),0);
 await page.evaluate(()=>window.toggleBusy(true));await page.waitForFunction(()=>document.getElementById('captionDeckSelect').disabled);assert(await page.locator('#captionDeckSelect').isDisabled());assert(await page.locator('.photo-preset-trigger').isDisabled());assert(await page.locator('.list-create-partner-grid button').isDisabled());assert(await page.locator('.list-create-recent button').isDisabled());
 console.log('PASS compact creation UI: automatic single/batch, manual caption retained, data templates, generated list navigation, cache/busy guards, text-only, partner search/create, Escape.');
}finally{await browser.close();}
