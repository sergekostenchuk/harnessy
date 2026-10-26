import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import {readFileSync} from 'node:fs';
import {fixture,call,FakeProvider,deferred} from '../../api/src/test-helpers.ts';
import {networkRevision,type NetworkPolicy,type ExitCheck} from '@harnessy/projects';
import {listen,proxy,through} from './network-test-helpers.ts';
import {ProviderCatalog,builtinEntries} from '@harnessy/providers';
import {MemoryKeys,config,openai} from '../../llm/src/test-helpers.ts';
const opts={timeout:20000};
const cert=readFileSync(new URL('./fixtures/network-test-cert.pem',import.meta.url),'utf8'),key=readFileSync(new URL('./fixtures/network-test-key.pem',import.meta.url),'utf8');
type Harness=Awaited<ReturnType<typeof fixture>>;
// Only the cleanup deadline is virtual. Sockets, HTTP and provider finally blocks stay real.
function cleanupDeadline(t:TestContext){
 const timeoutMs=23457,armed=deferred(),set=globalThis.setTimeout,clear=globalThis.clearTimeout;
 let pending:{timer:ReturnType<typeof setTimeout>;fire:()=>void}|null=null;
 t.mock.method(globalThis,'setTimeout',((callback:(...args:any[])=>void,ms?:number,...args:any[])=>{
  if(ms!==timeoutMs)return set(callback,ms,...args);
  assert.equal(pending,null,'one cleanup deadline per attempt');
  const timer={unref(){return this},ref(){return this},hasRef(){return false}} as ReturnType<typeof setTimeout>;
  pending={timer,fire:()=>callback(...args)};armed.resolve();return timer;
 }) as typeof setTimeout);
 t.mock.method(globalThis,'clearTimeout',((timer:Parameters<typeof clearTimeout>[0])=>{if(pending&&timer===pending.timer)pending=null;else clear(timer)}) as typeof clearTimeout);
 return {timeoutMs,armed:armed.promise,get pending(){return pending!==null},expire(){assert.ok(pending,'cleanup deadline must be armed');const fire=pending.fire;pending=null;fire()}};
}

async function routes(h:Harness,vendor:string,urls:string[],policy:NetworkPolicy={mode:'fallback',silenceSeconds:1},countries:(string|null)[]=urls.map(()=>'Germany')){
 await h.runtime.settings.changeNetwork(async c=>{c.migrated=true;urls.forEach((url,i)=>{c.exits['exit-'+i]={id:'exit-'+i,label:'Выход '+i,type:'proxy',url}});c.chains[vendor]=urls.map((_,i)=>'exit-'+i);(c.policies??={})[vendor]=policy;return {result:undefined}});
 const checks=new Map<string,ExitCheck>();urls.forEach((_,i)=>{checks.set('exit-'+i,{revision:networkRevision(h.runtime.settings.network().exits['exit-'+i])!,checkedAt:Date.now(),ok:true,ip:'192.0.2.'+(i+1),country:countries[i]??null,durationMs:1,state:'checked'})});
 h.runtime.networkChecks.snapshot=(id,revision)=>{const check=checks.get(id);return check?.revision===revision?structuredClone(check):null};return checks;
}
async function api(h:Harness){await h.runtime.settings.changeLlmProvider('local',{...config('https://api-origin.invalid/v1'),timeoutMs:15000,retryPolicy:{mode:'normal',maxRetries:0}},null);assert.equal((await call(h.api,'/api/panes/worker',{body:{vendor:'api:local',model:'test-model'}})).status,200)}

