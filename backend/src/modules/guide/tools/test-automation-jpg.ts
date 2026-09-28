import assert from 'node:assert/strict';
import { AutomationSchedulerService } from '../automation-scheduler.service';

// In-memory scheduler boundary: never instantiate the live service or write user state.
const scheduler = Object.create(AutomationSchedulerService.prototype) as any;
scheduler.guideService = { getDestinations: () => ({destinations:[{id:'dalat'}]}) };
scheduler.assertOutputDirectory = () => undefined;
scheduler.findBrowser = () => 'test-browser';
const input = {name:'JPG test',destinationId:'dalat',frequency:'daily',dailyTime:'09:00',outputDir:'test-output',templates:[{deckId:'summary-note',count:3}]};
for (const format of [undefined, 'png', 'jpg']) {
 const schedule=scheduler.validateSchedule({...input,format});
 assert.equal(schedule.format,format || 'png');
 const reloaded=JSON.parse(JSON.stringify(schedule));
 const edited=scheduler.validateSchedule({name:'Edited JPG test'},reloaded);
 assert.equal(edited.format,format || 'png');
 const run=scheduler.newRun(edited,new Date().toISOString());
 assert.equal(run.format,format || 'png');
 run.status='awaiting-export';
 scheduler.authorizeExport=()=>JSON.parse(JSON.stringify(run));
 assert.equal(scheduler.getExportContext(run.id,'test').format,format || 'png');
}
assert.throws(()=>scheduler.validateSchedule({...input,format:'webp'}),/PNG hoặc JPG/);
console.log('PASS: scheduler JPG/PNG validation, serialized round-trip, edit preservation, run snapshot, export context, legacy PNG default; invalid format rejected.');
