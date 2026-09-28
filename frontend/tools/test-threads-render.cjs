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
 assert(html.includes('<table class="threads-table">'));
 for (const heading of ['Giờ dự kiến', 'Hoạt động / địa điểm', 'Địa chỉ']) assert(html.includes(heading));
 assert.equal((html.match(/class="threads-place-row"/g)||[]).length, count);
 assert(html.includes('Về chỗ nghỉ'));
 assert(!/<img\b|image-placeholder|list-item-image|Minh họa/.test(html));
 assert.equal((html.match(/&lt;test&gt;/g)||[]).length, count);
 for (const period of ['Sáng','Trưa','Chiều','Tối']) assert(html.includes(period));
}
for (const count of [14,22]) {
 const page = {type:'list',layoutVariant:'itinerary-note-threads-day',title:'Lịch trình tổng hợp',subtitle:'Giờ dự kiến',items:Array.from({length:count},(_,i)=>({name:`Điểm ${i}`,metaPrimary:`Địa chỉ ${i}`,label:`Ngày ${Math.floor(i/8)+1}|Sáng`,scheduleTime:'09:00',sourceSectionKey:'cafe'}))};
 const html = renderListPage(page,0,1,'threads-main',[],{pages:[page]});
 assert.equal((html.match(/<article /g)||[]).length,1);
 assert.equal((html.match(/class="threads-place-row /g)||[]).length,count);
 assert.equal((html.match(/<th>/g)||[]).length,4);
 assert(html.includes('threads-summary'));
 assert(!html.includes('<h1>'), 'Threads summaries begin with column headings, without a title');
 for (const heading of ['Ngày','Địa điểm / hoạt động','Địa chỉ','Ghi chú']) assert(html.includes(`<th>${heading}</th>`));
 assert(!html.includes('<th>Giờ dự kiến</th>'));
 assert(!html.includes('Cafe: Điểm'));
 assert(html.includes('day-2'));
 assert.equal(html.includes('day-3'),count===22);
 assert(!/<img\b|image-placeholder/.test(html));
}
console.log('PASS: legacy day rendering and single-page 14/22-row summaries, reference columns, no images');
