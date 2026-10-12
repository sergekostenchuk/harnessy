import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {Agent} from 'undici';
import {fixture,call} from '../../api/src/test-helpers.ts';
import {MemoryKeys} from '../../llm/src/test-helpers.ts';
import {listen,proxy,through} from './network-test-helpers.ts';
const opts={timeout:20000};
async function setup(t:Parameters<typeof fixture>[0]){
 const seen:http.IncomingHttpHeaders[]=[],target=http.createServer((q,r)=>{seen.push(q.headers);r.end('private-proxy-access')}),port=await listen(t,target),up=await proxy(t,port,'Basic '+Buffer.from('fixture:private-proxy-password').toString('base64'));
 const h=await fixture(t,{deps:{networkKeys:new MemoryKeys(),networkRelayOptions:{timeoutMs:1000}}});
 assert.equal((await call(h.api,'/api/network/exits/up/save',{body:{config:{id:'up',type:'proxy',label:'fixture',url:up.url,login:'fixture'},password:'private-proxy-password',revision:null}})).status,200);
 await h.runtime.settings.changeNetwork(async c=>{c.migrated=true;c.chains.claude=['up'];return {result:undefined}});
 const env=await h.runtime.networkRelay.environment('claude',t.signal),url=new URL(env!.HTTP_PROXY!);return {h,up,seen,url,auth:'Basic '+Buffer.from('harnessy:'+url.password).toString('base64')};
}
function request(url:URL,method:string,headers:http.OutgoingHttpHeaders={}){return new Promise<{status:number;body:string}>((resolve,reject)=>{
 const req=http.request(url.origin,{method,path:method==='CONNECT'?'untrusted-destination.invalid:443':'http://untrusted-destination.invalid/',headers},res=>{let body='';res.on('data',c=>body+=c);res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode!,body}))});req.on('connect',(res,s)=>{s.destroy();resolve({status:res.statusCode!,body:''})});req.on('error',reject);req.end();
})}
for(const method of ['GET','CONNECT'])test('22c r2: '+method+' requires relay authentication before upstream access',opts,async t=>{
 const x=await setup(t);let passwordReads=0;const resolvePassword=x.h.runtime.network.resolvePassword.bind(x.h.runtime.network);x.h.runtime.network.resolvePassword=async exit=>{passwordReads++;return resolvePassword(exit)};
 for(const headers of [{},{'Proxy-Authorization':'Basic wrong'},{'Proxy-Authorization':'Bearer '+x.url.password},{Authorization:x.auth},{'Proxy-Authorization':[x.auth,x.auth]}]){
  const r=await request(x.url,method,headers);assert.equal(r.status,407);assert.equal(r.body,'');
 }
 assert.equal(passwordReads,0);assert.equal(x.up.connects.length,0);assert.equal(x.seen.length,0);assert.equal((await x.h.runtime.networkRelay.status('claude')).verification,'unverified');
 await x.h.runtime.project.trace.flush();const trace=(await call(x.h.api,'/api/trace')).text;assert.match(trace,/network.auth_failed/);for(const secret of [x.url.password,x.auth,'private-proxy-password'])assert.ok(!trace.includes(secret));
 // Ordinary URL userinfo produces origin Authorization in node:http, not Proxy-Authorization.
 const automatic=await new Promise<number>((resolve,reject)=>{const req=http.request(x.url,{method,path:method==='CONNECT'?'untrusted-destination.invalid:443':'http://untrusted-destination.invalid/'},res=>{res.resume();res.on('end',()=>resolve(res.statusCode!))});req.on('connect',(res,s)=>{s.destroy();resolve(res.statusCode!)});req.on('error',reject);req.end()});assert.equal(automatic,407);assert.equal(x.up.connects.length,0);
 const good=await request(x.url,method,{'Proxy-Authorization':x.auth});assert.equal(good.status,200);assert.equal(x.up.connects.length,1);assert.ok(x.up.connects.every(c=>c.headers['proxy-authorization']!==x.auth&&c.headers.authorization===undefined));
 if(method==='GET'){assert.equal(good.body,'private-proxy-access');assert.equal(x.seen[0]!['proxy-authorization'],undefined);assert.equal(x.seen[0]!.authorization,undefined)}
});
test('22c r2: engine restart gets a new token; API dispatcher and HTTP client use the same current credential',opts,async t=>{
 const a=await setup(t),b=await setup(t);assert.equal(Buffer.from(a.url.password,'base64url').length,32);assert.notEqual(a.url.password,b.url.password);
 assert.equal((await request(b.url,'CONNECT',{'Proxy-Authorization':a.auth})).status,407);assert.equal(b.up.connects.length,0);
 assert.equal(await through(b.url.href,'http://origin.invalid/'),'private-proxy-access');assert.equal(await(await b.h.runtime.networkRelay.fetch('claude')('http://origin.invalid/')).text(),'private-proxy-access');assert.equal(b.up.connects.length,2);
 assert.ok(b.seen.every(q=>q.authorization===undefined&&q['proxy-authorization']===undefined));assert.ok(b.up.connects.every(q=>q.headers['proxy-authorization']!==b.auth));
});
test('22c r2: loopback redirect cannot escape a configured chain into direct traffic',opts,async t=>{
 let outside=0;const external=http.createServer((_q,r)=>{outside++;r.end('external-reached-directly')}),outsidePort=await listen(t,external),local=http.createServer((_q,r)=>{r.writeHead(302,{Location:'http://external-target.invalid:'+outsidePort+'/'});r.end()}),localPort=await listen(t,local),h=await fixture(t);
 await h.runtime.settings.changeNetwork(async c=>{c.migrated=true;c.chains.claude=[];return {result:undefined}});
 const agent=new Agent({connect:{lookup:(_host:any,options:any,callback:any)=>options?.all?callback(null,[{address:'127.0.0.1',family:4}]):callback(null,'127.0.0.1',4)}});t.after(()=>agent.close());
 await assert.rejects(h.runtime.networkRelay.fetch('claude')('http://127.0.0.1:'+localPort,{dispatcher:agent} as RequestInit));assert.equal(outside,0);
 const response=await h.runtime.networkRelay.fetch('claude')('http://127.0.0.1:'+localPort,{redirect:'manual',dispatcher:agent} as RequestInit);assert.equal(response.status,302);await response.body?.cancel();assert.equal(outside,0);
});
