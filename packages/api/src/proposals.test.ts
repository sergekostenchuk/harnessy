import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {withPathLock} from '@harnessy/team';
import {createRuntime,diskIO,type StateIO} from '@harnessy/runtime';
import {completedActions} from '../../runtime/src/test-helpers.ts';
import {fixture,call,deferred,until,OWNER,FakeProvider} from './test-helpers.ts';
const seats='  lead: {kind: orchestrator, role: юрист, label: Ведущий, vendor: claude, model: w1, mode: read}\n  worker: {kind: worker, role: orchestrator, label: orchestrator, vendor: claude, model: w1, mode: read}';
const member=(label='Юрист')=>({kind:'worker',label,vendor:'claude',model:'w1',mode:'read',intro:'Ты — юрист по договорам. Подготовь анализ условий.'});
async function setup(t:Parameters<typeof fixture>[0],options:Parameters<typeof fixture>[1]={}){
 const h=await fixture(t,{...options,seats}),end=deferred<{text:string;sessionId:null}>();h.provider.onRun=async(seat,_text,ctx)=>{ctx.modelStarted?.();if(seat.id==='lead'||seat.id==='worker'){ctx.registerProcessToken(seat.id+'-token');return end.promise}ctx.publish({type:'done',sessionId:null,model:seat.model,durationMs:1,usage:{input:1,output:1,cacheRead:0}});return {text:'готов: '+seat.label,sessionId:null}};
 const run=h.runtime.runTurn('lead','Предложи команду').catch(e=>{if(e.code!=='cancelled')throw e});await until(()=>h.provider.calls.some(c=>c.seat.id==='lead'));t.after(async()=>{end.resolve({text:'done',sessionId:null});await run});
 const post=(path:string,body:unknown,from='lead')=>call(h.api,path,{body:{...(body as object),from},headers:{'X-Pane-Token':from+'-token'}});
 const propose=async(body:unknown={seats:[member()]})=>{const r=await post('/api/seats/propose',body);assert.equal(r.status,200,JSON.stringify(r.body));return r.body};
 return {...h,end,run,post,propose};
}

test('85/104/156: real bridge proposes, owner freezes version, participants created exactly once; labels grant no rights',async t=>{
 const h=await setup(t),proposal=await h.propose({seats:[member(),{...member('Критик'),kind:'reviewer'}]}),ref={proposalId:proposal.proposalId,version:proposal.version};
 assert.equal(proposal.version,1);assert.equal(h.runtime.registry.ids.length,2);assert.equal(h.runtime.journal.read({limit:0}).filter(r=>r.origin==='team-proposal').length,1);
 const list=(await call(h.api,'/api/seats/proposals')).body;assert.equal(list.project,h.dir);assert.deepEqual(list.proposals[0].seats.map((s:any)=>s.intro),[member().intro,member().intro]);
 assert.equal((await h.post('/api/seats',ref)).body.code,'proposal_unconfirmed');h.runtime.chat({pane:'lead',message:'да'},OWNER);assert.equal((await h.post('/api/seats',ref)).body.code,'proposal_unconfirmed');
 assert.equal((await h.post('/api/seats/confirm',{...ref,project:h.dir})).body.code,'policy_denied');assert.equal((await call(h.api,'/api/seats/confirm',{body:{...ref,project:'/foreign'}})).body.code,'proposal_project_changed');
 assert.equal((await call(h.api,'/api/seats/confirm',{body:{...ref,project:h.dir}})).body.already,false);assert.equal((await call(h.api,'/api/seats/confirm',{body:{...ref,project:h.dir}})).body.already,true);
 const made=await h.post('/api/seats',ref);assert.equal(made.status,200,JSON.stringify(made.body));assert.equal(made.body.seats.length,2);await until(()=>h.provider.calls.filter(c=>!['lead','worker'].includes(c.seat.id)).length===2);
 const saved=JSON.stringify(h.runtime.project.state.chats.chats),again=await h.post('/api/seats',ref);assert.equal(again.status,200);assert.deepEqual(again.body.seats,made.body.seats);assert.equal(JSON.stringify(h.runtime.project.state.chats.chats),saved);
 for(const s of proposal.proposal.seats){assert.match(s.sid,/^[a-z][a-z0-9_-]{0,30}$/);assert.equal(h.runtime.project.state.chats.active[s.sid],s.operationId);assert.equal(readFileSync(join(h.dir,'.harness/roles/seats',s.sid+'.md'),'utf8'),s.intro)}
 assert.equal((await h.post('/api/seats/propose',{...ref,seats:[member('новый')]})).body.code,'proposal_stale');
 const worker=h.runtime.runTurn('worker','подделай права');await until(()=>h.provider.calls.some(c=>c.seat.id==='worker'));assert.equal((await h.post('/api/seats/propose',{seats:[member()]},'worker')).body.code,'policy_denied');assert.equal((await h.post('/api/seats',ref,'worker')).body.code,'policy_denied');h.end.resolve({text:'done',sessionId:null});await worker;
});

