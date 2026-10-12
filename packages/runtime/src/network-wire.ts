import net,{type Socket} from 'node:net';
import tls from 'node:tls';
import {ProviderError} from '@harnessy/providers';
export class NetworkError extends ProviderError {constructor(){super('network_unavailable','Нет готового сетевого выхода; проверьте цепочку провайдера')}}
export interface Destination {host:string;port:number}
export interface Hop {id:string;type:'direct'|'proxy';url?:string;login?:string;password?:string}
export const loopback=(host:string)=>host==='localhost'||host==='::1'||host==='[::1]'||/^127\.(?:\d+\.){2}\d+$/.test(host);
export function destination(host:string,port:number):Destination {host=host.replace(/^\[|\]$/g,'');if(!host||host.length>253||/[\s\x00-\x1f\x7f/@?#]/.test(host)||!Number.isInteger(port)||port<1||port>65535)throw new NetworkError();return {host,port}}
export const authority=(d:Destination)=>(d.host.includes(':')?'['+d.host+']':d.host)+':'+d.port;
class Reader {
 private socket:Socket;private bytes=Buffer.alloc(0);private wake:(()=>void)|null=null;private error=false;
 constructor(socket:Socket){this.socket=socket;socket.on('data',this.data);socket.on('error',this.failed);socket.on('end',this.failed);socket.on('close',this.failed)}
 private data=(value:Buffer)=>{this.bytes=Buffer.concat([this.bytes,value]);if(this.bytes.length>65536)this.error=true;this.wake?.()};
 private failed=()=>{this.error=true;this.wake?.()};
 async read(n:number){while(this.bytes.length<n){if(this.error)throw new NetworkError();await new Promise<void>(resolve=>this.wake=resolve);this.wake=null}const value=this.bytes.subarray(0,n);this.bytes=this.bytes.subarray(n);return value}
 async headers(){for(let n=0;n<16384;n++){const b=await this.read(1);this.header.push(b[0]!);if(this.header.length>=4&&Buffer.from(this.header.slice(-4)).equals(Buffer.from('\r\n\r\n')))return Buffer.from(this.header).toString('latin1')}throw new NetworkError()}
 private header:number[]=[];
 release(){this.socket.pause();this.socket.off('data',this.data);this.socket.off('error',this.failed);this.socket.off('end',this.failed);this.socket.off('close',this.failed);if(this.bytes.length)this.socket.unshift(this.bytes)}
}
const detach=new WeakMap<Socket,()=>void>();
function disarm(socket:Socket){detach.get(socket)?.();detach.delete(socket)}
async function dial(d:Destination,secure:boolean,signal:AbortSignal,ca?:string){
 if(signal.aborted)throw new NetworkError();
 const socket:Socket=secure?tls.connect({host:d.host,port:d.port,servername:net.isIP(d.host)?undefined:d.host,...(ca?{ca}:{}),rejectUnauthorized:true}):net.connect(d);
 socket.on('error',()=>{});const abort=()=>socket.destroy(new NetworkError());signal.addEventListener('abort',abort,{once:true});detach.set(socket,()=>signal.removeEventListener('abort',abort));socket.once('close',()=>disarm(socket));
 await new Promise<void>((resolve,reject)=>{const clean=()=>{socket.off('error',fail);socket.off('close',fail);socket.off(secure?'secureConnect':'connect',ok)};const fail=()=>{clean();reject(new NetworkError())};const ok=()=>{clean();resolve()};socket.once('error',fail);socket.once('close',fail);socket.once(secure?'secureConnect':'connect',ok)});
 if(signal.aborted){socket.destroy();throw new NetworkError()}return socket;
}
/** SOCKS5h sends the hostname to the proxy; no origin DNS lookup occurs here. */
export async function connectHop(hop:Hop,target:Destination|null,signal:AbortSignal,ca?:string):Promise<Socket>{
 let socket:Socket|undefined,reader:Reader|undefined;
 try{
  if(hop.type==='direct'){if(!target)throw new NetworkError();const direct=await dial(target,false,signal);disarm(direct);return direct}
  const url=new URL(hop.url!),proxy=destination(url.hostname,Number(url.port)||(url.protocol==='https:'?443:url.protocol==='socks5h:'?1080:80));
  if(!['http:','https:','socks5h:'].includes(url.protocol)||url.username||url.password)throw new NetworkError();
  socket=await dial(proxy,url.protocol==='https:',signal,ca);reader=new Reader(socket);
  if(url.protocol==='socks5h:'){
   const auth=hop.login!==undefined||hop.password!==undefined;socket.write(Buffer.from([5,1,auth?2:0]));const hello=await reader.read(2);if(hello[0]!==5||hello[1]!== (auth?2:0))throw new NetworkError();
   if(auth){const user=Buffer.from(hop.login??''),pass=Buffer.from(hop.password??'');if(user.length>255||pass.length>255)throw new NetworkError();socket.write(Buffer.concat([Buffer.from([1,user.length]),user,Buffer.from([pass.length]),pass]));const reply=await reader.read(2);if(reply[0]!==1||reply[1]!==0)throw new NetworkError()}
   if(target){const host=Buffer.from(target.host),port=Buffer.alloc(2);if(host.length>255)throw new NetworkError();port.writeUInt16BE(target.port);socket.write(Buffer.concat([Buffer.from([5,1,0,3,host.length]),host,port]));const head=await reader.read(4);if(head[0]!==5||head[1]!==0||head[2]!==0)throw new NetworkError();const length=head[3]===1?4:head[3]===4?16:head[3]===3?(await reader.read(1))[0]!:0;if(!length)throw new NetworkError();await reader.read(length+2)}
  }else if(target){
   const dest=authority(target),auth=hop.login!==undefined||hop.password!==undefined?'Proxy-Authorization: Basic '+Buffer.from((hop.login??'')+':'+(hop.password??'')).toString('base64')+'\r\n':'';
   socket.write('CONNECT '+dest+' HTTP/1.1\r\nHost: '+dest+'\r\n'+auth+'\r\n');const head=await reader.headers();if(!/^HTTP\/1\.[01] 200(?: |\r)/.test(head))throw new NetworkError();
  }
  reader.release();disarm(socket);return socket;
 }catch{socket?.destroy();throw new NetworkError()}
}
