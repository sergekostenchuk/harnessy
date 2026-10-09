import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {GitOps,execute} from '@harnessy/projects';
import {createActions,createRuntime,Runtime,RuntimeError,diskIO,type StateIO,type RuntimeDeps,type MergeResult} from './index.ts';
import {harness,OWNER,FakeProvider,deferred,until} from './test-helpers.ts';
const seats='  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read}\n  reviewer: {role: reviewer, vendor: claude, label: ревьюер, model: w1, mode: read}\n  orchestrator: {role: orchestrator, vendor: claude, label: оркестратор, model: w1, mode: read}';
function git(dir:string,...args:string[]){return execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim()}
async function setup(t:Parameters<typeof harness>[0],deps:Partial<RuntimeDeps>={},ack=false){
 let base='',sha='',merges=0;const g=new GitOps(async(args,cwd,timeout=60)=>{if(args[0]==='merge'&&args[1]==='--no-ff')merges++;const r=await execute('git',args,cwd,timeout*1000);return {...r,stdout:r.stdout.trim(),stderr:r.stderr.trim()}});
 const h=await harness(t,{seats,actions:createActions(),deps:{gitops:g,...deps},before:dir=>{
 fs.writeFileSync(join(dir,'.harness','comms-policy.yaml'),'version: 1\nroutes:\n  - {from: reviewer, to: executor, kinds: [verdict], '+(ack?'trigger: owner-ack, ':'')+'bounds: {accept_score: 9}}\n  - {from: "*", to: "*", kinds: "*"}\nobserve: {}\n');
 git(dir,'init','-q','-b','main');git(dir,'config','user.email','test@example.invalid');git(dir,'config','user.name','Test');git(dir,'config','commit.gpgsign','false');fs.writeFileSync(join(dir,'base.txt'),'base');git(dir,'add','base.txt','.harness/team.yaml','.harness/comms-policy.yaml');git(dir,'commit','-qm','base');base=git(dir,'rev-parse','HEAD');
 git(dir,'checkout','-qb','feature');fs.writeFileSync(join(dir,'feature.txt'),'feature');git(dir,'add','feature.txt');git(dir,'commit','-qm','feature');sha=git(dir,'rev-parse','HEAD');git(dir,'checkout','-q','main');
 }});await h.runtime.halt(true,OWNER);
 return {...h,base,sha,merges:()=>merges};
}
function verdict(r:Runtime,sha:string,thread='T',score=9,round=1){
 const rr=r.channel.post({to:'reviewer',kind:'review-request',text:'ревью',thread,sha},{seat:'worker',trust:'agent'}),dir=join(r.project.dir,'.harness','evidence',thread,'r'+round);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(join(dir,'report.md'),'# Ran\nok\n# Skipped\n—\n# Planned\n—\n# Manual\n—\n');
 return r.channel.post({to:'worker',kind:'verdict',text:String(score),thread,reply_to:rr.seq,score,round,evidence:['.harness/evidence/'+thread+'/r'+round+'/report.md']},{seat:'reviewer',trust:'agent'});
}
const statuses=(r:Runtime)=>r.journal.read({limit:0}).filter(a=>a.origin==='merge');