test('22d: chain policy validation, revision, restart and owner-only access',opts,async t=>{
 const h=await fixture(t,{deps:{providerCatalog:new ProviderCatalog(builtinEntries({claude:new FakeProvider()},{},{execute:async()=>({code:0,signal:null,stdout:'1.0',stderr:''})}))}});await h.runtime.settings.changeNetwork(async c=>{c.migrated=true;c.exits.direct={id:'direct',label:'Direct',type:'direct'};c.chains.claude=['direct'];return {result:undefined}});
 const path='/api/network/providers/claude',old=(await call(h.api,path)).body;
 for(const policy of [{mode:'rotation',silenceSeconds:2},{mode:'rotation',rotationMinutes:0,silenceSeconds:2},{mode:'rotation',rotationMinutes:1,silenceSeconds:0},{mode:'fallback',silenceSeconds:2,country:'Germany'},null])assert.equal((await call(h.api,path,{body:{exits:['direct'],policy,revision:old.revision}})).status,400);
 const policy={mode:'rotation',rotationMinutes:5,silenceSeconds:30},r=await call(h.api,path,{body:{exits:['direct'],policy,revision:old.revision}});assert.equal(r.status,200,r.text);assert.deepEqual(r.body.policy,policy);assert.notEqual(r.body.revision,old.revision);
 assert.equal((await call(h.api,path,{body:{exits:[],policy,revision:old.revision}})).status,409);assert.deepEqual((await h.runtime.network.chain('claude')).policy,policy);
 assert.equal((await call(h.api,path,{headers:{'x-pane-token':'forged'},body:{exits:[],policy,revision:r.body.revision}})).status,403);
 // Saving through an older client preserves the mode, but still uses its full revision.
 assert.deepEqual((await call(h.api,path,{body:{exits:['direct'],revision:r.body.revision}})).body.policy,policy);
});

test('22d: failed primary uses a verified same-country reserve; other country and unknown country are never contacted',opts,async t=>{
 const origin=http.createServer((_q,r)=>r.end('reserve')),p=await proxy(t,await listen(t,origin)),h=await fixture(t,{deps:{networkRelayOptions:{timeoutMs:100}}});
 await routes(h,'claude',['http://127.0.0.1:1',p.url],undefined,['Germany','France']);await assert.rejects(h.runtime.runTurn('worker','deny'),{code:'network_no_reserve'});assert.equal(p.connects.length,0);assert.equal(h.provider.calls.length,0);assert.equal(h.runtime.registry.get('worker')!.status,'uncertain');
 const other=await fixture(t,{deps:{networkRelayOptions:{timeoutMs:100}}});const checks=await routes(other,'claude',['http://127.0.0.1:1',p.url],undefined,['Germany',null]);await assert.rejects(other.runtime.networkRelay.prepare('claude',t.signal),{code:'network_country_unverified'});assert.equal(p.connects.length,0);
 checks.get('exit-1')!.country='Germany';const turn=other.runtime.networkRelay.begin('claude','good',t.signal);t.after(()=>turn.close());const text=await turn.run(async()=>await(await other.runtime.networkRelay.fetch('claude')('http://origin.invalid')).text());assert.equal(text,'reserve');assert.equal(turn.hop!.id,'exit-1');
 // An old successful check cannot authorize a changed proxy URL.
 await other.runtime.settings.changeNetwork(async c=>{(c.exits['exit-1'] as any).url=p.url+'/';return {result:undefined}});await assert.rejects(other.runtime.networkRelay.prepare('claude',t.signal),{code:'network_country_unverified'});
});

for(const status of [429,503,401])test('22d: actual API '+status+' retries only before output; auth does not select reserve',opts,async t=>{
 let a=0,b=0;const one=https.createServer({cert,key},(q,r)=>{q.resume();a++;r.writeHead(status,{'content-type':'application/json'});r.end(JSON.stringify({error:{message:'fixture rejection'}}))}),two=https.createServer({cert,key},(q,r)=>{q.resume();b++;openai(r)});
 const pa=await proxy(t,await listen(t,one)),pb=await proxy(t,await listen(t,two)),h=await fixture(t,{deps:{llmKeys:new MemoryKeys(),networkRelayOptions:{tlsCa:cert,timeoutMs:500}}});await api(h);await routes(h,'api:local',[pa.url,pb.url]);
 if(status===401){await assert.rejects(h.runtime.runTurn('worker','auth'));assert.equal(b,0);assert.equal(h.runtime.networkRelay.stats().reduce((n,r)=>n+(r.switches??0),0),0)}
 else {assert.equal(await h.runtime.runTurn('worker','retry'),'hello world');assert.equal(b,1);const messages=h.runtime.registry.get('worker')!.transcript;const receipt=messages.find(m=>m.role==='ai')!.network as any;assert.equal(receipt.via.id,'exit-1');assert.equal(receipt.reserve.reason,status===429?'rate_limited':'server_error');assert.equal(h.runtime.networkRelay.stats().find(r=>r.exit==='exit-1')!.switches,1)}assert.equal(a,1);
});

