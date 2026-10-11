import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {ProviderError,type TurnContext} from '@harnessy/providers';
import {harness,FakeProvider,OWNER,collect,deferred,until} from './test-helpers.ts';
import {createRuntime} from './runtime.ts';
import {timestampMessage} from './state.ts';
import {transferSnapshot} from './chats.ts';
function seed(runtime:Awaited<ReturnType<typeof harness>>['runtime'],n=16){const p=runtime.project,pane=runtime.registry.get('worker')!;pane.transcript=Array.from({length:n},(_,i)=>timestampMessage(i%2?'ai':'me','SAVED-'+i+'\nsecond '+i+'\nOLDER-DETAIL-'+i,1791500000000+i*1000));pane.sessionId='old';p.state.savePanes(p.registry,p.journal);return pane}
function done(ctx:TurnContext,model:string,text='answer'){ctx.modelStarted?.();ctx.publish({type:'done',sessionId:'new-session',model,durationMs:7,usage:{input:345,output:12,cacheRead:9}});return {text,sessionId:'new-session'}}
for(const [from,to,model] of [['claude','codex','c1'],['codex','claude','w1']] as const)test('245/247/249: '+from+' → '+to+' carries only saved active history once, retains measured usage',async t=>{
 const claude=new FakeProvider('claude'),codex=new FakeProvider('codex'),h=await harness(t,{deps:{providers:{claude,codex}}}),pane=seed(h.runtime),p=h.runtime.project;pane.vendor=from;pane.model=from==='claude'?'w1':'c1';p.state.savePanes(p.registry,p.journal);
 const events=collect(h.runtime);h.runtime.paneSet('worker',{model},OWNER);const provider=to==='claude'?claude:codex;provider.onRun=async(s,_m,ctx)=>done(ctx,s.model);
 await h.runtime.runTurn('worker','CURRENT');const prompt=provider.calls[0]!.message;assert.match(prompt,/Контекст этого разговора/);assert.match(prompt,/Новое сообщение:\nCURRENT$/);for(let i=4;i<16;i++)assert.ok(prompt.includes('SAVED-'+i+'\n> second '+i+'\n> OLDER-DETAIL-'+i));assert.doesNotMatch(prompt,/OLDER-DETAIL-0\n/);
 await until(()=>events.events.some(e=>e.type==='contextTransfer'));const event=events.events.find(e=>e.type==='contextTransfer')!,transfer=event.transfer as any;assert.equal(transfer.chat,p.state.chats.active.worker);assert.equal(transfer.project,h.dir);assert.equal(transfer.messages,16);assert.equal(transfer.verbatim,12);
 assert.equal(pane.transcript.filter(m=>m.contextTransfer).length,1);assert.deepEqual(pane.transcript.at(-1)!.usage,{input:345,output:12,cacheRead:9});assert.equal(pane.settings().contextTransfer?.messages,16);
 await h.runtime.runTurn('worker','SECOND');assert.doesNotMatch(provider.calls[1]!.message,/Контекст этого разговора/);assert.equal(provider.calls[1]!.seat.sessionId,'new-session');events.sub.close();
});
test('245/249: same vendor model switch keeps session and does not repeat context',async t=>{
 const h=await harness(t),pane=seed(h.runtime);h.runtime.paneSet('worker',{model:'w2'},OWNER);await h.runtime.runTurn('worker','current');assert.equal(h.provider.calls[0]!.seat.sessionId,'old');assert.equal(h.provider.calls[0]!.message,'current');assert.equal(pane.transcript.filter(m=>m.contextTransfer).length,0);
});
for(const vendor of ['claude','codex'] as const)test('245: '+vendor+' missing session retries with the same saved context and one transfer',async t=>{
 const provider=new FakeProvider(vendor),h=await harness(t,{deps:{providers:{[vendor]:provider},models:{claude:[{id:'w1'}],codex:[{id:'c1'}]}}}),pane=seed(h.runtime);pane.vendor=vendor;pane.model=vendor==='claude'?'w1':'c1';
 provider.onRun=async(s,_m,ctx)=>{if(s.sessionId==='old')throw new ProviderError('session_missing','expired');return done(ctx,s.model)};
 await h.runtime.runTurn('worker','NOW');assert.equal(provider.calls.length,2);assert.equal(provider.calls[0]!.message,'NOW');assert.equal(provider.calls[1]!.seat.sessionId,null);assert.match(provider.calls[1]!.message,/SAVED-15/);assert.equal(pane.transcript.filter(m=>m.contextTransfer).length,1);
});
test('245: reset persists across reopen; new conversation never inherits old transcript',async t=>{
 const codex=new FakeProvider('codex'),h=await harness(t,{deps:{providers:{codex,claude:new FakeProvider()}}});seed(h.runtime);h.runtime.paneSet('worker',{model:'c1'},OWNER);await h.runtime.close();const r=await createRuntime(h.deps,h.runtime.actions);t.after(()=>r.close());await r.runTurn('worker','REOPEN');assert.match(codex.calls[0]!.message,/SAVED-15/);
 await r.chatsNew({pane:'worker',carry:'none'},OWNER);await r.runTurn('worker','EMPTY');assert.equal(codex.calls[1]!.message,'EMPTY');
});
test('245: switch vendor while old turn runs transfers its eventual reply without restoring old session',async t=>{
 const gate=deferred(),codex=new FakeProvider('codex'),h=await harness(t,{deps:{providers:{codex,claude:new FakeProvider()}}}),pane=seed(h.runtime);const claude=h.deps.providers.claude as FakeProvider;
 claude.onRun=async(s,_m,ctx)=>{ctx.modelStarted?.();await gate.promise;return {text:'LATE OLD ANSWER',sessionId:'wrong-vendor'}};const running=h.runtime.runTurn('worker','first');await until(()=>claude.calls.length===1);h.runtime.paneSet('worker',{model:'c1'},OWNER);gate.resolve();await running;assert.equal(pane.sessionId,null);await h.runtime.runTurn('worker','next');assert.match(codex.calls[0]!.message,/LATE OLD ANSWER/);assert.equal(codex.calls[0]!.seat.sessionId,null);
});
test('248/249: owner opt out persists notice, small budget compresses without rejecting the turn',async t=>{
 const h=await harness(t),pane=seed(h.runtime);await h.runtime.settingsPatch('owner',{contextTransferEnabled:false},OWNER);pane.sessionId=null;await h.runtime.runTurn('worker','CURRENT');assert.equal(h.provider.calls[0]!.message,'CURRENT');assert.match(pane.transcript.find(m=>m.contextTransfer)!.text,/контекст не передан по настройке/);
 await h.runtime.settingsPatch('owner',{contextTransferEnabled:true,contextTransferTokens:512,contextTransferMessages:2},OWNER);pane.record('me','LONG'.repeat(10000));pane.sessionId=null;h.runtime.project.state.savePanes(h.runtime.registry,h.runtime.project.journal);await h.runtime.runTurn('worker','NEXT');const transfer=pane.settings().contextTransfer!;assert.ok(transfer.tokens<=512);assert.equal(transfer.compressed,true);
});
test('249: forged project/chat history refuses before provider; neighbour conversations never enter block',async t=>{
 const h=await harness(t),pane=seed(h.runtime);const p=h.runtime.project,chat=p.state.activeChat(pane)!;p.state.chats.chats.foreign={...structuredClone(chat),id:'foreign',transcript:[timestampMessage('me','FOREIGN SECRET',0)]};pane.sessionId=null;await h.runtime.runTurn('worker','CURRENT');assert.doesNotMatch(h.provider.calls[0]!.message,/FOREIGN SECRET/);
 for(const bad of [{project:'/foreign'},{chat:'foreign'},{provenance:{project:'/foreign',chat:chat.id}}]){pane.transcript.push({...timestampMessage('me','INJECTED SECRET',0),...bad});pane.sessionId=null;p.state.saveChats(p.registry);await assert.rejects(h.runtime.runTurn('worker','NEXT'),(e:any)=>e.code==='context_binding_invalid');pane.transcript.pop();p.state.saveChats(p.registry)}assert.equal(h.provider.calls.length,1);
 const ownId=p.state.chats.active.worker!;p.state.chats.active.worker='foreign';p.state.chats.chats.foreign!.pane='another';await assert.rejects(h.runtime.runTurn('worker','BAD'),(e:any)=>e.code==='context_binding_invalid');p.state.chats.active.worker=ownId;
});
test('246: saved promotion intro, documents, same-chat proposal and task; foreign proposal excluded',async t=>{
 const h=await harness(t),pane=seed(h.runtime),p=h.runtime.project,chat=p.state.activeChat(pane)!;
 const task=p.journal.append({sender:'owner',to:['worker'],kind:'task',text:'LAST TASK',thread:'T1'});pane.transcript.at(-1)!.runtime={turnInstanceId:'turn-own',recordSeqs:[task.seq]};
 chat.promotion={target:p.dir,sid:pane.id,source:{chat:{id:chat.id}},intro:'SUBJECT INTRO'};chat.documents=[{project:p.dir,path:'claim.md'}];writeFileSync(join(h.dir,'.harness/MEMORY.md'),'## Цель\nSAVED MEMORY');
 p.state.saveProposals({project:p.dir,proposals:[{proposalId:'own',version:2,from:'worker',turnInstanceId:'turn-own',confirmed:false,seats:[{label:'Юрист',kind:'worker'}]},{proposalId:'foreign',version:1,from:'worker',turnInstanceId:'other-chat',confirmed:false,seats:[{label:'FOREIGN SECRET'}]}]});p.state.saveChats(p.registry);
 const out=transferSnapshot(p,pane,[])!;const text=JSON.stringify(out.facts);for(const value of ['SUBJECT INTRO','claim.md','SAVED MEMORY','LAST TASK','own','Юрист'])assert.ok(text.includes(value),value);assert.doesNotMatch(text,/FOREIGN SECRET/);
});
test('245: failure after early session callback but before model start retries transfer, without false notice',async t=>{
 const h=await harness(t),pane=seed(h.runtime);pane.sessionId=null;h.provider.onRun=async(_s,_m,ctx)=>{ctx.session('empty-session');throw new ProviderError('not_logged_in','no login')};
 await assert.rejects(h.runtime.runTurn('worker','NOW'));assert.equal(pane.sessionId,null);assert.equal(pane.transcript.some(m=>m.contextTransfer),false);h.provider.onRun=null;await h.runtime.runTurn('worker','RETRY');assert.match(h.provider.calls[1]!.message,/Контекст этого разговора/);
});
test('246/249: pending owner ack from same thread is included; settled and unrelated acks are excluded',async t=>{
 const h=await harness(t),pane=seed(h.runtime),p=h.runtime.project;
 const task=p.journal.append({sender:'owner',to:['worker'],kind:'task',thread:'case',text:'TASK'});pane.transcript.at(-1)!.runtime={turnInstanceId:'own',recordSeqs:[task.seq]};
 p.journal.append({sender:'worker',to:['owner'],kind:'question',thread:'case',text:'WAIT OWNER',ack:'pending'});
 p.journal.append({sender:'worker',to:['owner'],kind:'question',thread:'another-chat',text:'UNRELATED',ack:'pending'});
 p.state.saveChats(p.registry);const snapshot=transferSnapshot(p,pane,[])!;assert.match(JSON.stringify(snapshot.facts),/WAIT OWNER/);assert.doesNotMatch(JSON.stringify(snapshot.facts),/UNRELATED/);
});