test('24/35/60/63: owner merge requires confirmed acceptance, uses accepted metadata, preserves exact status and repeated SHA',async t=>{
 const h=await setup(t),r=h.runtime;assert.deepEqual(await r.mergeOwner({sha:h.sha},OWNER),{ok:false,code:'not_accepted',error:'у коммита '+h.sha.slice(0,12)+' нет принятого вердикта; сливать можно только принятое'});assert.equal((await r.mergeOwner({sha:'deadbeef'},OWNER)).ok,false);
 const good=verdict(r,h.sha);verdict(r,h.sha,'T',7,2);assert.equal(r.channel.threads.get('T')!.lastScore,7);const result=await r.mergeOwner({sha:h.sha.slice(0,10)},OWNER);assert.ok(result.ok);if(!result.ok)return;
 assert.equal(h.merges(),1);assert.equal(git(h.dir,'log','-1','--format=%s'),'merge T: '+h.sha.slice(0,12)+' (вердикт #'+good.seq+', балл 9)');assert.deepEqual(git(h.dir,'rev-list','--parents','-n','1','HEAD').split(' '),[result.mergeSha,h.base,h.sha]);
 assert.deepEqual(result,{ok:true,sha:h.sha,mergeSha:result.mergeSha,branch:'main',thread:'T'});assert.equal(statuses(r).length,1);assert.equal(statuses(r)[0]!.text,'Тред T: коммит '+h.sha.slice(0,12)+' слит в main как '+result.mergeSha.slice(0,12)+' (владелец).');assert.equal(r.channel.threads.get('T')!.merged,result.mergeSha);
 assert.deepEqual(await r.mergeOwner({sha:h.sha,message:'повтор'},OWNER),result);assert.equal(h.merges(),1);assert.equal(statuses(r).length,1);await assert.rejects(r.mergeOwner({sha:h.sha},{seat:'worker',trust:'agent'}),(e:unknown)=>e instanceof RuntimeError&&e.code==='policy_denied');
});

test('35/63: pending accepted verdict gives no merge authority; latest confirmation wins among threads',async t=>{
 const h=await setup(t,{},true),r=h.runtime,a=verdict(r,h.sha,'A',9);await until(()=>r.registry.get('reviewer')!.approvals.has('ack:'+a.seq));const denied=await r.mergeOwner({sha:h.sha},OWNER);assert.equal(!denied.ok&&denied.code,'not_accepted');assert.equal(h.merges(),0);
 const b=verdict(r,h.sha,'B',10);await until(()=>r.registry.get('reviewer')!.approvals.has('ack:'+b.seq));r.approve('reviewer','ack:'+b.seq,'allow',OWNER);r.approve('reviewer','ack:'+a.seq,'allow',OWNER);
 const result=await r.mergeOwner({sha:h.sha},OWNER);assert.ok(result.ok);assert.equal(result.ok&&result.thread,'A');assert.equal(git(h.dir,'log','-1','--format=%s'),'merge A: '+h.sha.slice(0,12)+' (вердикт #'+a.seq+', балл 9)');
});

test('24/63: no repo, role denial, unknown SHA and tracked dirt return typed failures before Git mutation',async t=>{
 const plain=await harness(t,{actions:createActions()});const none=await plain.runtime.mergeOwner({sha:'a'.repeat(40)},OWNER);assert.equal(!none.ok&&none.code,'no_repo');
 const h=await setup(t),r=h.runtime;verdict(r,h.sha);fs.writeFileSync(join(h.dir,'base.txt'),'dirty');const dirty=await r.mergeOwner({sha:h.sha},OWNER);assert.equal(!dirty.ok&&dirty.code,'merge_failed');assert.equal(h.merges(),0);assert.equal(statuses(r).length,0);fs.writeFileSync(join(h.dir,'base.txt'),'base');await r.halt(false,OWNER);await r.idle();let refusal:MergeResult|undefined;
 h.provider.onRun=async(s,_m,c)=>{c.modelStarted?.();if(s.id==='worker')refusal=await r.merge(r.project.active.get('worker')!.scope,{sha:h.sha});return {text:'done',sessionId:null}};r.postOwner({to:'worker',kind:'task',text:'попытка'},OWNER);await r.idle();assert.deepEqual(refusal,{ok:false,code:'policy_denied',error:'слияние разрешено ролям orchestrator, owner, а не executor'});assert.equal(h.merges(),0);
});

test('60/64: intent write failure forbids merge; retry sees unchanged HEAD and creates exactly one commit',async t=>{
 let armed=true;const io:StateIO={read:diskIO.read,write(path,text){if(armed&&path.endsWith('actions.json')&&text.includes('"stage": "intent"')){armed=false;throw Error('intent not saved')}diskIO.write(path,text)}};
 const h=await setup(t,{stateIO:io});verdict(h.runtime,h.sha);const result=await h.runtime.mergeOwner({sha:h.sha},OWNER);assert.equal(!result.ok&&result.code,'write_failed');assert.equal(h.merges(),0);assert.equal(git(h.dir,'rev-parse','HEAD'),h.base);assert.equal((await h.runtime.mergeOwner({sha:h.sha},OWNER)).ok,true);assert.equal(h.merges(),1);
});

