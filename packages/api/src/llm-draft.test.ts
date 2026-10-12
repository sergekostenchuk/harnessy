import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,renameSync,mkdirSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,call} from './test-helpers.ts';
import {MemoryKeys,config,endpoint} from '../../llm/src/test-helpers.ts';
const limits={timeout:15000},root='/api/llm/providers',secret='draft-secret-fixture';
test('draft discovery is owner-only, strict, explicit and never persists a route or secret',limits,async t=>{
 const keys=new MemoryKeys(),requests:string[]=[];const remote=await endpoint(t,(_b,req,res)=>{requests.push(String(req.headers.authorization));res.end(JSON.stringify({data:[{id:'example'}]}))}),h=await fixture(t,{deps:{llmKeys:keys}}),draft={id:'demo',config:{...config(remote.url),models:[]},secret};
 assert.equal((await call(h.api,root+'/discover',{body:draft,headers:{'x-pane-token':'fake'}})).status,403);
 assert.equal((await call(h.api,root+'/demo/save',{body:{config:draft.config,secret},headers:{'x-pane-token':'fake'}})).status,403);
 assert.equal((await call(h.api,root+'/discover',{body:{...draft,config:{...draft.config,apiKey:secret}}})).body.code,'config_invalid');assert.equal(requests.length,0);
 let r=await call(h.api,root+'/discover',{body:draft});assert.equal(r.status,200);assert.equal(r.body.models[0].id,'example');assert.deepEqual(requests,['Bearer '+secret]);assert.equal(await keys.resolveKey('demo'),null);assert.deepEqual((await call(h.api,root)).body.providers,[]);assert.doesNotMatch(r.text,RegExp(secret));
 r=await call(h.api,root+'/demo/save',{body:{config:{...draft.config,models:[{id:'example'}]},secret,revision:null}});assert.equal(r.status,200);assert.equal(r.body.config.keyRef,'demo');assert.equal(await keys.resolveKey('demo'),secret);assert.doesNotMatch(r.text,RegExp(secret));assert.doesNotMatch(readFileSync(join(h.dir,'owner-settings.json'),'utf8'),RegExp(secret));assert.doesNotMatch((await call(h.api,'/api/trace')).text,RegExp(secret));
 const saved=r.body;r=await call(h.api,root+'/demo/save',{body:{config:saved.config,secret:'replacement-fixture',revision:null}});assert.equal(r.status,409);assert.equal(r.body.code,'llm_conflict');assert.equal(await keys.resolveKey('demo'),secret);
});
test('draft cannot carry a stored key to changed URL, protocol, catalog or redirected destination',limits,async t=>{
 let targetCalls=0,headers:string[]=[];const target=await endpoint(t,(_b,_req,res)=>{targetCalls++;res.end('{}')}),source=await endpoint(t,(_b,req,res)=>{headers.push(String(req.headers.authorization));res.writeHead(302,{location:target.url+'/models'});res.end()}),keys=new MemoryKeys(),h=await fixture(t,{deps:{llmKeys:keys}});
 const saved=await call(h.api,root+'/demo/save',{body:{config:config(source.url),secret}});assert.equal(saved.status,200);
 for(const changed of [{...saved.body.config,baseURL:target.url},{...saved.body.config,api:'anthropic-messages'},{...saved.body.config,catalog:'openai'}]){const r=await call(h.api,root+'/discover',{body:{id:'demo',config:changed}});assert.equal(r.body.code,'credential_target_changed');}assert.deepEqual(headers,[]);
 const r=await call(h.api,root+'/discover',{body:{id:'demo',config:saved.body.config}});assert.equal(r.body.ok,false);assert.equal(targetCalls,0);assert.deepEqual(headers,['Bearer '+secret]);assert.doesNotMatch(r.text,RegExp(secret));
});
test('save rolls back key on settings failure, and settings stay unchanged on partial key write failure',limits,async t=>{
 const keys=new MemoryKeys(),h=await fixture(t,{deps:{llmKeys:keys}}),file=join(h.dir,'owner-settings.json');let r=await call(h.api,root+'/demo/save',{body:{config:config('https://example.test/v1'),secret}});assert.equal(r.status,200);const saved=r.body,bytes=readFileSync(file,'utf8'),put=keys.put.bind(keys);let obstruct=true;
 keys.put=async(id,value)=>{await put(id,value);if(obstruct){obstruct=false;renameSync(file,file+'.backup');mkdirSync(file)}};
 r=await call(h.api,root+'/demo/save',{body:{config:{...saved.config,displayName:'new'},revision:saved.revision,secret:'new-fixture-key'}});assert.equal(r.body.code,'write_failed');assert.equal(await keys.resolveKey('demo'),secret);rmdirSync(file);renameSync(file+'.backup',file);assert.equal(readFileSync(file,'utf8'),bytes);
 let fail=true;keys.put=async(id,value)=>{await put(id,value);if(fail){fail=false;throw Error('unsafe '+value)}};
 r=await call(h.api,root+'/demo/save',{body:{config:{...saved.config,displayName:'new'},revision:saved.revision,secret:'new-fixture-key'}});assert.equal(r.body.code,'credential_unavailable');assert.equal(await keys.resolveKey('demo'),secret);assert.equal(readFileSync(file,'utf8'),bytes);assert.doesNotMatch(r.text,/unsafe|new-fixture-key/);
});
test('catalog draft discovery stays offline and keyless; missing fields refuse before any write',limits,async t=>{
 const h=await fixture(t,{deps:{llmKeys:new MemoryKeys(),llmFetch:async()=>{assert.fail('catalog discovery must be offline')}}});const r=await call(h.api,root+'/discover',{body:{id:'my-api',config:{catalog:'anthropic'}}});assert.equal(r.status,200);assert.ok(r.body.models.length>0);
 for(const body of [{},{id:'custom',config:{}},{id:'../x',config:config('https://example.test')}])assert.equal((await call(h.api,root+'/discover',{body})).body.code,'config_invalid');
 assert.equal((await call(h.api,root+'/custom/save',{body:{config:config('https://example.test'),secret:''}})).body.code,'config_invalid');
});
test('first save removes newly written key when config cannot be committed; concurrent save refuses stale draft',limits,async t=>{
 const keys=new MemoryKeys(),h=await fixture(t,{deps:{llmKeys:keys}}),file=join(h.dir,'owner-settings.json');await h.runtime.settings.patch('owner',{keep:true});const bytes=readFileSync(file,'utf8'),put=keys.put.bind(keys);let obstruct=true;
 keys.put=async(id,value)=>{await put(id,value);if(obstruct){obstruct=false;renameSync(file,file+'.backup');mkdirSync(file)}};
 let r=await call(h.api,root+'/new/save',{body:{config:config('https://example.test'),secret}});assert.equal(r.body.code,'write_failed');assert.equal(await keys.resolveKey('new'),null);rmdirSync(file);renameSync(file+'.backup',file);assert.equal(readFileSync(file,'utf8'),bytes);
 keys.put=put;const results=await Promise.all(['first-fixture','second-fixture'].map(secret=>call(h.api,root+'/new/save',{body:{config:config('https://example.test'),secret,revision:null}})));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);r=results.find(r=>r.status===200)!;assert.equal((await keys.describe('new')).mask,r.body.key.mask);
});
