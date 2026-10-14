const assert=require('node:assert/strict');
const esbuild=require('../../backend/node_modules/esbuild');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../lib/backendProxy.js'),'utf8');
const compiled=esbuild.transformSync(source+'\nexport {localSettingsOrigin,getForwardHeaders};',{format:'cjs'}).code;
const mod={exports:{}};vm.runInNewContext(compiled,{module:mod,exports:mod.exports,URL,Headers});
const {localSettingsOrigin,getForwardHeaders}=mod.exports;
for(const [route,headerName] of [['/api/ai/settings','x-dalat-ai-settings'],['/api/app-update/status','x-dalat-update']]) {
 for(const host of ['localhost:3001','127.0.0.1:3001','[::1]:3001']) {
  const req={url:'http://0.0.0.0:3001'+route,headers:new Headers({host,[headerName]:'1'})};
  assert.equal(localSettingsOrigin(req,headerName),'http://'+host);
  assert.equal(getForwardHeaders(req).get('origin'),'http://'+host);
  req.headers.set('origin','http://'+host);assert(localSettingsOrigin(req,headerName));
  req.headers.set('origin','https://evil.example');assert.equal(localSettingsOrigin(req,headerName),null);
 }
 for(const headers of [{host:'192.168.1.2:3001',[headerName]:'1'},{host:'localhost:3001'},{host:'localhost:3001',[headerName]:'1','sec-fetch-site':'cross-site'}]) assert.equal(localSettingsOrigin({url:'http://0.0.0.0:3001'+route,headers:new Headers(headers)},headerName),null);
}
// Header của route này không mở khóa route kia.
assert.equal(localSettingsOrigin({url:'http://0.0.0.0:3001/api/ai/settings',headers:new Headers({host:'localhost:3001','x-dalat-update':'1'})},'x-dalat-ai-settings'),null);
console.log('PASS: AI settings + app update: wildcard bind with local Host, origin forwarding, cross-origin/LAN/missing-header rejection.');