test('22d: first-request silence retries once; all-silent chain stops with a durable decision',opts,async t=>{
 let silent=0,good=0;const one=https.createServer({cert,key},q=>{q.resume();silent++}),two=https.createServer({cert,key},(q,r)=>{q.resume();good++;openai(r)}),pa=await proxy(t,await listen(t,one)),pb=await proxy(t,await listen(t,two)),h=await fixture(t,{deps:{networkRelayOptions:{tlsCa:cert,timeoutMs:500}}});await api(h);await routes(h,'api:local',[pa.url,pb.url]);assert.equal(await h.runtime.runTurn('worker','silence'),'hello world');assert.equal(silent,1);assert.equal(good,1);assert.equal(h.runtime.networkRelay.stats().find(r=>r.exit==='exit-0')!.silences,1);
 const bad=await fixture(t,{deps:{networkRelayOptions:{tlsCa:cert,timeoutMs:500}}});await api(bad);await routes(bad,'api:local',[pa.url,pa.url]);await assert.rejects(bad.runtime.runTurn('worker','all silent'));assert.equal(silent,3);assert.equal(bad.runtime.registry.get('worker')!.status,'uncertain');
});

for(const effect of ['text','tool'])test('22d: no automatic replay after '+effect+'; explicit next turn receives reserve',opts,async t=>{
 let requests=0;const target=http.createServer((q,r)=>{q.resume();requests++;r.writeHead(503);r.end()}),good=http.createServer((_q,r)=>r.end('ok')),pa=await proxy(t,await listen(t,target)),pb=await proxy(t,await listen(t,good)),fake=new FakeProvider(),h=await fixture(t,{deps:{providers:{claude:fake}}});await routes(h,'claude',[pa.url,pb.url]);let calls=0;
 fake.onRun=async(seat,_message,ctx)=>{calls++;ctx.modelStarted?.();if(effect==='text')ctx.publish({type:'delta',text:'already replied'});else await ctx.tools.readPane({pane:'worker',last_n:1});const text=await(await h.runtime.networkRelay.fetch('claude')('http://origin.invalid')).text();ctx.publish({type:'done',model:seat.model,sessionId:null,durationMs:1,usage:{input:null,output:null,cacheRead:null}});return {text,sessionId:null}};
 await assert.rejects(h.runtime.runTurn('worker','effect'),{code:'network_unavailable'});assert.equal(calls,1);assert.equal(requests,1);assert.equal(pb.connects.length,0);
 const turn=h.runtime.networkRelay.begin('claude','next',t.signal);t.after(()=>turn.close());assert.equal(await turn.run(async()=>await(await h.runtime.networkRelay.fetch('claude')('http://origin.invalid')).text()),'ok');assert.equal(turn.hop!.id,'exit-1');
});

test('22d: rotation is lazy by owner interval; concurrent turns stay pinned including new sockets and stable CLI endpoint',opts,async t=>{
 let now=0;const a=http.createServer((_q,r)=>{r.setHeader('connection','close');r.end('A')}),b=http.createServer((_q,r)=>{r.setHeader('connection','close');r.end('B')}),pa=await proxy(t,await listen(t,a)),pb=await proxy(t,await listen(t,b)),h=await fixture(t,{deps:{networkRelayOptions:{now:()=>now}}});await routes(h,'claude',[pa.url,pb.url],{mode:'rotation',rotationMinutes:1,silenceSeconds:60});const relay=h.runtime.networkRelay;
 const first=relay.begin('claude','pane-a',t.signal);t.after(()=>first.close());const env=await relay.environment('claude',t.signal,first);assert.equal(await through(env!.HTTP_PROXY!,'http://origin.invalid'),'A');now=61000;
 const second=relay.begin('claude','pane-b',t.signal);t.after(()=>second.close());assert.equal(await second.run(async()=>await(await relay.fetch('claude')('http://origin.invalid')).text()),'B');assert.equal(await through(env!.HTTP_PROXY!,'http://origin.invalid/again'),'A');now=65000;assert.ok(relay.stats().find(r=>r.exit==='exit-1')!.reserveMs!>=4000);
 await first.close();const next=relay.begin('claude','pane-a',t.signal);t.after(()=>next.close());const nextEnv=await relay.environment('claude',t.signal,next);assert.equal(env!.HTTP_PROXY,nextEnv!.HTTP_PROXY);assert.equal(await through(nextEnv!.HTTP_PROXY!,'http://origin.invalid'),'B');await next.close();await assert.rejects(through(nextEnv!.HTTP_PROXY!,'http://origin.invalid'));
});

