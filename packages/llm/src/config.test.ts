import test from 'node:test';
import assert from 'node:assert/strict';
import {validateResolvedRoutes,routeModels,catalogProviders} from './catalog.ts';
import {createLlmService} from './service.ts';
import {config,endpoint,collect,prompt,openai} from './test-helpers.ts';
const options={timeout:10000};
test('catalog routes need no network; custom models and overrides resolve every field without ambient credentials',options,async()=>{
 const route={catalog:'anthropic',keyRef:'anthropic',modelOverrides:{}};const routes=validateResolvedRoutes({anthropic:route});const native=routeModels('anthropic',routes.anthropic!);assert.ok(native.length>0);const id=native[0]!.id;
 const overridden=validateResolvedRoutes({sample:{catalog:'anthropic',modelOverrides:{[id]:{name:'Alias',contextWindow:64000,maxTokens:3000,reasoning:false}}}});const svc=createLlmService({routes:()=>overridden,resolveKey:async()=>{throw Error()},fetch:async()=>{throw Error('network forbidden')}});assert.equal(svc.models('sample').find(m=>m.id===id)?.name,'Alias');assert.equal((await svc.discover('sample')).length,native.length);assert.ok(catalogProviders().includes('openai'));assert.equal(routeModels('custom',config('http://127.0.0.1:8000/v1'))[0]!.api,'openai-completions');
});
test('strict writes reject secrets, foreign key references, invalid protocols, unsupported switches and ill-formed limits',options,()=>{
 const base=config('https://example.test/v1');const mutations:any[]=[{apiKey:'forbidden'},{headers:{Authorization:'forbidden'}},{keyRef:'other'},{api:'openai-codex-responses'},{baseURL:'https://user:password@example.test/v1'},{baseURL:'https://example.test/?api_key=forbidden'},{baseURL:'file:///tmp/file'},{timeoutMs:0},{defaultMaxTokens:-1},{models:[{id:'a',contextWindow:100,maxTokens:101}]},{models:[{id:'a'},{id:'a'}]},{models:[{id:'a',unexpected:true}]},{reasoningEfforts:{magic:'anything'}},{compat:{supportsFoo:true}},{api:'anthropic-messages',compat:{maxTokensField:'max_tokens'}},{modelOverrides:{missing:{name:'Missing'}}},{retryPolicy:{mode:'always',maxRetries:5}}];
 for(const patch of mutations)assert.throws(()=>validateResolvedRoutes({custom:{...base,...patch}}),{code:'config_invalid'});for(const id of ['__proto__','constructor','../other','api:x'])assert.throws(()=>validateResolvedRoutes(JSON.parse('{"'+id+'":'+JSON.stringify(base)+'}')),{code:'config_invalid'});
});
test('OpenAI and Anthropic discovery use their own auth headers and never mutate configured models',options,async t=>{
 for(const api of ['openai-completions','anthropic-messages'] as const){const e=await endpoint(t,(_b,req,res)=>{assert.equal(req.url,'/v1/models');assert.equal(req.headers[api==='anthropic-messages'?'x-api-key':'authorization'],api==='anthropic-messages'?'fixture-secret':'Bearer fixture-secret');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'fresh-model',display_name:'Fresh'}]}))});const svc=createLlmService({routes:()=>({custom:{...config(e.url+'/v1',api),keyRef:'custom'}}),resolveKey:async()=> 'fixture-secret'});assert.deepEqual(await svc.discover('custom'),[{id:'fresh-model',name:'Fresh'}]);assert.equal(svc.models('custom')[0]!.id,'test-model')}
});
test('discovery rejects redirected credentials and forged/oversized replies; cancellation settles pending fetch',options,async t=>{
 let kind='redirect',remote=0;const e=await endpoint(t,(_b,_req,res)=>{remote++;if(kind==='redirect'){res.writeHead(302,{Location:'/other'});res.end()}else{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(kind==='forged'?{data:[{id:'fixture-secret'}]}:{data:[],padding:'x'.repeat(2_100_000)}))}});const svc=createLlmService({routes:()=>({custom:{...config(e.url),keyRef:'custom'}}),resolveKey:async()=> 'fixture-secret'});await assert.rejects(svc.discover('custom'),{code:'transport'});assert.equal(remote,1);kind='forged';await assert.rejects(svc.discover('custom'),{code:'discovery_invalid'});kind='oversized';await assert.rejects(svc.discover('custom'),{code:'discovery_invalid'});
 const c=new AbortController(),hung=createLlmService({routes:()=>({custom:config(e.url)}),resolveKey:async()=>null,fetch:()=>new Promise(()=>{})}),job=hung.discover('custom',c.signal);c.abort();await assert.rejects(job,{code:'cancelled'});
});
test('discovery cannot send a newly resolved key to a replaced route address',options,async()=>{
 let rows:any={custom:{...config('https://old.example.test/v1'),keyRef:'custom'}},release!:(key:string)=>void,calls=0;const wait=new Promise<string>(r=>release=r),svc=createLlmService({routes:()=>rows,resolveKey:()=>wait,fetch:async()=>{calls++;throw Error()}}),pending=svc.discover('custom');rows={custom:{...config('https://new.example.test/v1'),keyRef:'custom'}};release('new-endpoint-key');await assert.rejects(pending,{code:'route_changed'});assert.equal(calls,0);
});

test('unsupported catalog transport is not advertised, fails before any request and is never retryable',options,async()=>{
 assert.equal(catalogProviders().includes('google'),false);assert.throws(()=>validateResolvedRoutes({g:{catalog:'google'}}),{code:'transport_unsupported'});
 let calls=0;const svc=createLlmService({routes:()=>({g:{catalog:'google'}}),resolveKey:async()=>null,fetch:async()=>{calls++;throw Error('must not dispatch')}});
 const result=await collect(svc,{...prompt,provider:'g'});assert.equal(result.finish.failure?.code,'transport_unsupported');assert.equal(result.finish.failure?.retryable,false);assert.equal(calls,0);
});
test('custom routes require models even when id is a catalog name; Google-compatible own address remains available',options,async t=>{
 for(const id of ['custom','google','openai'])for(const models of [undefined,[]])assert.throws(()=>validateResolvedRoutes({[id]:{api:'openai-completions',baseURL:'https://example.test/v1',...(models?{models}:{})}}),{code:'config_invalid'});
 const server=await endpoint(t,(_body,_req,res)=>openai(res));const svc=createLlmService({routes:()=>({google:config(server.url)}),resolveKey:async()=>null});assert.equal((await collect(svc,{...prompt,provider:'google'})).finish.reason,'stop');
});
