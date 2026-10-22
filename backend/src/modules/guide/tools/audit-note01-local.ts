// Read the cached, published source only. All generated review lists stay in temp.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import XLSX from 'xlsx';
async function main(){
 const backend=path.resolve(__dirname,'../../../../'),userData=path.join(backend,'data'),root=fs.mkdtempSync(path.join(os.tmpdir(),'note01-local-'));
 process.env.DALAT_DATA_DIR=root;require('../../../../../scripts/test-support/source-links-fixture.cjs').seedSourceLinks(root);
 const {publishedSourcePaths}=require('../sync/published-source'),{loadWorkbookItems}=require('../workbook-items'),{setActiveDestinationLocalize}=require('../sync/destination-localize');
 const {NOTE_DARK_ID:id,NOTE_GROUPS,buildNoteDarkPages,pickNoteCaption}=require('../logic/threads-note-dark-list');
 setActiveDestinationLocalize('dalat-threads');const published=publishedSourcePaths(userData,'dalat-threads');if(!published)throw Error('Chưa có bản dữ liệu Threads Đà Lạt đã đồng bộ.');
 const manifest=JSON.parse(fs.readFileSync(published.manifest,'utf8')),items=loadWorkbookItems('dalat-threads',backend,XLSX.readFile(published.workbook),[],{version:1,instructions:[],mappings:[]},[],manifest);
 const lists:any[]=[];
 for(let n=0;n<4;n++){const pages=buildNoteDarkPages(items,'review-'+n,lists);lists.push({id:`${id}-caption-${n+1}-review`,navTitle:`Mẫu ${n+1}`,title:pages[0].title,description:'',postCaption:pickNoteCaption(lists.map(l=>l.postCaption),'review-'+n),captionBody:'',captionHashtags:[],canvasPreset:'tiktok-9x16',templateVersion:1,pages});}
 const zeroItems=structuredClone(items);Object.values(zeroItems).forEach((rows:any)=>rows.forEach((row:any)=>row.isPartner=false));const zero={...lists[0],id:id+'-caption-99-zero',navTitle:'Mẫu 99',pages:buildNoteDarkPages(zeroItems,'zero')};
 const styled=structuredClone(lists[0]);styled.id=id+'-caption-100-styled';styled.pages[0].textFontSize=40;styled.pages[0].titlePlacement='mid-left';
 fs.writeFileSync(path.join(root,'fixture.json'),JSON.stringify({lists:[...lists,zero,styled],localData:true,root}));
 const report={source:'dalat-threads',readOnly:true,imagesRequired:false,addressesRequired:false,groups:NOTE_GROUPS.map((g:any)=>({group:g.label,available:g.keys.flatMap((key:string)=>items[key]||[]).filter((i:any)=>i.name?.trim()).length})),lists:4,missing:[]};
 fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));console.log('NOTE01_FIXTURE='+path.join(root,'fixture.json'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
