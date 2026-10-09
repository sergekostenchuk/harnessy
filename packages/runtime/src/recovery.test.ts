import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {Journal} from '@harnessy/journal';
import {createRuntime,diskIO,type StateIO,type RuntimeActions} from './index.ts';
import {harness,OWNER,completedActions,FakeProvider,collect} from './test-helpers.ts';

for(const cut of ['result-before-write','result-after-write','advance','after-turn','panes','effects-marker'])test('40/46: recovery at '+cut+' never repeats model, ai or durable effect',async t=>{
 let armed=true,effects=0,afterCalls=0;
 const io:StateIO={read:diskIO.read,write(path,text){
 const data=path.endsWith('chats.json')?JSON.parse(text):null,ai=data?Object.values(data.chats as Record<string,{transcript:{runtime?:{effectsPending:boolean}}[]}>).flatMap(c=>c.transcript).find(m=>m.runtime):null;
 if(armed&&ai&&cut==='result-before-write'){armed=false;throw Error('cut result')}
 if(armed&&ai&&cut==='result-after-write'){armed=false;diskIO.write(path,text);throw Error('cut after durable result')}
 if(armed&&ai?.runtime?.effectsPending===false&&cut==='effects-marker'){armed=false;throw Error('cut effects marker')}
 diskIO.write(path,text)
 }};
 const actions:RuntimeActions={...completedActions,async afterTurn(ctx){afterCalls++;if(armed&&cut==='after-turn'){armed=false;throw Error('cut after advance')}
 const existing=ctx.project.journal.read({limit:0}).find(v=>v.origin==='test-effect'&&v.thread===ctx.turnInstanceId);if(!existing){ctx.project.channel.postCore({to:['owner'],kind:'note',text:'эффект',origin:'test-effect',thread:ctx.turnInstanceId},{seat:'harness',trust:'harness'});effects++}return 'completed'}};
 const h=await harness(t,{actions,deps:{stateIO:io,journalOptions:{fs:{renameSync(from,to){if(armed&&((cut==='advance'&&String(to).endsWith('cursors.json'))||(cut==='panes'&&String(to).endsWith('panes.json')))){armed=false;throw Error('cut '+cut)}renameSync(from,to)}}}}}),{runtime:r,provider:f}=h;
 r.registry.get('worker')!.carry='сохранённый контекст';r.registry.get('worker')!.seen={peer:3};
 const {events}=collect(r);const rec=r.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await r.idle();assert.equal(f.calls.length,1);assert.equal(r.registry.get('worker')!.status,'recovering');assert.equal(events.filter(e=>e.type==='error'&&e.pane==='worker').length,1);assert.equal(events.filter(e=>e.type==='done'&&e.pane==='worker').length,0);
 if(cut==='result-before-write'){assert.equal(r.journal.cursors.worker??0,0);await r.kick('worker');assert.equal(f.calls.length,1)}
 await r.close();const next=new FakeProvider(),resumed=await createRuntime({...h.deps,providers:{claude:next}},actions);t.after(()=>resumed.close());await resumed.idle();await resumed.kick('worker');assert.equal(next.calls.length,0);assert.equal(resumed.journal.cursors.worker,rec.seq);assert.equal(resumed.registry.get('worker')!.transcript.filter(m=>m.role==='ai').length,1);assert.equal(effects,1);assert.equal(resumed.project.state.results(resumed.registry.get('worker')!)[0]!.runtime.effectsPending,false);assert.equal(resumed.project.state.attempts.worker,undefined);assert.equal(resumed.registry.get('worker')!.carry,'');assert.deepEqual(resumed.registry.get('worker')!.seen,{peer:3});assert.ok(afterCalls>=1)
});

test('46: empty response is durable and prevents automatic repeat after crash',async t=>{
 let fail=true;const h=await harness(t,{deps:{journalOptions:{fs:{renameSync(from,to){if(fail&&String(to).endsWith('cursors.json')){fail=false;throw Error('crash')}renameSync(from,to)}}}}});h.provider.onRun=async(_s,_m,ctx)=>{ctx.modelStarted?.();return {text:'',sessionId:null}};
 h.runtime.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await h.runtime.idle();const raw=JSON.parse(readFileSync(join(h.dir,'.harness','state','chats.json'),'utf8'));assert.equal(Object.values(raw.chats as Record<string,{transcript:{role:string;text:string}[]}>)[0]!.transcript.at(-1)!.text,'');await h.runtime.close();const next=new FakeProvider(),r=await createRuntime({...h.deps,providers:{claude:next}},completedActions);t.after(()=>r.close());await r.idle();assert.equal(next.calls.length,0);assert.equal(r.journal.pendingFor('worker').length,0)
});

