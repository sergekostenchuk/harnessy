import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import http,{type Server,type IncomingMessage,type ServerResponse} from 'node:http';
import type {Socket} from 'node:net';
import {fileURLToPath} from 'node:url';
import {ProxyAgent} from 'undici';
import {networkRevision,type NetworkExit,type NetworkSettings,type Settings} from '@harnessy/projects';
import {untilAbort} from './agent-cancel.ts';
import {ProviderError,type RouteEnv} from '@harnessy/providers';
import {NetworkError,connectHop,destination,loopback,type Destination,type Hop} from './network-wire.ts';
export {NetworkError} from './network-wire.ts';
export interface NetworkMetric {provider:string;exit:string;connections:number;errors:number;bytesUp:number;bytesDown:number;connectMs:number;durationMs:number}
export interface RelayOptions {timeoutMs?:number;tlsCa?:string;trace?:(value:NetworkMetric&{outcome:'ok'|'failed'})=>void;authFailure?:(provider:string)=>void;tunnels?:()=>Pick<import('./ssh-tunnels.ts').SshTunnels,'ensure'>}
interface Listener {server:Server;url:string;agent:ProxyAgent;verified:boolean}
interface Active {socket:Socket;metric:NetworkMetric;read:number;written:number;at:number}
/** A stable loopback listener per provider. Only new connections read new routing settings. */
export class NetworkRelay {
 private readonly token=randomBytes(32).toString('base64url');private readonly authorization='Basic '+Buffer.from('harnessy:'+this.token).toString('base64');private readonly authorizationHash=createHash('sha256').update(this.authorization).digest();
 private settings:Settings;private network:NetworkSettings;private options:RelayOptions;
 private listeners=new Map<string,Promise<Listener>>();private sockets=new Set<Socket>();private active=new Set<Active>();private totals=new Map<string,NetworkMetric>();private stop=new AbortController();private closed=false;
 constructor(settings:Settings,network:NetworkSettings,options:RelayOptions={}){this.settings=settings;this.network=network;this.options=options;if(options.timeoutMs!==undefined&&(!Number.isInteger(options.timeoutMs)||options.timeoutMs<1||options.timeoutMs>30000))throw new NetworkError()}
 configured(provider:string){return Object.hasOwn(this.settings.network().chains,provider)}
 private config(provider:string){const config=this.settings.network(),chain=config.chains[provider];return {config,chain,stamp:networkRevision([chain,...(chain??[]).map(id=>config.exits[id])])}}
 private current(provider:string,stamp:string|null){if(this.closed||this.config(provider).stamp!==stamp)throw new NetworkError()}
 private count(provider:string,exit:string){const key=provider+'\0'+exit;let metric=this.totals.get(key);if(!metric){metric={provider,exit,connections:0,errors:0,bytesUp:0,bytesDown:0,connectMs:0,durationMs:0};this.totals.set(key,metric)}return metric}
 private publish(metric:NetworkMetric,outcome:'ok'|'failed'){try{this.options.trace?.({...metric,outcome})}catch{}}
 private track(socket:Socket){this.sockets.add(socket);socket.on('error',()=>{});socket.once('close',()=>this.sockets.delete(socket));return socket}
 private async hop(exit:NetworkExit):Promise<Hop>{
  if(exit.type==='direct')return {id:exit.id,type:'direct'};
  if(exit.type==='proxy'){const password=await this.network.resolvePassword(exit);if(exit.passwordRef&&!password)throw new NetworkError();return {id:exit.id,type:'proxy',url:exit.url,...(exit.login!==undefined?{login:exit.login}:{}),...(password!==null?{password}:{})}}
  const tunnel=await this.options.tunnels?.()?.ensure(exit.id,{host:exit.host,port:exit.port,user:exit.user,keyPath:exit.keyPath});
  if(tunnel?.state!=='up'||!tunnel.url)throw new NetworkError();const url=new URL(tunnel.url);if(url.protocol!=='socks5h:'||url.hostname!=='127.0.0.1'||url.username||url.password||!url.port)throw new NetworkError();return {id:exit.id,type:'proxy',url:tunnel.url};
 }
 private async connection(provider:string,target:Destination|null,signal:AbortSignal){
  const {config,chain,stamp}=this.config(provider),ids=chain??['implicit-direct'];
  for(const id of ids){this.current(provider,stamp);if(signal.aborted)throw new NetworkError();let socket:Socket|undefined;const started=performance.now();
   const timeout=AbortSignal.timeout(this.options.timeoutMs??10000),combined=AbortSignal.any([signal,timeout,this.stop.signal]);
   try{
    const exit=chain===undefined?{id,type:'direct' as const,label:'direct'}:config.exits[id];if(!exit)throw new NetworkError();
    const hop=await untilAbort(combined,()=>this.hop(exit));this.current(provider,stamp);if(combined.aborted)throw new NetworkError();
    if(!target&&hop.type==='direct')return {socket:null,id,connectMs:0};
    socket=this.track(await connectHop(hop,target,combined,this.options.tlsCa));this.current(provider,stamp);if(combined.aborted)throw new NetworkError();return {socket,id,connectMs:performance.now()-started};
   }catch{socket?.destroy();const metric=this.count(provider,id);metric.errors++;metric.connectMs+=Math.round(performance.now()-started);this.publish(metric,'failed');this.current(provider,stamp);if(signal.aborted||this.closed)throw new NetworkError()}
  }throw new NetworkError();
 }
 private observe(provider:string,exit:string,socket:Socket,connectMs:number){
  const metric=this.count(provider,exit);metric.connections++;metric.connectMs+=Math.round(connectMs);const active:Active={socket,metric,read:socket.bytesRead,written:socket.bytesWritten,at:performance.now()};this.active.add(active);
  let failed=false;socket.once('error',()=>failed=true);socket.once('close',()=>{this.active.delete(active);metric.bytesUp+=Math.max(0,socket.bytesWritten-active.written);metric.bytesDown+=Math.max(0,socket.bytesRead-active.read);metric.durationMs+=Math.round(performance.now()-active.at);if(failed)metric.errors++;this.publish(metric,failed?'failed':'ok')});
 }
 private authorized(req:IncomingMessage){const header=req.headers['proxy-authorization'],hash=createHash('sha256').update(typeof header==='string'?header:'').digest();const matches=timingSafeEqual(hash,this.authorizationHash);return matches&&req.rawHeaders.filter((v,i)=>i%2===0&&v.toLowerCase()==='proxy-authorization').length===1}
 private denied(provider:string){try{this.options.authFailure?.(provider)}catch{}}
 private async tunnel(provider:string,req:IncomingMessage,client:Socket,head:Buffer){
  this.track(client);if(!this.authorized(req)){this.denied(provider);client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Harnessy"\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');return}const abort=new AbortController();client.once('close',()=>abort.abort());
  try{if(!req.url||/[/?#@\s]/.test(req.url))throw new NetworkError();const url=new URL('http://'+req.url),target=destination(url.hostname,Number(url.port)||80);if(!req.url.endsWith(':'+target.port))throw new NetworkError();
   const opened=await this.connection(provider,target,abort.signal),upstream=opened.socket!;this.observe(provider,opened.id,upstream,opened.connectMs);if(client.destroyed){upstream.destroy();return}
   (await this.listeners.get(provider))!.verified=true;client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);
   client.pipe(upstream);upstream.pipe(client);client.once('close',()=>upstream.destroy());upstream.once('close',()=>client.destroy());upstream.resume();
  }catch{if(!client.destroyed)client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')}
 }
 private async request(provider:string,req:IncomingMessage,res:ServerResponse){
  if(!this.authorized(req)){this.denied(provider);res.writeHead(407,{'Proxy-Authenticate':'Basic realm="Harnessy"',Connection:'close','Content-Length':'0'});res.end();return}const abort=new AbortController();res.once('close',()=>abort.abort());
  try{const url=new URL(req.url??'');if(url.protocol!=='http:'||url.username||url.password||url.hash)throw new NetworkError();const target=destination(url.hostname,Number(url.port)||80),opened=await this.connection(provider,target,abort.signal),socket=opened.socket!;this.observe(provider,opened.id,socket,opened.connectMs);if(abort.signal.aborted){socket.destroy();return}
   (await this.listeners.get(provider))!.verified=true;const headers:http.OutgoingHttpHeaders={...req.headers,host:url.host};for(const key of ['proxy-authorization','proxy-connection','connection','keep-alive','upgrade',...(req.headers.connection??'').toLowerCase().split(',').map(s=>s.trim())])delete headers[key];headers.connection='close';
   const agent=new http.Agent({keepAlive:false});agent.createConnection=()=>socket;
   const outgoing=http.request({hostname:target.host,port:target.port,method:req.method,path:url.pathname+url.search,headers,agent},response=>{res.writeHead(response.statusCode??502,response.headers);response.pipe(res)});
   const stop=()=>outgoing.destroy();res.once('close',stop);outgoing.once('close',()=>{res.off('close',stop);agent.destroy()});outgoing.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end()});req.pipe(outgoing);socket.resume();
  }catch{if(!res.headersSent)res.writeHead(502);res.end()}
 }
 private listener(provider:string):Promise<Listener>{
  let pending=this.listeners.get(provider);if(pending)return pending;if(this.closed)return Promise.reject(new NetworkError());
  pending=new Promise<Listener>((resolve,reject)=>{
   const server=http.createServer({maxHeaderSize:16384},(req,res)=>{void this.request(provider,req,res)});
   server.requestTimeout=300000;server.headersTimeout=10000;
   server.on('connection',socket=>this.track(socket));
   server.on('connect',(req,socket,head)=>{void this.tunnel(provider,req,socket as Socket,head)});
   server.on('clientError',(_error,socket)=>socket.destroy());server.on('error',()=>reject(new NetworkError()));
   server.listen(0,'127.0.0.1',()=>{
    if(this.closed){server.close();reject(new NetworkError());return}
    const url='http://harnessy:'+this.token+'@127.0.0.1:'+(server.address() as {port:number}).port;
    resolve({server,url,verified:false,agent:new ProxyAgent({uri:new URL(url).origin,token:this.authorization,...(this.options.tlsCa?{requestTls:{ca:this.options.tlsCa}}:{})})});
   });
  });
  this.listeners.set(provider,pending);void pending.catch(()=>{if(this.listeners.get(provider)===pending)this.listeners.delete(provider)});return pending;
 }
 async prepare(provider:string,signal:AbortSignal){try{if(signal.aborted)throw new NetworkError();await this.network.migrate();if(signal.aborted)throw new NetworkError();if(!this.configured(provider))return null;const ready=await this.connection(provider,null,signal);ready.socket?.destroy();return await this.listener(provider)}catch(e){if(signal.aborted)throw new ProviderError('cancelled','Ход отменён');throw e}}
 async environment(provider:string,signal:AbortSignal):Promise<RouteEnv|null>{const listener=await this.prepare(provider,signal);if(!listener)return null;const preload=fileURLToPath(new URL('./network-node.cjs',import.meta.url));return {HTTP_PROXY:listener.url,HTTPS_PROXY:listener.url,ALL_PROXY:listener.url,http_proxy:listener.url,https_proxy:listener.url,all_proxy:listener.url,NO_PROXY:'localhost,127.0.0.1,[::1],::1',no_proxy:'localhost,127.0.0.1,[::1],::1',NODE_USE_ENV_PROXY:'1',HARNESS_RELAY_PROXY:listener.url,NODE_OPTIONS:(process.env.NODE_OPTIONS??'')+' --require '+JSON.stringify(preload)}}
 fetch(provider:string,fallback:typeof fetch=fetch):typeof fetch{return async(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input));if(loopback(url.hostname))return fallback(input,{...init,redirect:(init?.redirect??(input instanceof Request?input.redirect:undefined))==='manual'?'manual':'error'});const signal=init?.signal??(input instanceof Request?input.signal:undefined)??new AbortController().signal;const listener=await this.prepare(provider,signal);if(!listener){if(this.configured(provider))throw new NetworkError();return fallback(input,init)}try{return await fetch(input,{...init,dispatcher:listener.agent} as RequestInit)}catch{throw new NetworkError()}}}
 async status(provider:string){const pending=this.listeners.get(provider),listener=pending?await pending:null;return {configured:this.configured(provider),verification:listener?.verified?'verified':'unverified',label:listener?.verified?'программа ходит через выход: проверено':'программа ходит через выход: не проверено'}}
 stats(){const rows=new Map([...this.totals].map(([k,v])=>[k,{...v}]));for(const a of this.active){const r=rows.get(a.metric.provider+'\0'+a.metric.exit)!;r.bytesUp+=Math.max(0,a.socket.bytesWritten-a.written);r.bytesDown+=Math.max(0,a.socket.bytesRead-a.read);r.durationMs+=Math.round(performance.now()-a.at)}return [...rows.values()]}
 async close(){if(this.closed)return;this.closed=true;this.stop.abort();for(const socket of this.sockets)socket.destroy();await Promise.allSettled([...this.listeners.values()].map(async p=>{const l=await p;await l.agent.destroy();await new Promise<void>(resolve=>l.server.close(()=>resolve()))}));this.listeners.clear()}
}
