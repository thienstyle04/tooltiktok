import assert from 'node:assert/strict';
import {AutomationSchedulerService} from '../automation-scheduler.service';
async function main(){
 const scheduler:any=Object.create(AutomationSchedulerService.prototype),requests:any[]=[];
 Object.assign(scheduler,{manualExportUntil:0,waitForExistingSync:async()=>{},assertOutputDirectory:()=>{},findBrowser:()=>({}),assertHookSelectionReady:()=>{},assertFrontendReady:async()=>{},waitForDriveCache:async()=>{},touch:()=>{},closeBrowser:async()=>{},persist:()=>{},launchRenderer:async(run:any)=>{run.status='completed';},guideService:{isGenerationBusy:()=>false,getDestinations:()=>({active:{id:'dalat'}}),enqueueGeneration:async(fn:any)=>fn(),generateBatchLists:async(request:any)=>{requests.push(request);return{successCount:request.count,failCount:0,lists:Array.from({length:request.count},(_,i)=>({listId:request.deckId+'-'+i})),errors:[]};}}});
 const run:any={id:'isolated-palette',templates:[{deckId:'spotlight-v5',count:4,photoPreset:'iphone-color-edit-v1'},{deckId:'spotlight-v6',count:4,photoPreset:null}],destinationId:'dalat',hook:{mode:'normal'},outputDir:'mock-no-write',generated:[],listIds:[],errors:[],status:'queued'};
 await scheduler.executeWithAi(run);assert.equal(run.status,'completed');assert.equal(run.listIds.length,8);assert.equal(requests[0].photoPreset,'iphone-color-edit-v1');assert.equal(requests[1].photoPreset,null);assert(requests.every(request=>request.automationRunId===run.id));assert.deepEqual(run.errors,[]);
 console.log('PASS actual scheduled generation pipeline forwards independent original/Color Edit choices to 8 lists; no network/files/user data touched.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
