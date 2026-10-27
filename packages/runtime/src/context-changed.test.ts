import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,OWNER,collect,until} from './test-helpers.ts';
import {createRuntime} from './runtime.ts';
import {ProviderError,type TurnContext} from '@harnessy/providers';
import {transferSnapshot} from './chats.ts';

for(const compressed of [false,true])test('TS-51.E: durable '+(compressed?'truncate':'transfer')+' receipt and SSE agree without invented token counts',{timeout:60_000},async t=>{
 const h=await harness(t),r=h.runtime,pane=r.registry.get('worker')!;
 pane.record('me',compressed?'длинный текст '.repeat(2000):'вопрос');pane.record('ai','ответ');pane.sessionId=null;r.project.state.savePanes(r.registry,r.journal);
 await r.settingsPatch('owner',{contextTransferMessages:100,contextTransferTokens:compressed?512:20000},OWNER);
 const events=collect(r);t.after(()=>events.sub.close());await r.runTurn('worker','продолжить');await until(()=>events.events.some(e=>e.type==='contextChanged'));
 const event=events.events.find(e=>e.type==='contextChanged')!,saved=r.chatGet(r.project.state.chats.active.worker!,OWNER).messages.find(m=>m.contextChanged)!;
 const change=saved.contextChanged as any;assert.equal(change.kind,compressed?'truncate':'transfer');assert.equal(change.before,null);assert.equal(change.after,null);assert.equal(change.source,'harness');assert.equal(change.project,h.dir);assert.equal(change.chat,r.project.state.chats.active.worker);assert.equal(change.turnInstanceId,(pane.transcript.at(-1)!.runtime as any).turnInstanceId);assert.deepEqual(event.change,change);assert.equal(event.seq,saved.seq);
 assert.equal(transferSnapshot(r.project,pane,[])!.messages.some(m=>m.text===saved.text),false);
 await r.close();const reopened=await createRuntime(h.deps,r.actions);t.after(()=>reopened.close());assert.deepEqual(reopened.chatGet(change.chat,OWNER).messages.find(m=>m.contextChanged)!.contextChanged,change);
});

test('TS-51.E: manual summary belongs to the new chat and references the completed source turn',{timeout:60_000},async t=>{
 const h=await harness(t),r=h.runtime,pane=r.registry.get('worker')!;pane.record('me','вопрос');pane.record('ai','ответ');r.project.state.savePanes(r.registry,r.journal);const old=r.project.state.chats.active.worker!,events=collect(r);t.after(()=>events.sub.close());
 const result=await r.chatsNew({pane:'worker',carry:'summary'},OWNER),next=r.chatGet(result.chat.id,OWNER),notice=next.messages.find(m=>(m.contextChanged as any)?.kind==='manual_summary')!,change=notice.contextChanged as any;
 assert.equal(change.sourceChat,old);assert.equal(change.chat,result.chat.id);assert.equal(change.before,null);assert.equal(change.after,null);assert.equal(change.turnInstanceId,(r.chatGet(old,OWNER).messages.at(-1)!.runtime as any).turnInstanceId);
 await until(()=>events.events.some(e=>(e.change as any)?.kind==='manual_summary'));assert.deepEqual(events.events.find(e=>(e.change as any)?.kind==='manual_summary')!.change,change);assert.match(pane.carry,/Выжимка прежнего чата/);
 await r.close();const reopened=await createRuntime(h.deps,r.actions);t.after(()=>reopened.close());assert.deepEqual(reopened.chatGet(result.chat.id,OWNER).messages.find(m=>m.contextChanged)!.contextChanged,change);
});

for(const failure of [false,true])test('TS-51.E: provider compaction survives '+(failure?'failed':'successful')+' turn with source binding and nulls',{timeout:60_000},async t=>{
 const h=await harness(t),r=h.runtime;let captured:TurnContext|undefined;
 h.provider.onRun=async(seat,_text,ctx)=>{captured=ctx;ctx.modelStarted?.();ctx.publish({type:'contextChanged',kind:'provider_compaction',before:120000,after:null,source:'forged-source'});ctx.publish({type:'delta',text:'текст'});if(failure)throw new ProviderError('transport_lost','связь потеряна');return {text:'текст',sessionId:'s'}};
 const events=collect(r);t.after(()=>events.sub.close());if(failure)await assert.rejects(r.runTurn('worker','вопрос'));else await r.runTurn('worker','вопрос');
 const chat=r.project.state.chats.active.worker!,history=r.chatGet(chat,OWNER),change=history.messages.find(m=>m.contextChanged)!.contextChanged as any;
 assert.equal(change.kind,'provider_compaction');assert.equal(change.before,120000);assert.equal(change.after,null);assert.equal(change.source,'claude');assert.equal(change.chat,chat);assert.equal(change.project,h.dir);assert.equal(typeof change.ts,'number');assert.ok(change.turnInstanceId);
 await until(()=>events.events.some(e=>e.type==='contextChanged'));assert.deepEqual(events.events.find(e=>e.type==='contextChanged')!.change,change);
 const before=history.messages.length;captured!.publish({type:'contextChanged',kind:'provider_compaction',before:1,after:0,source:'late'});assert.equal(r.chatGet(chat,OWNER).messages.length,before);
 await r.close();const reopened=await createRuntime(h.deps,r.actions);t.after(()=>reopened.close());assert.deepEqual(reopened.chatGet(chat,OWNER).messages.find(m=>m.contextChanged)!.contextChanged,change);
});