test('60/64/152: crash after commit before result restores proven parents; two restarts never merge again',async t=>{
 let armed=true;const io:StateIO={read:diskIO.read,write(path,text){if(armed&&path.endsWith('actions.json')&&text.includes('"stage": "completed"')){armed=false;throw Error('result not saved')}diskIO.write(path,text)}};
 const h=await setup(t,{stateIO:io}),r=h.runtime;verdict(r,h.sha);const result=await r.mergeOwner({sha:h.sha},OWNER);assert.equal(!result.ok&&result.code,'write_failed');const actual=git(h.dir,'rev-parse','HEAD');assert.notEqual(actual,h.base);assert.equal(h.merges(),1);assert.equal(JSON.parse(fs.readFileSync(join(h.dir,'.harness','state','actions.json'),'utf8')).merges[0].stage,'intent');await r.close();
 const second=await createRuntime(h.deps,createActions());t.after(()=>second.close());assert.equal(statuses(second).length,1);assert.equal(statuses(second)[0]!.merged,actual);assert.equal((await second.mergeOwner({sha:h.sha},OWNER)).ok,true);await second.close();const third=await createRuntime(h.deps,createActions());t.after(()=>third.close());assert.equal(statuses(third).length,1);assert.equal(h.merges(),1);assert.equal(git(h.dir,'rev-parse','HEAD'),actual);
});

test('60/64/152: saved result but failed status across two opens appends only missing status',async t=>{
 let failures=2;const h=await setup(t,{journalOptions:{fs:{appendFileSync(path,data,options){if(failures&&String(data).includes('"origin": "merge"')){failures--;throw Error('status not saved')}fs.appendFileSync(path,data,options)}}}});verdict(h.runtime,h.sha);const result=await h.runtime.mergeOwner({sha:h.sha},OWNER);assert.equal(!result.ok&&result.code,'write_failed');assert.equal(h.merges(),1);await h.runtime.close();
 const failed=new Runtime(h.deps,createActions());await assert.rejects(failed.openProject(h.dir),(e:unknown)=>!!e&&typeof e==='object'&&'code' in e&&e.code==='write_failed');await failed.close();
 const next=await createRuntime(h.deps,createActions());t.after(()=>next.close());assert.equal(statuses(next).length,1);await next.close();const third=await createRuntime(h.deps,createActions());t.after(()=>third.close());assert.equal(statuses(third).length,1);assert.equal(h.merges(),1);
});

test('60/64: maybe-written merge status survives restart without another deliverySeq',async t=>{
 let armed=true;const h=await setup(t,{journalOptions:{fs:{appendFileSync(path,data,options){fs.appendFileSync(path,data,options);if(armed&&String(data).includes('"origin": "merge"')){armed=false;throw Error('fsync after status')}}}}});verdict(h.runtime,h.sha);await h.runtime.mergeOwner({sha:h.sha},OWNER);const status=statuses(h.runtime)[0]!;h.runtime.journal.advance('orchestrator',status.seq);await h.runtime.close();const next=await createRuntime(h.deps,createActions());t.after(()=>next.close());assert.equal(statuses(next).length,1);assert.equal(statuses(next)[0]!.seq,status.seq);assert.equal(next.journal.pendingFor('orchestrator').length,0);assert.equal(h.merges(),1);
});

test('60/64: intent without provable merge becomes durable uncertain, remains visible and never retries Git',async t=>{
 let armed=true;const io:StateIO={read:diskIO.read,write(path,text){diskIO.write(path,text);if(armed&&path.endsWith('actions.json')&&text.includes('"stage": "intent"')){armed=false;throw Error('crash after intent')}}};
 const h=await setup(t,{stateIO:io});verdict(h.runtime,h.sha);await h.runtime.mergeOwner({sha:h.sha},OWNER);assert.equal(h.merges(),0);await h.runtime.close();const next=await createRuntime(h.deps,createActions());t.after(()=>next.close());const refusal=await next.mergeOwner({sha:h.sha},OWNER);assert.equal(!refusal.ok&&refusal.code,'merge_uncertain');assert.equal(h.merges(),0);const sub=next.subscribe({owner:true}),event=await sub.events[Symbol.asyncIterator]().next();assert.equal(event.value.code,'merge_uncertain');sub.close();assert.equal(JSON.parse(fs.readFileSync(join(h.dir,'.harness','state','actions.json'),'utf8')).merges[0].stage,'uncertain');
});