test('22d: settings/country change during pinned turn refuses rather than switching or sending directly',opts,async t=>{
 const target=http.createServer((_q,r)=>r.end('ok')),p=await proxy(t,await listen(t,target)),h=await fixture(t,{deps:{networkRelayOptions:{timeoutMs:100}}});const checks=await routes(h,'claude',['http://127.0.0.1:1',p.url]);const turn=h.runtime.networkRelay.begin('claude','pinned',t.signal);t.after(()=>turn.close());await turn.ready();checks.get('exit-1')!.country='France';await assert.rejects(turn.run(async()=>await h.runtime.networkRelay.fetch('claude')('http://origin.invalid')),{code:'network_no_reserve'});assert.equal(p.connects.length,0);
});

test('22d: failed CONNECT automatically retries CLI, rejects late work from the old attempt and never reuses a failed exit',opts,async t=>{
 const rejecting=http.createServer();rejecting.on('connect',(_q,s)=>s.end('HTTP/1.1 503 Unavailable\r\nContent-Length: 0\r\n\r\n'));const rejectedPort=await listen(t,rejecting),good=http.createServer((_q,r)=>r.end('safe')),p=await proxy(t,await listen(t,good));
 const fake=new FakeProvider(),h=await fixture(t,{deps:{providers:{claude:fake}}});await routes(h,'claude',['http://127.0.0.1:'+rejectedPort,p.url]);let previous:typeof fake.calls[number]['ctx']|undefined;
 fake.onRun=async(seat,_text,ctx)=>{ctx.modelStarted?.();if(!previous)previous=ctx;else{await assert.rejects(previous.beforeModel!({provider:'claude',model:seat.model}),{code:'cancelled'});assert.deepEqual(await previous!.tools.send({to:'owner',kind:'note',text:'must not execute'}),{ok:false,code:'turn_ended',error:'ход не активен'});}const text=await through(ctx.env.HTTP_PROXY!,'http://origin.invalid');ctx.publish({type:'done',model:seat.model,sessionId:null,durationMs:1,usage:{input:null,output:null,cacheRead:null}});return {text,sessionId:null}};
 assert.equal(await h.runtime.runTurn('worker','connect'),'safe');assert.equal(fake.calls.length,2);assert.equal(fake.calls[0]!.ctx.env.HTTP_PROXY,fake.calls[1]!.ctx.env.HTTP_PROXY);assert.equal(p.connects.length,1);assert.equal((h.runtime.registry.get('worker')!.transcript.find(m=>m.role==='ai')!.network as any).reserve.from.id,'exit-0');
});

test('22d: partial API response followed by silence never retries; reasoning also counts as a response',opts,async t=>{
 for(const field of ['content','reasoning_content']){
  let second=0;const one=https.createServer({cert,key},(q,r)=>{q.resume();r.writeHead(200,{'content-type':'text/event-stream'});r.write('data: '+JSON.stringify({id:'test',object:'chat.completion.chunk',choices:[{index:0,delta:{[field]:'already started'},finish_reason:null}]})+'\n\n')}),two=https.createServer({cert,key},(q,r)=>{q.resume();second++;openai(r)}),pa=await proxy(t,await listen(t,one)),pb=await proxy(t,await listen(t,two)),h=await fixture(t,{deps:{networkRelayOptions:{tlsCa:cert}}});await api(h);await routes(h,'api:local',[pa.url,pb.url]);
  await assert.rejects(h.runtime.runTurn('worker','partial'),{code:'network_unavailable'});assert.equal(second,0);assert.equal(h.runtime.registry.get('worker')!.status,'uncertain');
 }
});

