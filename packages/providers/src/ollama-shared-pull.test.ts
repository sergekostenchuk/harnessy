import test from 'node:test';
import assert from 'node:assert/strict';
import {realpathSync} from 'node:fs';
import {OllamaModels,OLLAMA_URL,OLLAMA_CLOUD_URL} from './ollama-models.ts';
import {OllamaProvider} from './ollama.ts';
import {cliFixture} from './cli/test-support.ts';
import {ollamaTurnProvider} from './ollama-test-helpers.ts';
const budget={timeout:8000};
const deferred=<T=void>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve}};
interface Pull {model:string;signal:AbortSignal;complete(ok?:boolean):void;aborted:boolean}
function daemon(){
 const models=new Set<string>(),pulls:Pull[]=[],waiting:(()=>void)[]=[];let calls=0,tagCalls=0,holdTags=false;const tags=deferred();
 const fetcher:typeof fetch=async(url,init)=>{
  calls++;const address=String(url);if(address===OLLAMA_URL+'/api/version')return Response.json({version:'0.40.2'});
  if(address===OLLAMA_CLOUD_URL)return Response.json({models:[{name:'alpha'},{name:'beta'}]});
  if(address===OLLAMA_URL+'/api/tags'){tagCalls++;if(holdTags)await tags.promise;return Response.json({models:[...models].map(name=>({name}))})}
  assert.equal(address,OLLAMA_URL+'/api/pull');assert.equal(init?.method,'POST');const input=JSON.parse(init!.body as string);assert.deepEqual(input,{model:input.model,stream:false});assert.ok(['alpha:cloud','beta:cloud'].includes(input.model));
  return new Promise<Response>((resolve,reject)=>{
   const signal=init!.signal as AbortSignal;const pull:Pull={model:input.model,signal,aborted:false,complete(ok=true){signal.removeEventListener('abort',abort);if(ok)models.add(input.model);resolve(ok?Response.json({status:'success'}):new Response('SECRET',{status:503}))}};
   const abort=()=>{pull.aborted=true;reject(new DOMException('Aborted','AbortError'))};if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});pulls.push(pull);for(const notify of waiting.splice(0))notify();
  });
 };
 async function count(n:number){while(pulls.length<n)await new Promise<void>(resolve=>waiting.push(resolve))}
 return {fetcher,pulls,count,get calls(){return calls},get tagCalls(){return tagCalls},hold(){holdTags=true},release(){holdTags=false;tags.resolve()},finish(){for(const pull of pulls)if(!pull.aborted)pull.complete()}};
}

test('348: two provider turns share one missing-model operation and start twice after one pull',budget,async t=>{
 const d=daemon(),f=await cliFixture(t,'probe');let turns=0;
 const p=ollamaTurnProvider(new OllamaProvider({temporaryDirectory:f.dir,env:{},fetch:d.fetcher}),async(url)=>{assert.equal(String(url),OLLAMA_URL+'/v1/chat/completions');turns++;const body={id:'fixture',object:'chat.completion.chunk',model:'alpha:cloud',created:1,choices:[{index:0,delta:{role:'assistant',content:'ready'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}};return new Response('data: '+JSON.stringify(body)+'\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}})});t.after(()=>{d.finish();return p.close()});
 const seat={...f.seat,vendor:'ollama',model:'alpha:cloud',cwd:realpathSync(f.dir)};const a=p.runTurn({...seat,id:'first'},'one',f.ctx),b=p.runTurn({...seat,id:'second'},'two',f.ctx);const both=Promise.all([a,b]);await d.count(1);assert.equal(turns,0);d.pulls[0]!.complete();await both;assert.equal(d.pulls.length,1);assert.equal(turns,2);
});

for(const cancelled of [0,1])test('348: cancelling subscriber '+cancelled+' keeps the shared request for the other subscriber',budget,async t=>{
 const d=daemon();t.after(()=>d.finish());const m=new OllamaModels(d.fetcher,1000),signals=[new AbortController(),new AbortController()];
 const work=signals.map(s=>m.prepare('alpha:cloud',s.signal));const rejected=assert.rejects(work[cancelled]!,{code:'cancelled'});await d.count(1);signals[cancelled]!.abort();await rejected;assert.equal(d.pulls[0]!.aborted,false);d.pulls[0]!.complete();await work[1-cancelled];assert.equal(d.pulls.length,1);
});

test('348: cancelling the last subscriber aborts the fetch; a later turn can retry with a new request',budget,async t=>{
 const d=daemon();t.after(()=>d.finish());const m=new OllamaModels(d.fetcher,1000),first=new AbortController(),second=new AbortController();
 const a=assert.rejects(m.prepare('alpha:cloud',first.signal),{code:'cancelled'}),b=assert.rejects(m.prepare('alpha:cloud',second.signal),{code:'cancelled'});await d.count(1);first.abort();await a;assert.equal(d.pulls[0]!.aborted,false);second.abort();await b;assert.equal(d.pulls[0]!.aborted,true);
 const retry=m.prepare('alpha:cloud',t.signal);await d.count(2);assert.notEqual(d.pulls[0]!.signal,d.pulls[1]!.signal);d.pulls[1]!.complete();await retry;assert.equal(d.pulls.length,2);
});

test('348: one failure reaches all waiters with its reason and leaves the model retryable',budget,async t=>{
 const d=daemon();t.after(()=>d.finish());const m=new OllamaModels(d.fetcher,1000);let reason='';const failure=(e:any)=>{assert.equal(e.code,'transport_lost');assert.match(e.vendorText,/HTTP 503/);assert.doesNotMatch(e.vendorText,/SECRET/);if(reason)assert.equal(e.vendorText,reason);reason=e.vendorText;return true};
 const a=assert.rejects(m.prepare('alpha:cloud',t.signal),failure),b=assert.rejects(m.prepare('alpha:cloud',t.signal),failure);await d.count(1);d.pulls[0]!.complete(false);await Promise.all([a,b]);assert.equal(d.pulls.length,1);
 const retry=m.prepare('alpha:cloud',t.signal);await d.count(2);d.pulls[1]!.complete();await retry;assert.equal(d.pulls.length,2);
});

test('348: the shared operation covers the absence check too, and already-cancelled input starts nothing',budget,async t=>{
 const d=daemon();t.after(()=>{d.release();d.finish()});const m=new OllamaModels(d.fetcher,1000),stop=new AbortController();stop.abort();await assert.rejects(m.prepare('alpha:cloud',stop.signal),{code:'cancelled'});assert.equal(d.calls,0);
 d.hold();const a=m.prepare('alpha:cloud',t.signal),b=m.prepare('alpha:cloud',t.signal);await Promise.resolve();await Promise.resolve();assert.equal(d.tagCalls,1);assert.equal(d.pulls.length,0);d.release();await d.count(1);d.pulls[0]!.complete();await Promise.all([a,b]);assert.equal(d.pulls.length,1);
});

test('348: distinct model operations do not share cancellation or results',budget,async t=>{
 const d=daemon();t.after(()=>d.finish());const m=new OllamaModels(d.fetcher,1000),stop=new AbortController();const a=assert.rejects(m.prepare('alpha:cloud',stop.signal),{code:'cancelled'}),b=m.prepare('beta:cloud',t.signal);await d.count(2);stop.abort();await a;const beta=d.pulls.find(p=>p.model==='beta:cloud')!;assert.equal(beta.aborted,false);beta.complete();await b;assert.equal(d.pulls.length,2);
});
