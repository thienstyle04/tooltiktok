import assert from 'node:assert/strict';
import path from 'node:path'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)); const require=createRequire(import.meta.url); const esbuild=require('esbuild');
const bundle=await esbuild.build({entryPoints:[path.join(here,'../lib/pageMarkup.js')],bundle:true,platform:'node',format:'esm',write:false});
const url=`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`; const {renderListPage}=await import(url);
const items=Array.from({length:8},(_,i)=>({name:`Địa điểm ${i+1}`,rawName:`Địa điểm ${i+1}`,metaPrimary:`${i+1} Ngô Quyền, Cam Ly - Đà Lạt`,metaSecondary:'',imageUrl:''}));
const page={type:'list',chipText:'Địa điểm',title:'Những địa điểm phải ghé khi đi Đà Lạt',subtitle:'',items,backgroundImage:'',layoutVariant:'summary-note-page',titlePlacement:'top-left'};
const html=renderListPage(page,0,1,'summary-note-test',[],{id:'summary-note-test',pages:[page]});
assert.match(html,/summary-note-page/); assert.match(html,/Tất cả iCloud/); assert.match(html,/summary-note-date/); assert.match(html,/summary-note-share/); assert.match(html,/summary-note-more/); assert.match(html,/summary-note-title/); assert.match(html,/summary-note-row/g); assert.equal((html.match(/class="summary-note-row"/g)||[]).length,8); assert.match(html,/📍/); assert.doesNotMatch(html,/img|Giá:|Khung giờ|Đối tác/);
const captionBundle=await esbuild.build({entryPoints:[path.join(here,'../lib/captionText.js')],bundle:true,platform:'node',format:'esm',write:false});
const captionUrl=`data:text/javascript;base64,${Buffer.from(captionBundle.outputFiles[0].text).toString('base64')}`;
const {buildCaptionExportText}=await import(captionUrl);
const exportedCaption=buildCaptionExportText({id:'summary-note-caption-01',title:'Những địa điểm phải ghé khi đi Đà Lạt',postCaption:'Caption cũ',captionBody:'Mô tả cũ',captionHashtags:['#dalat'],pages:[page]});
assert.equal(exportedCaption.split('\n').length,3);
assert.match(exportedCaption,/Em sắp có chuyến đi Đà Lạt vào tuần tới ạ/);
assert.match(exportedCaption,/Tóp tóp như hình bên dưới/);
assert.doesNotMatch(exportedCaption,/#dalat|Caption cũ|Mô tả cũ/);
console.log('PASS summary-note renderer/caption: 1 trang note, 8 dòng, caption 3 dòng không hashtag.');

