import test from 'node:test';
import assert from 'node:assert/strict';
import {discover} from './discovery.ts';
import {createLlmService} from './service.ts';
import {collect} from './test-helpers.ts';
import {OLLAMA_CLOUD_BASE_URL,OLLAMA_CLOUD_MODELS_URL} from './presets.ts';
const config={api:'openai-completions' as const,baseURL:OLLAMA_CLOUD_BASE_URL,models:[{id:'gemma4:31b'}]},secret='fixture-cloud-key-0001';
test('21g: cloud discovery uses documented authenticated tags, preserves API names and rejects credential echoes',async()=>{
 let calls=0;const fetcher:typeof fetch=async(url,init)=>{calls++;assert.equal(url,OLLAMA_CLOUD_MODELS_URL);assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+secret);assert.equal(init?.redirect,'error');assert.equal(init?.credentials,'omit');assert.equal(init?.body,undefined);return Response.json({models:[{name:'gemma4:31b'},{name:'gpt-oss:120b'}]})};
 assert.deepEqual(await discover(config,secret,fetcher),[{id:'gemma4:31b',name:'gemma4:31b'},{id:'gpt-oss:120b',name:'gpt-oss:120b'}]);assert.equal(calls,1);
 for(const value of [{data:[]},{models:[{name:'bad\nmodel'}]},{models:[{name:secret}]},{models:[{name:'one'},{name:'one'}]}])await assert.rejects(discover(config,secret,async()=>Response.json(value)),{code:'discovery_invalid'});
});
test('21g: missing cloud key never makes discovery or inference requests',async()=>{
 let calls=0;const fetcher:typeof fetch=async()=>{calls++;throw Error('network forbidden')};await assert.rejects(discover(config,null,fetcher),{code:'missing_credential'});
 const service=createLlmService({routes:()=>({cloud:config}),resolveKey:async()=>null,fetch:fetcher}),result=await collect(service,{provider:'cloud',model:'gemma4:31b',messages:[{role:'user',content:[{type:'text',text:'fixture'}]}]});assert.equal(result.finish.failure?.code,'missing_credential');assert.equal(calls,0);
});
for(const status of [401,429,503])test('21g: cloud HTTP '+status+' does not expose the response body',async()=>{
 await assert.rejects(discover(config,secret,async()=>new Response(secret,{status})),(e:any)=>!e.message.includes(secret)&&typeof e.code==='string');
});
