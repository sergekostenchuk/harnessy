import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {execFile} from 'node:child_process';
import {fixture,call,deferred,FakeProvider,sse} from '../../api/src/test-helpers.ts';
import {MemoryKeys,config as apiConfig,openai,collect,prompt} from '../../llm/src/test-helpers.ts';
import {CLI_DESCRIPTORS,ProviderCatalog,builtinEntries} from '@harnessy/providers';
import {listen,proxy,socks,through} from './network-test-helpers.ts';
const cert=readFileSync(new URL('./fixtures/network-test-cert.pem',import.meta.url),'utf8'),key=readFileSync(new URL('./fixtures/network-test-key.pem',import.meta.url),'utf8');
const opts={timeout:20000},signal=()=>new AbortController().signal;
async function save(h:Awaited<ReturnType<typeof fixture>>,id:string,url:string,type='proxy'){return call(h.api,'/api/network/exits/'+id+'/save',{body:{config:{id,label:id,type,...(type==='proxy'?{url}:{})},revision:null}})}
async function chain(h:Awaited<ReturnType<typeof fixture>>,provider:string,exits:string[]){return h.runtime.settings.changeNetwork(async config=>{config.migrated=true;config.chains[provider]=exits;return {result:undefined}})}

test('22c: one listener per provider, HTTP and CONNECT forwarding, remote DNS, accounting and new-connection switching',opts,async t=>{
 const h=await fixture(t,{deps:{networkKeys:new MemoryKeys(),networkRelayOptions:{timeoutMs:1000}}}),relay=h.runtime.networkRelay;
 const target=http.createServer((_req,res)=>{res.setHeader('Connection','close');res.end('local-fixture-response')}),port=await listen(t,target),a=await proxy(t,port),b=await socks(t,port);await save(h,'first',a.url);await save(h,'second',b.url);await chain(h,'claude',['first']);
 const env=await relay.environment('claude',signal());assert.ok(env);assert.match(env.HTTP_PROXY!,/^http:\/\/harnessy:[A-Za-z0-9_-]{43}@127\.0\.0\.1:\d+$/);assert.equal(await through(env.HTTP_PROXY!,'http://origin.invalid/first'),'local-fixture-response');assert.equal(a.connects.length,1);assert.equal(a.connects[0]!.url,'origin.invalid:80');
 const response=await relay.fetch('claude')('http://origin.invalid/connect');assert.equal(await response.text(),'local-fixture-response');assert.equal(a.connects.length,2);
 await chain(h,'claude',['second']);const next=await relay.environment('claude',signal());assert.equal(next!.HTTP_PROXY,env.HTTP_PROXY);assert.equal(await through(next!.HTTP_PROXY!,'http://another.invalid/new'),'local-fixture-response');assert.deepEqual(b.hosts,['another.invalid']);
 const stats=relay.stats();assert.ok(stats.every(row=>row.bytesDown>0&&row.bytesUp>0&&row.connectMs>=0&&row.durationMs>=0));assert.equal(stats.reduce((n,r)=>n+r.connections,0),3);assert.equal((await relay.status('claude')).verification,'verified');
 await h.runtime.project.trace.flush();const trace=await call(h.api,'/api/trace');assert.match(trace.text,/network.connection/);assert.doesNotMatch(trace.text,/origin.invalid|another.invalid/);
});

test('22c: no implicit direct; unavailable chain refuses before a program starts with durable retry/skip card',opts,async t=>{
 let requests=0;const fake=new FakeProvider();const h=await fixture(t,{deps:{providers:{claude:fake},networkRelayOptions:{timeoutMs:100}}});await chain(h,'claude',[]);
 await assert.rejects(h.runtime.runTurn('worker','must not start'),{code:'network_unavailable'});assert.equal(fake.calls.length,0);assert.equal(h.runtime.registry.get('worker')!.status,'uncertain');
 const status=await call(h.api,'/api/status');assert.match(status.text,/network_unavailable/);assert.match(status.text,/retry/);assert.match(status.text,/skip/);
 const local=http.createServer((_req,res)=>{requests++;res.end('local')});const port=await listen(t,local);assert.equal(await (await h.runtime.networkRelay.fetch('claude')('http://127.0.0.1:'+port)).text(),'local');assert.equal(requests,1);
 await assert.rejects(h.runtime.networkRelay.fetch('claude')('http://origin.invalid/'),{code:'network_unavailable'});
 await save(h,'dead','http://127.0.0.1:1');await chain(h,'claude',['dead']);await assert.rejects(h.runtime.networkRelay.environment('claude',signal()),{code:'network_unavailable'});
});