test('156: old/foreign version, missing input, unknown models and masquerades fail before persistence',async t=>{
 const h=await setup(t);for(const bad of [{},{seats:[]},{seats:Array(13).fill(member())},{seats:[{...member(),kind:'owner'}]},{seats:[{...member(),model:undefined}]},{seats:[{...member(),mode:undefined}]},{seats:[{...member(),vendor:'codex'}]},{seats:[{...member(),label:'a'.repeat(61)}]},{seats:[{...member(),intro:'я'.repeat(4097)}]},{seats:[{...member(),sid:'owner'}]}])assert.equal((await h.post('/api/seats/propose',bad)).body.code,'proposal_invalid');
 assert.deepEqual((await call(h.api,'/api/seats/proposals')).body.proposals,[]);
 const first=await h.propose(),second=await h.propose({proposalId:first.proposalId,version:1,seats:[member('Новая версия')]});assert.equal(second.version,2);
 assert.equal((await call(h.api,'/api/seats/confirm',{body:{proposalId:first.proposalId,version:1,project:h.dir}})).body.code,'proposal_stale');assert.equal((await h.post('/api/seats',{proposalId:'p'+'a'.repeat(24),version:1})).body.code,'proposal_not_found');
 assert.equal((await call(h.api,'/api/seats',{body:{proposalId:first.proposalId,version:2,from:'lead'}})).body.code,'token_invalid');assert.equal((await call(h.api,'/api/seats',{body:{}})).body.code,'proposal_required');
 h.end.resolve({text:'done',sessionId:null});await h.run;assert.equal((await h.post('/api/seats/propose',{seats:[member()]})).body.code,'turn_ended');
});

for(const stage of ['proposal','question','confirmation','seat'])test('156: interruption after durable '+stage+' resumes without duplicate question, seats or replies',async t=>{
 let armed=false;const io:StateIO={...diskIO,write(path,text){diskIO.write(path,text);if(armed&&((stage==='proposal'||stage==='confirmation')&&path.endsWith('team-proposals.json')&&(stage==='proposal'||JSON.parse(text).proposals.some((q:any)=>q.confirmed))||stage==='seat'&&path.endsWith('seat-materialization.json')&&JSON.parse(text).some((a:any)=>a.stages.chat))){armed=false;throw Error('saved then lost')}}};
 const h=await setup(t,{deps:{stateIO:io}}),append=h.runtime.journal.append.bind(h.runtime.journal);let cut=stage==='question';h.runtime.journal.append=input=>{const r=append(input);if(cut&&input.origin==='team-proposal'){cut=false;throw Error('question saved')}return r};
 if(stage==='proposal')armed=true;const res=await h.post('/api/seats/propose',{seats:[member()]});if(['proposal','question'].includes(stage))assert.equal(res.body.ok,false);else assert.equal(res.body.ok,true);
 const q=(await call(h.api,'/api/seats/proposals')).body.proposals[0],ref={proposalId:q.proposalId,version:q.version};assert.equal(h.runtime.journal.read({limit:0}).filter(r=>r.origin==='team-proposal').length,1);
 if(stage==='confirmation')armed=true;const confirmation=await call(h.api,'/api/seats/confirm',{body:{...ref,project:h.dir}});assert.equal(confirmation.body.ok,stage!=='confirmation');assert.equal((await call(h.api,'/api/seats/confirm',{body:{...ref,project:h.dir}})).body.ok,true);
 if(stage==='seat')armed=true;const first=await h.post('/api/seats',ref);assert.equal(first.body.ok,stage!=='seat');const second=await h.post('/api/seats',ref);assert.equal(second.body.ok,true,JSON.stringify(second.body));await until(()=>h.provider.calls.some(c=>c.seat.id===q.seats[0].sid));
 h.end.resolve({text:'done',sessionId:null});await h.run;await h.runtime.idle();await h.runtime.close();const provider=new FakeProvider(),next=await createRuntime({...h.deps,providers:{claude:provider,codex:h.codex}},completedActions);t.after(()=>next.close());await next.idle();assert.equal(provider.calls.length,0);assert.equal(next.project.state.chats.active[q.seats[0].sid],q.seats[0].operationId);assert.equal(next.journal.read({limit:0}).filter(r=>r.origin==='team-proposal').length,1);assert.equal(next.journal.read({limit:0}).filter(r=>r.origin==='team-proposal-confirm').length,1);
});