test('46: uncertain attempt survives two restarts and other-agent incoming; only owner action releases it',async t=>{
 const h=await harness(t,{before:dir=>{const journal=new Journal(dir);const r=journal.append({sender:'owner',to:['worker'],kind:'task',text:'могло выполниться'});writeFileSync(join(dir,'.harness','state','attempts.json'),JSON.stringify({worker:{turnInstanceId:'unknown-turn',recordSeqs:[r.seq],startedAt:1}}))}});assert.equal(h.provider.calls.length,0);assert.equal(h.runtime.registry.get('worker')!.status,'uncertain');const sub=h.runtime.subscribe({pane:'worker'});assert.equal((await sub.events[Symbol.asyncIterator]().next()).value.text,'ход мог быть выполнен до перезапуска; записи #1–#1 остались в очереди и уйдут с вашим следующим сообщением');sub.close();
 h.runtime.journal.append({sender:'peer',to:['worker'],kind:'question',text:'от другого агента'});await h.runtime.kick('worker');assert.equal(h.provider.calls.length,0);await h.runtime.close();const f2=new FakeProvider(),second=await createRuntime({...h.deps,providers:{claude:f2}},completedActions);t.after(()=>second.close());await second.idle();assert.equal(f2.calls.length,0);assert.equal(second.project.state.attempts.worker!.status,'uncertain');await second.close();
 const f3=new FakeProvider(),third=await createRuntime({...h.deps,providers:{claude:f3}},completedActions);t.after(()=>third.close());await third.kick('worker');assert.equal(f3.calls.length,0);third.paneSet('worker',{model:'w2'},OWNER);await third.idle();assert.equal(f3.calls.length,1);assert.equal(third.journal.pendingFor('worker').length,0);assert.equal(third.project.state.attempts.worker,undefined)
});

for(const ownerAction of ['message','unhalt'])test('46: uncertain cleared by owner '+ownerAction+' immediately before kick',async t=>{
 const h=await harness(t,{before:dir=>{const j=new Journal(dir),r=j.append({sender:'owner',to:['worker'],kind:'task',text:'могло выполниться'});writeFileSync(join(dir,'.harness','state','attempts.json'),JSON.stringify({worker:{turnInstanceId:'unknown',recordSeqs:[r.seq],startedAt:0}}))}});assert.equal(h.provider.calls.length,0);
 if(ownerAction==='message')h.runtime.postOwner({to:'worker',kind:'task',text:'повтори'},OWNER);else await h.runtime.halt(false,OWNER);await h.runtime.idle();assert.equal(h.provider.calls.length,1);assert.equal(h.runtime.project.state.attempts.worker,undefined)
});

for(const missing of ['missing-seq','missing-runtime','wrong-delivery','foreign-record','missing-nextSeen','missing-recordSeqs','missing-id','missing-interrupted','missing-effectsPending','missing-delivery'])test('46: inconsistent result '+missing+' blocks model and cursor recovery',async t=>{
 const h=await harness(t);h.runtime.postOwner({to:'worker',kind:'task',text:'работа'},OWNER);await h.runtime.idle();const p=h.runtime.registry.get('worker')!,result=h.runtime.project.state.results(p)[0]!;
 result.runtime.effectsPending=true;const fields:Record<string,string>={'missing-nextSeen':'nextSeen','missing-recordSeqs':'recordSeqs','missing-id':'turnInstanceId','missing-interrupted':'interrupted','missing-effectsPending':'effectsPending'};if(fields[missing])delete (result.runtime as unknown as Record<string,unknown>)[fields[missing]!];if(missing==='missing-delivery')delete (result as unknown as Record<string,unknown>).deliverySeq;if(missing==='missing-seq')result.runtime.recordSeqs=[999];if(missing==='wrong-delivery')result.deliverySeq=100;if(missing==='missing-runtime')delete (result as unknown as Record<string,unknown>).runtime;if(missing==='foreign-record'){const foreign=h.runtime.journal.append({sender:'owner',to:['owner'],kind:'note',text:'чужая'});result.runtime.recordSeqs=[foreign.seq];result.deliverySeq=foreign.seq}
 h.runtime.project.state.saveChats(h.runtime.registry);await h.runtime.close();const next=new FakeProvider(),r=await createRuntime({...h.deps,providers:{claude:next}},completedActions);t.after(()=>r.close());await r.kick('worker');assert.equal(next.calls.length,0);assert.equal(r.registry.get('worker')!.status,'recovering');assert.equal(r.journal.cursors.worker,1)
});
