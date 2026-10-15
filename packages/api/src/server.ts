import {networkRoutes} from './routes-network.ts';
import {llmRoutes} from './routes-llm.ts';
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {randomUUID} from 'node:crypto';
import type {AddressInfo} from 'node:net';
import type {Runtime} from '@harnessy/runtime';
import {RuntimeError,traceId,traceBindingId,traceReason,type TraceStore,type TraceContext} from '@harnessy/runtime';
import {ATTACHMENT_BODY_LIMIT,checkBrowser,readBody} from './security.ts';
import {json,plain,failure,writeReply} from './responses.ts';
import {ownerRoutes} from './routes-owner.ts';
import {providerRoutes} from './routes-providers.ts';
import type {RouterSource} from './router-health.ts';
import {metaRoutes} from './routes-meta.ts';
import {traceRoutes} from './routes-trace.ts';
import {bridgeRoutes} from './routes-bridge.ts';
import type {Route} from './routes.ts';
import {serveSse} from './sse.ts';
import {serveStatic} from './static.ts';
export const PROTO_ENTRY='/sketches/proto/10-new-chat.html';
export interface ApiOptions {runtime:Runtime;siteDir:string;port?:number;host?:string;router?:RouterSource}
export function createApi(options:ApiOptions){
 const r=options.runtime,routes=[...ownerRoutes(r),...metaRoutes(r,options.router),...bridgeRoutes(r),...traceRoutes(r),...providerRoutes(r),...llmRoutes(r),...networkRoutes(r)],streams=new Set<()=>void>();let closing=false,closeJob:Promise<void>|null=null;
 const traceTemplates=[...new Set(routes.map(route=>route.path)), '/api/unknown'],traceStores=new WeakSet();
 const responseReasons=new WeakMap<ServerResponse,ReturnType<typeof traceReason>>();
 const pollRoutes=new Set(['/api/context/:id','/api/chats','/api/status','/api/limits','/api/spend','/api/connections']);
 const pollCounts=new Map<TraceStore,Map<string,{count:number;first:number}>>();
 function poll(store:TraceStore,route:string,now:number){let byRoute=pollCounts.get(store);if(!byRoute){byRoute=new Map();pollCounts.set(store,byRoute)}let row=byRoute.get(route);if(!row){row={count:0,first:now};byRoute.set(route,row)}row.count++;if(row.count>=30||now-row.first>=300000){store.record('http.poll',{data:{method:'GET',route,count:row.count}});byRoute.delete(route)}}
 function flushPolls(){for(const [store,rows] of pollCounts){for(const [route,row] of rows)if(row.count)store.record('http.poll',{data:{method:'GET',route,count:row.count}});rows.clear()}pollCounts.clear()}
 function pathIdentity(template:string,path:string){const marker=template.split('/').indexOf(':id');if(marker<0)return {};let id:string;try{id=decodeURIComponent(path.split('/')[marker]??'')}catch{return {}};
  if(template.startsWith('/api/network/exits/')&&/^[a-z][a-z0-9_-]{0,63}$/.test(id))return {exit:id};
  if(template.startsWith('/api/chats/')&&traceBindingId(id,'chat'))return {chatId:id};
  if((template.startsWith('/api/panes/')||template==='/api/context/:id')&&traceBindingId(id,'pane'))return {paneId:id};
  if(template.startsWith('/api/llm/providers/')&&/^[a-z][a-z0-9_-]{0,63}$/.test(id))return {routeId:id};
  if((template.startsWith('/api/providers/')||template.startsWith('/api/network/providers/'))&&/^[a-z][a-z0-9_-]{0,63}$/.test(id))return {providerId:id};
  return {};
 }
 function match(route:Route,path:string){const a=route.path.split('/'),b=path.split('/');if(a.length!==b.length)return null;const params:Record<string,string>={};for(let i=0;i<a.length;i++){if(a[i]!.startsWith(':')){if(!b[i])return null;params[a[i]!.slice(1)]=b[i]!}else if(a[i]!==b[i])return null}return params}
 const server=createServer((request,res)=>{void traceDispatch(request,res).catch(e=>{if(res.headersSent)res.destroy();else writeReply(res,failure(e),request.method==='HEAD')})});
 async function traceDispatch(request:IncomingMessage,res:ServerResponse){
 const path=(request.url??'').split('?')[0]??'';if(!path.startsWith('/api/'))return dispatch(request,res);
 let project;try{project=r.project}catch{return dispatch(request,res)}const store=project.trace;
 if(!traceStores.has(store)){store.setRouteTemplates(traceTemplates);traceStores.add(store)}
 if(path==='/api/trace'||path.startsWith('/api/events/'))return dispatch(request,res);
 const matching=routes.filter(route=>match(route,path)),routeTemplate=(matching.find(route=>route.method===request.method||request.method==='HEAD'&&route.method==='GET')??matching[0])?.path??'/api/unknown',start=r.clock.now(),id=request.headers['x-harness-trace-id'],parent=request.headers['x-harness-span-id'],binding=request.headers['x-harness-project'],instance=request.headers['x-harness-instance'];
 if(id!==undefined||parent!==undefined||binding!==undefined||instance!==undefined){let decoded='';try{decoded=decodeURIComponent(String(binding))}catch{}if(!traceId(id)||!traceId(parent)||decoded!==project.dir||instance!==store.instanceId){const data={method:request.method,route:routeTemplate,...pathIdentity(routeTemplate,path)},rejected=store.record('http.request',{actor:'window',data});writeReply(res,json({ok:false,code:'project_changed',error:'Привязка цепочки устарела'},409),request.method==='HEAD');store.end(rejected,'http.response',{outcome:'rejected',reason:traceReason('project_changed','Привязка цепочки устарела'),durationMs:r.clock.now()-start,data:{...data,status:409}});return}}
 let source:TraceContext|undefined;const pane=request.headers['x-harness-pane'];if(typeof pane==='string'&&typeof request.headers['x-pane-token']==='string')try{const scope=r.validateBridge(pane,request.headers['x-pane-token']);source=store.forTurn(scope.turnInstanceId)}catch{}
 const ids=pathIdentity(routeTemplate,path),samplePoll=request.method==='GET'&&pollRoutes.has(routeTemplate)&&!id&&!parent&&!source;
 const requestInput={...(traceId(id)?{traceId:id}:{}),parentSpanId:traceId(parent)?parent:source?.spanId??null,actor:source?.pane?'model:'+source.pane:'window',data:{method:request.method,route:routeTemplate,...ids}} as const;
 const span:TraceContext=samplePoll?{store,traceId:randomUUID(),spanId:randomUUID(),parentSpanId:null,chat:null,pane:null,turnInstanceId:null}:store.record('http.request',requestInput,source);
 res.setHeader('X-Harness-Trace-Id',span.traceId);res.setHeader('X-Harness-Span-Id',span.spanId);
 res.once('finish',()=>{const duration=r.clock.now()-start;if(samplePoll&&res.statusCode<400&&duration<2000){poll(store,routeTemplate,r.clock.now());return}if(samplePoll)store.record('http.request',{...requestInput,traceId:span.traceId,spanId:span.spanId},source);
  store.end(span,'http.response',{actor:'engine',outcome:res.statusCode<400?'ok':res.statusCode<500?'rejected':'failed',reason:res.statusCode<400?{code:'none',text:''}:responseReasons.get(res)??traceReason(res.getHeader('X-Harness-Reason')??(res.statusCode<500?'validation':'internal'),'HTTP '+res.statusCode),durationMs:duration,data:{method:request.method,route:routeTemplate,status:res.statusCode,...ids}})});
 return store.run(span,async()=>{try{await dispatch(request,res)}catch(e){responseReasons.set(res,traceReason((e as {code?:string}).code,e instanceof Error?e.message:''));res.setHeader('X-Harness-Reason',responseReasons.get(res)!.code);throw e}});
 }
 async function dispatch(request:IncomingMessage,res:ServerResponse){
 const target=(request.url??'/').replace(/^https?:\/\/[^/]+(?=\/|$)/i,'')||'/',q=target.indexOf('?'),rawPath=q<0?target:target.slice(0,q),query=new URLSearchParams(q<0?'':target.slice(q+1));let path:string;
 try{path=decodeURIComponent(rawPath)}catch{writeReply(res,plain('404: Not Found',404),request.method==='HEAD');return}
 const method=request.method??'GET',head=method==='HEAD',port=(server.address() as AddressInfo|null)?.port??options.port??3777;
 checkBrowser(request,path,port);
 if(closing){writeReply(res,json({error:'сервер закрывается'},503),head);return}
 if(path.startsWith('/sketches')){if(method!=='GET'&&!head){res.setHeader('Cache-Control','no-cache');writeReply(res,plain('405: Method Not Allowed',405,{Allow:'GET,HEAD'}));return}await serveStatic(res,rawPath,options.siteDir,head);return}
 if(path==='/'){if(method!=='GET'&&!head){writeReply(res,plain('405: Method Not Allowed',405,{Allow:'GET,HEAD'}));return}writeReply(res,plain(PROTO_ENTRY+'\n',302,{Location:PROTO_ENTRY,'Cache-Control':'no-store'}),head);return}
 if(path.startsWith('/api/sessions/')&&(method==='GET'||head)){writeReply(res,plain('405: Method Not Allowed',405,{Allow:'POST'}),head);return}
 if(/^\/api\/events\/[^/]+$/.test(path)){
 if(method!=='GET'&&!head){writeReply(res,plain('405: Method Not Allowed',405,{Allow:'GET,HEAD'}));return}
 const id=path.slice('/api/events/'.length);if(!['all','owner'].includes(id)&&!r.registry.get(id)){writeReply(res,json({error:'нет окна'},404),head);return}
 if(head){res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','X-Accel-Buffering':'no','Cache-Control':'no-cache'});res.end();return}
 const sub=r.subscribe(id==='all'?{all:true}:id==='owner'?{owner:true}:{pane:id});await serveSse(request,res,sub,r.clock,streams,id==='all');return
 }
 const matching=routes.map(route=>({route,params:match(route,path)})).filter(x=>x.params);
 const chosen=matching.find(x=>x.route.method===method||head&&x.route.method==='GET');
 if(!chosen){writeReply(res,matching.length?plain('405: Method Not Allowed',405,{Allow:[...new Set(matching.flatMap(x=>x.route.method==='GET'?['GET','HEAD']:['POST']))].sort().join(',')}):plain('404: Not Found',404),head);return}
 try{const body=method==='POST'?await readBody(request,path==='/api/attachments'?ATTACHMENT_BODY_LIMIT:undefined):{};const reply=await chosen.route.handle({request,body,query,params:chosen.params!});if(reply.status>=400&&reply.value&&typeof reply.value==='object'){const value=reply.value as {code?:string;error?:string};responseReasons.set(res,traceReason(value.code,value.error??'HTTP '+reply.status));res.setHeader('X-Harness-Reason',responseReasons.get(res)!.code)}if(!res.destroyed)writeReply(res,reply,head)}catch(e){if(!res.destroyed){responseReasons.set(res,traceReason((e as {code?:string}).code,e instanceof Error?e.message:''));res.setHeader('X-Harness-Reason',responseReasons.get(res)!.code);writeReply(res,failure(e,chosen.route.style,chosen.route.statuses),head)}}
 }
 const close=()=>closeJob??=(async()=>{
 closing=true;flushPolls();const httpClosed=new Promise<void>(resolve=>server.close(()=>resolve()));for(const stop of [...streams])stop();
 try{await r.close()}finally{server.closeAllConnections();await httpClosed}
 })();
 const listen=()=>new Promise<string>((resolve,reject)=>{
 if(closing){reject(new RuntimeError('server_closed','сервер закрывается',503));return}
 const clean=()=>{server.off('error',failed);server.off('listening',ready);server.off('close',stopped)};
 const failed=(e:Error)=>{clean();reject(e)},stopped=()=>failed(new RuntimeError('server_closed','сервер закрывается',503)),ready=()=>{clean();const a=server.address() as AddressInfo;resolve('http://127.0.0.1:'+a.port)};
 server.once('error',failed);server.once('listening',ready);server.once('close',stopped);server.listen(options.port??3777,options.host??'127.0.0.1')
 });
 return {server,listen,close,get url(){const a=server.address();if(!a||typeof a==='string')throw new RuntimeError('server_closed','сервер не слушает',503);return 'http://127.0.0.1:'+a.port},get streams(){return streams.size}}
}
export type Api=ReturnType<typeof createApi>;
