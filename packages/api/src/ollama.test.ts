import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,writeFileSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {ProviderCatalog,LoginTerminal,ollamaEntry} from '@harnessy/providers';
import {MemoryKeys} from '../../llm/src/test-helpers.ts';
import {ollamaFixture,ollamaAnswer} from '../../providers/src/ollama-test-helpers.ts';
import {fixture,call,sse,deferred} from './test-helpers.ts';
function result(stream:Awaited<ReturnType<typeof sse>>){const found=()=>stream.frames.find(e=>e.type==='providers'&&e.provider==='ollama'&&['done','declined','error'].includes(e.status)&&e.event==='probe');if(found())return Promise.resolve(found());return new Promise<any>((resolve,reject)=>{const done=()=>{const e=found();if(e){stream.response.off('data',done);resolve(e)}};stream.response.on('data',done);stream.response.once('error',reject);stream.response.once('end',()=>reject(Error('SSE ended without a probe result')));done()})}
async function setup(t:Parameters<typeof fixture>[0]){const f=await ollamaFixture(t),scripts:string[]=[],keys=new MemoryKeys(),h=await fixture(t,{deps:{llmKeys:keys,llmFetch:f.fetch,providerCatalog:new ProviderCatalog([f.entry]),loginTerminal:new LoginTerminal({platform:'darwin',temporaryDirectory:f.dir,open:async p=>{scripts.push(readFileSync(p,'utf8'))}})}});await call(h.api,'/api/providers/ollama/check',{body:{}});return {f,h,keys,scripts}}

test('21d: catalog/check/login stay intact; cloud and local seat/room turns use the daemon API and Harnessy history',async t=>{
 const {f,h,scripts}=await setup(t),row=(await call(h.api,'/api/providers/catalog')).body.providers.find((p:any)=>p.id==='ollama');assert.equal(row.title,'Ollama');assert.equal(row.subtitle,'облако и локально');assert.equal(row.service.ok,true);assert.equal(row.login.state,'unknown');assert.equal(row.models[0].label,'glm-5.3:cloud · облако');
 const login=await call(h.api,'/api/providers/ollama/login-terminal',{body:{command:'UNTRUSTED',args:['signout']}});assert.equal(login.status,200);assert.match(scripts[0]!,/'signin'/);assert.doesNotMatch(scripts[0]!,/UNTRUSTED|signout|SECRET/);assert.equal(f.capture().length,0);
 for(const [path,model] of [['/api/panes/worker','glm-5.3:cloud'],['/api/room','gemma4:latest']] as const){const r=await call(h.api,path,{body:{vendor:'ollama',model,...(path.endsWith('room')?{folder:true}:{})}});assert.equal(r.status,200,r.text);const id=path.endsWith('room')?'room':'worker';const first=await call(h.api,'/api/chat',{body:{pane:id,message:'FIRST QUESTION'}});assert.equal(first.status,200,first.text);await h.runtime.idle();const pane=h.runtime.registry.get(id)!;assert.equal(pane.vendor,'ollama');assert.equal(pane.sessionId,null);assert.equal(pane.transcript.at(-1)!.text,'готов');pane.sessionId='old-codex-session';const second=await call(h.api,'/api/chat',{body:{pane:id,message:'SECOND QUESTION'}});assert.equal(second.status,200,second.text);await h.runtime.idle();assert.equal(pane.sessionId,null);assert.match(JSON.stringify(f.capture().at(-1).messages),/FIRST QUESTION/);assert.equal(f.capture().at(-1).model,model)}
 assert.equal(f.capture().length,4);assert.equal(h.provider.calls.length+h.codex.calls.length,0);const status=(await call(h.api,'/api/status')).body;for(const mode of ['read','edit','all','chat','ask'])assert.equal(status.turnModes.ollama[mode].ok,true);for(const mode of ['check','web'])assert.equal(status.turnModes.ollama[mode].ok,false);assert.equal((await call(h.api,'/api/limits')).body.providers.some((p:any)=>p.vendor==='ollama'),false);
 const spend=await call(h.api,'/api/spend/turns?vendor=ollama');assert.equal(spend.body.items.length,4);assert.equal(spend.body.items.reduce((n:number,r:any)=>n+r.usage.output,0),16);assert.equal((await call(h.api,'/api/trace')).body.records.filter((r:any)=>r.kind==='llm.request').length,4);
});

