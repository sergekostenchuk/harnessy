import test from 'node:test';
import assert from 'node:assert/strict';
import {CliProvider} from './provider.ts';
import {ProviderError} from '../types.ts';
import {cliFixture} from './test-support.ts';
import type {CliExecutor} from './types.ts';

for(const behavior of ['slow-then-ok','both-slow','lost-then-ok','logged-out','login-changed','cancel'] as const)test('TS-26: turn login '+behavior,async t=>{
 const f=await cliFixture(t,'probe');let reads=0,runs=0,aborts=0;const limits:number[]=[];
 const execute:CliExecutor=async(req,signal,hooks)=>{
  if(req.args.includes('auth')){reads++;limits.push(req.timeoutMs);
   if(behavior==='login-changed')throw new ProviderError('login_changed','Вход изменился');
   if(behavior==='lost-then-ok'&&reads===1)throw new ProviderError('transport_lost','нет связи');
   if(behavior==='both-slow'||behavior==='slow-then-ok'&&reads===1||behavior==='cancel')return new Promise((_ok,reject)=>{signal.addEventListener('abort',()=>{aborts++;reject(new ProviderError('cancelled','отменено'))},{once:true});if(behavior==='cancel')f.controller.abort()});
   return {stdout:JSON.stringify({loggedIn:behavior!=='logged-out'}),stderr:'',code:0,signal:null};
  }
  if(req.args.includes('models'))return {stdout:JSON.stringify([{id:f.seat.model,label:'Fixture'}]),stderr:'',code:0,signal:null};
  runs++;hooks?.started?.();hooks?.stdout?.(JSON.stringify({type:'done',text:'готово'})+'\n');return {stdout:'',stderr:'',code:0,signal:null};
 };
 const p=new CliProvider({...f.description,name:'Devin'},{execute,env:f.env,cwd:f.dir,temporaryDirectory:f.dir,probeTimeoutMs:1,loginTimeoutMs:20});t.after(()=>p.close());
 if(['slow-then-ok','lost-then-ok'].includes(behavior)){assert.equal((await p.runTurn(f.seat,'тест',f.ctx)).text,'готово');assert.equal(reads,2);assert.equal(runs,1)}
 else{await assert.rejects(p.runTurn(f.seat,'тест',f.ctx),behavior==='both-slow'?{code:'login_timeout',message:'Devin не ответил на проверку входа'}:{code:behavior==='cancel'?'cancelled':behavior==='login-changed'?'login_changed':'not_logged_in'});assert.equal(runs,0);assert.equal(reads,behavior==='both-slow'?2:1)}
 assert.ok(limits.every(n=>n===20));if(behavior.includes('slow'))assert.equal(aborts,behavior==='both-slow'?2:1);assert.equal(f.starts,runs);
});
