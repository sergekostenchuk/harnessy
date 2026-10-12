import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import type {TestContext} from 'node:test';
export async function listen(t:TestContext,server:net.Server){const sockets=new Set<net.Socket>();server.on('connection',s=>{sockets.add(s);s.on('error',()=>{});s.once('close',()=>sockets.delete(s))});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{for(const s of sockets)s.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()))});return (server.address() as net.AddressInfo).port}
export async function proxy(t:TestContext,targetPort:number,auth?:string,tls?:{cert:string;key:string}){const connects:{url:string;headers:http.IncomingHttpHeaders}[]=[],server=tls?https.createServer(tls):http.createServer();server.on('connect',(req,client,head)=>{connects.push({url:req.url!,headers:req.headers});if(auth&&req.headers['proxy-authorization']!==auth){client.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n');return}const upstream=net.connect({host:'127.0.0.1',port:targetPort});upstream.on('error',()=>client.destroy());client.on('error',()=>upstream.destroy());client.once('close',()=>upstream.destroy());upstream.once('close',()=>client.destroy());upstream.once('connect',()=>{client.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);client.pipe(upstream);upstream.pipe(client)})});const port=await listen(t,server);return {url:(tls?'https':'http')+'://127.0.0.1:'+port,connects,server}}
export async function socks(t:TestContext,targetPort:number,credentials?:{login:string;password:string}){
 const hosts:string[]=[],auth:{login:string;password:string}[]=[],server=net.createServer(client=>{
  let phase=0,bytes=Buffer.alloc(0);const data=(chunk:Buffer)=>{
   bytes=Buffer.concat([bytes,chunk]);
   if(phase===0&&bytes.length>=3){bytes=bytes.subarray(3);phase=credentials?1:2;client.write(Buffer.from([5,credentials?2:0]))}
   if(phase===1&&bytes.length>=2){const n=bytes[1]!;if(bytes.length<n+3)return;const m=bytes[n+2]!;if(bytes.length<n+m+3)return;
    const pair={login:bytes.subarray(2,n+2).toString(),password:bytes.subarray(n+3,n+3+m).toString()};auth.push(pair);bytes=bytes.subarray(n+m+3);
    if(pair.login!==credentials!.login||pair.password!==credentials!.password){client.end(Buffer.from([1,1]));return}phase=2;client.write(Buffer.from([1,0]));
   }
   if(phase===2&&bytes.length>=5){const n=bytes[4]!;if(bytes.length<n+7)return;hosts.push(bytes.subarray(5,5+n).toString());const rest=bytes.subarray(n+7);phase=3;client.off('data',data);
    const upstream=net.connect({host:'127.0.0.1',port:targetPort});upstream.on('error',()=>client.destroy());client.once('close',()=>upstream.destroy());upstream.once('close',()=>client.destroy());upstream.once('connect',()=>{client.write(Buffer.from([5,0,0,1,127,0,0,1,0,1]));if(rest.length)upstream.write(rest);client.pipe(upstream);upstream.pipe(client)});
   }
  };client.on('data',data);
 });return {url:'socks5h://127.0.0.1:'+await listen(t,server),hosts,auth};
}
export async function through(url:string,target:string){return new Promise<string>((resolve,reject)=>{const address=new URL(url),authorization='Basic '+Buffer.from(decodeURIComponent(address.username)+':'+decodeURIComponent(address.password)).toString('base64');const req=http.get(address.origin,{path:target,headers:{Connection:'close','Proxy-Authorization':authorization}},res=>{let body='';res.on('data',c=>body+=c);res.on('error',reject);res.on('end',()=>res.statusCode===200?resolve(body):reject(Error('HTTP '+res.statusCode)))});req.on('error',reject)})}
