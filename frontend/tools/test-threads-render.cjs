const assert = require('node:assert/strict');
const esbuild = require('../../backend/node_modules/esbuild');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const result = esbuild.buildSync({ entryPoints: [path.join(root, 'frontend/lib/pageMarkup.js')], bundle: true, write: false, platform: 'node', format: 'cjs' });
const moduleObject = { exports: {} };
vm.runInNewContext(result.outputFiles[0].text, { module: moduleObject, exports: moduleObject.exports, require, console });
const { renderListPage } = moduleObject.exports;
for (const count of [6, 8]) {
 const page = { type: 'list', layoutVariant: 'itinerary-note-threads-day', title: 'Note Threads · Ngày 1', subtitle: 'Lịch trình gợi ý', chipText: 'Ngày 1', backgroundImage: '', items: Array.from({length:count}, (_,i) => ({ name: `Địa điểm ${i} <test>`, metaPrimary: 'Địa chỉ minh họa', label: ['Sáng','Trưa','Chiều','Tối'][i%4], imageUrl: '', imageSource: 'fallback' })) };
 const html = renderListPage(page, 0, 3, 'threads-main', [], { pages: [page] });
 assert(html.includes('itinerary-note-threads-day'));
 assert(html.includes('threads-portrait'));
 assert(html.includes('<table class="threads-table">'));
 for (const heading of ['Giờ dự kiến', 'Hoạt động / địa điểm', 'Địa chỉ']) assert(html.includes(heading));
 assert.equal((html.match(/class="threads-place-row"/g)||[]).length, count);
 assert(html.includes('Về chỗ nghỉ'));
 assert(!/<img\b|image-placeholder|list-item-image|Minh họa/.test(html));
 assert.equal((html.match(/&lt;test&gt;/g)||[]).length, count);
 for (const period of ['Sáng','Trưa','Chiều','Tối']) assert(html.includes(period));
}
for (const dayCounts of [[6,6,6],[9,9],[12,2],[12,10],[9,9,8]]) {
 const count = dayCounts.reduce((sum, value) => sum + value, 0);
 const dayFor = index => dayCounts.findIndex((_, day) => index < dayCounts.slice(0, day + 1).reduce((sum, value) => sum + value, 0)) + 1;
 const page = {type:'list',layoutVariant:'itinerary-note-threads-day',title:'Lịch trình tổng hợp',subtitle:'Giờ dự kiến',items:Array.from({length:count},(_,i)=>({name:`Điểm ${i}`,metaPrimary:`Địa chỉ ${i}`,label:`Ngày ${dayFor(i)}|Sáng`,scheduleTime:'09:00',sourceSectionKey:'cafe'}))};
 const html = renderListPage(page,0,1,'threads-main',[],{pages:[page]});
 assert.equal((html.match(/<article /g)||[]).length,1);
 assert.equal((html.match(/class="threads-place-row /g)||[]).length,count);
 assert.equal((html.match(/<th>/g)||[]).length,4);
 assert(html.includes('threads-summary'));
 assert(html.includes('threads-portrait'));
 assert(html.includes('<col style="width:12%"><col style="width:26%"><col style="width:40%"><col style="width:22%">'));
 assert(!html.includes('<h1>'), 'Threads summaries begin with column headings, without a title');
 for (const heading of ['Ngày','Địa điểm / hoạt động','Địa chỉ','Ghi chú']) assert(html.includes(`<th>${heading}</th>`));
 assert(!html.includes('<th>Giờ dự kiến</th>'));
 assert(!html.includes('Cafe: Điểm'));
 assert(html.includes('day-2'));
 assert.equal(html.includes('day-3'),dayCounts.length===3);
 for(const day of dayCounts.map((_,index)=>index+1)) {
  assert.equal((html.match(new RegExp(`class="threads-day-label threads-day-${day}"`, 'g'))||[]).length,1);
 }
 assert.equal((html.match(/class="threads-day-label /g)||[]).length,dayCounts.length);
 assert(!/<img\b|image-placeholder/.test(html));
}
const notePage = {type:'list',layoutVariant:'itinerary-note-threads-day',title:'Ghi chú',items:[
  {name:'Ăn sáng',metaPrimary:'Địa chỉ',label:'Ngày 1|Sáng',sourceSectionKey:'quan_an'},
  {name:'Điểm tham quan',metaPrimary:'Địa chỉ',label:'Ngày 1|Sáng',sourceSectionKey:'check_in'},
  {name:'Ăn tối',metaPrimary:'Địa chỉ',label:'Ngày 1|Tối',sourceSectionKey:'quan_an'},
  {name:'Đi chơi đêm',metaPrimary:'Địa chỉ',label:'Ngày 1|Tối',sourceSectionKey:'choi_dem'},
]};
const noteHtml = renderListPage(notePage,0,1,'threads-main',[],{pages:[notePage]});
for (const note of ['Ăn sáng','Tham quan / check-in','Ăn tối','Đi chơi đêm']) assert(noteHtml.includes(`<td>${note}</td>`));
assert(!/Ăn sáng · sáng|Tham quan \/ check-in · sáng|Ăn tối · tối/.test(noteHtml));
console.log('PASS: portrait Threads tables, one colored label per day, reference columns, no images');
