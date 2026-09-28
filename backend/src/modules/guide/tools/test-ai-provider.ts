import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AiProvider, AiError, aiProvider, isTextModel, safeAiDetail } from '../ai-provider';
import { GuideService } from '../guide.service';
import { AiSettingsController } from '../ai-settings.controller';

async function main() {
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'dalat-ai-test-'));
 const originalFetch=globalThis.fetch;
 const env=process.env.LOCALAPPDATA, deep=process.env.DEEPSEEK_API_KEY, gem=process.env.GEMINI_API_KEY;
 process.env.LOCALAPPDATA=temp;process.env.DEEPSEEK_API_KEY='fake-deep';delete process.env.GEMINI_API_KEY;
 const api=new AiProvider();
 const calls:Array<{url:string;body:any}>=[];
 let status=200, bad=false;
 globalThis.fetch=(async (url:any,options:any)=>{
   calls.push({url:String(url),body:options?.body?JSON.parse(options.body):null});
   if(status!==200)return new Response(JSON.stringify({error:{message:'secret must not leak: '+(options.headers['x-goog-api-key'] || options.headers.Authorization?.replace('Bearer ',''))}}),{status});
   if(String(url).includes('/models?'))return Response.json({models:[{name:'models/test-flash',displayName:'Test Flash',supportedGenerationMethods:['generateContent']},{name:'models/embed',supportedGenerationMethods:['embedContent']}]});
   const text=bad?'not JSON':'{"ok":true}';
   return Response.json(String(url).includes('googleapis')?{candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]}:{choices:[{finish_reason:'stop',message:{content:text}}]});
 }) as typeof fetch;
 const oldRead=(aiProvider as any).read;
 try {
   for(const id of ['gemini-3.5-transcribe','gemini-live-audio','gemini-flash-image','gemini-tts'])assert.equal(isTextModel(id),false);
   assert.equal(isTextModel('gemini-test-flash'),true);
   assert.equal(safeAiDetail('Invalid responseMimeType; key=private-test-secret','private-test-secret').includes('private-test-secret'),false);
   const blockedCalls=calls.length;
   await assert.rejects(api.test({provider:'gemini',model:'gemini-3.5-transcribe',apiKey:'fake-key'}),/không phù hợp/);
   assert.equal(calls.length,blockedCalls);
   assert.equal(api.status().active,'deepseek');
   await api.run(()=>api.chat({messages:[{role:'user',content:'test'}]}));
   assert(calls[0].url.includes('deepseek'));
   const beforeSave=calls.length;
   await api.save({provider:'gemini',model:'test-flash',apiKey:'fake-key',activate:false});
   assert.equal(calls.length,beforeSave,'Save configuration must not call API');
   assert.equal(new AiProvider().status().profiles.gemini.model,'test-flash');
   assert.equal(api.status().active,'deepseek');
   await api.save({provider:'gemini',model:'test-flash',activate:true});
   assert.equal(api.status().active,'gemini');
   assert(!JSON.stringify(api.status()).includes('fake-key'));
   assert(!fs.readFileSync(path.join(temp,'DalatStudio','ai-settings.json'),'utf8').includes('fake-key'));
   const restarted=new AiProvider();
   assert.equal(restarted.status().active,'gemini');
   await restarted.test({provider:'gemini'});
   assert.equal((await api.models({provider:'gemini'})).models.length,1);
   await api.run(async()=>{
     await api.save({provider:'deepseek',model:'deepseek-chat',activate:true});
     assert.equal(api.current().provider,'gemini');
     await api.chat({messages:[{role:'user',content:'test'}]});
     assert(calls[calls.length-1].url.includes('googleapis'));
   });
   assert.equal(api.current().provider,'deepseek');
   status=402;const n=calls.length;
   await api.run(async()=>{
     await assert.rejects(api.chat({}), (e:any)=>e instanceof AiError && e.fatal && !e.message.includes('fake-key') && !e.message.includes('fake-deep'));
     await assert.rejects(api.chat({}),AiError);
   });
   assert.equal(calls.length-n,1,'No repeated calls after quota error');
   await assert.rejects(api.save({provider:'gemini',activate:true}),AiError);
   assert.equal(api.status().active,'deepseek','Failed activation keeps current provider');
   status=200;bad=true;await assert.rejects(api.test({provider:'deepseek'}),/JSON/);bad=false;
   await api.save({provider:'gemini',removeKey:true});
   assert.equal(api.status().profiles.gemini.hasKey,false);
   const controller=new AiSettingsController();
   assert.throws(()=>controller.status({socket:{remoteAddress:'192.168.1.2'},headers:{}}));
   assert.throws(()=>controller.status({socket:{remoteAddress:'127.0.0.1'},headers:{origin:'https://evil.example'}}));
   // Exercise the actual batch catch/stop path, without constructing the live service.
   (aiProvider as any).read=()=>({active:'deepseek',profiles:{deepseek:{model:'deepseek-chat'},gemini:{model:''}}});
   const service:any=Object.create(GuideService.prototype);
   service.assertDriveCacheReady=()=>{};service.ensureGeneratedListsLoaded=()=>{};service.generatedListsByDeckId=new Map();
   service.prepareV4CaptionDeck=async()=>({id:'spotlight-v4',lists:[{id:'test',pages:[]}]});
   service.getUsedCaptionTitles=()=>[];service.buildDeepSeekPrompt=()=> 'test';
   service.generateDeckFromCaption=()=>{throw Error('Must not save failed list');};
   status=402;const before=calls.length;
   const result=await service.generateBatchLists({deckId:'spotlight-v4',count:4});
   assert.equal(result.successCount,0);assert.equal(result.failCount,4);assert.equal(calls.length-before,1);
   console.log('PASS: DPAPI persistence/restart, masked status, model listing, manual switch, task isolation, fatal batch stop, failed activation, invalid JSON, key deletion, local guards. No real API requests.');
 } finally {
   globalThis.fetch=originalFetch;(aiProvider as any).read=oldRead;
   if(env===undefined)delete process.env.LOCALAPPDATA;else process.env.LOCALAPPDATA=env;
   if(deep===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=deep;
   if(gem===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=gem;
 }
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
