// Real status component/CSS, isolated state transitions; no live data or jobs.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const {createRequire} = require('node:module');
const front = path.resolve(__dirname,'..');
const esbuild = createRequire(path.resolve(front,'../backend/package.json'))('esbuild');
const {chromium} = require('playwright');
async function main() {
  const source = `import React from 'react';import {createRoot} from 'react-dom/client';import Status from './components/StudioStatusBar';
    function App(){const[job,setJob]=React.useState(null),[status,setStatus]=React.useState('Dữ liệu đã sẵn sàng.'),[automated,setAutomated]=React.useState(false),[theme,setTheme]=React.useState('dark');
      window.ui={setJob,setStatus,setAutomated,setTheme};window.cancelCalls||=[];
      return <main className="app-shell studio-workflow" data-studio-theme={theme}>
        <aside className="app-sidebar"><h2>Dalat Studio</h2><span>Tạo bài đăng</span></aside>
        <section className="studio-shell"><header className="studio-topbar"><h2>Tạo list</h2></header>
          <Status status={status} job={job} automationState={{locked:automated,activeRunId:'scheduled',runs:[{id:'scheduled',phase:'Đang tạo 5 list...'}]}}
            onError={setStatus} onCancel={async id=>{window.cancelCalls.push(id);await new Promise(r=>setTimeout(r,100));if(window.cancelFails)throw Error('Không thể hủy: lỗi mạng thử nghiệm.');}}/>
          <nav className="studio-workflow-steps"><button>1 · Chọn mẫu</button><button>2 · Tạo list</button></nav>
          <section id="create-panel" className="workspace-grid caption-mode"><article><h2>Tạo list mới</h2><p>Chọn mẫu và cấu hình, phần còn lại để tool xử lý.</p><button>Đang tạo...</button></article></section>
        </section></main>;
    }createRoot(document.getElementById('root')).render(<App/>);`;
  const bundle=await esbuild.build({stdin:{contents:source,resolveDir:front,loader:'jsx'},bundle:true,write:false,format:'iife',loader:{'.js':'jsx'},jsx:'automatic'});
  const css=[...fs.readFileSync(path.join(front,'app/globals.css'),'utf8').matchAll(/@import url\("(.+?)"\)/g)].map(m=>fs.readFileSync(path.join(front,'app',m[1]),'utf8')).join('\n');
  const executablePath=[`${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`,`${process.env['PROGRAMFILES(X86)']}/Microsoft/Edge/Application/msedge.exe`].find(fs.existsSync);
  const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'dalat-status-layout-'));
  try {
    const page=await browser.newPage();await page.goto('about:blank');await page.setContent('<style>'+css+'</style><div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});await page.waitForFunction(()=>window.ui);
    const geometry=()=>page.evaluate(()=>Object.fromEntries(['.app-sidebar','.studio-shell','.studio-topbar','.studio-status-bar','#create-panel'].map(sel=>{const r=document.querySelector(sel).getBoundingClientRect();return [sel,{x:r.x,y:r.y,width:r.width,height:r.height}];})));
    for(const width of [1920,1280,768,390])for(const theme of ['dark','light']) {
      await page.setViewportSize({width,height:900});await page.evaluate(t=>{window.ui.setJob(null);window.ui.setAutomated(false);window.ui.setStatus('Sẵn sàng');window.ui.setTheme(t);},theme);await page.waitForTimeout(40);
      const before=await geometry();
      for(const state of ['queued','running','completed','failed','cancelled','automated','long']){
        await page.evaluate(s=>{window.ui.setJob(['queued','running'].includes(s)?{id:'fixture',status:s}:null);window.ui.setAutomated(s==='automated');window.ui.setStatus(s==='long'?'Lỗi: '.repeat(100):s==='failed'?'Lỗi tạo list: hãy thử lại.':'Đã hoàn tất.');},state);
        await page.waitForTimeout(40);assert.deepEqual(await geometry(),before,`${width}/${theme}/${state}: shell/header/content must not shift`);
        assert.equal(await page.locator('.app-shell > .automation-lock-banner').count(),0);
        assert.equal(await page.getByRole('button',{name:'Hủy yêu cầu',exact:true}).count(),state==='queued'?1:0);
        const noOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);assert.equal(noOverflow,true,`${width}: horizontal overflow`);
      }
      console.log('PASS stable layout:',width,theme);
    }
    await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>{window.ui.setAutomated(false);window.ui.setJob({id:'cancel-fixture',status:'queued'});window.cancelFails=true;});
    await page.getByRole('button',{name:'Hủy yêu cầu',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Đang hủy...',exact:true}).isDisabled(),true);
    await page.waitForFunction(()=>document.getElementById('statusText').textContent.includes('lỗi mạng'));assert.equal(await page.getByRole('button',{name:'Hủy yêu cầu',exact:true}).isEnabled(),true);
    await page.evaluate(()=>window.cancelFails=false);await page.getByRole('button',{name:'Hủy yêu cầu',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.studio-status-cancel')?.textContent==='Đã gửi hủy');
    assert.equal(await page.getByRole('button',{name:'Đã gửi hủy',exact:true}).isDisabled(),true);assert.deepEqual(await page.evaluate(()=>window.cancelCalls),['cancel-fixture','cancel-fixture']);
    await page.evaluate(()=>{window.ui.setTheme('dark');window.ui.setJob({id:'next-fixture',status:'queued'});});await page.waitForTimeout(40);
    await page.screenshot({path:path.join(output,'queue-desktop.png')});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'queue-mobile.png')});
    const studio=fs.readFileSync(path.join(front,'components/DeckStudio.js'),'utf8');
    assert.ok(studio.indexOf('{activeList?.warnings?.length')>studio.indexOf('<section className="studio-shell">'),'List warnings must belong to shell, not root grid');
    assert.ok(!studio.includes("{manualJob?.status === 'queued' ? <div"),'Old standalone queue banner removed');
    console.log('PASS cancellation pending/success/failure/retry, single stable status, root layout guards. Screenshots:',output);
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
