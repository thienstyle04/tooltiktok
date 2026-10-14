// Read-only remote audit; never writes application cache or saved lists.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'outputs/drive-audit');
const links=new Map();
function add(url,ref){if(!/^https:\/\/drive.google.com\//.test(url||''))return;const id=url.match(/(?:folders\/|\/d\/|[?&]id=)([\w-]+)/)?.[1];if(!id)return;const folder=url.includes('/folders/');const key=(folder?'folder:':'file:')+id;if(!links.has(key))links.set(key,{id,folder,refs:[]});links.get(key).refs.push(ref);}
for(const d of ['dalat','greenland']){
 const m=JSON.parse(fs.readFileSync(path.join(root,`backend/data/sheet-drive-images.${d}.json`)));
 for(const e of Object.values(m.items)){add(e.sourceLink,{destination:d,name:e.name});add(e.mapSourceLink,{destination:d,name:e.name,kind:'map'});}
 for(const [group,urls] of Object.entries(m.coverSourceLinkGroups||{}))for(const u of urls)add(u,{destination:d,group});
 const lists=JSON.parse(fs.readFileSync(path.join(root,`backend/data/generated-caption-lists.${d}.json`)));
 for(const [deck,ls] of Object.entries(lists.decks||{}))for(const l of ls)for(const [i,p] of l.pages.entries()){
  const str=JSON.stringify(p);for(const match of str.matchAll(/\/assets\/drive-file\?id=([\w-]+)/g))add('https://drive.google.com/file/d/'+match[1]+'/view',{destination:d,deck,list:l.id,page:i+1});
 }
}
async function get(url){try{const r=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Mozilla/5.0','Referer':'https://drive.google.com/'}});const b=Buffer.from(await r.arrayBuffer());const image=(b[0]===255&&b[1]===216)||b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||b.subarray(0,3).toString()==='GIF'||(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP');return{status:r.status,type:r.headers.get('content-type'),image,bytes:b.length,text:image?'':b.toString()};}catch(e){return{error:e.name+': '+e.message};}}
async function check(entry){
 const urls=entry.folder?[`https://drive.google.com/embeddedfolderview?id=${entry.id}#list`]:[`https://drive.google.com/uc?export=view&id=${entry.id}`,`https://drive.google.com/thumbnail?authuser=0&sz=w1600&id=${entry.id}`,`https://drive.google.com/uc?export=download&id=${entry.id}`];
 const attempts=[];let status='unreachable';
 for(const url of urls){const r=await get(url);const {text,...meta}=r;attempts.push(meta);
  if(entry.folder){const count=[...(text||'').matchAll(/\/file\/d\/[\w-]+\/view/g)].length;const auth=/accounts.google.com\/ServiceLogin|Request access|You need access/i.test(text||'');status=r.error?'network_error':r.status===200?(auth?'access_required':count?'folder_has_files_unverified_images':'folder_no_files_detected'):'unreachable';return{...entry,status,listedFileLinks:count,attempts};}
  if(r.image&&r.status===200){status='image_ok';break;}if(r.status===200)status='reachable_not_image';else if(r.error&&status==='unreachable')status='network_error';
 }return{...entry,status,attempts};
}
async function main(){fs.mkdirSync(out,{recursive:true});const pending=[...links.values()],results=[];let index=0;console.log('Audit total',pending.length);
 await Promise.all(Array.from({length:3},async()=>{while(index<pending.length){const entry=pending[index++];results.push(await check(entry));if(results.length%25===0){console.log('Checked',results.length,'/',pending.length);fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify({completed:results.length,total:pending.length}));}}}));
 const counts={};for(const r of results)counts[r.status]=(counts[r.status]||0)+1;
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checkedAt:new Date().toISOString(),counts,results},null,2));console.log(JSON.stringify(counts));
}
module.exports = { get, check };
if (require.main === module) main().catch(e=>{console.error(e);process.exitCode=1;});
