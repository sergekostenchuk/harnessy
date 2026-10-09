import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {join} from 'node:path';
import {createActions,createRuntime,Runtime,RuntimeError,diskIO,type StateIO,type AfterTurnContext} from './index.ts';
import {harness,OWNER,FakeProvider,collect} from './test-helpers.ts';
const seats='  worker: {role: assistant, vendor: claude, label: воркер, model: w1, mode: read}\n  peer: {role: assistant, vendor: claude, label: сосед, model: w1, mode: read}';
const policy='version: 1\nroutes: [{from: "*", to: "*", kinds: "*"}]\nobserve: {}\n';
const setup=(t:Parameters<typeof harness>[0],options:NonNullable<Parameters<typeof harness>[1]>={})=>harness(t,{seats,actions:createActions(),before:dir=>fs.writeFileSync(join(dir,'.harness','comms-policy.yaml'),policy),...options});
const effects=(r:Runtime,origin:string)=>r.journal.read({limit:0}).filter(r=>r.origin===origin);
function context(r:Runtime):AfterTurnContext{const pane=r.registry.get('worker')!,result=r.project.state.results(pane)[0]!;return {runtime:r,project:r.project,pane,turnInstanceId:result.runtime.turnInstanceId,records:result.runtime.recordSeqs.map(n=>r.journal.get(n)!),text:result.text,interrupted:result.runtime.interrupted}}

test('3/58/61: exact question→answer/task→status; explicit reply suppresses auto and owner receives only chat',async t=>{
 const h=await setup(t),r=h.runtime;h.provider.onRun=async(s,_m,c)=>{c.modelStarted?.();const records=r.project.active.get(s.id)!.records;if(s.id==='worker'&&records.some(r=>r.text==='явно')){const q=records.find(r=>r.text==='явно')!;assert.equal((await c.tools.send({to:'peer',kind:'answer',text:'сам',reply_to:q.seq})).ok,true)}return {text:'ответ',sessionId:null}};
 const q=r.channel.post({to:'worker',kind:'question',text:'авто',thread:'Q'},{seat:'peer',trust:'agent'});await r.idle();const task=r.channel.post({to:'worker',kind:'task',text:'задача',thread:'T'},{seat:'peer',trust:'agent'});await r.idle();
 const a=r.journal.repliesTo(q.seq).find(a=>a.origin==='auto')!,s=r.journal.repliesTo(task.seq).find(a=>a.origin==='auto')!;assert.deepEqual([a.from,a.to,a.kind,a.text,a.thread],['worker',['peer'],'answer','ответ','Q']);assert.equal(s.kind,'status');
 const explicit=r.channel.post({to:'worker',kind:'question',text:'явно'},{seat:'peer',trust:'agent'});await r.idle();assert.equal(r.journal.repliesTo(explicit.seq).filter(a=>a.from==='worker').length,1);assert.equal(r.journal.repliesTo(explicit.seq)[0]!.origin,undefined);
 r.postOwner({to:'worker',kind:'task',text:'владельцу'},OWNER);await r.idle();assert.equal(r.journal.read({limit:0}).filter(a=>a.from==='worker'&&a.to.includes('owner')).length,0);
});

