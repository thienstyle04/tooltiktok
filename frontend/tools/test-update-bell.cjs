// Real update UI, sidebar and application CSS; all updater API calls simulated.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const front=path.resolve(__dirname,'..'),esbuild=require(path.join(front,'../backend/node_modules/esbuild')),{chromium}=require('playwright');
async function main(){
 const source=`import React from 'react';import{createRoot}from'react-dom/client';import UpdateNotice from './components/UpdateNotice';import ThemeToggle from './components/ui/ThemeToggle';
 const root=createRoot(document.getElementById('root'));
 function App(){const[theme,setTheme]=React.useState('dark');window.theme=setTheme;return <main className="app-shell studio-workflow studio-v2" data-studio-theme={theme} data-view="today">
   <aside className="v2-sidebar"><div className="v2-brand"><b>ĐL</b><span>Dalat Studio<small>v0</small></span></div><nav className="v2-nav" aria-label="Điều hướng chính">{['Hôm nay','Tạo','Duyệt & Xuất','Tự động'].map(label=><button key={label} type="button"><span className="v2-nav-label">{label}</span></button>)}</nav></aside>
   <section className="v2-workspace"><header className="v2-topbar"><div className="v2-title"><h2>Hôm nay</h2></div><div className="v2-top-actions"><ThemeToggle theme={theme} onToggle={()=>setTheme(theme==='dark'?'light':'dark')}/><button type="button" className="v2-icon-button v2-task-button">T</button></div></header>
   <UpdateNotice/><div className="v2-content"><div id="anchor">Nội dung đang làm</div><button id="outside" style={{marginTop:800}}>Ngoài bảng</button><div style={{height:1000}}/></div></section></main>}
 window.mount=()=>root.render(<React.StrictMode><App/></React.StrictMode>);window.unmount=()=>root.unmount();window.mount();`;
 const bundle=await esbuild.build({stdin:{contents:source,resolveDir:front,loader:'jsx'},bundle:true,write:false,format:'iife',loader:{'.js':'jsx'},jsx:'automatic'});
 const css=[...fs.readFileSync(path.join(front,'app/globals.css'),'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m=>fs.readFileSync(path.join(front,'app',m[1]),'utf8')).join('\n');
 const browser=await chromium.launch({headless:true,executablePath:[process.env.PROGRAMFILES+'/Google/Chrome/Application/chrome.exe',process.env['PROGRAMFILES(X86)']+'/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)});
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'dalat-update-bell-'));
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});await page.goto('about:blank');await page.setContent('<style>'+css+'</style><div id="root"></div>');
  await page.evaluate(()=>{
   window.calls=[];window.server={enabled:true,currentVersion:'0.9.07',availableVersion:null,notes:[],scheduledAt:null,applying:false,busy:false,error:''};
   window.intervals=new Map();const set=window.setInterval.bind(window),clear=window.clearInterval.bind(window);
   window.setInterval=(fn,ms)=>{const id=set(fn,ms);window.intervals.set(id,{fn,ms});return id;};window.clearInterval=id=>{window.intervals.delete(id);clear(id);};
   window.poll=()=>[...window.intervals.values()].filter(x=>[5000,60000].includes(x.ms)).forEach(x=>x.fn());
   window.fetch=async(url,init={})=>{const action=String(url).split('/').pop(),body=init.body?JSON.parse(init.body):{};window.calls.push({action,method:init.method||'GET',headers:init.headers,body});
    if(window.offline)throw Error('MOCK_NETWORK_UNAVAILABLE');
    if(action==='status'&&window.slow){window.slow=false;const stale=structuredClone(window.server);return new Promise(resolve=>{window.resolveSlow=()=>resolve(Response.json(stale));});}
    if(action==='check'&&window.checkError)return Response.json({message:'MOCK_CHECK_FAILED'},{status:503});
    if(action==='defer')window.server.scheduledAt=body.scheduledAt;
    if(action==='cancel-schedule')window.server.scheduledAt=null;
    if(action==='install'){if(window.server.busy)return Response.json({message:'Busy'},{status:409});window.server.applying=true;window.server.updateProgress={phase:'downloading',message:'Đang tải',bytes:25,total:100};}
    return Response.json(structuredClone(window.server));};
  });
  await page.addScriptTag({content:bundle.outputFiles[0].text});const bell=page.locator('.app-update-bell'),panel=page.locator('.app-update-notice');
  await bell.waitFor();await page.waitForFunction(()=>window.calls.length>0);
  assert.equal(await panel.count(),0);assert.equal(await page.locator('.app-update-dot').count(),0);
  assert.deepEqual(await page.evaluate(()=>[...window.intervals.values()].map(x=>x.ms)),[60000]);
  await bell.click();await page.getByText('Chưa có bản cập nhật mới',{exact:true}).waitFor();assert.equal(await bell.getAttribute('aria-expanded'),'true');
  assert.deepEqual(await page.evaluate(()=>[...window.intervals.values()].map(x=>x.ms)),[5000]);
  await page.keyboard.press('Escape');assert.equal(await panel.count(),0);assert.equal(await bell.evaluate(n=>n===document.activeElement),true);
  await bell.focus();await page.keyboard.press('Enter');await panel.waitFor();await page.keyboard.press('Tab');assert.equal(await page.getByRole('button',{name:'Đóng bảng cập nhật',exact:true}).evaluate(n=>n===document.activeElement),true);await page.keyboard.press('Enter');assert.equal(await panel.count(),0);
  await page.evaluate(()=>window.offline=true);await bell.click();await page.getByRole('alert').filter({hasText:'MOCK_NETWORK_UNAVAILABLE'}).waitFor();assert.equal(await page.getByText('Chưa có bản cập nhật mới',{exact:true}).count(),0);
  await page.evaluate(()=>{window.offline=false;window.checkError=true;});await page.getByRole('button',{name:'Kiểm tra lại',exact:true}).click();await page.getByText('MOCK_CHECK_FAILED',{exact:true}).waitFor();
  await page.evaluate(()=>window.checkError=false);await page.getByRole('button',{name:'Kiểm tra lại',exact:true}).click();await page.getByText('Chưa có bản cập nhật mới',{exact:true}).waitFor();await page.keyboard.press('Escape');
  await page.evaluate(()=>{window.server.availableVersion='0.9.08';window.server.notes=['Sửa lỗi và tối ưu'];window.poll();});await page.locator('.app-update-dot').waitFor();assert.equal(await panel.count(),0,'New release must not open the panel');
  await bell.click();await page.getByText('Có bản mới 0.9.08',{exact:true}).waitFor();await bell.click();assert.equal(await page.locator('.app-update-dot').count(),1,'Viewing does not clear badge');
  for(const width of [1920,1280,768,390])for(const theme of ['dark','light']){
   await page.setViewportSize({width,height:900});await page.evaluate(t=>{window.theme(t);window.server.notes=Array.from({length:20},(_,i)=>'Ghi chú '+i+' '+ 'nội dung '.repeat(20));},theme);
   const geometry=()=>page.locator('#anchor').boundingBox();const before=await geometry();const fixed=await bell.boundingBox();
   await bell.click();await page.waitForFunction(()=>document.querySelector('.app-update-notice ul')?.children.length===20);
   assert.deepEqual(await geometry(),before,'Floating update panel must not shift layout');
   const p=await panel.boundingBox();assert.ok(p.x>=0&&p.y>=0&&p.x+p.width<=width+1&&p.y+p.height<=901,'Panel must fit viewport');
   for(const selector of ['.studio-theme-toggle','.v2-task-button','.v2-nav button'])for(const n of await page.locator(selector).all()){const r=await n.boundingBox();if(r)assert.ok(r.x+r.width<=fixed.x||r.x>=fixed.x+fixed.width||r.y+r.height<=fixed.y||r.y>=fixed.y+fixed.height,'Bell must not overlap theme/menu');}
   await page.screenshot({path:path.join(output,`${width}-${theme}.png`)});
   await page.keyboard.press('Escape');await page.evaluate(()=>document.querySelector('.v2-content').scrollTop=500);assert.deepEqual(await bell.boundingBox(),fixed,'Bell must stay fixed while scrolling');await page.evaluate(()=>document.querySelector('.v2-content').scrollTop=0);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));console.log('PASS fixed layout',width,theme);
  }
  await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>{window.server.notes=[];window.server.busy=true;});await bell.click();await page.waitForFunction(()=>document.querySelector('.app-update-actions button')&&[...document.querySelectorAll('button')].some(b=>b.textContent==='Cập nhật ngay'&&b.disabled));
  assert.equal(await page.getByRole('button',{name:'Cập nhật ngay',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'Hẹn ngày giờ',exact:true}).click();
  await page.locator('input[type=datetime-local]').fill('2027-01-01T22:00');await page.getByRole('button',{name:'Lưu giờ hẹn',exact:true}).click();await page.getByText(/Hẹn cập nhật:/).waitFor();
  assert.equal(await page.evaluate(()=>window.server.scheduledAt),'2027-01-01T15:00:00.000Z');assert.equal(await page.locator('.app-update-dot').count(),1);await page.keyboard.press('Escape');assert.ok(await page.evaluate(()=>window.server.scheduledAt));
  await bell.click();await page.getByRole('button',{name:'Hủy lịch cập nhật',exact:true}).click();await page.waitForFunction(()=>window.server.scheduledAt===null);
  await page.evaluate(()=>{window.server.busy=false;window.poll();});await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Cập nhật ngay'&&!b.disabled));
  await page.getByRole('button',{name:'Cập nhật ngay',exact:true}).click();await page.getByText(/Đang tải.*25%/).waitFor();await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.server.applying),true,'Closing panel must not stop installation');
  await page.evaluate(()=>{window.server.applying=false;window.server.error='MOCK_INSTALL_FAILED';window.poll();});await bell.click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('.app-update-dot').count(),1);
  await page.evaluate(()=>{window.offline=true;window.poll();});await page.getByRole('alert').filter({hasText:'MOCK_NETWORK_UNAVAILABLE'}).waitFor();assert.equal(await page.locator('.app-update-dot').count(),1);assert.equal(await page.getByText('Chưa có bản cập nhật mới',{exact:true}).count(),0);
  await page.evaluate(()=>{window.offline=false;window.server.error='';window.server.currentVersion='0.9.08';window.server.availableVersion=null;window.server.updateProgress={phase:'complete'};});await page.getByRole('button',{name:'Kiểm tra lại',exact:true}).click();await page.locator('.app-update-dot').waitFor({state:'detached'});
  await page.evaluate(()=>{window.server.enabled=false;window.poll();});await page.getByText('Phiên bản này chưa bật trình cập nhật.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Cập nhật ngay',exact:true}).count(),0);
  await page.evaluate(()=>{window.server.enabled=true;window.server.availableVersion='0.9.09';window.slow=true;window.poll();});await page.waitForFunction(()=>window.resolveSlow);
  await page.evaluate(()=>{window.server.availableVersion='0.9.10';});await page.getByRole('button',{name:'Kiểm tra lại',exact:true}).click();await page.getByText('Có bản mới 0.9.10',{exact:true}).waitFor();await page.evaluate(()=>window.resolveSlow());assert.equal(await page.getByText('Có bản mới 0.9.10',{exact:true}).count(),1,'Stale GET must not overwrite POST result');
  await page.mouse.click(220,300);assert.equal(await panel.count(),0,'Outside pointer closes panel');
  await page.evaluate(()=>window.unmount());assert.equal(await page.evaluate(()=>window.intervals.size),0);
  assert.ok((await page.evaluate(()=>window.calls)).every(c=>c.headers['x-dalat-update']==='1'));
  console.log('PASS updater states, idle/open polling, badge lifetime, actions, busy scheduling/Vietnam time, errors/recovery, stale responses, focus/Escape/outside, cleanup. Screenshots:',output);
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
