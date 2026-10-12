import test from 'node:test';
import assert from 'node:assert/strict';
import type {TestContext} from 'node:test';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {ProviderCatalog,type CatalogEntry} from '@harnessy/providers';
import {fixture,call,sse,deferred,OWNER} from './test-helpers.ts';

async function setup(t:TestContext,extra:CatalogEntry[]=[]){
 const state={email:'alice@example.test',loggedIn:true,models:[{id:'m1',label:'Model 1'}],starts:0};
 let beforeTurn:(()=>Promise<void>)|undefined;
 const entry:CatalogEntry={id:'fixture',title:'Fixture',binary:'/no-real-cli',forbiddenEnv:[],login:{args:['login']},capabilities:{headless:true,mcp:true,resume:true,limits:false},
  async version(){return '1.0'},async auth(){return {loggedIn:state.loggedIn,email:state.email}},async models(){return state.models},
  async runTurn(seat,_message,ctx){await beforeTurn?.();await ctx.beforeModel?.({provider:seat.vendor,model:seat.model});state.starts++;ctx.modelStarted?.();ctx.publish({type:'done',model:seat.model,sessionId:'test',durationMs:1,usage:{input:1,output:1,cacheRead:0}});return {text:'готов',sessionId:'test'}}};
 const h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([entry,...extra])}}),stream=await sse(h.api,'owner');t.after(()=>stream.close());
 const probe=async()=>{const r=await call(h.api,'/api/providers/fixture/probe',{body:{model:'m1'}});assert.equal(r.body.ok,true);return r.body as {approvalId:string;bindingGen:number}},
 check=async()=>{const r=await call(h.api,'/api/providers/fixture/check',{body:{}});assert.equal(r.body.ok,true);return r.body as {bindingGen:number;login:{checkedAt:number}}},
 decide=(id:string,decision:'allow'|'deny',extra:Record<string,unknown>={})=>call(h.api,'/api/approve',{body:{pane:'owner',project:h.dir,id,decision,...extra}}),
 ended=(id:string)=>new Promise<any>((resolve,reject)=>{
  const finish=(error?:Error,value?:unknown)=>{clearTimeout(timer);stream.response.off('data',inspect);error?reject(error):resolve(value)},
  inspect=()=>{const event=stream.frames.find(e=>e.type==='providers'&&e.approvalId===id&&['done','error','declined'].includes(e.status));if(event)finish(undefined,event)},
  timer=setTimeout(()=>finish(Error('Нет результата probe: '+JSON.stringify(stream.frames))),5000);stream.response.on('data',inspect);inspect();
 });
 return {...h,state,entry,stream,probe,check,decide,ended,setBeforeTurn(fn:()=>Promise<void>){beforeTurn=fn}};
}

for(const source of ['catalog','check'] as const)for(const change of ['account','login','models'] as const)for(const first of ['allow','deny'] as const){
 test('295: '+source+' detects '+change+' A→B→A before '+first+'; approval cannot start a model',async t=>{
  const h=await setup(t),card=await h.probe();assert.ok(Number.isSafeInteger(card.bindingGen)&&card.bindingGen>0);
  const read=async()=>source==='check'?h.check():call(h.api,'/api/providers/catalog');
  if(change==='account')h.state.email='amy@example.test'; // Same public mask: account identity must still change.
  if(change==='login')h.state.loggedIn=false;
  if(change==='models')h.state.models=[...h.state.models,{id:'m2',label:'Model 2'}];
  await read();h.state.email='alice@example.test';h.state.loggedIn=true;h.state.models=[{id:'m1',label:'Model 1'}];await read();
  const latest=await h.check();assert.equal(latest.bindingGen,card.bindingGen+2);
  const order=first==='allow'?['allow','deny'] as const:['deny','allow'] as const;
  for(const decision of order){const r=await h.decide(card.approvalId,decision,{bindingGen:latest.bindingGen});if(decision==='allow'){assert.equal(r.body.ok,false);assert.equal(r.body.code,'binding_changed')}else assert.equal(r.body.ok,true)}
  const end=await h.ended(card.approvalId);assert.equal(end.status,'error');assert.equal(end.error.code,'binding_changed');assert.match(end.error.reason,/Привязка/);assert.equal(h.state.starts,0);assert.equal(h.runtime.owner.approvals.size,0);
  assert.equal((await h.decide(card.approvalId,'deny')).body.ok,true);
  const events=h.stream.frames.filter(e=>e.type==='providers'&&e.approvalId===card.approvalId);assert.deepEqual(events.map(e=>e.status),['awaiting_approval','error']);for(const event of events)assert.equal(event.bindingGen,card.bindingGen);
  assert.doesNotMatch(JSON.stringify(events),/alice|amy/);
 });
}

