import test from 'node:test';
import assert from 'node:assert/strict';
import {MacKeyStore,keySlot} from './keys.ts';
import {randomUUID} from 'node:crypto';
import {KEYCHAIN_SCRIPT} from './keychain-script.ts';
import {runInNewContext} from 'node:vm';
const options={timeout:10000};
test('21c.2: JXA queries avoid Ref-valued Security and CoreFoundation constants',()=>{
 assert.doesNotMatch(KEYCHAIN_SCRIPT,/\$\.(?:kSec|kCF)/);
});
test('21c.2: live macOS Keychain put/get/delete uses only the isolated dummy account',{
 skip:process.env.HARNESS_KEYCHAIN_LIVE==='1'?false:'HARNESS_KEYCHAIN_LIVE=1 required',timeout:60000,
},async()=>{
 assert.equal(process.platform,'darwin','live Keychain test requires macOS');
 const store=new MacKeyStore(),account=keySlot('harnessy-selftest',randomUUID()),secret='probe-not-a-real-key-0001',startedAt=Date.now();
 assert.equal(await store.resolveKey(account),null,'self-test generation must be absent before creation');
 let created=false;
 try{
  await store.put(account,secret);
  created=true;
  assert.equal(await store.resolveKey(account),secret);
  const description=await store.describe(account);
  assert.equal(description.present,true);assert.equal(description.mask,'••••••••0001');
  assert.ok(description.updatedAt!==null&&description.updatedAt>=startedAt&&description.updatedAt<=Date.now());
 }finally{if(created)await store.delete(account)}
 assert.equal(await store.resolveKey(account),null);
});
test('arbitrary route Keychain references use stdin only; descriptions expose only presence mask and date',options,async()=>{
 const rows=new Map<string,any>(),seen:any[]=[];const store=new MacKeyStore({platform:'darwin',execute:async r=>{seen.push(r);const body=JSON.parse(r.input!);if(body.op==='put')rows.set(body.provider,{key:body.key,updatedAt:100});if(body.op==='delete')rows.delete(body.provider);return {stdout:JSON.stringify({ok:true,value:rows.get(body.provider)??null}),stderr:'',code:0,signal:null}}});
 assert.deepEqual(await store.describe('my-gateway'),{present:false,mask:null,updatedAt:null});await store.put('my-gateway','private-fixture-1234');assert.equal(await store.resolveKey('my-gateway'),'private-fixture-1234');assert.deepEqual(await store.describe('my-gateway'),{present:true,mask:'••••••••1234',updatedAt:100});await store.put('my-gateway','replacement-5678');assert.equal((await store.describe('my-gateway')).mask,'••••••••5678');await store.delete('my-gateway');assert.equal(await store.resolveKey('my-gateway'),null);for(const r of seen)assert.doesNotMatch(JSON.stringify({args:r.args,env:r.env}),/private-fixture|replacement/);
});
test('Keychain rejects bad routes/keys, unsupported platforms and malformed records with safe codes',options,async()=>{
 let calls=0;const execute:any=async()=>{calls++;throw Error('RAW-SECRET')};const store=new MacKeyStore({platform:'darwin',execute});for(const id of ['../other','constructor','__proto__'])await assert.rejects(store.put(id,'valid-fixture'),{code:'config_invalid'});await assert.rejects(store.put('custom','bad\nkey'),{code:'config_invalid'});assert.equal(calls,0);await assert.rejects(new MacKeyStore({platform:'linux',execute}).describe('custom'),{code:'credential_unavailable'});assert.equal(calls,0);await assert.rejects(store.resolveKey('custom'),e=>e instanceof Error&&!e.message.includes('RAW-SECRET'));
 const bad=new MacKeyStore({platform:'darwin',execute:async()=>({stdout:'{"ok":true,"value":{"key":"RAW-SECRET"}}',stderr:'',code:0,signal:null})});await assert.rejects(bad.describe('custom'),{code:'credential_unavailable'});
});
test('native keychain script accepts new route ids and fails before native calls for forged ids',options,()=>{
 const run=(provider:string)=>JSON.parse(runInNewContext(KEYCHAIN_SCRIPT+';run()',{$:{NSFileHandle:{fileHandleWithStandardInput:{readDataToEndOfFile:{length:80}}},NSString:{alloc:{initWithDataEncoding:()=>JSON.stringify({op:'get',provider})}}},ObjC:{import(){},unwrap:(s:string)=>s}}));assert.equal(run('../escape').code,'key_invalid');assert.equal(run('constructor').code,'key_invalid');assert.equal(run('new-owner-gateway').code,'keystore_failed');
});
test('versioned Keychain accounts validate both components and never overwrite a generation',options,()=>{
 const generation='00000000-0000-4000-8000-000000000001';let updates=0,adds=0;
 const run=(provider:string)=>{const dollar:any=(_s:string)=>({dataUsingEncoding(){return {}}});Object.assign(dollar,{NSFileHandle:{fileHandleWithStandardInput:{readDataToEndOfFile:{length:80}}},NSString:{alloc:{initWithDataEncoding:()=>JSON.stringify({op:'put',provider,key:'fixture-secret'})}},NSMutableDictionary:{alloc:{get init(){return {setObjectForKey(){},removeObjectForKey(){}}}}},SecItemAdd(){adds++;return -25299},SecItemUpdate(){updates++;return 0}});return JSON.parse(runInNewContext(KEYCHAIN_SCRIPT+';run()',{$:dollar,ObjC:{import(){},unwrap:(s:string)=>s}}))};
 assert.equal(run('gateway:'+generation).ok,false);assert.equal(adds,1);assert.equal(updates,0);
 for(const id of ['gateway:bad','gateway:'+generation+':extra','../other:'+generation,'constructor:'+generation])assert.equal(run(id).code,'key_invalid');assert.equal(adds,1);assert.equal(updates,0);
});
test('22a: proxy passwords share the Keychain backend with a separate service, stdin and a full mask even for short passwords',options,async()=>{
 const rows=new Map<string,unknown>(),seen:any[]=[];const execute:any=async(r:any)=>{seen.push(r);const body=JSON.parse(r.input),id=(body.purpose??'api-key')+':'+body.provider;if(body.op==='put')rows.set(id,{key:body.key,updatedAt:100});if(body.op==='delete')rows.delete(id);return {stdout:JSON.stringify({ok:true,value:rows.get(id)??null}),stderr:'',code:0,signal:null}};
 const proxy=new MacKeyStore({purpose:'proxy-password',platform:'darwin',execute}),api=new MacKeyStore({platform:'darwin',execute}),id=keySlot('same-id',randomUUID());
 await api.put(id,'api-fixture-value');await proxy.put(id,'я');assert.equal(await api.resolveKey(id),'api-fixture-value');assert.equal(await proxy.resolveKey(id),'я');assert.deepEqual(await proxy.describe(id),{present:true,mask:'••••••••',updatedAt:100});await proxy.delete(id);assert.equal(await api.resolveKey(id),'api-fixture-value');
 for(const value of ['', 'x\ny', 'x'.repeat(4097), 'я'.repeat(2049)])await assert.rejects(proxy.put(id,value),{code:'config_invalid'});await assert.rejects(api.put(id,'я'),{code:'config_invalid'});
 for(const r of seen)assert.doesNotMatch(JSON.stringify({args:r.args,env:r.env}),/api-fixture-value|я/);
});
test('22a: native Keychain selects the proxy namespace and preserves immutable generation writes',options,()=>{
 const gen='00000000-0000-4000-8000-000000000001',services:string[]=[];let adds=0,updates=0;
 const run=(purpose?:string)=>{const dollar:any=(s:string)=>({s,dataUsingEncoding(){return {}},lengthOfBytesUsingEncoding(){return Buffer.byteLength(s)}});Object.assign(dollar,{NSFileHandle:{fileHandleWithStandardInput:{readDataToEndOfFile:{length:80}}},NSString:{alloc:{initWithDataEncoding:()=>JSON.stringify({op:'put',provider:'same:'+gen,key:'я',...(purpose?{purpose}:{})})}},NSMutableDictionary:{alloc:{get init(){return {setObjectForKey(value:any,key:any){if(key.s==='svce')services.push(value.s)},removeObjectForKey(){}}}}},SecItemAdd(){adds++;return -25299},SecItemUpdate(){updates++;return 0}});return JSON.parse(runInNewContext(KEYCHAIN_SCRIPT+';run()',{$:dollar,ObjC:{import(){},unwrap:(s:string)=>s}}))};
 assert.equal(run('proxy-password').code,'keystore_failed');assert.equal(adds,1);assert.equal(updates,0);assert.deepEqual(services,['Harnessy proxy password']);assert.equal(run().code,'key_invalid');assert.equal(run('arbitrary').code,'key_invalid');assert.equal(adds,1);
});
