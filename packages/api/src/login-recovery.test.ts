import test from 'node:test';
import assert from 'node:assert/strict';
import {ProviderCatalog,ProviderError,type CatalogEntry} from '@harnessy/providers';
import {fixture,call} from './test-helpers.ts';
const entry=():CatalogEntry=>({id:'fixture',title:'Fixture',binary:'fixture',login:{args:['login']},forbiddenEnv:[],capabilities:{headless:true,mcp:true,resume:true,limits:false},version:async()=> '1',auth:async()=>({loggedIn:true,email:'owner@example.test'}),models:async()=>[{id:'model',label:'Model'}],runTurn:async()=>{throw Error('no model calls')}});
const marker='sk-test-NEVER-PUBLISH-999999999999999';
for(const [code,failure] of [['region_restricted','region'],['network_blocked','blocked'],['network_unavailable','offline'],['transport_lost','unresponsive'],['protocol','unresponsive']] as const)test('TS-23e: HTTP login failure uses typed '+code+' evidence, never stderr',async t=>{
 const e=entry();let failed=true;e.auth=async()=>{if(failed)throw new ProviderError(code,marker+' region denied');return {loggedIn:true}};const catalog=new ProviderCatalog([e]),h=await fixture(t,{deps:{providerCatalog:catalog}});
 const first=await call(h.api,'/api/providers/fixture/check',{body:{}});assert.equal(first.status,200);assert.equal(first.body.login.failure,failure);assert.equal(first.text.includes(marker),false);
 const rows=await call(h.api,'/api/providers/catalog');assert.equal(rows.body.providers[0].login.failure,failure);assert.equal(rows.text.includes(marker),false);
 failed=false;const again=await call(h.api,'/api/providers/fixture/check',{body:{}});assert.equal(again.body.login.state,'ok');assert.equal(again.body.login.failure,undefined);
});

test('TS-23e: local absence, unknown login and model failures never invent a network cause',async t=>{
 for(const mode of ['missing','unknown','models','message']){const e=entry();if(mode==='missing')e.version=async()=>{throw new ProviderError('no_binary','region denied')};if(mode==='unknown')e.auth=async()=>({loggedIn:false,state:'unknown',reason:'вход не проверен'});if(mode==='models')e.models=async()=>{throw new ProviderError('protocol','region denied')};if(mode==='message')e.auth=async()=>{throw Error('region denied '+marker)};
 const catalog=new ProviderCatalog([e]);t.after(()=>catalog.close());const {row}=await catalog.read('fixture');assert.equal(row.login.failure,mode==='message'?'unresponsive':undefined);assert.equal(JSON.stringify(row).includes(marker),false);
 }
});

test('TS-23e: refused socket means no connection; a later model error clears the old login cause',async t=>{
 const e=entry();e.auth=async()=>{throw Object.assign(new Error(marker),{code:'ECONNREFUSED'})};const c=new ProviderCatalog([e]);t.after(()=>c.close());assert.equal((await c.read('fixture')).row.login.failure,'offline');e.auth=async()=>({loggedIn:true});c.get('fixture').auth=e.auth;c.get('fixture').models=async()=>{throw new ProviderError('transport_lost','read interrupted')};assert.equal((await c.read('fixture')).row.login.failure,undefined);
});
