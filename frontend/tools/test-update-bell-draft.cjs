// Full DeckStudio: updater interactions must not discard or autosave editor drafts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const front=path.resolve(__dirname,'..'),esbuild=require(path.join(front,'../backend/node_modules/esbuild')),{chromium}=require('playwright');
const id='local-update-fixture';
const model={templateId:id,version:1,width:1080,height:1440,fonts:[],nodes:[{kind:'shape',x:0,y:0,width:1080,height:1440,style:{background:'#ddd'}},{kind:'text',field:'title',x:90,y:100,width:900,height:150,style:{fontFamily:'Arial',fontSize:60,lineHeight:'70px'}}]};
const dataset={generatedAt:'2026-10-13T00:00:00Z',source:{destinationId:'dalat-test',destinationLabel:'Đà Lạt Test',totalItems:1,coverImageUrls:[],allowedDeckIds:[id]},sections:[],decks:[{id,navTitle:'Mẫu thử',title:'Mẫu thử',description:'',localTemplate:{version:1,pageCount:2},lists:[{id:id+'-main',navTitle:'List chính',title:'Hook thử',pages:[{type:'cover',title:'Hook thử',subtitle:'',backgroundImage:'',localRender:model},{type:'list',title:'Trang hai',subtitle:'',backgroundImage:'',items:[],localRender:model}]}]}]};
async function main(){
 const bundle=await esbuild.build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Studio from './components/DeckStudio';createRoot(document.getElementById('root')).render(<Studio initialDataset={window.fixture}/>);",resolveDir:front,loader:'jsx'},bundle:true,write:false,format:'iife',loader:{'.js':'jsx'},jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const css=[...fs.readFileSync(path.join(front,'app/globals.css'),'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m=>fs.readFileSync(path.join(front,'app',m[1]),'utf8')).join('\n');
 const browser=await chromium.launch({headless:true,executablePath:[process.env.PROGRAMFILES+'/Google/Chrome/Application/chrome.exe',process.env['PROGRAMFILES(X86)']+'/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)});
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'dalat-update-draft-'));let dialogs=0,patches=[];
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('dialog',async d=>{dialogs++;await d.dismiss();});
  const update={enabled:true,currentVersion:'0.9.07',availableVersion:'0.9.08',notes:['Cải thiện giao diện'],busy:false,applying:false};
  await page.route('**/*',route=>{const p=new URL(route.request().url()).pathname;
   if(p==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<meta charset="utf-8"><style>'+css+'</style><div id="root"></div><script>window.fixture='+JSON.stringify(dataset)+'</script><script>'+bundle.outputFiles[0].text+'</script>'});
   if(p.startsWith('/api/app-update/')){const action=p.split('/').pop();if(action==='defer')update.scheduledAt=route.request().postDataJSON().scheduledAt;return route.fulfill({json:update});}
   if(p.startsWith('/api/decks/')&&route.request().method()==='PATCH'){const body=route.request().postDataJSON();patches.push(body);return route.fulfill({json:{deckId:id,listId:id+'-main',pageIndex:0,...body}});}
   if(p==='/api/guide-data')return route.fulfill({json:dataset});
   if(p==='/api/destinations')return route.fulfill({json:{active:{id:'dalat-test',label:'Đà Lạt Test'},destinations:[{id:'dalat-test',label:'Đà Lạt Test'}]}});
   if(p==='/api/drive-cache/status')return route.fulfill({json:{ready:true,phase:'ready',destinationId:'dalat-test'}});
   if(p==='/api/health')return route.fulfill({json:{status:'ok',sessionId:'update-draft-test',appVersion:'0.9.07'}});
   if(p==='/api/automation')return route.fulfill({json:{locked:false,schedules:[],runs:[]}});
   if(p==='/api/hook-sources')return route.fulfill({json:{mode:'normal',sources:[]}});
   if(p==='/api/photo-presets')return route.fulfill({json:{presets:[{id:null,label:'Ảnh gốc'}]}});
   if(p==='/api/partners')return route.fulfill({json:[]});
   if(p==='/api/night-sync/status')return route.fulfill({json:{phase:'idle',locked:false,sources:[]}});
   if(p.startsWith('/api/runtime-performance'))return route.fulfill({json:{mode:'modern',reason:'isolated'}});
   if(p.startsWith('/fonts/'))return route.fulfill({body:fs.readFileSync(path.join(front,'public',p))});
   return route.fulfill({status:404,body:'Isolated test: unavailable'});
  });
  await page.goto('http://update-draft.test/');await page.getByRole('navigation',{name:'Điều hướng chính'}).getByRole('button',{name:/^Duyệt & Xuất/}).click();
  const input=page.locator('.font-size-value input');await input.fill('45');await input.press('Enter');
  const title=page.locator('.inspector-page-editor textarea').first();await title.fill('Nội dung đang sửa');
  await page.getByText('● Chưa lưu',{exact:true}).waitFor();const bell=page.locator('.app-update-bell');const confirm=page.getByRole('alertdialog');
  await bell.click();assert.equal(await page.getByRole('button',{name:'Cập nhật ngay',exact:true}).isDisabled(),true,'Do not restart over an unsaved draft');await page.getByRole('button',{name:'Hẹn ngày giờ',exact:true}).click();await page.locator('input[type=datetime-local]').fill('2027-01-01T22:00');await page.getByRole('button',{name:'Lưu giờ hẹn',exact:true}).click();await page.getByText(/Hẹn cập nhật:/).waitFor();
  await page.getByRole('button',{name:'Đóng bảng cập nhật',exact:true}).click();assert.equal(dialogs,0);assert.equal(await confirm.count(),0);assert.equal(patches.length,0,'Update actions must not autosave');assert.equal(await input.inputValue(),'45');assert.equal(await title.inputValue(),'Nội dung đang sửa');
  await bell.click();await page.keyboard.press('Escape');assert.equal(dialogs,0);assert.equal(await confirm.count(),0);assert.equal(await title.inputValue(),'Nội dung đang sửa');
  // Cảnh báo bản nháp giờ là hộp xác nhận của studio (không phải window.confirm).
  await page.getByRole('tab',{name:'Trang 2',exact:true}).click();await confirm.waitFor();assert.match(await confirm.innerText(),/thay đổi chưa lưu/,'Real page navigation must still warn about draft');
  await confirm.getByRole('button',{name:'Ở lại chỉnh sửa',exact:true}).click();await confirm.waitFor({state:'detached'});await page.getByRole('heading',{name:'Trang 1/2',exact:true}).waitFor();assert.equal(await title.inputValue(),'Nội dung đang sửa','Staying keeps the draft');assert.equal(dialogs,0);
  await page.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();await page.getByText('Đã lưu',{exact:true}).waitFor();assert.equal(patches.length,1);assert.equal(patches[0].textFontSize,45);assert.equal(patches[0].title,'Nội dung đang sửa');
  await page.getByRole('tab',{name:'Trang 2',exact:true}).click();await page.getByRole('heading',{name:'Trang 2/2',exact:true}).waitFor();assert.equal(dialogs,0);assert.equal(await confirm.count(),0,'Saved draft navigates without a warning');
  await bell.click();assert.equal(await page.getByRole('button',{name:'Cập nhật ngay',exact:true}).isEnabled(),true);await page.screenshot({path:path.join(output,'editor-bell.png')});
  console.log('PASS full editor: update bell/check/schedule/close/Escape preserve font+copy draft; no false confirm/autosave; real navigation still warns; subsequent save and navigation succeed. Screenshot:',output);
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
