import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {compatJson,Journal} from '@harnessy/journal';
import {harness,OWNER,FakeProvider} from './test-helpers.ts';
const fixture=(name:string)=>readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8');

test('10/23/45: Pane.settings/persist and panes/halt/chats bytes match Python AST golden',async t=>{
 const h=await harness(t,{deps:{id:()=> 'beef'},seats:'  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read, write_paths: [src], digest: false}'}),{runtime:r,dir}=h,p=r.registry.get('worker')!;
 p.sessionId='s1';p.touched=true;p.record('me','Первая реплика\nпродолжение');p.record('ai','Ответ 🧠');r.project.state.savePanes(r.registry,r.journal);r.project.state.saveHalt(true);
 const expected=JSON.parse(fixture('settings.json'));expected.cwd=dir;expected.kind='worker';assert.equal(compatJson(p.settings()),compatJson(expected));
 assert.equal(readFileSync(join(dir,'.harness','state','panes.json'),'utf8'),fixture('panes.json'));assert.equal(readFileSync(join(dir,'.harness','state','halt.json'),'utf8'),fixture('halt.json'));assert.equal(readFileSync(join(dir,'.harness','state','chats.json'),'utf8'),fixture('chats.json'))
});

test('10: Python panes/session/digest and halted queue restore; unhalt is the first launch',async t=>{
 const h=await harness(t,{before:dir=>{const j=new Journal(dir);j.append({sender:'owner',to:['worker'],kind:'task',text:'жду после перезапуска'});j.savePanes({worker:{model:'w2',mode:'check',sessionId:'old',digest:true,vendor:'claude'}});writeFileSync(join(dir,'.harness','state','halt.json'),fixture('halt.json'))}}),{runtime:r,provider:f}=h,p=r.registry.get('worker')!;
 assert.equal(f.calls.length,0);assert.equal(r.halted,true);assert.equal(p.sessionId,'old');assert.equal(p.model,'w2');assert.equal(p.mode,'check');assert.equal(p.digest,true);assert.equal(p.touched,true);await r.halt(false,OWNER);await r.idle();assert.equal(f.calls.length,1);assert.equal(f.calls[0]!.seat.sessionId,'old');assert.equal(r.journal.pendingFor('worker').length,0)
});

test('10/49: old Python chats round-trip including fractional and integral float timestamp forms',async t=>{
 const source=fixture('chats-floats.json');const h=await harness(t,{before:dir=>writeFileSync(join(dir,'.harness','state','chats.json'),source)});h.runtime.project.state.saveChats(h.runtime.registry);assert.equal(readFileSync(join(h.dir,'.harness','state','chats.json'),'utf8'),source)
});

test('10/26: real git worktree restores cwd/branch and supplies writableRoots; legacy merged status uses actual git',async t=>{
 let mergeSha='';const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'};
 const h=await harness(t,{seats:'  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read, worktree: .work/worker}',before:dir=>{
 const git=(args:string[])=>execFileSync('git',['-C',dir,...args],{encoding:'utf8',env,stdio:['ignore','pipe','pipe']}).trim();git(['init','-q','-b','main']);git(['config','user.name','Test']);git(['config','user.email','test@example.invalid']);git(['config','commit.gpgsign','false']);writeFileSync(join(dir,'base.txt'),'base');git(['add','base.txt']);git(['commit','-qm','base']);git(['checkout','-qb','feature']);writeFileSync(join(dir,'feature.txt'),'feature');git(['add','feature.txt']);git(['commit','-qm','feature']);const sha=git(['rev-parse','HEAD']);git(['checkout','-q','main']);git(['merge','--no-ff','--no-edit','-qm','merge',sha]);mergeSha=git(['rev-parse','HEAD']);const j=new Journal(dir);j.append({sender:'reviewer',to:['owner'],kind:'verdict',text:'принято',thread:'Tlegacy',sha,score:9,round:1,accepted:true});j.append({sender:'harness',to:['owner'],kind:'status',text:'слито',thread:'Tlegacy',sha,origin:'merge'})
 }}),{runtime:r,provider:f,dir}=h,p=r.registry.get('worker')!;assert.equal(p.cwd,join(dir,'.work','worker'));assert.equal(p.worktree,p.cwd);assert.equal(p.branch,'seat/worker');assert.equal(r.channel.threads.get('Tlegacy')!.merged,mergeSha);r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await r.idle();assert.deepEqual(f.calls[0]!.ctx.writableRoots,[join(dir,'.git'),join(dir,'.harness','evidence')]);assert.match(f.calls[0]!.ctx.roleNote,/worktree на ветке seat\/worker/)
});

test('21: runtime context uses last completed usage, and unknown model has null window',async t=>{
 const {runtime:r}=await harness(t);assert.equal(r.context('worker').measured,false);r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await r.idle();const card=r.context('worker');assert.equal(card.measured,true);assert.equal(card.window,null)
});