test('33/64: stop during Git reads invalidates agent scope before merge/intent, actual agent success uses common algorithm',async t=>{
 let hold=false,count=0;const paused=deferred(),release=deferred();const g=new GitOps(async(args,cwd,timeout=60)=>{if(hold&&args[0]==='status'){hold=false;paused.resolve();await release.promise}if(args[0]==='merge'&&args[1]==='--no-ff')count++;const r=await execute('git',args,cwd,timeout*1000);return {...r,stdout:r.stdout.trim(),stderr:r.stderr.trim()}});
 const h=await setup(t,{gitops:g}),r=h.runtime;verdict(r,h.sha);await r.halt(false,OWNER);await r.idle();let result:MergeResult|undefined;
 h.provider.onRun=async(s,_m,c)=>{c.modelStarted?.();if(s.id==='orchestrator'&&r.project.active.get(s.id)!.records.some(r=>r.from==='owner'))result=await r.merge(r.project.active.get(s.id)!.scope,{sha:h.sha});return {text:'done',sessionId:null}};
 hold=true;r.postOwner({to:'orchestrator',kind:'task',text:'слить'},OWNER);await paused.promise;r.interrupt('orchestrator',OWNER);release.resolve();await r.idle();assert.deepEqual(result,{ok:false,code:'turn_ended',error:'ход не активен'});assert.equal(count,0);assert.equal(git(h.dir,'rev-parse','HEAD'),h.base);
 r.postOwner({to:'orchestrator',kind:'task',text:'слить снова'},OWNER);await r.idle();assert.equal(result?.ok,true);assert.equal(count,1);assert.equal(statuses(r)[0]!.text.endsWith('(оркестратор).'),true);
});