for(const cut of ['before-auto','after-auto','effects-marker'])test('40/58/61: '+cut+' recovers without model, duplicate answer or duplicate ai',async t=>{
 let armed=true;
 const io:StateIO={read:diskIO.read,write(path,text){if(cut==='effects-marker'&&armed&&path.endsWith('chats.json')){const raw=JSON.parse(text);if(Object.values(raw.chats as Record<string,{transcript:{runtime?:{effectsPending:boolean}}[]}>).some(c=>c.transcript.some(m=>m.runtime?.effectsPending===false))){armed=false;throw Error('receipt marker failed')}}diskIO.write(path,text)}};
 const h=await setup(t,{deps:{stateIO:io,journalOptions:{fs:{appendFileSync(path,data,options){const auto=String(data).includes('"origin": "auto"');if(armed&&auto&&cut==='before-auto'){armed=false;throw Error('before auto')}fs.appendFileSync(path,data,options);if(armed&&auto&&cut==='after-auto'){armed=false;throw Error('after auto')}}}}}}),r=h.runtime;
 const q=r.channel.post({to:'worker',kind:'question',text:'вопрос'},{seat:'peer',trust:'agent'});await r.idle();assert.equal(r.registry.get('worker')!.status,'recovering');assert.equal(h.provider.calls.filter(c=>c.seat.id==='worker').length,1);
 await r.close();const f=new FakeProvider(),next=await createRuntime({...h.deps,providers:{claude:f}},createActions());t.after(()=>next.close());await next.idle();await next.kick('worker');assert.equal(f.calls.filter(c=>c.seat.id==='worker').length,0);assert.equal(next.journal.repliesTo(q.seq).filter(a=>a.origin==='auto').length,1);assert.equal(next.registry.get('worker')!.transcript.filter(m=>m.role==='ai').length,1);assert.equal(next.registry.get('worker')!.status,'idle');
});

test('61: permanent auto policy denial is visible, completes effects and never repeats the model',async t=>{
 const h=await setup(t,{before:dir=>fs.writeFileSync(join(dir,'.harness','comms-policy.yaml'),'version: 1\nroutes: [{from: assistant, to: assistant, kinds: [question]}]\nobserve: {}\n')}),r=h.runtime,{events}=collect(r);
 r.channel.post({to:'worker',kind:'question',text:'вопрос'},{seat:'peer',trust:'agent'});await r.idle();assert.equal(r.registry.get('worker')!.status,'idle');assert.equal(effects(r,'auto').length,0);assert.equal(r.journal.read({limit:0}).filter(a=>a.kind==='rejected').length,1);assert.ok(events.some(e=>e.type==='toolError'&&String(e.text).startsWith('автоответ не записан: ')));
 const calls=h.provider.calls.length;await r.kick('worker');assert.equal(h.provider.calls.length,calls);assert.equal(r.project.state.results(r.registry.get('worker')!)[0]!.runtime.effectsPending,false);
});

test('7/60/61: explicit note/status still awaits verdict; same turn replay and two restarts do not duplicate nudge/escalation',async t=>{
 let stopped=false;const actions=createActions(),real=actions.afterTurn;actions.afterTurn=async ctx=>{const done=await real(ctx);if(!stopped&&ctx.records.some(r=>r.kind==='review-request')){stopped=true;ctx.project.halted=true;ctx.project.state.saveHalt(true)}return done};
 const h=await setup(t,{actions}),r=h.runtime;h.provider.onRun=async(s,_m,c)=>{c.modelStarted?.();const request=r.project.active.get(s.id)!.records.find(r=>r.kind==='review-request');if(request){await c.tools.send({to:'peer',kind:'note',text:'посмотрел',reply_to:request.seq});await c.tools.send({to:'peer',kind:'status',text:'посмотрел ещё',reply_to:request.seq})}return {text:'без вердикта',sessionId:null}};
 const rr=r.channel.post({to:'worker',kind:'review-request',text:'ревью',thread:'R'},{seat:'peer',trust:'agent'});await r.idle();assert.equal(effects(r,'nudge').length,1);assert.equal(effects(r,'nudge')[0]!.reply_to,rr.seq);const first=context(r);await real(first);assert.equal(effects(r,'nudge').length,1);
 h.provider.onRun=null;await r.close();const second=await createRuntime(h.deps,createActions());t.after(()=>second.close());assert.equal(effects(second,'nudge').length,1);await second.close();const third=await createRuntime(h.deps,createActions());t.after(()=>third.close());await third.halt(false,OWNER);await third.idle();
 const es=effects(third,'nudge');assert.equal(es.length,2);assert.equal(es.filter(r=>r.kind==='note').length,1);assert.equal(es.filter(r=>r.kind==='escalation').length,1);assert.equal(es[1]!.reply_to,rr.seq);assert.equal(es[1]!.text,'воркер дважды не дало вердикт на review-request #'+rr.seq+'.');
});