test('295: checkedAt changes alone keep the binding; duplicate approval starts exactly one model',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const h=await setup(t),card=await h.probe(),a=await h.check();now+=1000;const b=await h.check();assert.notEqual(a.login.checkedAt,b.login.checkedAt);assert.equal(a.bindingGen,b.bindingGen);assert.equal(b.bindingGen,card.bindingGen);
 await call(h.api,'/api/providers/catalog');const responses=await Promise.all([h.decide(card.approvalId,'allow'),h.decide(card.approvalId,'allow')]);assert.equal(responses.filter(r=>r.body.ok).length,1);
 assert.equal((await h.ended(card.approvalId)).status,'done');assert.equal(h.state.starts,1);for(const event of h.stream.frames.filter(e=>e.type==='providers'&&e.approvalId===card.approvalId))assert.equal(event.bindingGen,card.bindingGen);
 assert.equal((await h.decide(card.approvalId,'deny')).body.ok,true);assert.equal(h.state.starts,1);
});

test('295: a catalog observation revokes an allowed turn while its provider awaits preparation',async t=>{
 const h=await setup(t),seen=deferred(),gate=deferred();t.after(()=>gate.resolve());h.setBeforeTurn(async()=>{seen.resolve();await gate.promise});
 const card=await h.probe();assert.equal((await h.decide(card.approvalId,'allow')).body.ok,true);await seen.promise;
 h.state.email='amy@example.test';await h.check();h.state.email='alice@example.test';await h.check();gate.resolve();
 const end=await h.ended(card.approvalId);assert.equal(end.error.code,'binding_changed');assert.equal(h.state.starts,0);
});

test('295: a slow second CLI cannot delay or roll back binding observations from a catalog request',async t=>{
 const seen=deferred(),gate=deferred();t.after(()=>gate.resolve());
 const slow:CatalogEntry={id:'slow',title:'Slow CLI',binary:'/no-real-cli',forbiddenEnv:[],login:{args:['login']},capabilities:{headless:true,mcp:true,resume:true,limits:false},async version(){return '1'},async auth(){return {loggedIn:true,email:'other@example.test'}},async models(){seen.resolve();await gate.promise;return []},async runTurn(){throw Error('must not run')}};
 const h=await setup(t,[slow]),card=await h.probe();h.state.email='amy@example.test';const list=call(h.api,'/api/providers/catalog');await seen.promise;
 // check is queued after the catalog's read for this provider, while the other provider stays blocked.
 const b=await h.check();assert.equal(b.bindingGen,card.bindingGen+1);h.state.email='alice@example.test';assert.equal((await h.check()).bindingGen,card.bindingGen+2);
 assert.equal((await h.decide(card.approvalId,'allow')).body.code,'binding_changed');assert.equal((await h.ended(card.approvalId)).error.code,'binding_changed');assert.equal(h.state.starts,0);
 gate.resolve();await list;assert.equal((await h.check()).bindingGen,card.bindingGen+2);
});

test('295: direct runtime approval checks generation too; closed-card deny cannot cancel a new card',async t=>{
 const h=await setup(t),old=await h.probe();h.state.email='amy@example.test';await h.check();h.state.email='alice@example.test';await h.check();
 const rejected=h.runtime.approve('owner',old.approvalId,'allow',OWNER);assert.ok('code'in rejected);assert.equal(rejected.code,'binding_changed');await h.ended(old.approvalId);
 const fresh=await h.probe();assert.equal(fresh.bindingGen,old.bindingGen+2);assert.notEqual(fresh.approvalId,old.approvalId);
 assert.equal((await h.decide(old.approvalId,'deny')).body.ok,true);assert.equal(h.runtime.owner.approvals.size,1);
 assert.equal((await h.decide(fresh.approvalId,'allow')).body.ok,true);assert.equal((await h.ended(fresh.approvalId)).status,'done');assert.equal(h.state.starts,1);
 assert.equal((await h.decide('provider-probe:forged','deny')).body.ok,false);
});


test('295: each project/provider keeps its generation across project close and return',async t=>{
 const h=await setup(t),a=await h.check();h.state.email='amy@example.test';assert.equal((await h.check()).bindingGen,a.bindingGen+1);
 const other=join(h.dir,'second-project');mkdirSync(other);await h.runtime.projectSet(other,{},OWNER);
 const b=await h.check();assert.equal(b.bindingGen,1);h.state.email='alice@example.test';assert.equal((await h.check()).bindingGen,b.bindingGen+1);
 await h.runtime.projectSet(h.dir,{},OWNER);assert.equal((await h.check()).bindingGen,a.bindingGen+2);
});
