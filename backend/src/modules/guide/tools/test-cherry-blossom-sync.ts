import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import sharp from 'sharp';
import { buildSheetDriveManifest, emptySheetDriveManifest } from '../sync/sheet-drive-manifest';
import { itemMappingKey } from '../logic/image-resolver';
import { configureDriveFileDiskCache, setCachedDriveFileAccessibility } from '../sync/drive-images';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadWorkbookItems } from '../workbook-items';

async function main() {
  // Fixture photos (regular-*/flower-*) go to a throwaway cache, never the user's.
  const cacheDir=fs.mkdtempSync(path.join(os.tmpdir(),'cherry-sync-cache-'));configureDriveFileDiskCache(cacheDir);
  const oldFetch=global.fetch;
  const bytes=await sharp(Buffer.from(Array.from({length:128*192*3},(_,i)=>(i*37+Math.floor(i/384)*19)%256)),{raw:{width:128,height:192,channels:3}}).png().toBuffer();
  let revision=1,seen:string[]=[];
  const parent='cherry-parent-fixture',name='1/2 Circle Coffee',address='12 Đường thử';
  const sheet=XLSX.utils.aoa_to_sheet([['Ten_quan','Dia_chi','Link_drive','Doi_tac','Mo_ta'],[name,address,`https://drive.google.com/drive/folders/${parent}`,'x','Mô tả gốc']]);
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,'cafe');
  const source:any={workbook,workbookName:'fixture.xlsx',destinationId:'dalat-test',fetchedAt:1,bytes:1,sourceUrl:'fixture'};
  const previous=emptySheetDriveManifest(),key=itemMappingKey('cafe',name,address);
  const primary={fileId:'regular-1',fileName:'regular.jpg',viewUrl:'https://drive.google.com/file/d/regular-1/view'};
  previous.items[key]={key,name,address,sectionKey:'cafe',sourceLink:`https://drive.google.com/drive/folders/${parent}`,fileId:primary.fileId,fileName:primary.fileName,candidateImages:[primary]};
  for(const id of ['regular-1','regular-2','flower-1','flower-2'])setCachedDriveFileAccessibility(id,true);
  global.fetch=(async(input:any)=>{
    const url=String(input);seen.push(url);
    if(url.includes('embeddedfolderview')){
      const id=new URL(url).searchParams.get('id');
      if(id===parent)return new Response(`<a href="https://drive.google.com/file/d/regular-1/view">regular.jpg</a><a href="https://drive.google.com/file/d/regular-2/view">regular2.jpg</a><a href="https://drive.google.com/drive/folders/cherry-child-${revision}">Hoa đào Circle</a><a href="https://drive.google.com/drive/folders/never-map">Bản đồ</a>`,{headers:{'content-type':'text/html'}});
      if(id===`cherry-child-${revision}`)return new Response(`<a href="https://drive.google.com/file/d/flower-${revision}/view">flower.jpg</a><a href="https://drive.google.com/drive/folders/never-nested">Hoa đào sâu</a>`,{headers:{'content-type':'text/html'}});
      throw Error('Must not recurse into maps/unrelated/nested folders: '+id);
    }
    return new Response(new Uint8Array(bytes),{headers:{'content-type':'image/png'}});
  }) as typeof fetch;
  try {
    const before=JSON.stringify(previous);
    const first=await buildSheetDriveManifest(source,previous);
    assert.equal(JSON.stringify(previous),before,'staging never mutates the published manifest');
    assert.deepEqual(first.items[key].candidateImages,[primary],'old templates keep their exact regular pool');
    assert.equal(first.items[key].cherryRegularImages!.length,2,'new deck sees the full parent pool, not old top-six metadata');
    assert.equal(first.items[key].themedImages!['cherry-blossom']!.images[0].fileId,'flower-1');
    assert.equal(first.items[key].themedImages!['cherry-blossom']!.venueKey,key);
    // Manual and night syncs force a re-read (the coordinator passes these flags).
    const sync={forceRevalidate:true,revalidateUncached:true};
    revision=2;seen=[];
    const second=await buildSheetDriveManifest(source,first,sync);
    assert.equal(second.items[key].themedImages!['cherry-blossom']!.images[0].fileId,'flower-2','unchanged parent must discover new direct folder');
    assert.ok(seen.some(url=>url.includes(parent)));assert.ok(!seen.some(url=>url.includes('never-')));
    const items=loadWorkbookItems('dalat-test','',workbook,[],{version:1,instructions:[],mappings:[]},[],second);
    assert.equal(items.cafe[0].diaryImageUrls!.length,second.items[key].candidateImages!.length);assert.equal(items.cafe[0].cherryRegularImageUrls!.length,2);assert.equal(items.cafe[0].themedImageUrls!['cherry-blossom']!.length,1);
    const retained=JSON.stringify(second),workingFetch=global.fetch;
    global.fetch=(async()=>new Response('forbidden',{status:403})) as typeof fetch;
    await assert.rejects(buildSheetDriveManifest(source,second,sync),/Không đồng bộ.*Hoa đào/);
    assert.equal(JSON.stringify(second),retained,'failed staging must retain the complete last published source');
    global.fetch=workingFetch;revision=3;
    const retry=await buildSheetDriveManifest(source,second,sync);
    assert.equal(retry.items[key].themedImages!['cherry-blossom']!.images[0].fileId,'flower-3','a failed sync must be retryable without changing the parent URL');
    // Startup/switching source reuses the verified folders of an unchanged link: no network.
    revision=4;seen=[];const switched=await buildSheetDriveManifest(source,retry);
    assert.equal(switched.items[key].themedImages!['cherry-blossom']!.images[0].fileId,'flower-3','switching keeps the last verified cherry folders');
    assert.equal(switched.items[key].cherryRegularImages!.length,2);assert.equal(seen.length,0,'switching source must not re-list Drive folders');
    seen=[];await buildSheetDriveManifest({...source,destinationId:'dalat'},previous);assert.equal(seen.length,0,'old source does not run new folder discovery');
    console.log('PASS cherry sync: manual/night sync refreshes direct children/full regular pool, switching reuses verified folders without network, no recursive/maps scan, venue provenance, staged copy, legacy pools/sources unchanged.');
  }finally{global.fetch=oldFetch;fs.rmSync(cacheDir,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