for(const mode of ['read','edit','all','ask','chat','check','web'])test('21d: '+mode+' is enforced by Harnessy tools, without Codex',async t=>{
 const {f,h}=await setup(t);let step=0;f.setRespond(res=>ollamaAnswer(res,step++===0?{name:'write_file',arguments:{path:'artifacts/result.md',text:'tool result'}}:'готов'));
 const r=await call(h.api,'/api/panes/worker',{body:{vendor:'ollama',model:'glm-5.3:cloud',mode,...(mode==='all'?{binding:h.runtime.paneBinding('worker')}:{})}});if(['check','web'].includes(mode)){assert.equal(r.status,409,r.text);assert.equal(f.capture().length,0);return}assert.equal(r.status,200,r.text);
 const stream=h.runtime.subscribe({all:true});t.after(()=>stream.close());const approval=mode==='ask'?(async()=>{for await(const event of stream.events)if(event.type==='approval')return event;throw Error('no approval')})():null,run=h.runtime.runTurn('worker','fixture tools');
 if(approval){const event=await approval;assert.equal(existsSync(join(h.dir,'artifacts/result.md')),false);await call(h.api,'/api/approve',{body:{pane:'worker',id:event.id,decision:'allow'}})}await run;
 assert.equal(existsSync(join(h.dir,'artifacts/result.md')),['edit','all','ask'].includes(mode));assert.equal(f.capture().length,2);const tools=f.capture()[0].tools.map((x:any)=>x.function.name);assert.equal(tools.includes('write_file'),['edit','all','ask'].includes(mode));assert.equal(tools.includes('shell'),mode==='all');assert.equal(tools.includes('read_file'),mode!=='chat');assert.equal(h.codex.calls.length,0);
});

for(const approve of [false,true])test('21d: probe requires owner approval; only allow reaches the daemon API: '+approve,async t=>{
 const {f,h}=await setup(t),stream=await sse(h.api,'owner');t.after(()=>stream.close());assert.equal((await call(h.api,'/api/providers/ollama/probe',{body:{model:'glm-5.3:cloud'},headers:{'X-Pane-Token':'forged'}})).status,403);
 const probe=await call(h.api,'/api/providers/ollama/probe',{body:{model:'glm-5.3:cloud'}});assert.equal(probe.status,200,probe.text);assert.equal(probe.body.status,'awaiting_approval');assert.equal(probe.body.price.kind,'unknown');assert.equal(f.capture().length,0);
 await call(h.api,'/api/approve',{body:{pane:'owner',id:probe.body.approvalId,decision:approve?'allow':'deny',project:h.dir}});const event=await result(stream);assert.equal(event.status,approve?'done':'declined',JSON.stringify(event));assert.equal(f.capture().length,approve?1:0);if(approve){assert.ok(f.capture()[0].tools.every((x:any)=>!['read_file','write_file','shell'].includes(x.function.name)));assert.match(JSON.stringify(f.capture()[0].messages),/Ответь одним словом/)}
});

test('21d: daemon disappears after probe approval, or tags omit the model — no inference or stale success',async t=>{
 const {f,h}=await setup(t),stream=await sse(h.api,'owner');t.after(()=>stream.close());const probe=await call(h.api,'/api/providers/ollama/probe',{body:{model:'glm-5.3:cloud'}});f.setOffline(true);await call(h.api,'/api/approve',{body:{pane:'owner',id:probe.body.approvalId,decision:'allow',project:h.dir}});assert.equal((await result(stream)).status,'error');assert.equal(f.capture().length,0);
 f.setOffline(false);await call(h.api,'/api/providers/ollama/check',{body:{}});assert.equal((await call(h.api,'/api/panes/worker',{body:{vendor:'ollama',model:'glm-5.3:cloud'}})).status,200);f.setTags({models:[{name:'gemma4:latest'}]});await assert.rejects(h.runtime.runTurn('worker','missing model'),{code:'model_unsupported'});assert.equal(f.capture().length,0);
});

test('21d: local route ignores same-named owner API route, credentials and address overrides',async t=>{
 const {f,h,keys}=await setup(t);let keyReads=0;keys.resolveKey=async()=>{keyReads++;return 'SECRET-OWNER-KEY'};await call(h.api,'/api/llm/providers/ollama',{body:{config:{api:'openai-completions',baseURL:'https://foreign.invalid/v1',keyRef:'ollama',models:[{id:'glm-5.3:cloud'}]}}});await call(h.api,'/api/panes/worker',{body:{vendor:'ollama',model:'glm-5.3:cloud'}});await h.runtime.runTurn('worker','fixture');assert.equal(keyReads,0);assert.ok(f.network.every(r=>r.url.startsWith('http://127.0.0.1:11434/')));assert.doesNotMatch(JSON.stringify(f.network),/SECRET|foreign/);assert.ok(f.commands.every(c=>c.binary===f.options.binary&&JSON.stringify(c.args)==='["--version"]'));
});

test('21d: cancellation stops a pending daemon stream',async t=>{
 const {f,h}=await setup(t),entered=deferred();f.setRespond(res=>{res.writeHead(200,{'Content-Type':'text/event-stream'});res.flushHeaders();entered.resolve()});await call(h.api,'/api/panes/worker',{body:{vendor:'ollama',model:'glm-5.3:cloud'}});const run=h.runtime.runTurn('worker','pending');await entered.promise;h.runtime.cancelTurn('worker','fixture cancel');await run;assert.equal(h.runtime.registry.get('worker')!.busy,false);assert.equal(h.runtime.registry.get('worker')!.sessionId,null);assert.equal(f.capture().length,1);
});

