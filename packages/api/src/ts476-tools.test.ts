import assert from 'node:assert/strict';
import test from 'node:test';
import {createRuntime} from '../../runtime/src/index.ts';
import {completedActions} from '../../runtime/src/test-helpers.ts';
import {createApi} from './server.ts';
import {call,fixture} from './test-helpers.ts';
import {ProviderError} from '@harnessy/providers';

test('TS-47.6: observed tools and independent receipts survive engine restart and API history',async t=>{
 const h=await fixture(t);
 h.provider.onRun=async(seat,_message,ctx)=>{
  ctx.modelStarted?.();ctx.publish({type:'delta',text:'До '});
  ctx.publish({type:'tool',name:'Read',detail:'password=secret123'});
  ctx.traceEvent?.({id:'private-tool-id',name:'Read',phase:'call'});
  ctx.publish({type:'tool',name:'Read',detail:'второй файл'});
  ctx.publish({type:'toolError',text:'пример отказа'});
  ctx.traceEvent?.({id:'private-tool-id',name:'Read',phase:'result',outcome:'failed',error:'пример отказа'});
  ctx.publish({type:'delta',text:'после'});
  ctx.publish({type:'done',sessionId:'test',model:seat.model,durationMs:5,usage:{input:2,output:3,cacheRead:0}});
  return {text:'До после',sessionId:'test'};
 };
 assert.equal((await call(h.api,'/api/chat',{body:{pane:'worker',message:'проверь'}})).status,200);await h.runtime.idle();
 const id=h.runtime.chatsList({seat:'owner',trust:'owner'}).active.worker!;
 const before=(await call(h.api,'/api/chats/'+id)).body.messages.at(-1);
 assert.deepEqual(before.toolEvents.map((e:any)=>[e.type,e.status,e.offset]),[['tool','unknown',3],['tool','unknown',3],['toolError','error',3]]);
 assert.equal(before.toolResults.length,1);assert.equal(before.toolResults[0].status,'error');assert.equal(before.toolResults[0].offset,3);assert.deepEqual([...before.toolEvents.map((e:any)=>e.order),before.toolResults[0].order],[0,1,2,3]);assert.match(before.toolResults[0].id,/^[a-f0-9]{64}$/);
 assert.doesNotMatch(JSON.stringify(before.toolEvents),/secret123/);assert.doesNotMatch(JSON.stringify(before.toolResults),/private-tool-id/);
 await h.runtime.close();const restored=await createRuntime(h.deps,completedActions);t.after(()=>restored.close());
 const api=createApi({runtime:restored,siteDir:h.siteDir,port:0});t.after(()=>api.close());await api.listen();
 const after=(await call(api,'/api/chats/'+id)).body.messages.at(-1);
 assert.deepEqual(after.toolEvents,before.toolEvents);assert.deepEqual(after.toolResults,before.toolResults);assert.equal(after.usage.toolCalls,2);
});

test('TS-47.6: a result-only provider error records its own position without inventing a toolError',async t=>{
 const h=await fixture(t);h.provider.onRun=async(seat,_message,ctx)=>{ctx.modelStarted?.();ctx.publish({type:'tool',name:'Edit',detail:'file'});ctx.traceEvent?.({id:'edit-1',name:'fileChange',phase:'result',outcome:'failed',error:'Не удалось изменить файл'});ctx.publish({type:'delta',text:'ответ'});ctx.publish({type:'done',sessionId:'s',model:seat.model,durationMs:1,usage:{input:0,output:0,cacheRead:0}});return {text:'ответ',sessionId:'s'}};
 await call(h.api,'/api/chat',{body:{pane:'worker',message:'проверь'}});await h.runtime.idle();const id=h.runtime.chatsList({seat:'owner',trust:'owner'}).active.worker!;
 const message=(await call(h.api,'/api/chats/'+id)).body.messages.at(-1);assert.deepEqual(message.toolEvents.map((e:any)=>e.type),['tool']);assert.equal(message.toolResults[0].status,'error');assert.equal(message.toolResults[0].offset,0);assert.equal(message.toolResults[0].order,1);assert.equal(message.toolResults[0].reason,'Не удалось изменить файл');
});

for(const failure of ['throw','terminal'] as const)test('TS-47.6 r2: '+failure+' retains failed turn events without asserting text position',async t=>{
 const h=await fixture(t);h.provider.onRun=async(seat,_message,ctx)=>{ctx.modelStarted?.();ctx.publish({type:'delta',text:'неподтверждённый текст'});ctx.publish({type:'tool',name:'Read',detail:'file'});ctx.publish({type:'toolError',text:'Ошибка чтения'});ctx.traceEvent?.({id:'read-failed',name:'Read',phase:'result',outcome:'failed',error:'Ошибка чтения'});if(failure==='throw')throw new ProviderError('transport_lost','Связь потеряна');ctx.publish({type:'error',text:'Провайдер отказал'});return {text:'неподтверждённый текст',sessionId:null}};
 await assert.rejects(h.runtime.runTurn('worker','проверка'));const id=h.runtime.chatsList({seat:'owner',trust:'owner'}).active.worker!;await h.runtime.openProject(h.dir);
 const history=(await call(h.api,'/api/chats/'+id)).body,turn=history.turns.at(-1);assert.equal(turn.outcome,'error');assert.ok(turn.turnInstanceId);assert.deepEqual(turn.toolEvents.map((e:any)=>[e.type,e.offset]),[['tool',null],['toolError',null]]);assert.deepEqual(turn.toolResults.map((e:any)=>[e.status,e.offset]),[['error',null]]);assert.equal(turn.toolEvents[1].reason,'Ошибка чтения');assert.equal(turn.toolResults[0].reason,'Ошибка чтения');assert.equal(history.messages.some((m:any)=>m.text==='неподтверждённый текст'),false);
});

test('TS-47.6 r2: a network refusal before model start keeps the existing failed-turn record',async t=>{
 const h=await fixture(t);h.provider.onRun=async()=>{throw new ProviderError('network_unavailable','Связь недоступна')};
 await assert.rejects(h.runtime.runTurn('worker','проверка'));const id=h.runtime.chatsList({seat:'owner',trust:'owner'}).active.worker!;await h.runtime.openProject(h.dir);
 const history=(await call(h.api,'/api/chats/'+id)).body;assert.equal(history.turns.at(-1).errorCode,'network_unavailable');assert.equal(history.turns.at(-1).toolEvents,undefined);
});

test('TS-47.6: changed final text never assigns unconfirmed tool positions',async t=>{
 const h=await fixture(t);h.provider.onRun=async(seat,_message,ctx)=>{ctx.modelStarted?.();ctx.publish({type:'delta',text:'часть'});ctx.publish({type:'tool',name:'Bash',detail:'проверка'});ctx.publish({type:'done',sessionId:'s',model:seat.model,durationMs:1,usage:{input:0,output:0,cacheRead:0}});return {text:'другой итог',sessionId:'s'}};
 await call(h.api,'/api/chat',{body:{pane:'worker',message:'проверь'}});await h.runtime.idle();const id=h.runtime.chatsList({seat:'owner',trust:'owner'}).active.worker!;
 const message=(await call(h.api,'/api/chats/'+id)).body.messages.at(-1);assert.equal(message.toolEvents[0].offset,null);assert.equal(message.toolEvents[0].status,'unknown');assert.equal(message.toolResults,undefined);
});
