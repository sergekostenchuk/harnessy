import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {completedActions} from '../../runtime/src/test-helpers.ts';
import {fixture,call,deferred,until,OWNER} from './test-helpers.ts';
const seats='  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read}\n  peer: {role: reviewer, vendor: claude, label: ревьюер, model: w1, mode: read}';
const setup=(t:Parameters<typeof fixture>[0],actions=completedActions)=>fixture(t,{seats,actions,before:dir=>writeFileSync(join(dir,'.harness/comms-policy.yaml'),'version: 1\nroutes: [{from: executor, to: [owner, reviewer], kinds: [status, note, question, answer]}]\nobserve: {executor: "*"}\n')});

test('2/9/19/67/69: every bridge path requires bound token, accepts raw forms and ignores body owner spoofing',async t=>{
 let owner:string|undefined;
 const h=await setup(t,{...completedActions,async mergeOwner(_a,c){owner=c.initiator.seat;return {ok:true,sha:'a'.repeat(40),mergeSha:'b'.repeat(40),branch:'main'}}});
 for(const path of ['send','ask','merge','assign_role'])for(const headers of [{},{'X-Pane-Token':'foreign'}]){const r=await call(h.api,'/api/'+path,{body:{from:'worker',to:'owner',kind:'status',text:'x',sha:'a'.repeat(40),role:'tester'},headers});assert.equal(r.status,403);assert.deepEqual(r.body,{ok:false,code:'token_invalid',error:'недействительный токен'})}
 assert.equal((await call(h.api,'/api/pane_transcript?from=worker&pane=peer')).status,403);
 const gate=deferred<{text:string;sessionId:null}>();h.provider.onRun=async(_s,_m,c)=>{c.modelStarted?.();c.registerProcessToken('worker-token');c.setHandle({async interrupt(){gate.resolve({text:'часть',sessionId:null})},async steer(){}});return gate.promise};
 const run=h.runtime.runTurn('worker','работа');await until(()=>h.provider.calls.length===1);
 const headers={'X-Pane-Token':'worker-token'};
 assert.equal((await call(h.api,'/api/send',{body:{from:'peer',to:'owner',kind:'status',text:'подделка'},headers})).body.code,'token_invalid');
 assert.equal((await call(h.api,'/api/merge',{body:{from:'owner',sha:'a'.repeat(40)},headers})).status,403);
 const sent=await call(h.api,'/api/send',{body:{from:'worker',to:['owner'],kind:'status',text:'сырой текст'},headers});assert.equal(sent.status,200);assert.deepEqual(sent.body,{ok:true,seq:1,thread:null,to:['owner']});
 const ask=await call(h.api,'/api/ask',{body:{from:'worker',to:'peer',text:'вопрос'},headers});assert.deepEqual(ask.body,{ok:true,reply:'ответ',seq:1});
 const merge=await call(h.api,'/api/merge',{body:{from:'worker',sha:'a'.repeat(40)},headers});assert.deepEqual(merge.body,{ok:true,sha:'a'.repeat(40),mergeSha:'b'.repeat(40),branch:'main'});
 const role=await call(h.api,'/api/assign_role',{body:{from:'worker',role:'tester'},headers});assert.deepEqual(role.body,{ok:true,pane:'tester',label:'тестер',model:'w1',mode:'read',mandate:1});
 h.runtime.registry.get('peer')!.record('me','первое');h.runtime.registry.get('peer')!.record('ai','последнее');
 const transcript=await call(h.api,'/api/pane_transcript?from=worker&pane=peer&last=0',{headers});assert.equal(transcript.status,200);assert.deepEqual(Object.keys(transcript.body).sort(),['ok','text']);assert.match(transcript.body.text,/последние 1 реплик/);assert.match(transcript.body.text,/последнее/);assert.doesNotMatch(transcript.body.text,/первое/);
 assert.equal((await call(h.api,'/api/send',{body:{from:'worker',to:'worker',kind:'status',text:'x'},headers})).status,400);
 await call(h.api,'/api/interrupt',{body:{pane:'worker'}});await run;
 for(const path of ['send','ask','merge','assign_role']){const r=await call(h.api,'/api/'+path,{body:{from:'worker',to:'peer',kind:'note',text:'x'},headers});assert.equal(r.status,403);assert.deepEqual(r.body,{ok:false,code:'turn_ended',error:'ход не активен'})}
 const merged=await call(h.api,'/api/owner/merge',{body:{from:'worker',sha:'a'.repeat(40)}});assert.equal(merged.status,200);assert.equal(owner,'owner')
});

test('9: interrupt between token validation and action effect returns turn_ended and produces no effect',async t=>{
 const entered=deferred(),release=deferred();let effects=0;const h=await setup(t,{...completedActions,async ask(_a,c){entered.resolve();await release.promise;c.assertActive();effects++;return {ok:true,reply:'ответ',seq:1}}});
 const turnEnd=deferred<{text:string;sessionId:null}>();h.provider.onRun=async(_s,_m,c)=>{c.modelStarted?.();c.registerProcessToken('worker-token');c.setHandle({async interrupt(){turnEnd.resolve({text:'часть',sessionId:null})},async steer(){}});return turnEnd.promise};
 const run=h.runtime.runTurn('worker','работа');await until(()=>h.provider.calls.length===1);const asked=call(h.api,'/api/ask',{body:{from:'worker',to:'peer',text:'вопрос'},headers:{'X-Pane-Token':'worker-token'}});await entered.promise;
 await call(h.api,'/api/interrupt',{body:{pane:'worker'}});await run;release.resolve();const result=await asked;assert.equal(result.status,403);assert.equal(result.body.code,'turn_ended');assert.equal(effects,0)
});

test('19/68: bridge failures retain route 400/403/409, uncertain/write failures retain agreed codes',async t=>{
 const h=await setup(t,{...completedActions,async ask(){return {ok:false,code:'depth',error:'глубина'}},async assignRole(){return {ok:false,code:'not_allowed',error:'отказ'}},async merge(){return {ok:false,code:'merge_uncertain',error:'исход неизвестен'}}});
 const finish=deferred<{text:string;sessionId:null}>();h.provider.onRun=async(_s,_m,c)=>{c.registerProcessToken('worker-token');c.signal.addEventListener('abort',()=>finish.resolve({text:'',sessionId:null}),{once:true});return finish.promise};const run=h.runtime.runTurn('worker','работа');await until(()=>h.provider.calls.length===1);const headers={'X-Pane-Token':'worker-token'};
 const ask=await call(h.api,'/api/ask',{body:{from:'worker',to:'peer',text:'x'},headers});assert.equal(ask.status,409);assert.deepEqual(ask.body,{ok:false,code:'depth',error:'глубина'});
 assert.equal((await call(h.api,'/api/assign_role',{body:{from:'worker',role:'tester'},headers})).status,403);
 const merge=await call(h.api,'/api/merge',{body:{from:'worker',sha:'a'},headers});assert.equal(merge.status,409);assert.equal(merge.body.code,'merge_uncertain');finish.resolve({text:'готово',sessionId:null});await run
});