for(const cut of ['append','stage'])test('60/61: nudge '+cut+' failure recovers the same first turn without escalation or duplicate record',async t=>{
 let armed=true;const io:StateIO={read:diskIO.read,write(path,text){if(cut==='stage'&&armed&&path.endsWith('actions.json')&&text.includes('"stage": "nudged"')){armed=false;throw Error('stage failed')}diskIO.write(path,text)}};
 const actions=createActions(),real=actions.afterTurn;actions.afterTurn=async ctx=>{try{return await real(ctx)}finally{ctx.project.halted=true;ctx.project.state.saveHalt(true)}};
 const h=await setup(t,{actions,deps:{stateIO:io,journalOptions:{fs:{appendFileSync(path,data,options){fs.appendFileSync(path,data,options);if(cut==='append'&&armed&&String(data).includes('"origin": "nudge"')){armed=false;throw Error('append before stage')}}}}}}),r=h.runtime;
 r.channel.post({to:'worker',kind:'review-request',text:'ревью',thread:'R'},{seat:'peer',trust:'agent'});await r.idle();assert.equal(r.registry.get('worker')!.status,'recovering');assert.equal(effects(r,'nudge').length,1);await r.close();const f=new FakeProvider(),next=await createRuntime({...h.deps,providers:{claude:f}},createActions());t.after(()=>next.close());assert.equal(f.calls.length,0);assert.equal(next.registry.get('worker')!.status,'idle');assert.equal(effects(next,'nudge').length,1);assert.equal(effects(next,'nudge').some(r=>r.kind==='escalation'),false);
});

test('61: pending verdict suppresses nudge, interrupted question keeps partial auto answer, interrupted review does not nudge itself',async t=>{
 const h=await setup(t),r=h.runtime;h.provider.onRun=async(s,_m,c)=>{c.modelStarted?.();return {text:'часть',sessionId:null,interrupted:s.id==='worker'}};
 const q=r.channel.post({to:'worker',kind:'question',text:'вопрос'},{seat:'peer',trust:'agent'});await r.idle();assert.equal(r.journal.repliesTo(q.seq).find(a=>a.origin==='auto')!.text,'часть');
 const rr=r.channel.post({to:'worker',kind:'review-request',text:'ревью',thread:'R'},{seat:'peer',trust:'agent'});await r.idle();assert.equal(r.journal.repliesTo(rr.seq).some(a=>a.origin==='nudge'),false);
 // A durable pending verdict is history for afterTurn even before owner-ack delivery.
 fs.writeFileSync(join(h.dir,'.harness','comms-policy.yaml'),'version: 2\nroutes: [{from: assistant, to: assistant, kinds: [verdict], trigger: owner-ack, bounds: {accept_score: 9}}, {from: "*", to: "*", kinds: "*"}]\nobserve: {}\n');
 fs.mkdirSync(join(h.dir,'.harness','evidence','R','r1'),{recursive:true});fs.writeFileSync(join(h.dir,'.harness','evidence','R','r1','report.md'),'# Ran\nok\n# Skipped\n—\n# Planned\n—\n# Manual\n—\n');
 const v=r.channel.post({to:'peer',kind:'verdict',text:'9',thread:'R',reply_to:rr.seq,score:9,round:1,evidence:['.harness/evidence/R/r1/report.md']},{seat:'worker',trust:'agent'});assert.equal(v.ack,'pending');const ctx=context(r);await r.actions.afterTurn({...ctx,records:[rr],interrupted:false,turnInstanceId:'later'});assert.equal(effects(r,'nudge').length,0);assert.equal(JSON.parse(fs.readFileSync(join(h.dir,'.harness','state','actions.json'),'utf8')).reviews[0].stage,'closed');
});