test('22c: failed first proxy selects next; password stays in upstream auth, never listener URL, origin or trace',opts,async t=>{
 const requests:http.IncomingHttpHeaders[]=[],target=http.createServer((req,res)=>{requests.push(req.headers);res.end('ok')}),port=await listen(t,target),key='ProxySecretFixture',p=await proxy(t,port,'Basic '+Buffer.from('alice:'+key).toString('base64'));
 const h=await fixture(t,{deps:{networkKeys:new MemoryKeys(),networkRelayOptions:{timeoutMs:100}}});await save(h,'dead','http://127.0.0.1:1');const saved=await call(h.api,'/api/network/exits/good/save',{body:{config:{id:'good',label:'Good',type:'proxy',url:p.url,login:'alice'},password:key,revision:null}});assert.equal(saved.status,200);await chain(h,'claude',['dead','good']);
 const env=await h.runtime.networkRelay.environment('claude',signal());assert.doesNotMatch(JSON.stringify(env),/ProxySecretFixture|alice/);const value=await h.runtime.networkRelay.fetch('claude')('http://origin.invalid/',{headers:{Authorization:'Bearer ModelKeyFixture'}});assert.equal(await value.text(),'ok');assert.equal(p.connects[0]!.headers.authorization,undefined);assert.equal(requests[0]!.authorization,'Bearer ModelKeyFixture');assert.equal(requests[0]!['proxy-authorization'],undefined);
 await h.runtime.project.trace.flush();assert.doesNotMatch((await call(h.api,'/api/trace')).text,/ProxySecretFixture|ModelKeyFixture|alice|Basic/);assert.ok(h.runtime.networkRelay.stats().find(row=>row.exit==='dead')!.errors>0);
});

test('22c: changed settings during password await refuse old connection; SSH port uses declared tunnel interface',opts,async t=>{
 const entered=deferred(),release=deferred();t.after(()=>release.resolve());const keys=new MemoryKeys(),h=await fixture(t,{deps:{networkKeys:keys,networkRelayOptions:{timeoutMs:100}}});await call(h.api,'/api/network/exits/slow/save',{body:{config:{id:'slow',label:'Slow',type:'proxy',url:'http://127.0.0.1:1'},password:'fixture',revision:null}});await chain(h,'claude',['slow']);
 const resolve=keys.resolveKey.bind(keys);keys.resolveKey=async id=>{entered.resolve();await release.promise;return resolve(id)};
 const preparing=h.runtime.networkRelay.environment('claude',signal()),rejected=assert.rejects(preparing,{code:'network_unavailable'});await entered.promise;await chain(h,'claude',[]);release.resolve();await rejected;
 const target=http.createServer((_q,r)=>r.end('ssh')),port=await listen(t,target),p=await socks(t,port),calls:string[]=[];
 const other=await fixture(t,{deps:{sshTunnels:{ensure:async id=>{calls.push(id);return {id,state:'up',url:p.url,generation:1,code:null,reason:null,retryAt:null}},get:()=>null,subscribe:()=>()=>false,snapshots:()=>[],stop:async()=>{},close:async()=>{}},networkRelayOptions:{timeoutMs:1000}}});
 await other.runtime.settings.changeNetwork(async config=>{config.migrated=true;config.exits.ssh={id:'ssh',label:'SSH',type:'ssh',host:'vps.test',port:22,user:'owner',keyPath:'~/.ssh/key'};config.chains.claude=['ssh'];return {result:undefined}});
 assert.equal(await (await other.runtime.networkRelay.fetch('claude')('http://ssh-origin.invalid/')).text(),'ssh');assert.deepEqual(p.hosts,['ssh-origin.invalid']);assert.ok(calls.length>=1);
});

test('22c: every program catalog id receives the relay; real Node http and fetch children count CONNECT without model calls',opts,async t=>{
 const target=http.createServer((_q,r)=>{r.setHeader('Connection','close');r.end('node')}),port=await listen(t,target),p=await proxy(t,port),h=await fixture(t,{deps:{networkRelayOptions:{timeoutMs:1000}}});await save(h,'proxy',p.url);
 for(const id of ['claude','codex',...CLI_DESCRIPTORS.map(d=>d.id)]){
  // Configure catalog ids directly so no installed program, login or model is queried.
  await h.runtime.settings.changeNetwork(async config=>{config.migrated=true;config.chains[id]=['proxy'];return {result:undefined}});
  assert.equal((await h.runtime.networkRelay.status(id)).verification,'unverified');const env=await h.runtime.networkRelay.environment(id,signal());assert.equal(new URL(env!.HTTPS_PROXY!).username,'harnessy');assert.match(new URL(env!.HTTPS_PROXY!).password,/^[A-Za-z0-9_-]{43}$/);const before=p.connects.length;
  const script="const http=require('node:http');http.get('http://fixture.invalid/agent',r=>{r.resume();r.on('end',async()=>{console.log(await(await fetch('http://fixture.invalid/fetch')).text());process.exit(0)})}).on('error',e=>{console.error(e);process.exit(1)});";
  const result=await new Promise<string>((resolve,reject)=>execFile(process.execPath,['-e',script],{env:{...process.env,...env},timeout:5000},(error,out)=>error?reject(error):resolve(out)));assert.equal(result.trim(),'node',id);assert.equal(p.connects.length-before,2,id);assert.equal((await h.runtime.networkRelay.status(id)).verification,'verified');
 }
});


