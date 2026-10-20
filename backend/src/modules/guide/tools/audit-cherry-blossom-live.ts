// Explicit live audit. Reads user source/cache but writes only an OS temp root.
// It does not select a source, publish a snapshot or append to user list stores.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as XLSX from 'xlsx';
import assert from 'node:assert/strict';
import { fetchWorkbookFromSheet } from '../sync/workbook-source';
import { getDestinationConfig } from '../sync/destination-config';
import { publishedSourcePaths } from '../sync/published-source';
import { buildSheetDriveManifest, emptySheetDriveManifest, SheetDriveImageManifest } from '../sync/sheet-drive-manifest';
import { configureDriveFileDiskCache, resolveCherryBlossomFolders, resolveCherryRegularImages, warmDriveFileDiskCache, extractDriveFileIdFromProxyUrl, hasDriveFileDiskCache } from '../sync/drive-images';
import { loadWorkbookItems, loadHinhNenImagePools } from '../workbook-items';
import { buildCherryBlossom, CHERRY_ID, isCircle, isDlart } from '../logic/spotlight-cherry-blossom';
import { CherryBlossomHookSourceStore } from '../sync/cherry-blossom-hook-source';
import type { PartnerRotationHistory } from '../../../common/interfaces/guide.types';

async function main() {
  if (process.argv[2]) {
    const input=path.resolve(process.argv[2]), data=JSON.parse(fs.readFileSync(input,'utf8'));
    configureDriveFileDiskCache(path.join(path.dirname(input),'drive-file-cache'));
    const hookStore=new CherryBlossomHookSourceStore(path.dirname(input));
    const lists=[];let history:PartnerRotationHistory={};
    for(let n=0;n<8;n++) {
      const built=buildCherryBlossom({items:data.items,pools:data.pools,hooks:hookStore.getCachedHooks(),history,seed:'final-live-'+n});
      built.list.id=`${CHERRY_ID}-caption-final-${n}`;built.list.navTitle=`Mẫu ${String(n+1).padStart(2,'0')}`;
      if(n>=4){built.list.photoPreset='iphone-color-edit-v1';built.list.pages.forEach(page=>page.photoPreset='iphone-color-edit-v1');}
      history=built.history;lists.push(built.list);
    }
    const output=path.join(path.dirname(input),'audit-final.json');fs.writeFileSync(output,JSON.stringify({...data,lists,history},null,2));
    console.log('PASS latest builder on full live snapshot: 4 original + 4 Color Edit. '+output);return;
  }
  const backend = path.resolve(__dirname, '../../../../');
  const userData = path.join(backend, 'data');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'dalat-cherry-audit-'));
  console.log('AUDIT_ROOT='+temporary);
  process.env.DALAT_DATA_DIR = temporary;
  const cache = path.join(temporary,'drive-file-cache'); fs.mkdirSync(cache);
  configureDriveFileDiskCache(cache);
  const published = publishedSourcePaths(userData,'dalat-test');
  if (!published) throw new Error('Thiếu snapshot Test để audit chỉ đọc.');
  const manifest: SheetDriveImageManifest = JSON.parse(fs.readFileSync(published.manifest,'utf8'));
  const source = await fetchWorkbookFromSheet(getDestinationConfig('dalat-test'));
  // Copy just the relevant Sheet, preserving hyperlink cells exactly.
  const backgrounds = await buildSheetDriveManifest({...source,workbook:{SheetNames:['Hinh_nen'],Sheets:{Hinh_nen:source.workbook.Sheets.Hinh_nen}}},emptySheetDriveManifest(),{forceRevalidate:true});
  for (const group of ['cherry-blossom','cherry-blossom-random'] as const) {
    manifest.coverImageGroups![group]=backgrounds.coverImageGroups![group];
    manifest.coverSourceLinkGroups![group]=backgrounds.coverSourceLinkGroups![group];
  }
  manifest.hookSourceGroups=backgrounds.hookSourceGroups;
  const mapping:any={version:1,instructions:[],mappings:[]};
  let items=loadWorkbookItems('dalat-test',backend,source.workbook,[],mapping,[],manifest);
  const required=items.cafe.filter(item=>isCircle(item)||isDlart(item));
  assert.equal(required.length,2,'Must identify both mandatory cafes from source, not row numbers');
  for(const item of required) {
    const entry=manifest.items[item.imageMappingKey];
    const themed=await resolveCherryBlossomFolders(entry.sourceLink);
    entry.themedImages={'cherry-blossom':{...themed,sourceLink:entry.sourceLink,venueKey:entry.key}};
    console.log(item.name, 'flower folders', themed.folders, 'photos',themed.images.length);
  }
  const relevant=Object.values(items).flat().filter(item=>item.isPartner && ['quan_an','cafe'].includes(item.sectionKey));
  for(const item of relevant) {
    const entry=manifest.items[item.imageMappingKey];
    entry.cherryRegularImages=await resolveCherryRegularImages(entry.sourceLink,item.name,item.address);
    console.log('FULL REGULAR',item.name,entry.cherryRegularImages.length);
  }
  const regularIds=[...new Set(relevant.flatMap(item=>manifest.items[item.imageMappingKey].cherryRegularImages!.map(image=>image.fileId)))];
  const newIds=[...new Set([...required.flatMap(item=>manifest.items[item.imageMappingKey].themedImages!['cherry-blossom']!.images.map(image=>image.fileId)),
    ...manifest.coverImageGroups!['cherry-blossom'].slice(0,24).map(image=>image.fileId),...manifest.coverImageGroups!['cherry-blossom-random'].map(image=>image.fileId)])];
  for(const id of [...regularIds,...newIds]) for(const ext of ['bin','json']) {
    const from=path.join(userData,'drive-file-cache',id+'.'+ext);
    if(fs.existsSync(from)) fs.copyFileSync(from,path.join(cache,id+'.'+ext));
  }
  const warm=await warmDriveFileDiskCache([...regularIds,...newIds],{concurrency:2,onProgress:p=>{if((p.ok+p.fail+p.skipped)%10===0)console.log('cache',p);}});
  console.log('WARM',warm);
  items=loadWorkbookItems('dalat-test',backend,source.workbook,[],mapping,[],manifest);
  for(const pool of Object.values(items)) for(const item of pool) {
    item.diaryImageUrls=(item.diaryImageUrls||[]).filter(url=>hasDriveFileDiskCache(extractDriveFileIdFromProxyUrl(url)));
    if(item.cherryRegularImageUrls) item.cherryRegularImageUrls=item.cherryRegularImageUrls.filter(url=>hasDriveFileDiskCache(extractDriveFileIdFromProxyUrl(url)));
    if(item.themedImageUrls) item.themedImageUrls['cherry-blossom']=(item.themedImageUrls['cherry-blossom']||[]).filter(url=>hasDriveFileDiskCache(extractDriveFileIdFromProxyUrl(url)));
  }
  const pools=loadHinhNenImagePools(manifest);
  for(const group of ['cherry-blossom','cherry-blossom-random'] as const) pools[group]=(pools[group]||[]).filter(url=>hasDriveFileDiskCache(extractDriveFileIdFromProxyUrl(url)));
  const hookStore=new CherryBlossomHookSourceStore(temporary);
  await hookStore.ensureReady(manifest.hookSourceGroups!['cherry-blossom']!,true);
  const lists:any[]=[];let history:PartnerRotationHistory={};
  for(let n=0;n<8;n++) {
    const result=buildCherryBlossom({items,pools,hooks:hookStore.getCachedHooks(),history,seed:'live-audit-'+n});
    result.list.id=`${CHERRY_ID}-caption-audit-${n}`;result.list.navTitle=`Audit ${n+1}`;
    if(n>=4) {result.list.photoPreset='iphone-color-edit-v1';result.list.pages.forEach(page=>page.photoPreset='iphone-color-edit-v1');}
    const policy=require(path.resolve(backend,'../frontend/lib/partnerNames.mjs'));
    assert.equal(policy.collectPartnerNames(result.list).length,7);
    lists.push(result.list);history=result.history;
    console.log('LIST',n+1,policy.collectPartnerNames(result.list));
  }
  fs.writeFileSync(path.join(temporary,'audit.json'),JSON.stringify({lists,history,items,pools,hookCount:hookStore.getCachedHooks().length,manifest},null,2));
  console.log('PASS live 4 original + 4 Color Edit snapshots:',path.join(temporary,'audit.json'));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
