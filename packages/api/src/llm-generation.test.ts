import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,call} from './test-helpers.ts';
import {MemoryKeys,config,endpoint,openai,collect,prompt} from '../../llm/src/test-helpers.ts';
import {keySlot,createLlmService} from '@harnessy/llm';
const api='/api/llm/providers';
for(const path of ['stream','draft-discover','saved-discover'])test('atomic save never sends replacement key to prior address: '+path,{timeout:15000},async t=>{
 const seen:string[]=[];
 const old=await endpoint(t,(_b:any,req:any,res:any)=>{seen.push(String(req.headers.authorization));if(path==='stream')openai(res);else res.end(JSON.stringify({data:[{id:'test-model'}]}));});
 const next=await endpoint(t,(_b:any,_req:any,res:any)=>res.end('{}'));
 const keys=new MemoryKeys(),h=await fixture(t,{deps:{llmKeys:keys}});
 const first=await call(h.api,api+'/demo/save',{body:{config:config(old.url),secret:'old-endpoint-key-fixture',revision:null}});
 assert.equal(first.status,200);
 let entered!:()=>void,release!:()=>void;
 const writing=new Promise<void>(r=>entered=r),hold=new Promise<void>(r=>release=r),put=keys.put.bind(keys);
 t.after(()=>release());
 keys.put=async(id:string,key:string)=>{await put(id,key);if(key==='new-endpoint-key-fixture'){entered();await hold;}};
 const updating=call(h.api,api+'/demo/save',{body:{config:config(next.url),secret:'new-endpoint-key-fixture',revision:first.body.revision}});
 await writing;
 let result:any;
 try{
  if(path==='stream')result=await collect(h.runtime.llm,{...prompt,provider:'demo'});
  else if(path==='draft-discover')result=await call(h.api,api+'/discover',{body:{id:'demo',config:first.body.config}});
  else result=await call(h.api,api+'/demo/discover',{body:{}});
 }finally{release();}
 const saved=await updating;assert.equal(saved.status,200);
 assert.deepEqual(seen,['Bearer old-endpoint-key-fixture']);assert.notEqual(saved.body.config.keyGeneration,first.body.config.keyGeneration);assert.equal(await keys.resolveKey(keySlot('demo',first.body.config.keyGeneration)),null);assert.equal(await keys.resolveKey(keySlot('demo',saved.body.config.keyGeneration)),'new-endpoint-key-fixture');
});
test('legacy key slot stays frozen during /key replacement; normal config writes cannot forge a generation',{timeout:15000},async t=>{
 const seen:string[]=[],keys=new MemoryKeys();await keys.put('legacy','legacy-fixture-key');const remote=await endpoint(t,(_b,req,res)=>{seen.push(String(req.headers.authorization));openai(res)}),h=await fixture(t,{deps:{llmKeys:keys}});
 // A previously saved TS-21a config uses the unversioned compatibility slot.
 await h.runtime.settings.changeLlmProvider('legacy',{...config(remote.url),keyRef:'legacy'},null);
 const first=await call(h.api,api+'/legacy'),put=keys.put.bind(keys);let release!:()=>void,entered!:()=>void;const hold=new Promise<void>(r=>release=r),writing=new Promise<void>(r=>entered=r);t.after(()=>release());
 keys.put=async(id,key)=>{await put(id,key);entered();await hold};
 const updating=call(h.api,api+'/legacy/key',{body:{secret:'new-fixture-key',revision:first.body.revision}});await writing;
 try{assert.equal((await collect(h.runtime.llm,{...prompt,provider:'legacy'})).finish.reason,'stop');assert.deepEqual(seen,['Bearer legacy-fixture-key'])}finally{release()}
 const result=await updating;assert.equal(result.status,200);assert.equal(await keys.resolveKey('legacy'),null);assert.ok(result.body.config.keyGeneration);
 for(const path of [api+'/legacy',api+'/legacy/save'])assert.equal((await call(h.api,path,{body:{config:{...result.body.config,keyGeneration:'00000000-0000-4000-8000-000000000000'},revision:result.body.revision}})).body.code,'config_invalid');
 const changed=await call(h.api,api+'/legacy',{body:{config:{...result.body.config,displayName:'Renamed'},revision:result.body.revision}});assert.equal(changed.status,200);assert.equal(changed.body.config.keyGeneration,result.body.config.keyGeneration);
});
test('deleting and recreating a route cannot supply a new secret to an old captured generation',{timeout:15000},async t=>{
 const keys=new MemoryKeys(),h=await fixture(t,{deps:{llmKeys:keys}});const before=await call(h.api,api+'/demo/save',{body:{config:config('https://old.test'),secret:'before-fixture-key'}});
 assert.equal((await call(h.api,api+'/demo/delete',{body:{revision:before.body.revision}})).status,200);const after=await call(h.api,api+'/demo/save',{body:{config:config('https://new.test'),secret:'after-fixture-key'}});assert.equal(after.status,200);assert.notEqual(before.body.config.keyGeneration,after.body.config.keyGeneration);
 let calls=0;const captured=createLlmService({routes:()=>({demo:before.body.config}),resolveKey:(ref,generation)=>keys.resolveKey(keySlot(ref,generation)),fetch:async()=>{calls++;throw Error('no transport')}});
 assert.equal((await collect(captured,{...prompt,provider:'demo'})).finish.failure?.code,'missing_credential');assert.equal(calls,0);assert.equal(keys.rows.size,1);
});
test('key deletion publishes a missing generation and invalidates the old revision',{timeout:15000},async t=>{
 const keys=new MemoryKeys(),h=await fixture(t,{deps:{llmKeys:keys}});const before=await call(h.api,api+'/demo/save',{body:{config:config('https://example.test'),secret:'before-fixture-key'}});
 const removed=await call(h.api,api+'/demo/key/delete',{body:{revision:before.body.revision}});assert.equal(removed.status,200);assert.notEqual(removed.body.config.keyGeneration,before.body.config.keyGeneration);assert.equal(removed.body.key.present,false);assert.equal(keys.rows.size,0);
 assert.equal((await call(h.api,api+'/demo/key',{body:{revision:before.body.revision,secret:'stale-fixture-key'}})).body.code,'llm_conflict');assert.equal(keys.rows.size,0);
 assert.equal((await collect(h.runtime.llm,{...prompt,provider:'demo'})).finish.failure?.code,'missing_credential');
});
test('a stale generation plus stale revision remains a 409 and cannot write any key',{timeout:15000},async t=>{
 const keys=new MemoryKeys(),h=await fixture(t,{deps:{llmKeys:keys}});const first=await call(h.api,api+'/demo/save',{body:{config:config('https://example.test'),secret:'first-fixture-key'}});
 const next=await call(h.api,api+'/demo/save',{body:{config:first.body.config,revision:first.body.revision,secret:'second-fixture-key'}});assert.equal(next.status,200);
 const stale=await call(h.api,api+'/demo/save',{body:{config:first.body.config,revision:first.body.revision,secret:'third-fixture-key'}});assert.equal(stale.status,409);assert.equal(stale.body.code,'llm_conflict');assert.equal(keys.rows.size,1);assert.equal(await keys.resolveKey(keySlot('demo',next.body.config.keyGeneration)),'second-fixture-key');
});
test('missing or forged generation cannot adopt an orphan legacy secret',{timeout:15000},async t=>{
 const keys=new MemoryKeys();await keys.put('demo','orphan-fixture-key');let calls=0;const remote=await endpoint(t,(_b,_req,res)=>{calls++;res.end('{}')}),h=await fixture(t,{deps:{llmKeys:keys}});
 const first=await call(h.api,api+'/demo',{body:{config:config(remote.url)}});assert.equal(first.status,200);
 const draft=await call(h.api,api+'/discover',{body:{id:'demo',config:{...first.body.config,keyRef:'demo'}}});assert.equal(draft.body.code,'missing_credential');assert.equal(calls,0);
 for(const patch of [{keyGeneration:123,keyRef:'demo'},{keyGeneration:'bad',keyRef:'demo'},{keyGeneration:'00000000-0000-4000-8000-000000000001'}])assert.equal((await call(h.api,api+'/demo/save',{body:{config:{...first.body.config,...patch},revision:first.body.revision}})).body.code,'config_invalid');
 const published=await call(h.api,api+'/demo/save',{body:{config:{...first.body.config,keyRef:'demo'},revision:first.body.revision}});assert.equal(published.status,200);assert.ok(published.body.config.keyGeneration);assert.equal(published.body.key.present,false);
 assert.equal((await collect(h.runtime.llm,{...prompt,provider:'demo'})).finish.failure?.code,'missing_credential');assert.equal(calls,0);assert.equal(await keys.resolveKey('demo'),'orphan-fixture-key');
});
test('deleting an absent key keeps a keyless local route usable',{timeout:15000},async t=>{
 const keys=new MemoryKeys(),remote=await endpoint(t,(_b,req,res)=>{assert.equal(req.headers.authorization,undefined);openai(res)}),h=await fixture(t,{deps:{llmKeys:keys}});
 const first=await call(h.api,api+'/demo/save',{body:{config:config(remote.url)}});assert.equal(first.status,200);
 const removed=await call(h.api,api+'/demo/key/delete',{body:{revision:first.body.revision}});assert.equal(removed.status,200);assert.deepEqual(removed.body.config,first.body.config);assert.equal(removed.body.revision,first.body.revision);assert.equal(keys.rows.size,0);
 assert.equal((await collect(h.runtime.llm,{...prompt,provider:'demo'})).finish.reason,'stop');
});