for(const raw of ['{broken','{}','{"reviews":[{"sid":"worker","reviewSeq":1}],"merges":[]}','{"reviews":[],"merges":[{"stage":"completed"}]}'])test('60: malformed actions refuses opening without clearing state or calling model: '+raw,async t=>{
 const h=await setup(t);await h.runtime.close();const path=join(h.dir,'.harness','state','actions.json');fs.writeFileSync(path,raw);const f=new FakeProvider(),r=new Runtime({...h.deps,providers:{claude:f}},createActions());t.after(()=>r.close());await assert.rejects(r.openProject(h.dir),(e:unknown)=>e instanceof RuntimeError&&e.code==='actions_invalid');assert.equal(fs.readFileSync(path,'utf8'),raw);assert.equal(f.calls.length,0);
});


test('R2/2: durable auto policy rejection survives failed effects marker and restart without duplicate or model',async t=>{
 let armed=true;const io:StateIO={read:diskIO.read,write(path,text){if(armed&&path.endsWith('chats.json')){const raw=JSON.parse(text);if(Object.values(raw.chats as Record<string,{transcript:{runtime?:{effectsPending:boolean}}[]}>).some(c=>c.transcript.some(m=>m.runtime?.effectsPending===false))){armed=false;throw Error('effects marker failed')}}diskIO.write(path,text)}};
 const h=await setup(t,{deps:{stateIO:io},before:dir=>fs.writeFileSync(join(dir,'.harness','comms-policy.yaml'),'version: 1\nroutes: [{from: assistant, to: assistant, kinds: [question]}]\nobserve: {}\n')}),r=h.runtime;
 const q=r.channel.post({to:'worker',kind:'question',text:'вопрос',thread:'Q'},{seat:'peer',trust:'agent'});await r.idle();assert.equal(r.registry.get('worker')!.status,'recovering');assert.equal(h.provider.calls.length,1);
 const rejected=r.journal.read({limit:0}).filter(a=>a.kind==='rejected');assert.equal(rejected.length,1);assert.equal(rejected[0]!.reply_to,q.seq);assert.equal(rejected[0]!.origin,'auto:worker');assert.equal(rejected[0]!.thread,'Q');
 await r.close();const f=new FakeProvider(),next=await createRuntime({...h.deps,providers:{claude:f}},createActions());t.after(()=>next.close());await next.idle();await next.kick('worker');assert.equal(f.calls.length,0);assert.equal(next.registry.get('worker')!.status,'idle');
 assert.deepEqual(next.journal.read({limit:0}).filter(a=>a.kind==='rejected').map(a=>a.seq),[rejected[0]!.seq]);assert.equal(next.project.state.results(next.registry.get('worker')!)[0]!.runtime.effectsPending,false);
});

test('R2/2: rejection belongs to both source record and replying seat, never suppresses its neighbour',async t=>{
 const h=await setup(t,{seats:seats+'\n  third: {role: assistant, vendor: claude, label: третий, model: w1, mode: read}',before:dir=>fs.writeFileSync(join(dir,'.harness','comms-policy.yaml'),'version: 1\nroutes: [{from: assistant, to: assistant, kinds: [question]}]\nobserve: {}\n')}),r=h.runtime;
 const a=r.channel.post({to:['worker','peer'],kind:'question',text:'оба отвечают'},{seat:'third',trust:'agent'});await r.idle();
 const b=r.channel.post({to:'worker',kind:'question',text:'другой вопрос'},{seat:'third',trust:'agent'});await r.idle();
 assert.deepEqual(r.journal.read({limit:0}).filter(a=>a.kind==='rejected').map(r=>[r.reply_to,r.origin]),[[a.seq,'auto:worker'],[a.seq,'auto:peer'],[b.seq,'auto:worker']]);
});
