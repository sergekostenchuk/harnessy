import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {Journal} from '@harnessy/journal';
import {fixture,call,OWNER} from './test-helpers.ts';
function seed(dir:string){const j=new Journal(dir),r=j.append({sender:'owner',to:['worker'],kind:'task',text:'старый ход'});writeFileSync(join(dir,'.harness','state','attempts.json'),JSON.stringify({worker:{turnInstanceId:'old-turn',recordSeqs:[r.seq],startedAt:1,deliverySeq:r.seq}}))}

test('72/73/74/97 HTTP: status, stateful entry refusals and explicit owner door use the same waiting/binding',async t=>{
 const h=await fixture(t,{before:seed}),expected={status:'uncertain',recordSeqs:[1],startedAt:1,turnInstanceId:'old-turn',actions:['retry','skip']};
 const status=await call(h.api,'/api/status');assert.deepEqual(status.body.panes.find((p:{id:string})=>p.id==='worker').waiting,expected);
 const queued=await call(h.api,'/api/chat',{body:{pane:'worker',message:'следующая работа'}});assert.equal(queued.status,200);assert.equal(queued.body.queued,true);assert.deepEqual(queued.body.waiting,expected);
 const settings=await call(h.api,'/api/panes/worker',{body:{model:'w2'}});assert.equal(settings.status,200);assert.deepEqual(settings.body.waiting,expected);
 const opened=await call(h.api,'/api/sessions/open',{body:{pane:'worker',id:'old'}});assert.equal(opened.status,409);assert.equal(opened.body.code,'uncertain');assert.deepEqual(opened.body.waiting,expected);assert.equal(h.provider.messageCalls,0);await h.runtime.idle();assert.equal(h.provider.calls.length,0);
 const target=join(h.dir,'other');mkdirSync(target);assert.equal((await call(h.api,'/api/project',{body:{path:target}})).status,200);assert.equal((await call(h.api,'/api/project',{body:{path:h.dir}})).status,200);assert.deepEqual((await call(h.api,'/api/status')).body.panes.find((p:{id:string})=>p.id==='worker').waiting,expected);
 const input={project:h.dir,turnInstanceId:'old-turn',action:'skip'},done=await call(h.api,'/api/panes/worker/attempt',{body:input});assert.equal(done.status,200);await h.runtime.idle();assert.equal(h.provider.calls.length,1);assert.doesNotMatch(h.provider.calls[0]!.message,/старый ход/);assert.match(h.provider.calls[0]!.message,/следующая работа/);
 assert.deepEqual((await call(h.api,'/api/panes/worker/attempt',{body:input})).body,done.body);const opposite=await call(h.api,'/api/panes/worker/attempt',{body:{...input,action:'retry'}});assert.equal(opposite.status,409);assert.equal(opposite.body.code,'decision_exists');assert.equal(h.runtime.waiting('worker'),null);
});

test('74 HTTP: malformed/foreign/stale door and Codex bridge cannot choose an owner decision',async t=>{
 const h=await fixture(t,{before:seed}),path='/api/panes/worker/attempt',input={project:h.dir,turnInstanceId:'old-turn',action:'skip'},bytes=readFileSync(h.runtime.project.state.attemptsPath,'utf8');
 for(const body of [{}, {...input,project:null},{...input,turnInstanceId:null},{...input,action:null},{...input,action:'anything'}]){const result=await call(h.api,path,{body});assert.equal(result.status,400);assert.equal(result.body.code,'attempt_invalid')}
 for(const [body,code] of [[{...input,project:'/foreign'},'project_changed'],[{...input,turnInstanceId:'other'},'stale_attempt']] as const){const result=await call(h.api,path,{body});assert.equal(result.status,409);assert.equal(result.body.code,code)}
 assert.equal((await call(h.api,'/api/peer/attempt',{body:{...input,pane:'worker'},headers:{'X-Pane-Token':'fake'}})).status,404);assert.equal((await call(h.api,path,{method:'GET'})).status,405);assert.equal(readFileSync(h.runtime.project.state.attemptsPath,'utf8'),bytes);assert.equal(h.provider.calls.length,0);
 await h.runtime.halt(true,OWNER);
});