for(const cleanup of ['delayed','never'] as const)test('22d: approved probe waits for '+cleanup+' cleanup before safe retry',opts,async t=>{
 const deadline=cleanupDeadline(t),cleaning=deferred();const {sse}=await import('../../api/src/test-helpers.ts');const fake=new FakeProvider();fake.auth=async()=>({loggedIn:true,email:'fixture@example.test'});
 const catalog=new ProviderCatalog(builtinEntries({claude:fake},{},{execute:async()=>({code:0,signal:null,stdout:'1.0',stderr:''})}));const h=await fixture(t,{deps:{providers:{claude:fake},providerCatalog:catalog,networkRelayOptions:{settleTimeoutMs:deadline.timeoutMs}}});let release!:()=>void;const held=new Promise<void>(r=>release=r);t.after(()=>release());let busy=false;
 const bad=http.createServer();bad.on('connect',(_q,s)=>s.end('HTTP/1.1 503 Unavailable\r\nContent-Length: 0\r\n\r\n'));const good=http.createServer((_q,r)=>r.end('done')),p=await proxy(t,await listen(t,good));await routes(h,'claude',['http://127.0.0.1:'+await listen(t,bad),p.url]);
 fake.onRun=async(seat,_text,ctx)=>{assert.equal(busy,false);busy=true;ctx.modelStarted?.();try{const text=await through(ctx.env.HTTP_PROXY!,'http://origin.invalid');ctx.publish({type:'done',model:seat.model,sessionId:null,durationMs:1,usage:{input:1,output:1,cacheRead:0}});return {text,sessionId:null}}finally{if(fake.calls.length===1){cleaning.resolve();await held}busy=false}};
 const events=await sse(h.api,'owner');t.after(()=>events.close());const response=await call(h.api,'/api/providers/claude/probe',{body:{model:'w1'}});assert.equal(response.status,200,response.text);assert.equal(fake.calls.length,0);await call(h.api,'/api/approve',{body:{pane:'owner',id:response.body.approvalId,decision:'allow',project:h.dir}});
 await Promise.all([cleaning.promise,deadline.armed]);assert.equal(fake.calls.length,1);assert.equal(p.connects.length,0,'reserve waits for cleanup');if(cleanup==='never')deadline.expire();else release();
 await new Promise<void>((resolve,reject)=>{const match=()=>{if(events.frames.some(e=>e.type==='providers'&&e.event==='probe'&&['done','error'].includes(e.status))){clean();resolve()}},stop=()=>{clean();reject(Error('probe closed'))},clean=()=>{events.response.off('data',match);events.response.off('close',stop);t.signal.removeEventListener('abort',stop)};events.response.on('data',match);events.response.once('close',stop);t.signal.addEventListener('abort',stop,{once:true});match()});const terminal=events.frames.find(e=>e.type==='providers'&&e.event==='probe'&&['done','error'].includes(e.status));assert.equal(terminal.status,cleanup==='never'?'error':'done',JSON.stringify(terminal));assert.equal(fake.calls.length,cleanup==='never'?1:2);assert.equal(p.connects.length,cleanup==='never'?0:1);assert.equal(deadline.pending,false,'settled attempt clears its deadline');release();
});

