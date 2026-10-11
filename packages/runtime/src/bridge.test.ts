import test from 'node:test';
import assert from 'node:assert/strict';
import {invokeTool} from '../../providers/src/tools.ts';
import type {TurnContext} from '@harnessy/providers';
import {harness,OWNER,until,deferred} from './test-helpers.ts';
import {failedActions} from './test-helpers.ts';
import {type TurnScope,type RuntimeActions} from './index.ts';

test('48/98: raw Python bridge results and Claude PeerTools text share one scope-checked implementation',async t=>{
 const {runtime:r,provider:f}=await harness(t),gate=deferred<{text:string;sessionId:string}>();let ctx!:TurnContext;f.onRun=async(_s,_m,c)=>{ctx=c;c.modelStarted?.();c.registerProcessToken('token');return gate.promise};r.postOwner({to:'worker',kind:'task',text:'поручение'},OWNER);await until(()=>f.calls.length===1);const scope=r.validateBridge('worker','token');
 const raw=await r.send(scope,{to:'owner',kind:'status',text:'сырой ответ'});assert.deepEqual(raw,{ok:true,seq:2,thread:null,to:['owner']});
 const viaSdk=await invokeTool('send',{to:'owner',kind:'status',text:'через SDK'},ctx);assert.deepEqual(viaSdk,{ok:true,text:'Запись #3 отправлена owner; тред без треда.'});
 assert.deepEqual(await r.ask(scope,{to:'peer',text:'вопрос'}),{ok:true,reply:'ответ',seq:1});assert.deepEqual(await ctx.tools.ask({to:'peer',text:'вопрос'}),{ok:true,text:'ответ'});
 assert.deepEqual(await r.merge(scope,{sha:'a'.repeat(40)}),{ok:true,sha:'a'.repeat(40),mergeSha:'b'.repeat(40),branch:'main'});assert.deepEqual(await ctx.tools.merge({sha:'a'.repeat(40)}),{ok:true,text:'Слито: aaaaaaaaaaaa → bbbbbbbbbbbb в main.'});
 assert.deepEqual(await r.assignRole(scope,{role:'tester'}),{ok:false,code:'proposal_required',error:'участников создаёт оркестратор по подтверждённому предложению'});assert.deepEqual(await ctx.tools.assignRole({role:'tester'}),{ok:false,code:'proposal_required',error:'участников создаёт оркестратор по подтверждённому предложению'});
 const read=await r.readPane(scope,{pane:'missing'});assert.equal(!read.ok&&read.code,'pane_unknown');gate.resolve({text:'готово',sessionId:'s1'});await r.idle();
 for(const result of [await r.send(scope,{to:'owner',kind:'status',text:'поздно'}),await r.ask(scope,{to:'peer',text:'поздно'}),await r.merge(scope,{sha:'x'}),await r.assignRole(scope,{role:'tester'}),await r.readPane(scope,{pane:'peer'})])assert.deepEqual(result,{ok:false,code:'turn_ended',error:'ход не активен'})
});

test('48: unavailable raw actions and SDK tools preserve typed refusal',async t=>{
 const h=await harness(t,{actions:failedActions}),{runtime:r,provider:f}=h,gate=deferred<{text:string;sessionId:string}>();let ctx!:TurnContext;f.onRun=async(_s,_m,c)=>{ctx=c;c.modelStarted?.();return gate.promise};r.postOwner({to:'worker',kind:'task',text:'поручение'},OWNER);await until(()=>f.calls.length===1);const scope=r.project.active.get('worker')!.scope;
 for(const [raw,tool,name] of [[r.ask(scope,{to:'peer',text:'вопрос'}),ctx.tools.ask({to:'peer',text:'вопрос'}),'ask'],[r.merge(scope,{sha:'x'}),ctx.tools.merge({sha:'x'}),'merge'],[r.assignRole(scope,{role:'tester'}),ctx.tools.assignRole({role:'tester'}),'assign_role']] as const){const expected=name==='assign_role'?{ok:false,code:'proposal_required',error:'участников создаёт оркестратор по подтверждённому предложению'}:{ok:false,code:'unavailable',error:'действие недоступно: '+name};assert.deepEqual(await raw,expected);assert.deepEqual(await tool,{...expected,error:(name==='ask'?'Ответа нет: ':name==='merge'?'Слияние отклонено: ':'')+expected.error})}
 gate.resolve({text:'готово',sessionId:'s1'});await r.idle()
});

test('48: empty ask result translates to exact Python tool fallback',async t=>{const actions:RuntimeActions={...failedActions,async ask(){return {ok:true,reply:'',seq:1}},async afterTurn(){return 'completed'}};const {runtime:r,provider:f}=await harness(t,{actions});let value:unknown;f.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();value=await ctx.tools.ask({to:'peer',text:'вопрос'});return {text:'готово',sessionId:null}};r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await r.idle();assert.deepEqual(value,{ok:true,text:'(пустой ответ)'})});

test('48: raw send accepts Python recipient list and refuses forged from before write',async t=>{const {runtime:r,provider:f}=await harness(t);f.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();const scope=r.project.active.get('worker')!.scope;const sent=await r.send(scope,{to:['owner'],kind:'status',text:'список'});assert.deepEqual(sent,{ok:true,seq:2,thread:null,to:['owner']});const forged=await r.send(scope,{to:'owner',kind:'status',text:'подделка',from:'owner'} as never);assert.equal(!forged.ok&&forged.code,'initiator_invalid');assert.equal(r.journal.lastSeq,2);return {text:'готово',sessionId:null}};r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await r.idle()});