test('104/156 ОКНА: revoked turn while awaiting project lock cannot create; caller mutation cannot replace frozen seats',async t=>{
 const h=await setup(t),p=h.runtime.project,gate=deferred(),entered=deferred(),lock=withPathLock(h.dir,async()=>{entered.resolve();await gate.promise});await entered.promise;
 const args={seats:[member()]},scope=p.active.get('lead')!.scope,pending=h.runtime.proposeSeats(scope,args);args.seats[0]!.label='mutation';h.runtime.scopes.revoke(scope);gate.resolve();await lock;assert.equal((await pending).ok,false);assert.deepEqual((await call(h.api,'/api/seats/proposals')).body.proposals,[]);
});

test('156 absence: corrupt store and copied foreign project store are rejected, never reset',async t=>{
 const h=await setup(t),path=join(h.dir,'.harness/state/team-proposals.json');for(const bytes of ['{broken',JSON.stringify({project:'/foreign',proposals:[]}),JSON.stringify({project:h.dir,proposals:[{proposalId:'p'+'a'.repeat(24)}]})]){writeFileSync(path,bytes);assert.equal((await call(h.api,'/api/seats/proposals')).body.code,'proposal_invalid');assert.equal((await h.post('/api/seats/propose',{seats:[member()]})).body.code,'proposal_invalid');assert.equal(readFileSync(path,'utf8'),bytes)}
});

test('104/156 ОКНА: create rechecks turn after lock wait and never trusts caller seats',async t=>{
 const h=await setup(t),q=await h.propose(),ref={proposalId:q.proposalId,version:1};await call(h.api,'/api/seats/confirm',{body:{...ref,project:h.dir}});
 const entered=deferred(),gate=deferred(),held=withPathLock(h.dir,async()=>{entered.resolve();await gate.promise});await entered.promise;const scope=h.runtime.project.active.get('lead')!.scope,creating=h.runtime.createSeats(scope,{...ref,...{seats:[{...member(),mode:'all',label:'forged'}]}});h.runtime.scopes.revoke(scope);gate.resolve();await held;const result=await creating;assert.equal(result.ok,false);assert.equal(h.runtime.registry.ids.length,2);
});

test('156 ОКНА: proposal input is frozen before await; confirm cannot cross project change',async t=>{
 const h=await setup(t),entered=deferred(),gate=deferred(),held=withPathLock(h.dir,async()=>{entered.resolve();await gate.promise});await entered.promise;const input={seats:[member()]},proposing=h.runtime.proposeSeats(h.runtime.project.active.get('lead')!.scope,input);input.seats[0]!.label='mutated';gate.resolve();await held;const q=await proposing;assert.ok(q.ok);assert.equal(q.proposal.seats[0]!.label,'Юрист');
 h.end.resolve({text:'done',sessionId:null});await h.run;await h.runtime.idle();const next=join(h.dir,'next');mkdirSync(next);const entered2=deferred(),gate2=deferred(),held2=withPathLock(h.dir,async()=>{entered2.resolve();await gate2.promise});await entered2.promise;
 const pending=h.runtime.confirmTeam({proposalId:q.proposalId,version:1,project:h.dir},OWNER);const failed=assert.rejects(pending,(e:any)=>e.code==='project_changed'||e.code==='proposal_project_changed');await h.runtime.projectSet(next,{},OWNER);gate2.resolve();await held2;await failed;
 const saved=JSON.parse(readFileSync(join(h.dir,'.harness/state/team-proposals.json'),'utf8'));assert.equal(saved.proposals[0].confirmed,false);
});

