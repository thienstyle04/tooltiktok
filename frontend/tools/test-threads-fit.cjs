const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const esbuild = require('../../backend/node_modules/esbuild');
const puppeteer = require('../../backend/node_modules/puppeteer-core');
const root = path.resolve(__dirname, '../..');
const bundle = esbuild.buildSync({ stdin: { contents: "export {renderListPage} from './frontend/lib/pageMarkup'; export {fitItineraryNote} from './frontend/lib/itineraryNote'; export {applyPageTextScale,resetPageTextScale} from './frontend/lib/pageTextScale';", resolveDir: root }, bundle:true,write:false,format:'iife',globalName:'TestNote' }).outputFiles[0].text;
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.TEST_BROWSER_PATH,headless:true});
 try {
  const tab=await browser.newPage();
  await tab.setViewport({width:1000,height:900});
  await tab.setContent('<style>'+fs.readFileSync(path.join(root,'frontend/app/styles/itinerary-note.css'),'utf8')+'</style><main id="test"></main>');
  await tab.addScriptTag({content:bundle});
  for(const count of [22,26]) for(const size of [null]) {
   const result=await tab.evaluate(({count,size})=>{
    const names=['Tầm Bóp Lẩu Nướng','Tiệm cà phê trứng Cô Ba','Con hẻm Châu Âu','Bông Lan trứng nướng Kimi','Biệt thự Hoa Hồng','Tiệm cà phê Bình Minh Ơi','Con Dốc Nhật Bản','Tao Ngộ Quán – Lẩu gà lá é'];
    const addresses=['51 Trần Bình Trọng, Cam Ly – Đà Lạt','105 Hai Bà Trưng, Cam Ly – Đà Lạt','59/1 Nguyễn Văn Trỗi, Xuân Hương – Đà Lạt','21 Nguyễn Văn Trỗi, Xuân Hương – Đà Lạt','17 Cô Giang, Cam Ly – Đà Lạt','89 Hoàng Hoa Thám, Xuân Hương – Đà Lạt'];
    const page={type:'list',layoutVariant:'itinerary-note-threads-day',title:count===26?'Đà Lạt 3N2Đ':'Đà Lạt 2N1Đ',subtitle:'DỮ LIỆU KIỂM THỬ · Lịch trình gợi ý',textFontSize:size,items:Array.from({length:count},(_,i)=>({name:names[i%8],metaPrimary:addresses[i%6],label:'Ngày '+(Math.floor(i/8)+1)+'|'+['Sáng','Sáng','Sáng','Trưa','Chiều','Chiều','Chiều','Tối'][i%8],scheduleTime:'07:00',sourceSectionKey:['quan_an','cafe','check_in','quan_an','check_in','cafe','check_in','quan_an'][i%8]}))};
    const root=document.getElementById('test');root.innerHTML=TestNote.renderListPage(page,0,3,'test-main');
    TestNote.resetPageTextScale(root);TestNote.fitItineraryNote(root);TestNote.applyPageTextScale(root);TestNote.fitItineraryNote(root,true);
    const content=root.querySelector('.in-content'), last=root.querySelectorAll('.threads-place-row');
    const monochrome = [...root.querySelectorAll('h1,th,td')].every(node => {
      const style=getComputedStyle(node);
      return style.backgroundColor==='rgb(255, 255, 255)' && style.color==='rgb(17, 17, 17)';
    });
    return {monochrome,overflow:content.scrollHeight>content.clientHeight+1,rows:last.length,lastBottom:last[last.length-1].getBoundingClientRect().bottom,bottom:content.getBoundingClientRect().bottom,font:root.querySelector('article').style.getPropertyValue('--in-font-size')};
   },{count,size});
   assert.equal(result.monochrome,true);assert.equal(result.overflow,false);assert.equal(result.rows,count);assert(result.lastBottom<=result.bottom+1);
   console.log(JSON.stringify({count,size,...result}));
   await (await tab.$('article')).screenshot({path:path.join(root,`outputs/threads-fit-${count}-${size||'auto'}.png`)});
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
