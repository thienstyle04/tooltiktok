const assert=require('node:assert/strict');
const esbuild=require('../../backend/node_modules/esbuild');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('frontend/lib/backendProxy.js','utf8');
const compiled=esbuild.transformSync(source+'\nexport {aiSettingsOrigin,getForwardHeaders};',{format:'cjs'}).code;
const mod={exports:{}};vm.runInNewContext(compiled,{module:mod,exports:mod.exports,URL,Headers});
for(const host of ['localhost:3001','127.0.0.1:3001','[::1]:3001']) {
 const req={url:'http://0.0.0.0:3001/api/ai/settings',headers:new Headers({host,'x-dalat-ai-settings':'1'})};
 assert.equal(mod.exports.aiSettingsOrigin(req),'http://'+host);
 assert.equal(mod.exports.getForwardHeaders(req).get('origin'),'http://'+host);
 req.headers.set('origin','http://'+host);assert(mod.exports.aiSettingsOrigin(req));
 req.headers.set('origin','https://evil.example');assert.equal(mod.exports.aiSettingsOrigin(req),null);
}
for(const headers of [{host:'192.168.1.2:3001','x-dalat-ai-settings':'1'},{host:'localhost:3001'},{host:'localhost:3001','x-dalat-ai-settings':'1','sec-fetch-site':'cross-site'}]) assert.equal(mod.exports.aiSettingsOrigin({url:'http://0.0.0.0:3001/api/ai/settings',headers:new Headers(headers)}),null);
console.log('PASS: wildcard bind with local Host, origin forwarding, cross-origin/LAN/missing-header rejection.');
