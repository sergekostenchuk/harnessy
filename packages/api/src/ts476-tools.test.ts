import assert from 'node:assert/strict';
import test from 'node:test';
import {createRuntime} from '../../runtime/src/index.ts';
import {completedActions} from '../../runtime/src/test-helpers.ts';
import {createApi} from './server.ts';
import {call,fixture} from './test-helpers.ts';

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
 assert.equal(before.toolResults.length,1);assert.equal(before.toolResults[0].status,'error');assert.match(before.toolResults[0].id,/^[a-f0-9]{64}$/);
 assert.doesNotMatch(JSON.stringify(before.toolEvents),/secret123/);assert.doesNotMatch(JSON.stringify(before.toolResults),/private-tool-id/);
 await h.runtime.close();const restored=await createRuntime(h.deps,completedActions);t.after(()=>restored.close());
 const api=createApi({runtime:restored,siteDir:h.siteDir,port:0});t.after(()=>api.close());await api.listen();
 const after=(await call(api,'/api/chats/'+id)).body.messages.at(-1);
 assert.deepEqual(after.toolEvents,before.toolEvents);assert.deepEqual(after.toolResults,before.toolResults);assert.equal(after.usage.toolCalls,2);
});

test('TS-47.6: changed final text never assigns unconfirmed tool positions',async t=>{
 const h=await fixture(t);h.provider.onRun=async(seat,_message,ctx)=>{ctx.modelStarted?.();ctx.publish({type:'delta',text:'часть'});ctx.publish({type:'tool',name:'Bash',detail:'проверка'});ctx.publish({type:'done',sessionId:'s',model:seat.model,durationMs:1,usage:{input:0,output:0,cacheRead:0}});return {text:'другой итог',sessionId:'s'}};
 await call(h.api,'/api/chat',{body:{pane:'worker',message:'проверь'}});await h.runtime.idle();const id=h.runtime.chatsList({seat:'owner',trust:'owner'}).active.worker!;
 const message=(await call(h.api,'/api/chats/'+id)).body.messages.at(-1);assert.equal(message.toolEvents[0].offset,null);assert.equal(message.toolEvents[0].status,'unknown');assert.equal(message.toolResults,undefined);
});
