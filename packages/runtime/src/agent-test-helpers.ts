import {mkdtempSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {TestContext} from 'node:test';
import {fixture} from '../../providers/src/test-support.ts';
import {SecretRedactor} from '../../llm/src/redaction.ts';
import type {ContentBlock,GenerateOptions,LlmService,ProviderRoutes,RetryPolicy,StreamChunk} from '@harnessy/llm';
export function agentFixture(t:TestContext){const h=fixture(),dir=realpathSync(mkdtempSync(join(tmpdir(),'harnessy-agent-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));Object.assign(h.seat,{vendor:'api:local',model:'test-model',cwd:dir,writePaths:[],mode:'edit'});Object.assign(h.ctx,{projectDir:dir,writableRoots:[dir]});return {...h,dir}}
export const usage={input:10,output:4,cacheRead:2,cacheWrite:3,totalTokens:19};
export const end=(content:ContentBlock[]=[{type:'text',text:'готово'}],reason:'stop'|'tool-calls'|'length'='stop'):StreamChunk=>({type:'finish',reason,message:{role:'assistant',content},usage});
export const tool=(name:string,args:Record<string,any>,id='call-1'):ContentBlock=>({type:'tool-call',id,name,arguments:args});
export function modelDouble(next:(request:GenerateOptions,index:number)=>AsyncIterable<StreamChunk>|StreamChunk[],retry:RetryPolicy={mode:'normal',maxRetries:0}){
 const requests:GenerateOptions[]=[],listeners=new Set<Parameters<LlmService['onRoutesChanged']>[0]>();const routes:ProviderRoutes={local:{api:'openai-completions',baseURL:'http://127.0.0.1:1/v1',models:[{id:'test-model'}]}};
 const protection=new SecretRedactor(),service:LlmService={redact:protection.redact,textRedactor:protection.textRedactor,routes:()=>structuredClone(routes),models:()=>[{id:'test-model',name:'Fixture',api:'openai-completions',contextWindow:32768,maxTokens:4096,input:['text'],reasoning:false}],retryPolicy:()=>retry,discover:async()=>[],onRoutesChanged(fn){listeners.add(fn);return()=>{listeners.delete(fn)}},async *stream(request){const {signal:_,...snapshot}=request;requests.push(structuredClone(snapshot));yield*next(request,requests.length-1)}};
 return {service,protection,requests,routes,changed(){for(const fn of listeners)fn({type:'llm.routes',providers:Object.keys(routes)})},listeners};
}
