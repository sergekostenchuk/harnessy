import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync,writeFileSync} from 'node:fs';
import {ProviderCatalog,cliEntry,ProviderError} from '@harnessy/providers';
import {fixture,call,sse} from './test-helpers.ts';
import {antigravityFixture} from '../../providers/src/antigravity-test-helpers.ts';
async function waitEvent(stream:Awaited<ReturnType<typeof sse>>,predicate:(event:any)=>boolean,signal:AbortSignal){
 for(;;){const found=stream.raw.split('\n\n').flatMap(block=>{try{return [JSON.parse(block.replace(/^data: /,''))]}catch{return []}}).find(predicate);if(found)return found;await once(stream.response,'data',{signal})}
}
const marker='CredMarker!',reason='service unavailable; credential='+marker;
for(const source of ['stderr','event','exception'] as const)test('350 r2: '+source+' cannot leak a credential via chat, snapshot, trace bytes, HTTP or journal',{timeout:15000},async t=>{
 const f=antigravityFixture(t,'turn-crash');writeFileSync(f.description.binary,readFileSync(f.description.binary,'utf8').replace('service unavailable; api_key=FIXTURE-SECRET',reason));
 const entry=cliEntry(f.description,{env:f.env,cwd:f.dir});if(source!=='stderr')entry.runTurn=async(_seat,_message,ctx)=>{ctx.modelStarted?.();if(source==='exception')throw new ProviderError('transport_lost',reason);ctx.publish({type:'toolError',text:reason});ctx.publish({type:'error',text:reason});return {text:'',sessionId:null}};
 const catalog=new ProviderCatalog([entry]);await catalog.read('antigravity');const h=await fixture(t,{seats:'  worker: {role: executor, vendor: antigravity, label: воркер, model: gemini-3.8-flash-high, mode: all, digest: false}',deps:{providerCatalog:catalog}});
 const stream=await sse(h.api);t.after(()=>stream.close());assert.equal((await call(h.api,'/api/chat',{body:{pane:'worker',message:'local double'}})).status,200);await h.runtime.idle();await waitEvent(stream,e=>e.type==='error',t.signal);
 const status=await call(h.api,'/api/status'),waiting=h.runtime.waiting('worker');assert.equal(status.status,200);assert.equal(waiting?.failure?.code,source==='event'?'turn_failed':'transport_lost');assert.match(waiting!.failure!.reason,/service unavailable/);
 const httpTrace=await call(h.api,'/api/trace');assert.equal(httpTrace.status,200);const rows=await h.runtime.project.trace.read(),end=rows.find(r=>r.kind==='turn.end');assert.ok(end);assert.match(end.reason.text,/service unavailable/);
 const journal=(await call(h.api,'/api/journal')).text,bytes=readFileSync(h.runtime.project.trace.path,'utf8'),state=readFileSync(h.runtime.project.state.chatsPath,'utf8');
 for(const output of [status.text,httpTrace.text,JSON.stringify(rows),stream.raw,journal,bytes,state])assert.equal(output.includes(marker),false,source+' leaked');
 // Same provider path, now through explicit probe approval and its SSE card.
 const probe=await call(h.api,'/api/providers/antigravity/probe',{body:{model:'gemini-3.8-flash-high'}});assert.equal(probe.status,200,probe.text);const approval=await call(h.api,'/api/approve',{body:{pane:'owner',id:probe.body.approvalId,decision:'allow',project:h.dir}});assert.equal(approval.status,200,approval.text);assert.equal(approval.body.ok,true);
 const failed=await waitEvent(stream,e=>e.type==='providers'&&e.approvalId===probe.body.approvalId&&e.status==='error',t.signal);assert.match(failed.error.reason,/service unavailable/);assert.equal(stream.raw.includes(marker),false);
 const trace=await call(h.api,'/api/trace');assert.equal(trace.text.includes(marker),false);assert.equal(readFileSync(h.runtime.project.trace.path,'utf8').includes(marker),false);
});
