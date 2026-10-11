import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {ProviderError} from '@harnessy/providers';
import {harness,FakeProvider,OWNER,promotionInput,collect,until} from './test-helpers.ts';
import {createRuntime} from './runtime.ts';
import {timestampMessage} from './state.ts';

async function promoted(t:Parameters<typeof harness>[0],from:'claude'|'codex'='claude'){
 const claude=new FakeProvider('claude'),codex=new FakeProvider('codex'),h=await harness(t,{deps:{providers:{claude,codex}}}),r=h.runtime;
 r.roomSet({model:from==='claude'?'w1':'c1'},OWNER);
 for(const message of ['FIRST ROOM REQUEST','SECOND ROOM REQUEST']){r.chat({pane:'room',message},OWNER);await r.idle()}
 const input=promotionInput(r),out=await r.promoteChat(input.chat,input,OWNER);await r.idle();
 return {...h,claude,codex,pane:r.registry.get(out.pane.id)!,chat:r.project.state.chats.chats[input.chat]!};
}
for(const from of ['claude','codex'] as const)test('255/257/258: promoted room receipts survive vendor switch, queued request and reopen from '+from,async t=>{
 const h=await promoted(t,from),r=h.runtime,p=r.project,pid=h.pane.id,provider=from==='claude'?h.codex:h.claude;
 r.paneSet(pid,{model:from==='claude'?'c1':'w1'},OWNER);
 // A durable unconsumed delivery has the same state as the pre-fix rejected request.
 p.halted=true;const pending=r.chat({pane:pid,message:'PREVIOUSLY QUEUED'},OWNER);await r.idle();p.halted=false;
 const before=provider.calls.length;r.chat({pane:pid,message:'NEXT OWNER REQUEST'},OWNER);await r.idle();
 assert.equal(provider.calls.length,before+1);const prompt=provider.calls.at(-1)!.message;
 for(const text of ['FIRST ROOM REQUEST','SECOND ROOM REQUEST','PREVIOUSLY QUEUED','NEXT OWNER REQUEST','Контекст этого разговора'])assert.ok(prompt.includes(text),text);
 assert.equal(prompt.split('PREVIOUSLY QUEUED').length-1,1);
 assert.equal(h.pane.settings().contextTransfer?.failure,undefined);assert.equal(p.journal.pendingFor(pid).length,0);
 assert.equal(h.pane.transcript.filter(m=>m.role==='me'&&m.text==='PREVIOUSLY QUEUED').length,1);
 assert.ok(p.state.results(h.pane).some(m=>(m.runtime.recordSeqs as number[]).includes(pending.seq)));
 await r.close();const restored=await createRuntime(h.deps,r.actions);t.after(()=>restored.close());await restored.idle();
 restored.registry.get(pid)!.sessionId=null;await restored.runTurn(pid,'AFTER RESTART');assert.match(provider.calls.at(-1)!.message,/FIRST ROOM REQUEST/);assert.equal(restored.registry.get(pid)!.settings().contextTransfer?.failure,undefined);
});
for(const bad of ['another-chat','another-operation','another-source','missing-source','missing-promotion','altered-receipt','foreign-project','wildcard'] as const)test('255/258: promotion proof checks '+bad+' without blocking the owner',async t=>{
 const h=await promoted(t),r=h.runtime,p=r.project,chat=h.chat,pane=h.pane;
 const foreign=p.journal.append({sender:'owner',to:[bad==='wildcard'?'*':'room'],kind:'question',text:'FOREIGN REQUEST'});
 if(bad==='another-chat')(chat.promotion as any).source.chat.id='different-chat';
 else if(bad==='another-operation')(chat.promotion as any).id='c000000';
 else if(bad==='another-source'){(chat.promotion as any).source.pane='worker';(chat.promotion as any).source.chat.pane='worker'}
 else if(bad==='missing-source')delete (chat.promotion as any).source;
 else if(bad==='missing-promotion')delete chat.promotion;
 else if(bad==='altered-receipt'){const m=pane.transcript.find(m=>m.runtime)!;m.runtime={...(m.runtime as any),recordSeqs:[foreign.seq]}}
 else if(bad==='foreign-project'){const m=pane.transcript[0]!;m.provenance={project:'/foreign',chat:chat.id}}
 else {pane.transcript.push({...timestampMessage('peer','BROADCAST ANSWER',0),runtime:{turnInstanceId:'broadcast',recordSeqs:[foreign.seq]}})}
 p.state.saveChats(p.registry);r.paneSet(pane.id,{model:'c1'},OWNER);const events=collect(r);
 await r.runTurn(pane.id,'CURRENT REQUEST');assert.equal(h.codex.calls.length,1);
 if(bad==='wildcard'){assert.match(h.codex.calls[0]!.message,/BROADCAST ANSWER/);assert.equal(pane.settings().contextTransfer?.failure,undefined)}
 else {assert.equal(h.codex.calls[0]!.message,'CURRENT REQUEST');const note=[...pane.transcript].reverse().find(m=>m.contextTransfer)!;assert.match(note.text,/контекст не передан: /);assert.doesNotMatch(note.text,/по настройке/);assert.ok(pane.settings().contextTransfer?.failure?.code);await until(()=>events.events.some(e=>e.type==='contextTransfer'));const event=events.events.find(e=>e.type==='contextTransfer')!;assert.deepEqual((event.transfer as any).failure,pane.settings().contextTransfer!.failure);assert.equal((event.transfer as any).content,'')}
 events.sub.close();
});
for(const source of ['proposals','memory','settings','limit'] as const)for(const lost of [false,true])test('256: '+source+' snapshot failure'+(lost?' after session_missing':'')+' preserves request and durable reason',async t=>{
 const provider=new FakeProvider(),h=await harness(t,{deps:{providers:{claude:provider}}}),r=h.runtime,p=r.project,pane=r.registry.get('worker')!;
 pane.record('me','PRIVATE HISTORY');pane.carry='UNVERIFIED CARRY';pane.sessionId=lost?'expired':null;p.state.savePanes(p.registry,p.journal);
 if(source==='proposals')writeFileSync(join(h.dir,'.harness/state/team-proposals.json'),'{broken');
 if(source==='memory')writeFileSync(join(h.dir,'.harness/MEMORY.md'),Buffer.from([0xff]));
 if(source==='settings')writeFileSync(join(h.dir,'owner-settings.json'),JSON.stringify({contextTransferTokens:0}));
 if(source==='limit')p.state.readProposals=()=>{throw new RangeError('предел снимка')};
 provider.onRun=async(s,_m,ctx)=>{if(s.sessionId==='expired')throw new ProviderError('session_missing','expired');ctx.modelStarted?.();return {text:'CURRENT ANSWER',sessionId:'new'}};
 r.chat({pane:'worker',message:'CURRENT REQUEST'},OWNER);await r.idle();assert.equal(provider.calls.length,lost?2:1);
 const prompt=provider.calls.at(-1)!.message;assert.match(prompt,/CURRENT REQUEST/);assert.doesNotMatch(prompt,/PRIVATE HISTORY|UNVERIFIED CARRY|Контекст этого разговора/);
 const failure=pane.settings().contextTransfer?.failure;assert.ok(failure?.reason);assert.equal(p.journal.pendingFor('worker').length,0);assert.equal(pane.transcript.filter(m=>m.contextTransfer).length,1);
 await r.close();const next=await createRuntime(h.deps,r.actions);t.after(()=>next.close());assert.deepEqual(next.registry.get('worker')!.settings().contextTransfer?.failure,failure);
});