test('22c r2: every CLI id accepts authenticated HTTPS_PROXY in Node https and fetch doubles',opts,async t=>{
 const target=https.createServer({cert,key},(_q,r)=>{r.setHeader('Connection','close');r.end('secure-node')}),port=await listen(t,target),p=await proxy(t,port),h=await fixture(t,{deps:{networkRelayOptions:{timeoutMs:1000}}});await save(h,'proxy',p.url);
 for(const id of ['claude','codex',...CLI_DESCRIPTORS.map(d=>d.id)]){
  await chain(h,id,['proxy']);const env=await h.runtime.networkRelay.environment(id,t.signal),before=p.connects.length;
  const script="const https=require('node:https');https.get('https://api-origin.invalid/agent',r=>{r.resume();r.on('end',async()=>{try{console.log(await(await fetch('https://api-origin.invalid/fetch')).text());process.exit(0)}catch{process.exit(1)}})}).on('error',()=>process.exit(1));";
  const output=await new Promise<string>((resolve,reject)=>execFile(process.execPath,['-e',script],{env:{...process.env,...env,NODE_EXTRA_CA_CERTS:fileURLToPath(new URL('./fixtures/network-test-cert.pem',import.meta.url))},timeout:5000},(error,out)=>error?reject(error):resolve(out)));
  assert.equal(output.trim(),'secure-node',id);assert.equal(p.connects.length-before,2,id);assert.equal((await h.runtime.networkRelay.status(id)).verification,'verified');assert.ok(p.connects.every(c=>c.headers['proxy-authorization']===undefined));
 }
});

test('22c: API stream, saved and draft discovery use the same relay, keep credentials at origin, and fail closed',opts,async t=>{
 const observed:{path:string;auth:unknown}[]=[],target=https.createServer({cert,key},(req,res)=>{observed.push({path:req.url!,auth:req.headers.authorization});req.resume();if(req.url!.endsWith('/models')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'test-model'}]}))}else openai(res)}),port=await listen(t,target),p=await proxy(t,port);
 const h=await fixture(t,{deps:{llmKeys:new MemoryKeys(),networkRelayOptions:{timeoutMs:1000,tlsCa:cert}}}),config={...apiConfig('https://api-origin.invalid/v1'),keyRef:'local'};
 assert.equal((await call(h.api,'/api/llm/providers/local/save',{body:{config,secret:'ModelKeyFixture',revision:null}})).status,200);await save(h,'relay',p.url);await chain(h,'api:local',['relay']);
 for(const path of ['/api/llm/providers/local/discover','/api/llm/providers/discover']){const r=await call(h.api,path,{body:path.endsWith('/local/discover')?{}:{id:'local',config}});assert.equal(r.status,200,r.text);assert.equal(r.body.models[0].id,'test-model')}
 const answer=await collect(h.runtime.llm,prompt);assert.equal(answer.finish.reason,'stop');assert.equal(observed.length,3);assert.ok(observed.every(r=>r.auth==='Bearer ModelKeyFixture'));assert.ok(p.connects.length>=1);assert.ok(p.connects.every(r=>r.headers.authorization===undefined));
 assert.equal((await call(h.api,'/api/panes/worker',{body:{vendor:'api:local',model:'test-model'}})).status,200);const seat=h.runtime.registry.get('worker')!,settings=seat.settings();await chain(h,'api:local',[]);
 await assert.rejects(h.runtime.runTurn('worker','blocked'),{code:'network_unavailable'});assert.equal(observed.length,3);assert.deepEqual(seat.settings(),settings);assert.equal(seat.status,'uncertain');assert.match((await call(h.api,'/api/status')).text,/network_unavailable/);
 const denied=await collect(h.runtime.llm,prompt);assert.equal(denied.finish.failure?.code,'network_unavailable');assert.equal(denied.finish.failure?.retryable,false);
 await h.runtime.project.trace.flush();assert.doesNotMatch((await call(h.api,'/api/trace')).text,/ModelKeyFixture/);
});

