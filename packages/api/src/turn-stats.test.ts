import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture,call,OWNER,deferred,sse,until} from './test-helpers.ts';
const rate={vendor:'claude',model:'w1',inputPerM:3,outputPerM:15,cacheReadPerM:.3,currency:'USD'};
const prices=(h:Awaited<ReturnType<typeof fixture>>,rows:unknown[])=>call(h.api,'/api/settings',{body:{scope:'owner',patch:{priceList:rows}}});
const replies=async(h:Awaited<ReturnType<typeof fixture>>)=>(await call(h.api,'/api/chats/'+h.runtime.project.state.chats.active.worker)).body.messages.filter((m:any)=>m.role==='ai');

test('TS-40: per-answer usage, captured mode, tools, price and trace survive restart; current prices match spend',async t=>{
 const h=await fixture(t);assert.equal((await prices(h,[rate])).status,200);
 h.provider.onRun=async(seat,_text,ctx)=>{ctx.modelStarted?.();ctx.publish({type:'delta',text:'Ответ'});ctx.publish({type:'tool',name:'Read',detail:'a'});ctx.publish({type:'tool',name:'Read',detail:'b'});ctx.publish({type:'done',sessionId:'s',model:seat.model,durationMs:6400,usage:{input:100,output:20,cacheRead:30}});return {text:'Ответ',sessionId:'s'}};
 await h.runtime.runTurn('worker','Первый');await h.runtime.runTurn('worker','Второй');
 const before=await replies(h),u=before[0].usage;assert.equal(before.length,2);assert.notEqual(u.turnId,before[1].usage.turnId);
 assert.ok(Math.abs(u.cost-.000609)<1e-12);assert.deepEqual({...u,turnId:undefined,cost:undefined},{turnId:undefined,model:'w1',vendor:'claude',mode:'read',input:100,output:20,cacheRead:30,durationMs:6400,toolCalls:2,stopped:false,contextAfter:{used:150,window:null},cost:undefined,currency:'USD'});
 const trace=await call(h.api,'/api/trace?project='+encodeURIComponent(h.dir)+'&turnId='+u.turnId);assert.equal(trace.status,200);assert.ok(trace.body.records.some((r:any)=>r.kind==='turn.end'&&r.turnInstanceId===u.turnId));assert.ok(trace.body.records.every((r:any)=>!r.turnInstanceId||r.turnInstanceId===u.turnId));
 assert.equal((await call(h.api,'/api/trace?turnId=not-a-turn')).status,400);assert.equal((await call(h.api,'/api/trace?project=/another&turnId='+u.turnId)).status,409);
 await h.runtime.openProject(h.dir);assert.deepEqual(await replies(h),before);
 const saved=JSON.parse(readFileSync(h.runtime.project.state.chatsPath,'utf8'));assert.deepEqual(saved.chats[h.runtime.project.state.chats.active.worker!].transcript.find((m:any)=>m.role==='ai').usage,u);
 await prices(h,[{...rate,inputPerM:6}]);const changed=await replies(h),spend=(await call(h.api,'/api/spend')).body;assert.equal(changed.reduce((sum:number,m:any)=>sum+m.usage.cost,0),spend.cost);assert.notEqual(changed[0].usage.cost,u.cost);
 await prices(h,[]);assert.equal((await replies(h))[0].usage.cost,null);
});

test('TS-40: Codex CLI missing tokens remain null; a legacy response gets no synthetic usage',async t=>{
 const h=await fixture(t);h.runtime.paneSet('worker',{model:'c1'},OWNER);
 h.codex.onRun=async(seat,_text,ctx)=>{ctx.modelStarted?.();ctx.publish({type:'done',sessionId:'codex',model:seat.model,durationMs:41000,usage:{input:null,output:null,cacheRead:null}});return {text:'Ответ без токенов',sessionId:'codex'}};
 await h.runtime.runTurn('worker','Вопрос');const u=(await replies(h))[0].usage;assert.equal(u.vendor,'codex');assert.deepEqual([u.input,u.output,u.cacheRead,u.cost,u.contextAfter],[null,null,null,null,null]);assert.equal(u.durationMs,41000);
 h.runtime.registry.get('worker')!.record('ai','Старый ответ');h.runtime.project.state.saveChats(h.runtime.registry);assert.equal((await replies(h)).at(-1).usage,undefined);
});

test('TS-40: owner interruption retains partial output and its measured cost',async t=>{
 const h=await fixture(t),entered=deferred(),gate=deferred();t.after(()=>gate.resolve());await prices(h,[rate]);
 h.provider.onRun=async(seat,_text,ctx)=>{ctx.modelStarted?.();ctx.publish({type:'delta',text:'Часть ответа'});ctx.publish({type:'done',sessionId:'s',model:seat.model,durationMs:12000,usage:{input:12040,output:611,cacheRead:0}});ctx.setHandle({interrupt:async()=>gate.resolve(),steer:async()=>{}});entered.resolve();await gate.promise;return {text:'Часть ответа',sessionId:'s',interrupted:true}};
 const run=h.runtime.runTurn('worker','Вопрос');await entered.promise;h.runtime.interrupt('worker',OWNER);await run;
 const message=(await replies(h))[0];assert.equal(message.text,'Часть ответа');assert.equal(message.usage.stopped,true);assert.equal(message.usage.output,611);assert.equal(message.usage.cacheRead,0);assert.ok(message.usage.cost>0);assert.equal((await call(h.api,'/api/spend')).body.cost,message.usage.cost);
});

test('TS-40: absent and incomplete provider measurements do not become zero or a complete price',async t=>{
 const h=await fixture(t);await prices(h,[rate]);h.provider.onRun=async(_seat,_text,ctx)=>{ctx.modelStarted?.();h.clock.advance(5);return {text:'Без счётчиков',sessionId:null}};
 const stream=await sse(h.api,'worker');t.after(()=>stream.close());await h.runtime.runTurn('worker','Вопрос');await until(()=>stream.frames.some(e=>e.type==='done'));const a=(await replies(h))[0].usage;assert.deepEqual([a.input,a.output,a.cacheRead,a.cost,a.contextAfter],[null,null,null,null,null]);assert.equal(a.durationMs,5);assert.equal(a.model,null);assert.deepEqual(stream.frames.find(e=>e.type==='done').turnUsage,a);assert.equal(stream.frames.some(e=>e.code==='unserializable'),false);
 h.provider.onRun=async(seat,_text,ctx)=>{ctx.modelStarted?.();ctx.publish({type:'done',sessionId:null,model:seat.model,durationMs:1,usage:{input:1,output:2,cacheRead:0},usageIncomplete:true});return {text:'Часть счётчиков',sessionId:null}};await h.runtime.runTurn('worker','Ещё');const b=(await replies(h))[1].usage;assert.equal(b.cost,null);assert.equal(b.contextAfter,null);
});