test('21d: cancelling model discovery aborts the tags transport and prevents inference after a late reply',{timeout:12000},async t=>{
 const f=await ollamaFixture(t),entered=deferred(),reply=deferred<Response>();let hold=false,requestSignal:AbortSignal|null|undefined;
 const entry=ollamaEntry({...f.options,httpTimeoutMs:60000,fetch:async(url,init)=>{if(hold&&String(url).endsWith('/api/tags')){requestSignal=init?.signal;entered.resolve();return reply.promise}return f.fetch(url,init)}});
 const h=await fixture(t,{deps:{llmFetch:f.fetch,providerCatalog:new ProviderCatalog([entry])}});
 t.after(()=>reply.resolve(Response.json({models:[{name:'glm-5.3:cloud'}]})));
 assert.equal((await call(h.api,'/api/providers/ollama/check',{body:{}})).status,200);
 assert.equal((await call(h.api,'/api/panes/worker',{body:{vendor:'ollama',model:'glm-5.3:cloud'}})).status,200);
 hold=true;const run=h.runtime.runTurn('worker','pending discovery'),stopped=assert.rejects(run,{code:'cancelled'});
 await entered.promise;assert.equal(requestSignal?.aborted,false);assert.equal(h.runtime.cancelTurn('worker','fixture cancel'),true);await stopped;
 assert.equal(requestSignal?.aborted,true);assert.equal(h.runtime.registry.get('worker')!.busy,false);assert.equal(f.capture().length,0);assert.equal(f.pulls.length,0);
 reply.resolve(Response.json({models:[{name:'glm-5.3:cloud'}]}));await h.runtime.idle();assert.equal(f.capture().length,0);
});

test('21d: a probe cannot use file/peer tools or turn one approval into a second model request',async t=>{
 const {f,h}=await setup(t),stream=await sse(h.api,'owner');t.after(()=>stream.close());f.setRespond(res=>ollamaAnswer(res,{name:'write_file',arguments:{path:'probe-leak',text:'bad'}}));
 const probe=await call(h.api,'/api/providers/ollama/probe',{body:{model:'glm-5.3:cloud'}});assert.equal(probe.status,200,probe.text);await call(h.api,'/api/approve',{body:{pane:'owner',id:probe.body.approvalId,decision:'allow',project:h.dir}});assert.equal((await result(stream)).status,'error');assert.equal(f.capture().length,1);assert.equal(existsSync(join(h.dir,'probe-leak')),false);assert.equal(h.codex.calls.length,0);
});

test('21d: Ollama tool calls use the Harnessy shell boundary and retain external files',async t=>{
 const {f,h}=await setup(t),outside=join(f.dir,'outside');writeFileSync(outside,'unchanged');symlinkSync(f.dir,join(h.dir,'escape'));let step=0;f.setRespond(res=>ollamaAnswer(res,step++===0?{name:'shell',arguments:{command:'printf bad > escape/outside'}}:'готов'));
 const select=await call(h.api,'/api/panes/worker',{body:{vendor:'ollama',model:'gemma4:latest',mode:'all',binding:h.runtime.paneBinding('worker')}});assert.equal(select.status,200,select.text);await h.runtime.runTurn('worker','bounded shell');assert.equal(readFileSync(outside,'utf8'),'unchanged');assert.match(JSON.stringify(f.capture()[1].messages),/shell_failed/);assert.equal(h.codex.calls.length,0);
});

test('344: HTTP-selected uninstalled cloud model pulls only after probe approval; failed pull preserves a seat/session', {timeout:8000},async t=>{
 const f=await ollamaFixture(t);f.setCloud({models:[{name:'gpt-oss:20b'}]});const h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog([f.entry]),llmFetch:f.fetch}}),stream=await sse(h.api,'owner');t.after(()=>stream.close());await call(h.api,'/api/providers/ollama/check',{body:{}});
 const select=await call(h.api,'/api/panes/worker',{body:{vendor:'ollama',model:'gpt-oss:20b-cloud'}});assert.equal(select.status,200,select.text);assert.equal(f.pulls.length,0);const pane=h.runtime.registry.get('worker')!;pane.sessionId='previous-session';const before=pane.settings();f.setPullStatus(503);await assert.rejects(h.runtime.runTurn('worker','do not execute'));assert.deepEqual(pane.settings(),before);assert.equal(f.capture().length,0);
 const probe=await call(h.api,'/api/providers/ollama/probe',{body:{model:'gpt-oss:20b-cloud'}});assert.equal(probe.status,200,probe.text);assert.equal(f.pulls.length,1);assert.equal(f.capture().length,0);f.setPullStatus(200);
 await call(h.api,'/api/approve',{body:{pane:'owner',id:probe.body.approvalId,decision:'allow',project:h.dir}});assert.equal((await result(stream)).status,'done');assert.equal(f.pulls.length,2);assert.equal(f.capture().length,1);assert.deepEqual(pane.settings(),before);
});
