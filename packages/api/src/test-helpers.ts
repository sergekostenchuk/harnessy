import type {TestContext} from 'node:test';
import {request as httpRequest,type IncomingHttpHeaders,type IncomingMessage,type ClientRequest} from 'node:http';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {harness,FakeProvider} from '../../runtime/src/test-helpers.ts';
import {createApi,type Api} from './server.ts';
export {deferred,until,OWNER,FakeProvider,FakeClock} from '../../runtime/src/test-helpers.ts';
export async function fixture(t:TestContext,options:Parameters<typeof harness>[1]={}){
 const codex=new FakeProvider('codex');codex.models=async()=>[{id:'gpt-test',label:'GPT test'}];
 const h=await harness(t,{...options,deps:{...options.deps,providers:{claude:new FakeProvider(),codex,...options.deps?.providers}}});
 const provider=h.deps.providers.claude as FakeProvider,siteDir=join(h.dir,'site');mkdirSync(siteDir);writeFileSync(join(siteDir,'test.js'),'window.test = "готов";');
 const api=createApi({runtime:h.runtime,siteDir,port:0});await api.listen();t.after(()=>api.close());h.deps.appUrl=api.url;
 return {...h,provider,codex,api,siteDir}
}
export interface Response {status:number;headers:IncomingHttpHeaders;body:any;text:string}
export function call(api:Api,path:string,options:{method?:string;body?:unknown;raw?:string|Buffer|Buffer[];headers?:Record<string,string>}={}):Promise<Response>{return new Promise((resolve,reject)=>{
 const raw=options.raw??(options.body===undefined?undefined:JSON.stringify(options.body));
 const req=httpRequest(api.url,{path,method:options.method??(raw===undefined?'GET':'POST'),headers:{...(raw===undefined?{}:{'Content-Type':'application/json'}),...options.headers}},res=>{const chunks:Buffer[]=[];res.on('data',d=>chunks.push(Buffer.from(d)));res.on('end',()=>{const text=Buffer.concat(chunks).toString('utf8');let body:unknown=text;try{body=JSON.parse(text)}catch{}resolve({status:res.statusCode??0,headers:res.headers,body,text})});res.on('error',reject)});
 req.on('error',reject);if(Array.isArray(raw)){for(const chunk of raw)req.write(chunk);req.end()}else req.end(raw)
 })}
export async function sse(api:Api,id='all'){
 let req!:ClientRequest;const response=await new Promise<IncomingMessage>((resolve,reject)=>{req=httpRequest(api.url+'/api/events/'+id,resolve);req.on('error',reject);req.end()});
 let raw='';const frames:any[]=[];response.on('error',()=>{});response.on('data',chunk=>{raw+=chunk.toString();for(const block of chunk.toString().split('\n\n')){if(block.startsWith('data: '))try{frames.push(JSON.parse(block.slice(6)))}catch{}}});
 return {req,response,frames,get raw(){return raw},close(){req.destroy();response.destroy()}}
}