test('22c: approved CLI probe with no exit never calls the provider, reports reason in card and trace',opts,async t=>{
 const fake=new FakeProvider();fake.auth=async()=>({loggedIn:true,email:'fixture@example.test'});const h=await fixture(t,{deps:{providers:{claude:fake},providerCatalog:new ProviderCatalog(builtinEntries({claude:fake},{},{execute:async()=>({code:0,signal:null,stdout:'fixture 1.0',stderr:''})}))}});await chain(h,'claude',[]);const stream=await sse(h.api,'owner');t.after(()=>stream.close());
 const probe=await call(h.api,'/api/providers/claude/probe',{body:{model:'w1'}});assert.equal(probe.status,200,probe.text);await call(h.api,'/api/approve',{body:{pane:'owner',id:probe.body.approvalId,decision:'allow',project:h.dir}});
 await new Promise<void>((resolve,reject)=>{const match=()=>{if(stream.frames.some(e=>e.type==='providers'&&e.event==='probe'&&e.status==='error')){cleanup();resolve()}},stop=()=>{cleanup();reject(Error('probe transport closed'))},cleanup=()=>{stream.response.off('data',match);stream.response.off('close',stop);t.signal.removeEventListener('abort',stop)};stream.response.on('data',match);stream.response.once('close',stop);t.signal.addEventListener('abort',stop,{once:true});match()});const result=stream.frames.find(e=>e.type==='providers'&&e.event==='probe'&&e.status==='error');assert.equal(result.error.code,'network_unavailable');assert.equal(fake.calls.length,0);await h.runtime.project.trace.flush();assert.match((await call(h.api,'/api/trace')).text,/network_unavailable/);
});

test('22c: HTTPS upstream proxy verifies its certificate; no plaintext fallback on TLS refusal',opts,async t=>{
 const target=http.createServer((_q,r)=>r.end('secure-proxy')),port=await listen(t,target),p=await proxy(t,port,undefined,{cert,key});
 const good=await fixture(t,{deps:{networkRelayOptions:{timeoutMs:1000,tlsCa:cert}}});await save(good,'secure',p.url);await chain(good,'claude',['secure']);assert.equal(await(await good.runtime.networkRelay.fetch('claude')('http://origin.invalid/')).text(),'secure-proxy');assert.equal(p.connects.length,1);
 const bad=await fixture(t,{deps:{networkRelayOptions:{timeoutMs:1000}}});await save(bad,'secure',p.url);await chain(bad,'claude',['secure']);await assert.rejects(bad.runtime.networkRelay.fetch('claude')('http://origin.invalid/'),{code:'network_unavailable'});assert.equal(p.connects.length,1);
});

test('22c: silent SOCKS handshake times out, abort and close release pending connections',opts,async t=>{
 const hang=net.createServer(),port=await listen(t,hang),h=await fixture(t,{deps:{networkRelayOptions:{timeoutMs:80}}});await save(h,'silent','socks5h://127.0.0.1:'+port);await chain(h,'claude',['silent']);
 await assert.rejects(h.runtime.networkRelay.prepare('claude',t.signal),{code:'network_unavailable'});
 const controller=new AbortController(),pending=h.runtime.networkRelay.prepare('claude',controller.signal),rejected=assert.rejects(pending,{code:'cancelled'});controller.abort();await rejected;
 const last=h.runtime.networkRelay.prepare('claude',t.signal),closed=assert.rejects(last,{code:'network_unavailable'});await h.runtime.networkRelay.close();await closed;await assert.rejects(h.runtime.networkRelay.prepare('claude',t.signal),{code:'network_unavailable'});
});

test('22c: explicit direct is allowed; malformed proxy requests cannot choose an implicit direct fallback',opts,async t=>{
 let calls=0;const target=http.createServer((_q,r)=>{calls++;r.end('explicit-direct')}),port=await listen(t,target),h=await fixture(t);await save(h,'direct','', 'direct');await chain(h,'claude',['direct']);
 const env=await h.runtime.networkRelay.environment('claude',t.signal);assert.equal(await through(env!.HTTP_PROXY!,'http://127.0.0.1:'+port+'/'),'explicit-direct');assert.equal(calls,1);
 const request=(path:string)=>new Promise<number>((resolve,reject)=>{const req=http.request(env!.HTTP_PROXY!,{path,method:'CONNECT',headers:{'Proxy-Authorization':'Basic '+Buffer.from('harnessy:'+new URL(env!.HTTP_PROXY!).password).toString('base64')}},res=>resolve(res.statusCode!));req.on('connect',(res,s)=>{s.destroy();resolve(res.statusCode!)});req.on('error',reject);req.end()});
 assert.equal(await request('name:80/escape'),502);assert.equal(calls,1);await chain(h,'claude',[]);await assert.rejects(through(env!.HTTP_PROXY!,'http://127.0.0.1:'+port+'/'));assert.equal(calls,1);
});