test('22d: proxy authentication refusal does not trigger another exit or an automatic turn',opts,async t=>{
 const bad=http.createServer();let refused=0;bad.on('connect',(_q,s)=>{refused++;s.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n')});const good=http.createServer((_q,r)=>r.end('must not be used')),p=await proxy(t,await listen(t,good)),fake=new FakeProvider(),h=await fixture(t,{deps:{providers:{claude:fake}}});await routes(h,'claude',['http://127.0.0.1:'+await listen(t,bad),p.url]);
 fake.onRun=async(_seat,_text,ctx)=>{ctx.modelStarted?.();return {text:await through(ctx.env.HTTP_PROXY!,'http://origin.invalid'),sessionId:null}};await assert.rejects(h.runtime.runTurn('worker','auth'),{code:'network_proxy_auth'});assert.equal(fake.calls.length,1);assert.equal(refused,1);assert.equal(p.connects.length,0);assert.equal(h.runtime.networkRelay.stats().reduce((n,r)=>n+r.switches,0),0);
});

test('22d: completed API request does not count tool time as network silence',opts,async t=>{
 const target=http.createServer((_q,r)=>r.end('complete')),p=await proxy(t,await listen(t,target)),h=await fixture(t);await routes(h,'claude',[p.url]);const turn=h.runtime.networkRelay.begin('claude','tool-time',t.signal);t.after(()=>turn.close());await turn.run(async()=>{const fetcher=h.runtime.networkRelay.fetch('claude');assert.equal(await(await fetcher('http://origin.invalid')).text(),'complete');await new Promise<void>(resolve=>setTimeout(resolve,1100));assert.equal(turn.failure,undefined);assert.equal(await(await fetcher('http://origin.invalid')).text(),'complete')});assert.equal(h.runtime.networkRelay.stats().reduce((n,r)=>n+r.silences,0),0);
});

import {ClaudeProvider} from '../../providers/src/claude.ts';

for(const partial of ['none','thinking','assistant-text','initial-block','tool-json']) test('Claude '+partial+' already received must prevent automatic replay',opts,async t=>{
 const bad=http.createServer((_q,r)=>{r.writeHead(503);r.end()}),good=http.createServer((_q,r)=>r.end('safe')),pa=await proxy(t,await listen(t,bad)),pb=await proxy(t,await listen(t,good));let calls=0;
 const provider=new ClaudeProvider({findBinary:async()=>'/fake/claude',authStatus:async()=>({loggedIn:true}),env:{},queryFn:((args:any)=>{
  const n=++calls;const gen=(async function*(){yield {type:'system',subtype:'init',session_id:'fixture-session'};
   if(n===1){
    if(partial==='thinking')yield {type:'stream_event',session_id:'fixture-session',event:{type:'content_block_delta',delta:{type:'thinking_delta',thinking:'already-reasoned'}}};
    else if(partial==='initial-block')yield {type:'stream_event',session_id:'fixture-session',event:{type:'content_block_start',content_block:{type:'text',text:'initial'}}};
    else if(partial==='tool-json')yield {type:'stream_event',session_id:'fixture-session',event:{type:'content_block_delta',delta:{type:'input_json_delta',partial_json:'{'}}};
    else if(partial==='assistant-text') yield {type:'assistant',session_id:'fixture-session',message:{content:[{type:'text',text:'already-replied'}]}};
    await through(args.options.env.HTTP_PROXY,'http://origin.invalid');
   }
   yield {type:'result',subtype:'success',is_error:false,session_id:'fixture-session',result:'replayed',duration_ms:1,usage:{input_tokens:1,output_tokens:1}};
  })();return Object.assign(gen,{interrupt:async()=>{},close:()=>{},streamInput:async()=>{}});
 }) as any});
 let invocations=0;const run=provider.runTurn.bind(provider);provider.runTurn=(...args)=>{invocations++;return run(...args)};const h=await fixture(t,{deps:{providers:{claude:provider}}});await routes(h,'claude',[pa.url,pb.url]);let outcome;try{outcome=await h.runtime.runTurn('worker','must not replay')}catch(e){outcome=(e as any).code}
 if(partial==='none'){assert.equal(outcome,'replayed','safe retry waits for prior provider cleanup');assert.equal(calls,2)}else{assert.equal(invocations,1,'first model response prevents any second attempt');assert.equal(h.runtime.registry.get('worker')!.status,'uncertain')}
});

for(const settle of ['delayed','never'] as const)test('22d: provider cleanup '+settle+' completes before retry or stops with a card',opts,async t=>{
 const deadline=cleanupDeadline(t);const bad=http.createServer((_q,r)=>{r.writeHead(503);r.end()}),good=http.createServer((_q,r)=>r.end('safe')),pa=await proxy(t,await listen(t,bad)),pb=await proxy(t,await listen(t,good)),fake=new FakeProvider();
 const h=await fixture(t,{deps:{providers:{claude:fake},networkRelayOptions:{settleTimeoutMs:deadline.timeoutMs}}});await routes(h,'claude',[pa.url,pb.url]);
 let release!:()=>void,entered!:()=>void,busy=false;const cleanup=new Promise<void>(r=>release=r),cleaning=new Promise<void>(r=>entered=r);t.after(()=>release());
 fake.onRun=async(_seat,_text,ctx)=>{assert.equal(busy,false,'previous attempt must release the seat');busy=true;ctx.modelStarted?.();try{return {text:await through(ctx.env.HTTP_PROXY!,'http://origin.invalid'),sessionId:null}}finally{if(fake.calls.length===1){entered();await cleanup}busy=false}};
 const run=h.runtime.runTurn('worker','cleanup'),outcome=run.then(text=>({text}),e=>({error:e}));await Promise.all([cleaning,deadline.armed]);assert.equal(fake.calls.length,1);assert.equal(pb.connects.length,0);
 if(settle==='delayed'){release();assert.deepEqual(await outcome,{text:'safe'});assert.equal(fake.calls.length,2)}else{deadline.expire();const value=await outcome;assert.ok('error'in value);assert.equal(value.error.code,'network_unavailable');assert.match(value.error.message,/не подтвердила завершение/);assert.equal(fake.calls.length,1);assert.equal(pb.connects.length,0);assert.equal(h.runtime.registry.get('worker')!.status,'uncertain');release();await cleanup}assert.equal(deadline.pending,false);
});
