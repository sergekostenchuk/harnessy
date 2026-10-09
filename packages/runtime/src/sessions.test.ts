import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RuntimeError} from './index.ts';
import {harness,OWNER,until,deferred,FakeProvider} from './test-helpers.ts';

test('23/37: model vendor switch resets session but retains ribbon; busy changes are ignored; metadata belongs to runtime',async t=>{
 const codex=new FakeProvider('codex'),{runtime:r,provider:f}=await harness(t,{deps:{providers:{claude:new FakeProvider(),codex},models:{claude:[{id:'w1'},{id:'w2'}],codex:[{id:'c1'},{id:'c2'}]}}});const p=r.registry.get('worker')!;p.sessionId='old';p.record('ai','история');r.paneSet('worker',{model:'c2',cwd:'/definitely-absent'},OWNER);assert.equal(p.vendor,'codex');assert.equal(p.model,'c2');assert.equal(p.sessionId,null);assert.equal(p.transcript.length,1);assert.notEqual(p.cwd,'/definitely-absent');await r.idle();
 const gate=deferred<{text:string;sessionId:string}>();codex.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();return gate.promise};r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await until(()=>codex.calls.length===1);r.paneSet('worker',{model:'w1',mode:'all'},OWNER);assert.equal(p.model,'c2');assert.equal(p.mode,'read');gate.resolve({text:'готов',sessionId:'new'});await r.idle();assert.equal((await r.auth('codex')).loggedIn,true);assert.ok((await r.models('codex')).length);assert.ok((await r.listSessions('worker')).length);assert.ok((await r.sessionMessages('worker','old')).length);assert.equal(codex.authCalls,1);assert.equal(codex.modelCalls,1);assert.equal(codex.listCalls,1);assert.equal(codex.messageCalls,1)
});

for(const change of ['revision','vendor','cwd','seat','busy','project'])test('23/49: openSession await guard rejects '+change+' change',async t=>{
 const h=await harness(t),{runtime:r,provider:f}=h,gate=deferred<{role:'ai';text:string}[]>();f.onMessages=()=>gate.promise;const loading=r.openSession('worker','old',OWNER);const rejection=assert.rejects(loading,(e:unknown)=>e instanceof RuntimeError&&['stale_session','project_changed'].includes(e.code));await until(()=>f.messageCalls===1);
 if(change==='revision')r.paneSet('worker',{mode:'check'},OWNER);
 if(change==='vendor'){r.registry.get('worker')!.vendor='codex'}
 if(change==='cwd'){mkdirSync(join(h.dir,'sub'));r.registry.update(r.registry.get('worker')!,{cwd:join(h.dir,'sub')})}
 if(change==='seat'){r.registry.panes.delete('worker');r.registry.add({id:'worker',vendor:'claude',role:'executor',label:'другой',model:'w1',mode:'read',digest:false,writePaths:[],instructions:null,worktree:null})}
 const work=deferred<{text:string;sessionId:string}>();if(change==='busy'){f.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();return work.promise};r.postOwner({to:'worker',kind:'task',text:'начали ход'},OWNER);await until(()=>f.calls.length===1)}
 if(change==='project'){const dir=mkdtempSync(join(tmpdir(),'harnessy-session-switch-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));await r.openProject(dir)}
 gate.resolve([{role:'ai',text:'прежняя история'}]);await rejection;work.resolve({text:'новый ход',sessionId:'new'});await r.idle();assert.notEqual(r.registry.get('worker')?.sessionId,'old')
});

test('49: opening a session installs ts=0 transcript and clears seen',async t=>{
 const {runtime:r}=await harness(t),p=r.registry.get('worker')!;p.seen={peer:10};const result=await r.openSession('worker','old',OWNER);assert.equal(result.id,'old');assert.equal(p.sessionId,'old');assert.equal(p.touched,true);assert.deepEqual(p.seen,{});assert.deepEqual(p.transcript,[{role:'ai',text:'прежний ответ',ts:0}])
});

test('49: route restart blocks launch until reset; ctx gets new proxy; label/expect do not reset',async t=>{
 const {runtime:r,provider:f}=await harness(t),gate=deferred();f.onReset=()=>gate.promise;const route=r.setRoute('claude',{route:'proxy',proxy:'http://127.0.0.1:9999'},OWNER);await until(()=>f.resets===1);r.postOwner({to:'worker',kind:'task',text:'после смены маршрута'},OWNER);await until(()=>r.project.pumps.size===1);assert.equal(f.calls.length,0);gate.resolve();await route;await r.idle();assert.equal(f.calls.length,1);assert.equal(f.calls[0]!.ctx.env.HTTPS_PROXY,'http://127.0.0.1:9999');const result=await r.setRoute('claude',{route:'proxy',proxy:'http://127.0.0.1:9999',label:'новая подпись',expect:'127.0.0.1'},OWNER);assert.equal(result.processRestartNeeded,false);assert.equal(f.resets,1)
});