test('22c: SOCKS5 username/password negotiation succeeds only with the captured credential generation',opts,async t=>{
 const target=http.createServer((_q,r)=>r.end('socks-auth')),port=await listen(t,target),p=await socks(t,port,{login:'alice',password:'FixtureProxyPass'}),h=await fixture(t,{deps:{networkKeys:new MemoryKeys(),networkRelayOptions:{timeoutMs:1000}}});
 const cfg={id:'socks',label:'Socks',type:'proxy',url:p.url,login:'alice'},saved=await call(h.api,'/api/network/exits/socks/save',{body:{config:cfg,password:'FixtureProxyPass',revision:null}});assert.equal(saved.status,200,saved.text);await chain(h,'claude',['socks']);
 assert.equal(await(await h.runtime.networkRelay.fetch('claude')('http://domain.invalid/')).text(),'socks-auth');assert.deepEqual(p.hosts,['domain.invalid']);assert.ok(p.auth.every(a=>a.login==='alice'&&a.password==='FixtureProxyPass'));
 const updated=await call(h.api,'/api/network/exits/socks/save',{body:{config:cfg,password:'WrongFixturePass',revision:saved.body.revision}});assert.equal(updated.status,200,updated.text);await assert.rejects(h.runtime.networkRelay.prepare('claude',t.signal),{code:'network_unavailable'});assert.equal(p.hosts.length,1);
 await h.runtime.project.trace.flush();assert.doesNotMatch((await call(h.api,'/api/trace')).text,/FixtureProxyPass|WrongFixturePass|alice/);
});

test('22c: adding a chain while a previously direct program awaits startup cannot launch it with old env',opts,async t=>{
 const entered=deferred(),release=deferred(),fake=new FakeProvider();t.after(()=>release.resolve());let starts=0;
 fake.runTurn=async(seat,message,ctx)=>{entered.resolve();await release.promise;await ctx.beforeModel?.({provider:seat.vendor,model:seat.model});starts++;return {text:'bad',sessionId:null}};
 const h=await fixture(t,{deps:{providers:{claude:fake}}}),run=h.runtime.runTurn('worker','pending start'),denied=assert.rejects(run,{code:'network_unavailable'});await entered.promise;await save(h,'direct','','direct');await chain(h,'claude',['direct']);release.resolve();await denied;assert.equal(starts,0);assert.equal(h.runtime.registry.get('worker')!.status,'uncertain');
});


test('22c: cancellation during route preparation does not leave a failed-turn decision card',opts,async t=>{
 const entered=deferred(),release=deferred();t.after(()=>release.resolve());const keys=new MemoryKeys(),h=await fixture(t,{deps:{networkKeys:keys}});await call(h.api,'/api/network/exits/proxy/save',{body:{config:{id:'proxy',label:'Proxy',type:'proxy',url:'http://127.0.0.1:1'},password:'fixture',revision:null}});await chain(h,'claude',['proxy']);
 keys.resolveKey=async()=>{entered.resolve();await release.promise;return 'fixture'};
 const run=h.runtime.runTurn('worker','cancel before model'),cancelled=assert.rejects(run,{code:'cancelled'});await entered.promise;h.runtime.cancelTurn('worker','fixture cancel');await cancelled;release.resolve();assert.equal(h.provider.calls.length,0);assert.notEqual(h.runtime.registry.get('worker')!.status,'uncertain');
});

test('22c: an API route named ollama uses api:ollama chain, never the daemon chain',opts,async t=>{
 let contacts=0;const port=await listen(t,net.createServer(s=>{contacts++;s.destroy()})),h=await fixture(t);await save(h,'daemon-chain','http://127.0.0.1:'+port);await call(h.api,'/api/llm/providers/ollama',{body:{config:apiConfig('https://api-origin.invalid/v1')}});await chain(h,'api:ollama',[]);await chain(h,'ollama',['daemon-chain']);
 const result=await collect(h.runtime.llm,{...prompt,provider:'ollama'});assert.equal(result.finish.failure?.code,'network_unavailable');assert.equal(result.finish.failure?.retryable,false);assert.equal(h.runtime.networkRelay.stats().length,0);assert.equal(contacts,0);
});
