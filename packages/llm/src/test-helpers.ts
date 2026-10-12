import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import type {TestContext} from 'node:test';
import type {AddressInfo} from 'node:net';
import {createLlmService} from './service.ts';
import type {ProviderConfig,GenerateOptions,StreamChunk,KeyDescription} from './index.ts';
export const prompt:GenerateOptions={provider:'local',model:'test-model',messages:[{role:'system',content:[{type:'text',text:'system instruction'}]},{role:'user',content:[{type:'text',text:'hello'}]}]};
export const config=(baseURL:string,api:ProviderConfig['api']='openai-completions'):ProviderConfig=>({api,baseURL,models:[{id:'test-model',contextWindow:32768,maxTokens:4096}],timeoutMs:2000});
export async function endpoint(t:TestContext,handle:(body:any,req:IncomingMessage,res:ServerResponse)=>void){const bodies:any[]=[];const server=createServer(async(req,res)=>{try{let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):null;bodies.push(body);handle(body,req,res)}catch{res.destroy()}});t.after(()=>new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections()}));await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));return {url:'http://127.0.0.1:'+(server.address() as AddressInfo).port,bodies}}
export function openai(res:ServerResponse,tool=false){res.writeHead(200,{'Content-Type':'text/event-stream'});const event=(delta:any,finish:any=null,usage?:any)=>res.write('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',created:1,model:'test-model',choices:[{index:0,delta,finish_reason:finish}],...(usage?{usage}:{})})+'\n\n');event({role:'assistant'});if(tool){event({tool_calls:[{index:0,id:'call_1',type:'function',function:{name:'lookup',arguments:'{"city":'}}]});event({tool_calls:[{index:0,function:{arguments:'"Paris"}'}}]},'tool_calls')}else{event({content:'hello '});event({content:'world'},'stop')}event({},null,{prompt_tokens:12,completion_tokens:4,total_tokens:16,prompt_tokens_details:{cached_tokens:2}});res.end('data: [DONE]\n\n')}
export async function collect(service:ReturnType<typeof createLlmService>,request:GenerateOptions=prompt){const chunks:StreamChunk[]=[];for await(const c of service.stream(request))chunks.push(c);return {chunks,finish:[...chunks].reverse().find(c=>c.type==='finish')!}}
export class MemoryKeys {
 rows=new Map<string,{key:string;updatedAt:number}>();
 async put(id:string,key:string){this.rows.set(id,{key,updatedAt:100})}async delete(id:string){this.rows.delete(id)}async resolveKey(id:string){return this.rows.get(id)?.key??null}
 async describe(id:string):Promise<KeyDescription>{const v=this.rows.get(id);return v?{present:true,mask:'••••••••'+v.key.slice(-4),updatedAt:v.updatedAt}:{present:false,mask:null,updatedAt:null}}
}
