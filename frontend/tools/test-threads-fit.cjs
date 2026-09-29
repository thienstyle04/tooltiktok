const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const esbuild = require('../../backend/node_modules/esbuild');
const puppeteer = require('../../backend/node_modules/puppeteer-core');
const root = path.resolve(__dirname, '../..');
const bundle = esbuild.buildSync({ stdin: { contents: "export {renderListPage} from './frontend/lib/pageMarkup'; export {fitItineraryNote} from './frontend/lib/itineraryNote'; export {applyPageTextScale,resetPageTextScale} from './frontend/lib/pageTextScale';", resolveDir: root }, bundle:true,write:false,format:'iife',globalName:'TestNote' }).outputFiles[0].text;
const exportSource = fs.readFileSync(path.join(root, 'frontend/lib/exportClient.js'), 'utf8');
const exportBundle = esbuild.buildSync({ stdin: { contents: exportSource + '\nexport {prepareQualityLayout,exportQualityProfile,renderPageBlobWithRetry};', resolveDir: path.join(root, 'frontend/lib') }, bundle:true,write:false,format:'iife',globalName:'TestExport' }).outputFiles[0].text;
(async()=>{
 const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'threads-portrait-'));
 const browser=await puppeteer.launch({executablePath:process.env.TEST_BROWSER_PATH,headless:true});
 try {
  const tab=await browser.newPage();
  await tab.setViewport({width:1000,height:900});
  await tab.setContent('<style>'+fs.readFileSync(path.join(root,'frontend/app/styles/itinerary-note.css'),'utf8')+'</style><main id="test"></main>');
  await tab.addScriptTag({content:bundle});
  await tab.addScriptTag({content:exportBundle});
  for(const {count,days,size,long} of [{count:18,days:3,size:null,long:false},{count:18,days:2,size:null,long:false},{count:18,days:3,size:9,long:false},{count:18,days:2,size:9,long:false},{count:18,days:3,size:null,long:true},{count:18,days:2,size:null,long:true},{count:22,days:2,size:null,long:false},{count:26,days:3,size:null,long:false}]) {
   const result=await tab.evaluate(async ({count,days,size,long})=>{
    const names=['Tầm Bóp Lẩu Nướng','Tiệm cà phê trứng Cô Ba','Con hẻm Châu Âu','Bông Lan trứng nướng Kimi','Biệt thự Hoa Hồng','Tiệm cà phê Bình Minh Ơi','Con Dốc Nhật Bản','Tao Ngộ Quán – Lẩu gà lá é'];
    const addresses=['51 Trần Bình Trọng, Cam Ly – Đà Lạt','105 Hai Bà Trưng, Cam Ly – Đà Lạt','59/1 Nguyễn Văn Trỗi, Xuân Hương – Đà Lạt','21 Nguyễn Văn Trỗi, Xuân Hương – Đà Lạt','17 Cô Giang, Cam Ly – Đà Lạt','89 Hoàng Hoa Thám, Xuân Hương – Đà Lạt'];
    const page={type:'list',layoutVariant:'itinerary-note-threads-day',title:days===3?'Đà Lạt 3N2Đ':'Đà Lạt 2N1Đ',subtitle:'DỮ LIỆU KIỂM THỬ · Lịch trình gợi ý',textFontSize:size,items:Array.from({length:count},(_,i)=>({name:names[i%8]+(long?' – chi nhánh gần khu trung tâm':''),metaPrimary:addresses[i%6]+(long?', phường trung tâm, thành phố Đà Lạt':''),label:'Ngày '+(days===3?(i<count/3?1:i<2*count/3?2:3):(i<count/2?1:2))+'|'+['Sáng','Sáng','Sáng','Trưa','Chiều','Chiều','Chiều','Tối'][i%8],scheduleTime:'07:00',sourceSectionKey:['quan_an','cafe','check_in','quan_an','check_in','cafe','check_in','quan_an'][i%8]}))};
    const root=document.getElementById('test');root.innerHTML=TestNote.renderListPage(page,0,3,'test-main');
    TestNote.resetPageTextScale(root);TestNote.fitItineraryNote(root);TestNote.applyPageTextScale(root);TestNote.fitItineraryNote(root,true);
    const content=root.querySelector('.in-content'), last=root.querySelectorAll('.threads-place-row');
    const background = element => getComputedStyle(element).backgroundColor;
    const headers = [...root.querySelectorAll('thead th')];
    const dayLabels = [...root.querySelectorAll('td.threads-day-label')];
    const plainCells = [...root.querySelectorAll('tbody td:not(.threads-day-label)')];
    const selectiveColor = headers.every(cell => background(cell)==='rgb(232, 236, 232)')
      && dayLabels.map(background).every((color, index, colors) => colors.indexOf(color)===index)
      && plainCells.every(cell => background(cell)==='rgb(255, 255, 255)');
    const dayColumnFits = [headers[0], ...dayLabels].every(cell => cell.scrollWidth <= cell.clientWidth + 1 && getComputedStyle(cell).whiteSpace === 'nowrap');
    const article=root.querySelector('article'), rect=article.getBoundingClientRect();
    let captured=null;
    if (count===18 && !long && size===null) {
      const profile=TestExport.exportQualityProfile('optimized',days===3?'itinerary-note-threads-3n2d':'itinerary-note-threads-2n1d','modern');
      TestExport.prepareQualityLayout([article],profile);
      const blob=await TestExport.renderPageBlobWithRetry(article,{...profile,imagesReady:true,embedFonts:false});
      const bitmap=await createImageBitmap(blob);
      const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
      const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
      let ink=0;for(let i=0;i<pixels.length;i+=64){if(pixels[i]<200||pixels[i+1]<200||pixels[i+2]<200)ink++;}
      captured={width:bitmap.width,height:bitmap.height,type:blob.type,ink};
      bitmap.close();
    }
    return {selectiveColor,dayColumnFits,overflow:content.scrollHeight>content.clientHeight+1,rows:last.length,lastBottom:last[last.length-1].getBoundingClientRect().bottom,bottom:content.getBoundingClientRect().bottom,font:article.style.getPropertyValue('--in-font-size'),cellFont:getComputedStyle(last[0].cells[1]).fontSize,tableWidth:root.querySelector('table').getBoundingClientRect().width,width:rect.width,height:rect.height,captured};
   },{count,days,size,long});
   assert.equal(result.selectiveColor,true);assert.equal(result.dayColumnFits,true);assert.equal(result.overflow,false);assert.equal(result.rows,count);assert(result.lastBottom<=result.bottom+1);
   assert.equal(result.width,810);assert.equal(result.height,1080);
   if(size===9) assert.equal(result.cellFont,'9px');
   else assert(Number.parseFloat(result.font)>=9);
   assert(result.tableWidth<=774);
   if(count===18&&!long&&size===null) { assert.equal(result.captured.width,1080);assert.equal(result.captured.height,1440);assert.equal(result.captured.type,'image/png');assert(result.captured.ink>1000); }
   console.log(JSON.stringify({count,days,size,long,...result}));
   await (await tab.$('article')).screenshot({path:path.join(outputDir,`threads-fit-${count}-${days}d-${size||'auto'}-${long?'long':'normal'}.png`)});
  }
  console.log(`Screenshots: ${outputDir}`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
