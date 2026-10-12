import test from 'node:test';
import assert from 'node:assert/strict';
import {MacKeyStore} from './keys.ts';
import {KEYCHAIN_SCRIPT} from './keychain-script.ts';
import {runInNewContext} from 'node:vm';
const options={timeout:10000};
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
