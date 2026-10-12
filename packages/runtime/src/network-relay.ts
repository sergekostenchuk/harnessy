import type {ConnectionSample} from './network-stats.ts';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {NetworkSelection,switchReason,type RouteSnapshot,type SwitchReason} from './network-selection.ts';
import http,{type Server,type IncomingMessage,type ServerResponse} from 'node:http';
import type {Socket} from 'node:net';
import {fileURLToPath} from 'node:url';
import {ProxyAgent} from 'undici';
import {type NetworkExit,type NetworkSettings,type Settings,type ExitCheck,networkRevision} from '@harnessy/projects';
import {untilAbort} from './agent-cancel.ts';
import {ProviderError,type RouteEnv} from '@harnessy/providers';
import {NetworkError,connectHop,destination,loopback,type Destination,type Hop} from './network-wire.ts';
export {NetworkError} from './network-wire.ts';
export interface TurnNetwork {provider:string;via:{id:string;type:NetworkExit['type'];label:string};directOnce?:true;reserve?:{from:{id:string;type:NetworkExit['type'];label:string};reason:SwitchReason}}
const publicExit=(e:NetworkExit)=>({id:e.id,type:e.type,label:e.label});
export interface NetworkMetric {switches:number;reserveMs:number;rateLimits:number;silences:number;provider:string;exit:string;connections:number;errors:number;bytesUp:number;bytesDown:number;connectMs:number;durationMs:number}
export interface RelayOptions {statsIntervalMs?:number;measurement?:(sample:ConnectionSample)=>void;httpStatus?:(provider:string,exit:string,status:number)=>void;now?:()=>number;check?:(id:string,revision:string)=>ExitCheck|null;timeoutMs?:number;settleTimeoutMs?:number;tlsCa?:string;trace?:(value:NetworkMetric&{outcome:'ok'|'failed'})=>void;authFailure?:(provider:string)=>void;tunnels?:()=>Pick<import('./ssh-tunnels.ts').SshTunnels,'ensure'>}
interface Listener {server:Server;url:string;agent:ProxyAgent;verified:boolean}
interface Active {socket:Socket;metric:NetworkMetric;read:number;written:number;at:number;connectMs:number;sampleRead:number;sampleWritten:number;sampleAt:number;latencyPending:boolean}
/** A stable loopback listener per provider. Only new connections read new routing settings. */
export class NetworkRelay {
 private scopes=new AsyncLocalStorage<NetworkTurn>();private turns=new Map<string,NetworkTurn>();readonly selection:NetworkSelection;
 private readonly token=randomBytes(32).toString('base64url');private readonly authorization='Basic '+Buffer.from('harnessy:'+this.token).toString('base64');private readonly authorizationHash=createHash('sha256').update(this.authorization).digest();
 private metricTimer:ReturnType<typeof setInterval>|null=null;
 private sample(a:Active,failed=false){const to=Date.now(),read=a.socket.bytesRead,written=a.socket.bytesWritten;if(to===a.sampleAt&&read===a.sampleRead&&written===a.sampleWritten&&!failed&&!a.latencyPending)return;this.measure({provider:a.metric.provider,exit:a.metric.exit,from:a.sampleAt,to,bytesUp:Math.max(0,written-a.sampleWritten),bytesDown:Math.max(0,read-a.sampleRead),connectMs:a.latencyPending?a.connectMs:null,connected:true,failed});a.sampleAt=to;a.sampleRead=read;a.sampleWritten=written;a.latencyPending=false}
 private measure(sample:ConnectionSample){try{this.options.measurement?.(sample)}catch{}}
 private statusCode(provider:string,exit:string,status:number){try{this.options.httpStatus?.(provider,exit,status)}catch{}}
 private settings:Settings;private network:NetworkSettings;private options:RelayOptions;
 private listeners=new Map<string,Promise<Listener>>();private sockets=new Set<Socket>();private active=new Set<Active>();private totals=new Map<string,NetworkMetric>();private stop=new AbortController();private closed=false;
 constructor(settings:Settings,network:NetworkSettings,options:RelayOptions={}){this.settings=settings;this.network=network;this.options=options;if(options.statsIntervalMs!==undefined&&(!Number.isInteger(options.statsIntervalMs)||options.statsIntervalMs<10||options.statsIntervalMs>60000))throw new NetworkError();this.selection=new NetworkSelection(settings,options.check??(()=>null),options.now);if(options.settleTimeoutMs!==undefined&&(!Number.isInteger(options.settleTimeoutMs)||options.settleTimeoutMs<1||options.settleTimeoutMs>30000))throw new NetworkError();if(options.timeoutMs!==undefined&&(!Number.isInteger(options.timeoutMs)||options.timeoutMs<1||options.timeoutMs>30000))throw new NetworkError()}
 settleTimeoutMs(){return this.options.settleTimeoutMs??30000}
 reopen(){if(this.closed){this.stop=new AbortController();this.closed=false}}
 configured(provider:string){return Object.hasOwn(this.settings.network().chains,provider)}
 private count(provider:string,exit:string){const key=provider+'\0'+exit;let metric=this.totals.get(key);if(!metric){metric={provider,exit,switches:0,reserveMs:0,rateLimits:0,silences:0,connections:0,errors:0,bytesUp:0,bytesDown:0,connectMs:0,durationMs:0};this.totals.set(key,metric)}return metric}
 private publish(metric:NetworkMetric,outcome:'ok'|'failed'){try{this.options.trace?.({...metric,...this.selection.stats().find(m=>m.provider===metric.provider&&m.exit===metric.exit),outcome})}catch{}}
 private track(socket:Socket){this.sockets.add(socket);socket.on('error',()=>{});socket.once('close',()=>this.sockets.delete(socket));return socket}
 private async hop(exit:NetworkExit):Promise<Hop>{
  if(exit.type==='direct')return {id:exit.id,type:'direct'};
  if(exit.type==='proxy'){const password=await this.network.resolvePassword(exit);if(exit.passwordRef&&!password)throw new NetworkError();return {id:exit.id,type:'proxy',url:exit.url,...(exit.login!==undefined?{login:exit.login}:{}),...(password!==null?{password}:{})}}
  const tunnel=await this.options.tunnels?.()?.ensure(exit.id,{host:exit.host,port:exit.port,user:exit.user,keyPath:exit.keyPath});
  if(tunnel?.state!=='up'||!tunnel.url)throw new NetworkError();const url=new URL(tunnel.url);if(url.protocol!=='socks5h:'||url.hostname!=='127.0.0.1'||url.username||url.password||!url.port)throw new NetworkError();return {id:exit.id,type:'proxy',url:tunnel.url};
 }
 begin(provider:string,lane:string,signal:AbortSignal,notice?:(text:string,network:TurnNetwork)=>void,directOnce=false){if(this.closed)throw new NetworkError();const key=provider+'\0'+lane;if(this.turns.has(key))throw new NetworkError();const turn=new NetworkTurn(this,provider,key,signal,notice,directOnce);this.turns.set(key,turn);return turn}
 beginCheck(provider:string,lane:string,exit:string,revision:string,signal:AbortSignal,guard:()=>void){guard();const turn=this.begin(provider,'check:'+lane,signal);turn.checkExit={id:exit,revision,guard};return turn}
 scope<T>(turn:NetworkTurn,run:()=>Promise<T>){return this.scopes.run(turn,run)}
 async release(turn:NetworkTurn){if(this.turns.get(turn.key)===turn)this.turns.delete(turn.key);if(/\0(?:fetch:|prepare:|probe:|check:)/.test(turn.key)){const pending=this.listeners.get(turn.key);this.listeners.delete(turn.key);if(pending){const l=await pending;await l.agent.destroy();await new Promise<void>(r=>l.server.close(()=>r()))}}}
 scoped(provider:string){const turn=this.scopes.getStore();return turn?.provider===provider?turn:undefined}
 async choose(turn:NetworkTurn){
  await this.network.migrate();const snapshot=this.selection.snapshot(turn.provider);turn.snapshot=snapshot;if(turn.directOnce){turn.snapshot={...snapshot,configured:true,exits:[{id:'direct-once',type:'direct',label:'Напрямую'}]};turn.hop={id:'direct-once',type:'direct'};return}if(!snapshot.configured)return;
  if(turn.checkExit){turn.assert();const index=snapshot.exits.findIndex(e=>e.id===turn.checkExit!.id);if(index<0)throw new NetworkError();const combined=AbortSignal.any([turn.signal,AbortSignal.timeout(this.options.timeoutMs??10000),this.stop.signal]),hop=await untilAbort(combined,()=>this.hop(snapshot.exits[index]!));let socket:Socket|undefined;
   try{if(hop.type!=='direct')socket=this.track(await connectHop(hop,null,combined,this.options.tlsCa));turn.assert();if(combined.aborted)throw new NetworkError();turn.index=index;turn.hop=hop;return}finally{socket?.destroy()}}
  const {ids,reason}=this.selection.candidates(snapshot);let why=reason;
  for(const index of ids){let socket:Socket|undefined;const started=performance.now(),startedAt=Date.now();try{
   const combined=AbortSignal.any([turn.signal,AbortSignal.timeout(this.options.timeoutMs??10000),this.stop.signal]);
   const hop=await untilAbort(combined,()=>this.hop(snapshot.exits[index]!));this.selection.current(snapshot);
   if(hop.type!=='direct')socket=this.track(await connectHop(hop,null,combined,this.options.tlsCa));if(combined.aborted)throw new NetworkError();this.selection.current(snapshot);
   turn.index=index;turn.hop=hop;turn.choice=this.selection.selected(snapshot,index,why);this.publish(this.count(turn.provider,hop.id),'ok');return;
  }catch(e){if(e instanceof NetworkError&&e.code==='network_proxy_auth')throw e;if(turn.signal.aborted)throw new ProviderError('cancelled','Ход отменён');this.selection.current(snapshot);this.measure({provider:turn.provider,exit:snapshot.exits[index]!.id,from:startedAt,to:Date.now(),bytesUp:0,bytesDown:0,connectMs:null,failed:true});this.selection.failed(snapshot,index,'connection');why='connection';const metric=this.count(turn.provider,snapshot.exits[index]!.id);metric.errors++;metric.connectMs+=Math.round(performance.now()-started);this.publish(metric,'failed')}finally{socket?.destroy()}}
  if(snapshot.exits.length>1)this.selection.candidates(snapshot);throw new NetworkError();
 }
 private async connection(provider:string,target:Destination|null,signal:AbortSignal,turn?:NetworkTurn):Promise<{socket:Socket|null;id:string;connectMs:number}>{
  if(this.closed)throw new NetworkError();if(turn){await turn.ready();turn.assert();if(!turn.snapshot!.configured)throw new NetworkError();const started=performance.now(),startedAt=Date.now();let socket:Socket|undefined;
   try{const combined=AbortSignal.any([signal,turn.signal,AbortSignal.timeout(this.options.timeoutMs??10000),this.stop.signal]);if(!target&&turn.hop!.type==='direct')return {socket:null,id:turn.hop!.id,connectMs:0};socket=this.track(await connectHop(turn.hop!,target,combined,this.options.tlsCa));turn.assert();if(combined.aborted)throw new NetworkError();turn.sockets.add(socket);socket.once('close',()=>turn.sockets.delete(socket!));return {socket,id:turn.hop!.id,connectMs:performance.now()-started}}
   catch(e){socket?.destroy();if(e instanceof NetworkError&&e.code==='network_proxy_auth'){turn.reject(e);throw e}if(e instanceof NetworkError&&e.code!=='network_unavailable')throw e;this.selection.current(turn.snapshot!);if(!signal.aborted&&!turn.signal.aborted){this.measure({provider,exit:turn.hop!.id,from:startedAt,to:Date.now(),bytesUp:0,bytesDown:0,connectMs:null,failed:true});turn.fail('connection');const m=this.count(provider,turn.hop!.id);m.errors++;this.publish(m,'failed')}throw turn.failure??e}
  }
  const temporary=this.begin(provider,'prepare:'+crypto.randomUUID(),signal);try{await temporary.ready();if(!temporary.snapshot!.configured){if(!target)return {socket:null,id:'implicit-direct',connectMs:0};return {socket:this.track(await connectHop({id:'implicit-direct',type:'direct'},target,signal,this.options.tlsCa)),id:'implicit-direct',connectMs:0}}
   const opened=await this.connection(provider,target,signal,temporary);temporary.sockets.clear();return opened;
  }finally{await temporary.close()}
 }
 private observe(provider:string,exit:string,socket:Socket,connectMs:number){
  const metric=this.count(provider,exit);metric.connections++;metric.connectMs+=Math.round(connectMs);const active:Active={socket,metric,read:socket.bytesRead,written:socket.bytesWritten,at:performance.now(),connectMs,sampleRead:socket.bytesRead,sampleWritten:socket.bytesWritten,sampleAt:Date.now(),latencyPending:true};this.active.add(active);this.sample(active);if(this.options.measurement&&!this.metricTimer){this.metricTimer=setInterval(()=>{for(const entry of this.active)this.sample(entry)},this.options.statsIntervalMs??1000);this.metricTimer.unref()}
  let failed=false;socket.once('error',()=>failed=true);socket.once('close',()=>{this.active.delete(active);this.sample(active,failed);if(!this.active.size&&this.metricTimer){clearInterval(this.metricTimer);this.metricTimer=null};metric.bytesUp+=Math.max(0,socket.bytesWritten-active.written);metric.bytesDown+=Math.max(0,socket.bytesRead-active.read);metric.durationMs+=Math.round(performance.now()-active.at);if(failed)metric.errors++;this.publish(metric,failed?'failed':'ok')});
 }
 private authorized(req:IncomingMessage){const header=req.headers['proxy-authorization'],hash=createHash('sha256').update(typeof header==='string'?header:'').digest();const matches=timingSafeEqual(hash,this.authorizationHash);return matches&&req.rawHeaders.filter((v,i)=>i%2===0&&v.toLowerCase()==='proxy-authorization').length===1}
 private denied(provider:string){try{this.options.authFailure?.(provider)}catch{}}
 private async tunnel(provider:string,req:IncomingMessage,client:Socket,head:Buffer,turn?:NetworkTurn){
  this.track(client);if(!this.authorized(req)){this.denied(provider);client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Harnessy"\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');return}const abort=new AbortController();client.once('close',()=>abort.abort());
  try{if(!req.url||/[/?#@\s]/.test(req.url))throw new NetworkError();const url=new URL('http://'+req.url),target=destination(url.hostname,Number(url.port)||80);if(!req.url.endsWith(':'+target.port))throw new NetworkError();
   const opened=await this.connection(provider,target,abort.signal,turn),upstream=opened.socket!;this.observe(provider,opened.id,upstream,opened.connectMs);if(client.destroyed){upstream.destroy();return}
   (await this.listeners.get(turn?.key??provider))!.verified=true;if(turn){turn.requests++;turn.sent()}client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);
   if(turn)turn.watch(upstream);client.pipe(upstream);upstream.pipe(client);client.once('close',()=>upstream.destroy());upstream.once('close',()=>client.destroy());upstream.resume();
  }catch{if(!client.destroyed)client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')}
 }
 private async request(provider:string,req:IncomingMessage,res:ServerResponse,turn?:NetworkTurn){
  if(!this.authorized(req)){this.denied(provider);res.writeHead(407,{'Proxy-Authenticate':'Basic realm="Harnessy"',Connection:'close','Content-Length':'0'});res.end();return}const abort=new AbortController();res.once('close',()=>abort.abort());
  try{const url=new URL(req.url??'');if(url.protocol!=='http:'||url.username||url.password||url.hash)throw new NetworkError();const target=destination(url.hostname,Number(url.port)||80),opened=await this.connection(provider,target,abort.signal,turn),socket=opened.socket!;this.observe(provider,opened.id,socket,opened.connectMs);if(abort.signal.aborted){socket.destroy();return}
   (await this.listeners.get(turn?.key??provider))!.verified=true;if(turn){turn.requests++;turn.sent()}const headers:http.OutgoingHttpHeaders={...req.headers,host:url.host};for(const key of ['proxy-authorization','proxy-connection','connection','keep-alive','upgrade',...(req.headers.connection??'').toLowerCase().split(',').map(s=>s.trim())])delete headers[key];headers.connection='close';
   const agent=new http.Agent({keepAlive:false});agent.createConnection=()=>socket;
   const outgoing=http.request({hostname:target.host,port:target.port,method:req.method,path:url.pathname+url.search,headers,agent},response=>{this.statusCode(provider,opened.id,response.statusCode??502);if(turn&&(response.statusCode??0)>=500){turn.fail('server_error');response.destroy();res.writeHead(502);res.end();return}res.writeHead(response.statusCode??502,response.headers);response.pipe(res)});
   const stop=()=>outgoing.destroy();res.once('close',stop);outgoing.once('close',()=>{res.off('close',stop);agent.destroy()});outgoing.on('error',()=>{if(!abort.signal.aborted&&!turn?.signal.aborted)turn?.fail('connection');if(!res.headersSent)res.writeHead(502);res.end()});if(turn)turn.watch(socket);req.pipe(outgoing);socket.resume();
  }catch{if(!res.headersSent)res.writeHead(502);res.end()}
 }
 private listener(provider:string,key=provider):Promise<Listener>{
  let pending=this.listeners.get(key);if(pending)return pending;if(this.closed)return Promise.reject(new NetworkError());
  pending=new Promise<Listener>((resolve,reject)=>{
   const server=http.createServer({maxHeaderSize:16384},(req,res)=>{const turn=this.turns.get(key);if(key!==provider&&!turn&&this.authorized(req)){res.writeHead(502);res.end();return}void this.request(provider,req,res,turn)});
   server.requestTimeout=300000;server.headersTimeout=10000;
   server.on('connection',socket=>this.track(socket));
   server.on('connect',(req,socket,head)=>{const turn=this.turns.get(key);if(key!==provider&&!turn&&this.authorized(req)){socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');return}void this.tunnel(provider,req,socket as Socket,head,turn)});
   server.on('clientError',(_error,socket)=>socket.destroy());server.on('error',()=>reject(new NetworkError()));
   server.listen(0,'127.0.0.1',()=>{
    if(this.closed){server.close();reject(new NetworkError());return}
    const url='http://harnessy:'+this.token+'@127.0.0.1:'+(server.address() as {port:number}).port;
    resolve({server,url,verified:false,agent:new ProxyAgent({uri:new URL(url).origin,token:this.authorization,...(this.options.tlsCa?{requestTls:{ca:this.options.tlsCa}}:{})})});
   });
  });
  this.listeners.set(key,pending);void pending.catch(()=>{if(this.listeners.get(key)===pending)this.listeners.delete(key)});return pending;
 }
 async prepare(provider:string,signal:AbortSignal,turn=this.scoped(provider)){try{if(this.closed)throw new NetworkError();if(turn){await turn.ready();turn.assert();return turn.snapshot!.configured?await this.listener(provider,turn.key):null;}if(signal.aborted)throw new NetworkError();await this.network.migrate();if(signal.aborted)throw new NetworkError();if(!this.configured(provider))return null;const ready=await this.connection(provider,null,signal);ready.socket?.destroy();return await this.listener(provider)}catch(e){if(signal.aborted)throw new ProviderError('cancelled','Ход отменён');throw e}}
 async environment(provider:string,signal:AbortSignal,turn=this.scoped(provider)):Promise<RouteEnv|null>{const listener=await this.prepare(provider,signal,turn);if(!listener)return null;const preload=fileURLToPath(new URL('./network-node.cjs',import.meta.url));return {HTTP_PROXY:listener.url,HTTPS_PROXY:listener.url,ALL_PROXY:listener.url,http_proxy:listener.url,https_proxy:listener.url,all_proxy:listener.url,NO_PROXY:'localhost,127.0.0.1,[::1],::1',no_proxy:'localhost,127.0.0.1,[::1],::1',NODE_USE_ENV_PROXY:'1',HARNESS_RELAY_PROXY:listener.url,NODE_OPTIONS:(process.env.NODE_OPTIONS??'')+' --require '+JSON.stringify(preload)}}
 fetch(provider:string,fallback:typeof fetch=fetch):typeof fetch{return async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input));if(loopback(url.hostname))return fallback(input,{...init,redirect:(init?.redirect??(input instanceof Request?input.redirect:undefined))==='manual'?'manual':'error'});
  const signal=init?.signal??(input instanceof Request?input.signal:undefined)??new AbortController().signal,scoped=this.scoped(provider),turn=scoped??this.begin(provider,'fetch:'+crypto.randomUUID(),signal);
  try{const listener=await this.prepare(provider,signal,turn);if(!listener){if(this.configured(provider))throw new NetworkError();if(!scoped)await turn.close();return fallback(input,init)}
   turn.fetchManaged=true;let idle:ReturnType<typeof setTimeout>|undefined;const clear=()=>clearTimeout(idle),arm=()=>{clear();idle=setTimeout(()=>turn.fail('silence'),turn.snapshot!.policy.silenceSeconds*1000);idle.unref()};
   const agent=turn.agent??=new ProxyAgent({uri:new URL(listener.url).origin,token:this.authorization,...(this.options.tlsCa?{requestTls:{ca:this.options.tlsCa}}:{})});
   let response:Response;arm();try{response=await fetch(input,{...init,signal:AbortSignal.any([signal,turn.signal]),dispatcher:agent} as RequestInit)}finally{clear()}
   if(turn.hop)this.statusCode(provider,turn.hop.id,response.status);
   if(response.status===429||response.status>=500){turn.fail(response.status===429?'rate_limited':'server_error');void response.body?.cancel().catch(()=>{});throw turn.failure!}
   if(!response.body){if(!scoped)await turn.close();return response}
   const reader=response.body.getReader();let cancelled=false;const body=new ReadableStream<Uint8Array>({async pull(controller){try{arm();const value=await reader.read();clear();if(cancelled)return;if(value.done){controller.close();if(!scoped)await turn.close()}else controller.enqueue(value.value)}catch(e){clear();if(cancelled)return;if(!signal.aborted&&!turn.signal.aborted)turn.fail('connection');if(!scoped)await turn.close();controller.error(turn.failure??e)}},async cancel(){cancelled=true;clear();await reader.cancel();if(!scoped)await turn.close()}});
   return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
  }catch(e){if(!(e instanceof NetworkError)&&!signal.aborted&&!turn.signal.aborted)turn.fail('connection');if(!scoped)await turn.close();if(signal.aborted)throw new ProviderError('cancelled','Ход отменён');throw turn.failure??e}
 }}
 summary(provider:string){const exit=this.selection.selectedExit(provider);return exit?publicExit(exit):null}
 async status(provider:string){const listeners=await Promise.all([...this.listeners].filter(([k])=>k===provider||k.startsWith(provider+'\0')).map(([,l])=>l)),verified=listeners.some(l=>l.verified)||[...this.totals.values()].some(m=>m.provider===provider&&m.connections>0);return {configured:this.configured(provider),verification:verified?'verified':'unverified',label:verified?'программа ходит через выход: проверено':'программа ходит через выход: не проверено'}}
 stats(){const rows=new Map([...this.totals].map(([k,v])=>[k,{...v}]));for(const a of this.active){const r=rows.get(a.metric.provider+'\0'+a.metric.exit)!;r.bytesUp+=Math.max(0,a.socket.bytesWritten-a.written);r.bytesDown+=Math.max(0,a.socket.bytesRead-a.read);r.durationMs+=Math.round(performance.now()-a.at)}for(const m of this.selection.stats()){const key=m.provider+'\0'+m.exit,r=rows.get(key)??{...this.count(m.provider,m.exit)};Object.assign(r,m);rows.set(key,r)}return [...rows.values()]}
 async close(){if(this.closed)return;this.closed=true;this.stop.abort();if(this.metricTimer){clearInterval(this.metricTimer);this.metricTimer=null}const closing=[...this.sockets].map(socket=>new Promise<void>(resolve=>socket.once('close',()=>resolve())));await Promise.allSettled([...this.turns.values()].map(turn=>turn.close()));for(const socket of this.sockets)socket.destroy();await Promise.all(closing);await Promise.allSettled([...this.listeners.values()].map(async p=>{const l=await p;await l.agent.destroy();await new Promise<void>(resolve=>l.server.close(()=>resolve()))}));this.listeners.clear()}
}

/** One immutable exit per runtime turn. A stable per-seat listener keeps CLI processes reusable. */
export class NetworkTurn {
 retryBlocked=false;requests=0;fetchManaged=false;snapshot:RouteSnapshot|undefined;index=0;hop:Hop|undefined;choice:{reserve:boolean;reason:SwitchReason|null}|undefined;agent:ProxyAgent|undefined;
 checkExit:{id:string;revision:string;guard:()=>void}|undefined;
 readonly sockets=new Set<Socket>();private controller=new AbortController();readonly signal:AbortSignal;private pending:Promise<void>|undefined;failure:NetworkError|undefined;rejection:NetworkError|undefined;private ended=false;private notified=false;
 private timers=new Map<Socket,ReturnType<typeof setTimeout>>();
 private relay:NetworkRelay;readonly provider:string;readonly key:string;private notice:((text:string,network:TurnNetwork)=>void)|undefined;readonly directOnce:boolean;
 constructor(relay:NetworkRelay,provider:string,key:string,signal:AbortSignal,notice?: (text:string,network:TurnNetwork)=>void,directOnce=false){this.directOnce=directOnce;this.relay=relay;this.provider=provider;this.key=key;this.notice=notice;this.signal=AbortSignal.any([signal,this.controller.signal])}
 ready(){return this.pending??=this.relay.choose(this)}
 assert(){if(this.rejection)throw this.rejection;if(this.failure)throw this.failure;if(this.signal.aborted||this.ended)throw new ProviderError('cancelled','Ход отменён');if(this.checkExit)this.checkExit.guard();if(this.snapshot){this.relay.selection.current(this.snapshot);if(this.checkExit){const exit=this.snapshot.exits.find(e=>e.id===this.checkExit!.id);if(!this.snapshot.configured||!exit||networkRevision(exit)!==this.checkExit.revision)throw new NetworkError()}else if(this.hop&&!this.directOnce)this.relay.selection.allowed(this.snapshot,this.index)}}
 receipt():TurnNetwork|null{const exit=this.snapshot?.exits[this.index];if(!exit)return null;return {provider:this.provider,via:publicExit(exit),...(this.directOnce?{directOnce:true as const}:{}),...(this.choice?.reserve?{reserve:{from:publicExit(this.snapshot!.exits[0]!),reason:this.choice.reason??'connection'}}:{})}}
 sent(){if(this.notified)return;this.notified=true;const network=this.receipt();if(network)this.notice?.(this.choice?.reserve?'Ход ушёл через резервный выход «'+network.via.label+'» · '+switchReason[this.choice.reason??'connection']:'',network)}
 reject(error:NetworkError){this.rejection=error;this.controller.abort();for(const socket of this.sockets)socket.destroy()}
 fail(reason:SwitchReason){if(this.failure||this.signal.aborted||this.ended||!this.snapshot||!this.hop)return;if(!this.checkExit&&!this.directOnce)this.relay.selection.failed(this.snapshot,this.index,reason);this.failure=new NetworkError('network_unavailable',switchReason[reason]+(this.checkExit?'; проверка выбранного выхода остановлена':'; ход остановлен, следующий ход выберет резерв той же страны'));this.controller.abort();for(const socket of this.sockets)socket.destroy()}
 watch(socket:Socket){if(this.fetchManaged)return;this.touch(socket);socket.once('error',()=>this.fail('connection'));socket.on('data',()=>this.touch(socket));socket.once('close',()=>{clearTimeout(this.timers.get(socket));this.timers.delete(socket)})}
 touch(socket:Socket){clearTimeout(this.timers.get(socket));if(this.ended||this.signal.aborted)return;const timer=setTimeout(()=>this.fail('silence'),this.snapshot!.policy.silenceSeconds*1000);timer.unref();this.timers.set(socket,timer)}
 async run<T>(callback:()=>Promise<T>){
  let operation:Promise<T>|undefined;
  try{const value=await this.relay.scope(this,()=>untilAbort(this.controller.signal,()=>operation=Promise.resolve().then(callback)));if(!this.signal.aborted)this.assert();return value}
  catch(e){
   // Cancellation of the relay's wait is not completion of the provider. Keep the
   // seat exclusive until its finally/cleanup has finished, including probe turns.
   if(this.failure&&operation){let timer:ReturnType<typeof setTimeout>|undefined;
    try{const settled=await Promise.race([operation.then(()=>true,()=>true),new Promise<false>(resolve=>{timer=setTimeout(()=>resolve(false),this.relay.settleTimeoutMs())})]);
     if(!settled){this.retryBlocked=true;throw new NetworkError('network_unavailable','Программа не подтвердила завершение предыдущей попытки; автоматический повтор остановлен')}
    }finally{clearTimeout(timer)}
   }
   throw this.rejection??this.failure??e;
  }
 }
 async close(){if(this.ended)return;this.ended=true;this.controller.abort();for(const t of this.timers.values())clearTimeout(t);this.timers.clear();for(const socket of this.sockets)socket.destroy();await this.agent?.destroy();await this.relay.release(this)}
}