for(const cut of ['question','confirmation'])test('156 restart: durable '+cut+' intent recovers its journal receipt on open',async t=>{
 let armed=false;const io:StateIO={...diskIO,write(path,text){diskIO.write(path,text);if(armed&&path.endsWith('team-proposals.json')){armed=false;throw Error('crash before receipt')}}};
 const h=await setup(t,{deps:{stateIO:io}});if(cut==='question')armed=true;
 const proposed=await h.post('/api/seats/propose',{seats:[member()]});if(cut==='confirmation'){assert.equal(proposed.body.ok,true);armed=true;const confirmed=await call(h.api,'/api/seats/confirm',{body:{proposalId:proposed.body.proposalId,version:1,project:h.dir}});assert.equal(confirmed.body.ok,false)}else assert.equal(proposed.body.ok,false);
 const stored=JSON.parse(readFileSync(join(h.dir,'.harness/state/team-proposals.json'),'utf8')).proposals[0];assert.equal(h.runtime.journal.read({limit:0}).filter(r=>r.origin==='team-proposal-confirm').length,0);
 h.end.resolve({text:'done',sessionId:null});await h.run;await h.runtime.close();const provider=new FakeProvider(),next=await createRuntime({...h.deps,providers:{claude:provider,codex:h.codex}},completedActions);t.after(()=>next.close());await next.idle();
 const list=await next.teamProposals(OWNER);assert.equal(list.proposals.length,1);assert.equal(list.proposals[0]!.proposalId,stored.proposalId);assert.equal(list.proposals[0]!.confirmed,cut==='confirmation');assert.equal(next.journal.read({limit:0}).filter(r=>r.origin==='team-proposal').length,1);assert.equal(next.journal.read({limit:0}).filter(r=>r.origin==='team-proposal-confirm').length,cut==='confirmation'?1:0);assert.equal(next.registry.ids.length,2);
});

test('156: retry of a partly created team preserves the first participant answer and newer active chat',async t=>{
 let armed=false;const io:StateIO={...diskIO,write(path,text){diskIO.write(path,text);if(armed&&path.endsWith('seat-materialization.json')){const ops=JSON.parse(text);if(ops.length===2&&ops[1].stages.chat){armed=false;throw Error('second seat interrupted')}}}};
 const h=await setup(t,{deps:{stateIO:io}}),q=await h.propose({seats:[member('Первый юрист'),member('Второй юрист')]}),ref={proposalId:q.proposalId,version:1},[first,second]=q.proposal.seats;
 await call(h.api,'/api/seats/confirm',{body:{...ref,project:h.dir}});armed=true;assert.equal((await h.post('/api/seats',ref)).body.ok,false);
 await until(()=>h.runtime.registry.get(first.sid)?.transcript.some(m=>m.role==='ai')===true&&!h.runtime.registry.get(first.sid)?.busy);const old=structuredClone(h.runtime.project.state.chats.chats[first.operationId]!.transcript);
 const fresh=await call(h.api,'/api/chats/new',{body:{pane:first.sid,carry:'none'}});assert.equal(fresh.body.ok,true,JSON.stringify(fresh.body));assert.notEqual(fresh.body.chat.id,first.operationId);
 const retried=await h.post('/api/seats',{...ref,seats:[{...member('Подмена'),mode:'all'}]});assert.equal(retried.body.ok,true,JSON.stringify(retried.body));assert.equal(h.runtime.project.state.chats.active[first.sid],fresh.body.chat.id);assert.deepEqual(h.runtime.project.state.chats.chats[first.operationId]!.transcript,old);
 await until(()=>h.provider.calls.some(c=>c.seat.id===second.sid));assert.equal(h.provider.calls.filter(c=>c.seat.id===first.sid).length,1);assert.equal(h.runtime.registry.get(second.sid)!.label,'Второй юрист');assert.equal(h.runtime.registry.get(second.sid)!.mode,'read');
});

