import {keySlot} from '@harnessy/llm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,call} from './test-helpers.ts';
import {MemoryKeys,config,endpoint,openai,prompt,collect} from '../../llm/src/test-helpers.ts';
const options={timeout:15000};
test('owner saves independent routes, validates revisions, manages keys and deletes route and key without secret exposure',options,async t=>{
 const keys=new MemoryKeys(),h=await fixture(t,{deps:{llmKeys:keys}}),path='/api/llm/providers/custom',events:any[]=[];const svc=h.runtime.llm,stop=svc.onRoutesChanged(e=>events.push(e));t.after(stop);
 let r=await call(h.api,path,{body:{config:config('https://example.test/v1')}});assert.equal(r.status,200);const rev=r.body.revision;
 assert.equal((await call(h.api,path,{body:{config:config('https://other.test/v1')}})).body.code,'llm_conflict');
 assert.equal((await call(h.api,'/api/llm/providers/other',{body:{config:config('https://other.test/v1')}})).status,200);
 r=await call(h.api,path+'/key',{body:{secret:'fixture-secret-1234',revision:rev}});assert.equal(r.status,200);assert.equal(r.body.key.mask,'••••••••1234');assert.equal(r.body.config.keyRef,'custom');assert.doesNotMatch(r.text,/fixture-secret/);const next=r.body.revision,keyId=keySlot('custom',r.body.config.keyGeneration);
 for(const endpoint of ['/api/settings','/api/llm/providers',path,path+'/key','/api/trace'])assert.doesNotMatch((await call(h.api,endpoint)).text,/fixture-secret/);
 assert.doesNotMatch(readFileSync(join(h.dir,'owner-settings.json'),'utf8'),/fixture-secret/);
 assert.equal((await call(h.api,path+'/check',{body:{}})).body.checked,'configuration');
 assert.equal((await call(h.api,path+'/delete',{body:{revision:rev}})).body.code,'llm_conflict');assert.equal(await keys.resolveKey(keyId),'fixture-secret-1234');
 assert.equal((await call(h.api,path+'/delete',{body:{revision:next}})).status,200);assert.equal(await keys.resolveKey(keyId),null);assert.equal((await call(h.api,path)).status,404);assert.deepEqual(Object.keys(svc.routes()),['other']);assert.equal(events.length,4);
});
test('every HTTP LLM door is owner-only and generic settings cannot bypass validation',options,async t=>{
 const h=await fixture(t,{deps:{llmKeys:new MemoryKeys()}});for(const [method,path] of [['GET','/api/llm/providers'],['GET','/api/llm/providers/catalog/openai'],['GET','/api/llm/providers/x'],['POST','/api/llm/providers/x'],['POST','/api/llm/providers/x/delete'],['POST','/api/llm/providers/x/check'],['POST','/api/llm/providers/x/discover'],['GET','/api/llm/providers/x/key'],['POST','/api/llm/providers/x/key'],['POST','/api/llm/providers/x/key/delete']]){const r=await call(h.api,path!,{method:method!,headers:{'x-pane-token':'forged'},...(method==='POST'?{body:{}}:{})});assert.equal(r.status,403,path);assert.equal(r.body.code,'owner_only')}
 assert.equal((await call(h.api,'/api/llm/providers/custom',{body:{config:{...config('https://example.test'),apiKey:'SECRET'}}})).body.code,'config_invalid');
 assert.equal((await call(h.api,'/api/settings',{body:{scope:'owner',patch:{llmProviders:[]}}})).status,400);
});
test('broken owner settings do not disappear or get overwritten; project settings cannot override routes',options,async t=>{
 const h=await fixture(t,{deps:{llmKeys:new MemoryKeys()}}),file=join(h.dir,'owner-settings.json');writeFileSync(file,'{bad bytes');assert.equal((await call(h.api,'/api/llm/providers')).body.code,'settings_unreadable');assert.equal((await call(h.api,'/api/llm/providers/custom',{body:{config:config('https://example.test')}})).body.code,'settings_unreadable');assert.equal(readFileSync(file,'utf8'),'{bad bytes');
 writeFileSync(file,JSON.stringify({keep:true}));await call(h.api,'/api/llm/providers/custom',{body:{config:config('https://example.test')}});assert.equal(JSON.parse(readFileSync(file,'utf8')).keep,true);
});
test('HTTP configuration/discovery plus actual service stream yields linked safe trace, and key removal fails closed',options,async t=>{
 const server=await endpoint(t,(_b,req,res)=>{if(req.method==='GET'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'test-model'}]}))}else openai(res)});const keys=new MemoryKeys(),h=await fixture(t,{deps:{llmKeys:keys}});let r=await call(h.api,'/api/llm/providers/local',{body:{config:config(server.url)}});r=await call(h.api,'/api/llm/providers/local/key',{body:{secret:'service-fixture-key',revision:r.body.revision}});assert.equal(r.status,200);assert.equal((await call(h.api,'/api/llm/providers/local/discover',{body:{}})).body.models[0].id,'test-model');assert.equal((await collect(h.runtime.llm,prompt)).finish.reason,'stop');const trace=await call(h.api,'/api/trace');assert.match(trace.text,/llm.request/);assert.match(trace.text,/llm.response/);assert.doesNotMatch(trace.text,/service-fixture-key|system instruction|hello world/);await call(h.api,'/api/llm/providers/local/key/delete',{body:{revision:r.body.revision}});assert.equal((await collect(h.runtime.llm,prompt)).finish.failure?.code,'missing_credential');
});
test('parallel updates to different routes merge; same revision cannot overwrite a newer record',options,async t=>{
 const h=await fixture(t,{deps:{llmKeys:new MemoryKeys()}});const [a,b]=await Promise.all(['alpha','beta'].map(id=>call(h.api,'/api/llm/providers/'+id,{body:{config:config('https://example.test/'+id)}})));assert.equal(a!.status,200);assert.equal(b!.status,200);assert.deepEqual(Object.keys(h.runtime.llm.routes()).sort(),['alpha','beta']);
 const results=await Promise.all(['one','two'].map(name=>call(h.api,'/api/llm/providers/alpha',{body:{config:{...config('https://example.test/alpha'),displayName:name},revision:a!.body.revision}})));assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal(h.runtime.llm.routes().beta!.baseURL,'https://example.test/beta');
});

test('save refuses empty custom models and unsupported catalog without writing settings',options,async t=>{
 const h=await fixture(t,{deps:{llmKeys:new MemoryKeys()}}),before=h.runtime.settings.llmProviders();
 for(const config of [{api:'openai-completions',baseURL:'https://example.test/v1'},{api:'openai-completions',baseURL:'https://example.test/v1',models:[]}]){const r=await call(h.api,'/api/llm/providers/custom',{body:{config}});assert.equal(r.status,400);assert.equal(r.body.code,'config_invalid')}
 const r=await call(h.api,'/api/llm/providers/google-route',{body:{config:{catalog:'google'}}});assert.equal(r.status,400);assert.equal(r.body.code,'transport_unsupported');assert.match(r.body.error,/защищённый транспорт/);assert.deepEqual(h.runtime.settings.llmProviders(),before);
 assert.equal((await call(h.api,'/api/llm/providers')).body.catalog.includes('google'),false);assert.equal((await call(h.api,'/api/llm/providers/catalog/google')).body.code,'transport_unsupported');
});
