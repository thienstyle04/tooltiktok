import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validatePhotoPreset, applyListPhotoPreset, supportsPhotoPreset, photoPresetsCatalog } from '../photo-presets';
import { migrateColorEditStores } from '../color-edit-migration';
import { AutomationSchedulerService } from '../automation-scheduler.service';
import { GuideService } from '../guide.service';

assert.equal(validatePhotoPreset(null),undefined);
assert.equal(validatePhotoPreset(undefined),undefined);
assert.throws(()=>validatePhotoPreset('bogus'),/không được hỗ trợ/);
assert.throws(()=>validatePhotoPreset('iphone-color-edit-v1','threads-mix-text'),/chỉ có chữ/);
assert.ok(supportsPhotoPreset('threads-cafe-local'));
assert.equal(photoPresetsCatalog().presets.length,2);
const list:any={id:'unchanged',pages:[{type:'cover',backgroundImage:'/assets/drive-file?id=source'},{type:'list',items:[{imageUrl:'/assets/library?path=source'}]}]};
const original=JSON.stringify(list);
applyListPhotoPreset(list,'iphone-color-edit-v1');assert(list.pages.every((page:any)=>page.photoPreset===list.photoPreset));
applyListPhotoPreset(list,null);assert.equal(JSON.stringify(list),original);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'dalat-preset-migration-'));
const saved:any={id:'spotlight-v5-color-edit-caption-001',photoPreset:'iphone-color-edit-v1',spotlightDesignRevision:1,pages:[{type:'cover',title:'Đã duyệt',backgroundImage:'/assets/drive-file?id=source',photoPreset:'iphone-color-edit-v1'}]};
const store={version:1,decks:{'spotlight-v5':[ {id:'old-v5',pages:[]} ],'spotlight-v5-color-edit':[saved]}};
const overrides={decks:{'spotlight-v5-color-edit':{[saved.id]:{'0':{title:'Đã chỉnh',textFontSize:14}}}}};
const schedule={version:1,schedules:[{templates:[{deckId:'spotlight-v5-color-edit',count:4}]}],runs:[{templates:[{deckId:'spotlight-v6-color-edit',count:3}],generated:[{deckId:'spotlight-v5-color-edit',listId:saved.id}],errors:[{deckId:'spotlight-v6-color-edit',message:'cũ'}]}]};
for(const [name,value]of Object.entries({'generated-caption-lists.dalat.json':store,'page-text-overrides.dalat.json':overrides,'automation-schedules.json':schedule}))fs.writeFileSync(path.join(root,name),JSON.stringify(value));
assert.equal(migrateColorEditStores(root).length,3);
const get=(name:string)=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
assert.deepEqual(get('generated-caption-lists.dalat.json').decks['spotlight-v5'][1],saved);
assert.equal(get('page-text-overrides.dalat.json').decks['spotlight-v5'][saved.id]['0'].title,'Đã chỉnh');
assert.deepEqual(get('automation-schedules.json').schedules[0].templates[0],{deckId:'spotlight-v5',count:4,photoPreset:'iphone-color-edit-v1'});
assert.equal(get('automation-schedules.json').runs[0].generated[0].listId,saved.id);
assert.equal(migrateColorEditStores(root).length,0);
const backup=path.join(root,'migration-backups',fs.readdirSync(path.join(root,'migration-backups'))[0]);
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(backup,'generated-caption-lists.dalat.json'),'utf8')),store);
const restored=fs.mkdtempSync(path.join(os.tmpdir(),'dalat-preset-restore-'));
for(const name of fs.readdirSync(backup))fs.copyFileSync(path.join(backup,name),path.join(restored,name));
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(restored,'generated-caption-lists.dalat.json'),'utf8')),store);
assert.equal(migrateColorEditStores(restored).length,3);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(restored,'generated-caption-lists.dalat.json'),'utf8')),get('generated-caption-lists.dalat.json'));
const rollback=fs.mkdtempSync(path.join(os.tmpdir(),'dalat-preset-rollback-'));
for(const name of fs.readdirSync(backup))fs.copyFileSync(path.join(backup,name),path.join(rollback,name));
const rename=fs.renameSync;let writes=0;
try { fs.renameSync=((...args:Parameters<typeof fs.renameSync>)=>{if(++writes===2)throw Error('Simulated disk replacement failure');return rename(...args);}) as typeof fs.renameSync;
 assert.throws(()=>migrateColorEditStores(rollback),/Simulated disk/);
} finally {fs.renameSync=rename;}
for(const name of fs.readdirSync(backup))assert(fs.readFileSync(path.join(backup,name)).equals(fs.readFileSync(path.join(rollback,name))),name+' rollback must restore original bytes');
const conflictRoot=fs.mkdtempSync(path.join(os.tmpdir(),'dalat-preset-conflict-'));
const bad=JSON.stringify({decks:{'spotlight-v5':[saved],'spotlight-v5-color-edit':[{...saved,title:'different'}]}});
fs.writeFileSync(path.join(conflictRoot,'generated-caption-lists.dalat.json'),bad);
assert.throws(()=>migrateColorEditStores(conflictRoot),/Trùng ID/);
assert.equal(fs.readFileSync(path.join(conflictRoot,'generated-caption-lists.dalat.json'),'utf8'),bad);
const scheduler:any=Object.create(AutomationSchedulerService.prototype);
assert.equal(scheduler.validateTemplates([{deckId:'spotlight-v5',count:4,photoPreset:'iphone-color-edit-v1'}])[0].photoPreset,'iphone-color-edit-v1');
assert.equal(scheduler.validateTemplates([{deckId:'spotlight-v6',count:4}])[0].photoPreset,undefined);
assert.throws(()=>scheduler.validateTemplates([{deckId:'spotlight-v5',count:4,photoPreset:'bad'}]),/không được hỗ trợ/);
const service:any=Object.create(GuideService.prototype);
service.activeDestinationId='dalat'; // Template-source validation requires a real source even when the preset is rejected.
Promise.all([
 assert.rejects(()=>service.generateDeckFromCaption({deckId:'spotlight-v5',photoPreset:'bad'}),/không được hỗ trợ/),
 assert.rejects(()=>service.generateBatchLists({deckId:'spotlight-v6',photoPreset:'bad'}),/không được hỗ trợ/),
 assert.rejects(()=>service.generatePartnerSpotlight({photoPreset:'bad'}),/đã ngừng sử dụng/),
]).then(()=>console.log('PASS preset validation before generation; migration/backup/restore/idempotency/conflicts; scheduled presets.')).catch(error=>{console.error(error);process.exitCode=1;});