for(const update of [false,true])for(const cut of ['intent','question','receipt'])test('156 round 2: exact propose retry after durable '+cut+(update?' while updating':'')+' resumes one proposal/version',async t=>{
 let armed=false,writes=0;const io:StateIO={...diskIO,write(path,text){diskIO.write(path,text);if(armed&&path.endsWith('team-proposals.json')&&++writes===(cut==='receipt'?2:1)&&cut!=='question'){armed=false;throw Error('persisted before failure')}}};
 const h=await setup(t,{deps:{stateIO:io}}),first=update?await h.propose():null,body={...(first?{proposalId:first.proposalId,version:first.version}:{}),seats:[member(update?'Новая версия':'Юрист')]};
 const append=h.runtime.journal.append.bind(h.runtime.journal);h.runtime.journal.append=input=>{const out=append(input);if(armed&&cut==='question'&&input.origin==='team-proposal'){armed=false;throw Error('question persisted before failure')}return out};
 armed=true;const failed=await h.post('/api/seats/propose',body);assert.equal(failed.body.ok,false);
 const persisted=JSON.parse(readFileSync(join(h.dir,'.harness/state/team-proposals.json'),'utf8')).proposals[0];
 const retry=await h.propose(body);assert.equal(retry.proposalId,persisted.proposalId);assert.equal(retry.version,update?2:1);assert.deepEqual(retry.proposal.seats,persisted.seats);
 const again=await h.propose(body);assert.equal(again.proposalId,retry.proposalId);assert.equal(again.version,retry.version);
 const list=(await call(h.api,'/api/seats/proposals')).body;assert.equal(list.proposals.length,1);assert.equal(h.runtime.journal.read({limit:0}).filter(r=>r.origin==='team-proposal').length,update?2:1);
});

test('156 round 2: creation receipt precedes child completion; new participant can ask its creator',{timeout:10000},async t=>{
 const {createActions}=await import('@harnessy/runtime');
 const h=await fixture(t,{seats:'  lead: {kind: orchestrator, role: юрист, vendor: claude, model: w1, mode: read}',actions:createActions(),before:dir=>writeFileSync(join(dir,'.harness/comms-policy.yaml'),'version: 1\nroutes: [{from: "*", to: "*", kinds: "*"}]\nobserve: {}\n')}),go=deferred<any>(),entered=deferred(),receipt=deferred(),answered=deferred(),childStarted=deferred(),releaseChild=deferred();
 let leadRuns=0,childRuns=0,childReply:any;
 h.provider.onRun=async(seat,_message,ctx)=>{ctx.modelStarted?.();
  if(seat.id==='lead'){ctx.registerProcessToken('lead-token');if(++leadRuns===1){entered.resolve();const ref=await go.promise;const made=await ctx.tools.createSeats(ref);assert.equal(made.ok,true);receipt.resolve();return {text:'Команда создана',sessionId:null}}return {text:'Прочитай договор поставки',sessionId:null}}
  if(++childRuns>1)return {text:'Принято',sessionId:null};childStarted.resolve();await releaseChild.promise;
  childReply=await ctx.tools.ask({to:'lead',text:'Какой договор читать?'});answered.resolve();return {text:childReply.ok?childReply.text:childReply.error,sessionId:null};
 };
 h.runtime.chat({pane:'lead',message:'Создай команду'},OWNER);await entered.promise;
 const q=await call(h.api,'/api/seats/propose',{body:{from:'lead',seats:[member()]},headers:{'X-Pane-Token':'lead-token'}});assert.equal(q.status,200,q.text);
 const ref={proposalId:q.body.proposalId,version:q.body.version};assert.equal((await call(h.api,'/api/seats/confirm',{body:{...ref,project:h.dir}})).status,200);go.resolve(ref);await childStarted.promise;
 // A real child is blocked before its ask. The creator still receives its durable receipt.
 await receipt.promise;assert.equal(Boolean(childReply),false);releaseChild.resolve();await answered.promise;await h.runtime.idle();assert.equal(childReply.ok,true);assert.match(childReply.text,/договор поставки/);assert.ok(leadRuns>=2);
});

test('156 round 2: legacy proposal derives its retry key; a stored key for different content is rejected',async t=>{
 const h=await setup(t),q=await h.propose(),path=join(h.dir,'.harness/state/team-proposals.json'),saved=JSON.parse(readFileSync(path,'utf8'));
 delete saved.proposals[0].requestKey;writeFileSync(path,JSON.stringify(saved));assert.equal((await h.propose()).proposalId,q.proposalId);
 saved.proposals[0].requestKey='sha256:'+'a'.repeat(64);writeFileSync(path,JSON.stringify(saved));const reply=await h.post('/api/seats/propose',{seats:[member()]});assert.equal(reply.body.code,'proposal_invalid');assert.equal(JSON.parse(readFileSync(path,'utf8')).proposals.length,1);
});
