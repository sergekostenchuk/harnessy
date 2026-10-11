import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,call,OWNER} from './test-helpers.ts';
import {promotionInput} from '../../runtime/src/test-helpers.ts';

for(const route of ['canonical','alias'])test('154 HTTP '+route+': owner binding, same chat, typed stale/absent input and repeat',async t=>{
 const h=await fixture(t);h.runtime.roomSet({model:'w1'},OWNER);h.runtime.registry.get('room')!.record('me','Проектирование здания');const body=promotionInput(h.runtime),path=route==='alias'?'/api/assign':'/api/chats/'+body.chat+'/orchestrator';
 for(const field of ['project','revision','documents']){const incomplete:any={...body,role:'orchestrator'};delete incomplete[field];const r=await call(h.api,path,{body:incomplete});assert.equal(r.status,400);assert.equal(r.body.ok,false)}
 const stale=await call(h.api,path,{body:{...body,revision:body.revision-1,role:'orchestrator'}});assert.equal(stale.status,409);assert.equal(stale.body.code,'stale_chat');
 const done=await call(h.api,path,{body:{...body,role:'orchestrator'}});assert.equal(done.status,200,done.text);assert.equal(done.body.chat.id,body.chat);await h.runtime.idle();const repeat=await call(h.api,path,{body:{...body,role:'orchestrator'}});assert.equal(repeat.status,200,repeat.text);assert.equal(repeat.body.already,true);assert.equal(h.provider.calls.length,1);
});
