import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {photoDisplayUrl,photoRenderPage,photoRenderArguments,supportsPhotoPreset,COLOR_EDIT_PRESET as preset} from '../lib/photoPresets.mjs';
const require=createRequire(import.meta.url),esbuild=require('esbuild');
const bundle=await esbuild.build({entryPoints:['lib/pageMarkup.js'],bundle:true,write:false,format:'esm',platform:'node'});
const {renderCoverPage,renderListPage}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const src='/assets/drive-file?id=original',candidate='/assets/drive-file?id=candidate';
const item={id:'place',name:'Quán thử',metaPrimary:'Xuân Hương - Đà Lạt',imageUrl:src,candidateImageUrls:[candidate],isPartner:true};
for(const layout of ['grid-4','grid-6','spotlight-v2','spotlight-v3','spotlight-v4-page','spotlight-v5-place','spotlight-v6-page','itinerary-timeline-day']){
 const page={type:'list',title:'Trang thử',chipText:'Điểm cần lưu',subtitle:'',footer:'',backgroundImage:src,layoutVariant:layout,items:[item]};
 const list={id:'fixture',title:'Thử',pages:[page],photoPreset:preset},before=JSON.stringify(list);
 const html=renderListPage(page,0,1,list.id,[],list,[]);
 assert(html.includes('/assets/color-edit?'),layout);assert(html.includes('data-export-strict="true"'),layout);
 assert(!/<img[^>]+src="\/assets\/drive-file/.test(html),layout);assert.equal(JSON.stringify(list),before);
 const original=renderListPage(page,0,1,list.id,[],{...list,photoPreset:null},[]);assert(!original.includes('/assets/color-edit?'),layout);
}
const cover={type:'cover',title:'Bìa',subtitle:'',backgroundImage:src,coverImages:[src,candidate],layoutVariant:'spotlight-v2-cover'};
const changed=photoRenderPage({type:'list',backgroundImage:candidate,items:[{...item,imageUrl:candidate}],layoutVariant:'spotlight-v6-diary-page'},preset);
assert.equal(changed.backgroundImage,photoDisplayUrl(candidate,preset));assert.equal(changed.items[0].imageUrl,changed.backgroundImage);
assert(renderListPage(changed,0,1,'diary',[],{pages:[changed],photoPreset:preset},[]).includes('/assets/color-edit?'));
assert(renderCoverPage(cover,0,1,'fixture',[],{pages:[cover],photoPreset:preset},[]).includes('/assets/color-edit?'));
const map={type:'list',layoutVariant:'spotlight-v6-map-page',backgroundImage:src,items:[item],photoPreset:preset};
assert.equal(photoRenderPage(map,preset),map);assert.equal(photoRenderArguments(map,[0,1,'id',[],{photoPreset:preset}]).preset,null);
assert.equal(photoDisplayUrl(photoDisplayUrl(src,preset),preset),photoDisplayUrl(src,preset));
assert(!supportsPhotoPreset('threads-mix-text'));assert(supportsPhotoPreset('threads-food-local'));
const fixture=JSON.parse(fs.readFileSync('../outputs/partners-audit-1790938831326/generation.json'));
let templates=0,pages=0;
for(const deck of fixture.decks.filter(deck=>supportsPhotoPreset(deck.id)&&deck.lists.length)){
 templates++;const list={...deck.lists[0],photoPreset:preset};const before=JSON.stringify(list);
 for(const [index,page]of list.pages.entries()){
  const renderer=page.type==='cover'?renderCoverPage:renderListPage;
  const html=renderer(page,index,list.pages.length,list.id,list.captionHashtags||[],list,[]);
  assert.equal(JSON.stringify(list),before);
  if(page.layoutVariant==='spotlight-v6-map-page')assert(!html.includes('/assets/color-edit?'));
  else if(renderer(page,index,list.pages.length,list.id,list.captionHashtags||[],{...list,photoPreset:null},[]).includes('<img'))assert(html.includes('/assets/color-edit?'),deck.id+':'+page.layoutVariant);
  pages++;
 }
}
console.log(`PASS full catalog render smoke: ${templates} photo templates, ${pages} pages; immutable models and map exclusion.`);
console.log('PASS shared render: 8 layouts, collage, original/preset, immutable sources, maps excluded, no double filtering.');