test('64: after Git starts, project switch persists result/status only to original project',async t=>{
 let hold=false,count=0;const committed=deferred(),release=deferred();const g=new GitOps(async(args,cwd,timeout=60)=>{const r=await execute('git',args,cwd,timeout*1000);if(args[0]==='merge'&&args[1]==='--no-ff'){count++;if(hold){hold=false;committed.resolve();await release.promise}}return {...r,stdout:r.stdout.trim(),stderr:r.stderr.trim()}});
 const h=await setup(t,{gitops:g}),r=h.runtime;verdict(r,h.sha);const p=r.project;hold=true;const merge=r.mergeOwner({sha:h.sha},OWNER);await committed.promise;
 const dir=fs.mkdtempSync(join(tmpdir(),'harnessy-merge-switch-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));await r.openProject(dir);release.resolve();assert.equal((await merge).ok,true);assert.equal(statuses(r).length,0);assert.equal(p.journal.read({limit:0}).filter(r=>r.origin==='merge').length,1);await r.openProject(h.dir);assert.equal(statuses(r).length,1);assert.equal(count,1);
});

for(const missing of ['initiator','beforeHead','verdict','result'])test('60: missing '+missing+' in a completed merge refuses restoration, no new merge',async t=>{
 const h=await setup(t);verdict(h.runtime,h.sha);assert.equal((await h.runtime.mergeOwner({sha:h.sha},OWNER)).ok,true);await h.runtime.close();const path=join(h.dir,'.harness','state','actions.json'),raw=JSON.parse(fs.readFileSync(path,'utf8'));delete raw.merges[0][missing];fs.writeFileSync(path,JSON.stringify(raw));const r=new Runtime(h.deps,createActions());t.after(()=>r.close());await assert.rejects(r.openProject(h.dir),(e:unknown)=>e instanceof RuntimeError&&e.code==='actions_invalid');assert.equal(h.merges(),1);
});

test('60: forged plausible result is checked against Git parents and cannot become successful merge',async t=>{
 const h=await setup(t);verdict(h.runtime,h.sha);await h.runtime.mergeOwner({sha:h.sha},OWNER);await h.runtime.close();const path=join(h.dir,'.harness','state','actions.json'),raw=JSON.parse(fs.readFileSync(path,'utf8'));raw.merges[0].result.mergeSha=h.base;fs.writeFileSync(path,JSON.stringify(raw));const next=await createRuntime(h.deps,createActions());t.after(()=>next.close());const result=await next.mergeOwner({sha:h.sha},OWNER);assert.equal(!result.ok&&result.code,'merge_uncertain');assert.equal(h.merges(),1);
});


test('59/60/64: pending ack restoration never mistakes an in-flight aborted merge for uncertain',async t=>{
 let pausedOnce=false;const paused=deferred(),release=deferred();const g=new GitOps(async(args,cwd,timeout=60)=>{const result=await execute('git',args,cwd,timeout*1000);if(args[0]==='merge'&&args[1]==='--no-ff'&&!pausedOnce){pausedOnce=true;paused.resolve();await release.promise}return {...result,stdout:result.stdout.trim(),stderr:result.stderr.trim()}});
 const h=await setup(t,{gitops:g},true),r=h.runtime;git(h.dir,'checkout','-qb','conflict',h.base);fs.writeFileSync(join(h.dir,'base.txt'),'left');git(h.dir,'commit','-qam','left');const sha=git(h.dir,'rev-parse','HEAD');git(h.dir,'checkout','-q','main');fs.writeFileSync(join(h.dir,'base.txt'),'right');git(h.dir,'commit','-qam','right');
 const good=verdict(r,sha);await until(()=>r.registry.get('reviewer')!.approvals.has('ack:'+good.seq));r.approve('reviewer','ack:'+good.seq,'allow',OWNER);
 const merge=r.mergeOwner({sha},OWNER);await paused.promise;const other=verdict(r,sha,'other');const restoring=r.actions.restorePendingAcks({runtime:r,project:r.project});await until(()=>r.registry.get('reviewer')!.approvals.has('ack:'+other.seq));release.resolve();await restoring;const result=await merge;assert.equal(!result.ok&&result.code,'merge_failed');assert.equal(JSON.parse(fs.readFileSync(join(h.dir,'.harness','state','actions.json'),'utf8')).merges[0].stage,'failed');assert.equal(r.lineErrors.some(s=>s.includes('слияние могло быть выполнено')),false);assert.equal(fs.existsSync(join(h.dir,'.git/MERGE_HEAD')),false);
});

test('64: owner project change during pre-merge waits refuses mutation; null mergeSha is never success',async t=>{
 let hold=true;const paused=deferred(),release=deferred();const g=new GitOps(async(args,cwd,timeout=60)=>{if(hold&&args[0]==='status'){hold=false;paused.resolve();await release.promise}const result=await execute('git',args,cwd,timeout*1000);return {...result,stdout:result.stdout.trim(),stderr:result.stderr.trim()}});
 const h=await setup(t,{gitops:g}),r=h.runtime;verdict(r,h.sha);const work=r.mergeOwner({sha:h.sha},OWNER);await paused.promise;const dir=fs.mkdtempSync(join(tmpdir(),'harnessy-before-merge-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));await r.openProject(dir);release.resolve();const result=await work;assert.equal(!result.ok&&result.code,'project_changed');assert.equal(git(h.dir,'rev-parse','HEAD'),h.base);assert.equal(fs.existsSync(join(h.dir,'.harness','state','actions.json')),false);
 class MissingResult extends GitOps {override async mergeInto(_root:string,sha:string){return {ok:true as const,sha,mergeSha:null}}}
 const bad=await setup(t,{gitops:new MissingResult()});verdict(bad.runtime,bad.sha);const missing=await bad.runtime.mergeOwner({sha:bad.sha},OWNER);assert.equal(!missing.ok&&missing.code,'merge_failed');assert.equal(statuses(bad.runtime).length,0);
});
