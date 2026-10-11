import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readdirSync} from 'node:fs';
import {fixture,call,OWNER} from './test-helpers.ts';
import {promotionInput} from '../../runtime/src/test-helpers.ts';

for(const route of ['canonical','alias'])test('154 HTTP '+route+': owner binding, same chat, typed stale/absent input and repeat',async t=>{
 const h=await fixture(t);h.runtime.roomSet({model:'w1'},OWNER);h.runtime.registry.get('room')!.record('me','Проектирование здания');const body=promotionInput(h.runtime),path=route==='alias'?'/api/assign':'/api/chats/'+body.chat+'/orchestrator';
 for(const field of ['project','revision','documents']){const incomplete:any={...body,role:'orchestrator'};delete incomplete[field];const r=await call(h.api,path,{body:incomplete});assert.equal(r.status,400);assert.equal(r.body.ok,false)}
 const stale=await call(h.api,path,{body:{...body,revision:body.revision-1,role:'orchestrator'}});assert.equal(stale.status,409);assert.equal(stale.body.code,'stale_chat');
 const done=await call(h.api,path,{body:{...body,role:'orchestrator'}});assert.equal(done.status,200,done.text);assert.equal(done.body.chat.id,body.chat);await h.runtime.idle();const repeat=await call(h.api,path,{body:{...body,role:'orchestrator'}});assert.equal(repeat.status,200,repeat.text);assert.equal(repeat.body.already,true);assert.equal(h.provider.calls.length,1);
});

for(const route of ['canonical','alias'])test('154/155 HTTP '+route+': fresh source metadata preserves the completed promotion input',async t=>{
 const h=await fixture(t),r=h.runtime,root=h.dir+'/projects';await r.settingsPatch('owner',{projectsRoot:root},OWNER);r.roomSet({model:'w1',folder:false},OWNER);r.registry.get('room')!.record('me','Обсуждаем документ');writeFileSync(h.dir+'/case.txt','original document');
 const original=promotionInput(r),refs=[{project:h.dir,path:'case.txt'}],path=route==='alias'?'/api/assign':'/api/chats/'+original.chat+'/orchestrator',extra=route==='alias'?{role:'orchestrator',chat:original.chat}:{};
 const promoted=await call(h.api,path,{body:{...original,...extra,documents:refs,createProject:true}});assert.equal(promoted.status,200,promoted.text);await r.idle();
 for(let n=0;n<2;n++){
  await r.projectSet(h.dir,{},OWNER);const snapshot=(await call(h.api,'/api/chats/'+original.chat)).body.chat;assert.equal(snapshot.promotion.pending,false);assert.deepEqual(snapshot.documents,refs);
  const repeated=await call(h.api,path,{body:{...extra,project:h.dir,revision:snapshot.revision,documents:snapshot.documents,createProject:true}});assert.equal(repeated.status,200,repeated.text);await r.idle();assert.equal(repeated.body.project,promoted.body.project);assert.equal(repeated.body.chat.id,original.chat);assert.equal(h.provider.calls.length,1);assert.equal(readdirSync(root).length,1);assert.equal(r.journal.read({limit:0}).filter(x=>x.thread?.startsWith('promotion:')).length,2);
 }
});
