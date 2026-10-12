import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request,type IncomingMessage,type ServerResponse} from 'node:http';
import {webFetch,publicWebAddress,WEB_MAX_BYTES,WEB_TEXT_BYTES,WEB_REDIRECTS,type WebFetchOptions} from './agent-web.ts';
import {deferred} from './test-helpers.ts';
import {ApiAgent} from './api-agent.ts';
import {agentFixture,modelDouble,end,tool} from './agent-test-helpers.ts';

const ready=()=>new AbortController().signal;
async function site(t:TestContext,handle:(req:IncomingMessage,res:ServerResponse)=>void){
 const received:IncomingMessage[]=[],pinned:string[]=[],hosts:string[]=[];
 const server=createServer((req,res)=>{received.push(req);handle(req,res)});await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 t.after(()=>new Promise<void>(done=>{server.closeAllConnections();server.close(()=>done())}));const port=(server.address() as {port:number}).port;
 const options:WebFetchOptions={resolve:async host=>{hosts.push(host);return [{address:'93.184.215.14',family:4}]},request:(url,opts,reply)=>{
  assert.equal(opts.method,'GET');assert.equal(opts.agent,false);assert.ok(opts.lookup);
  opts.lookup(url.hostname,{all:false},(_err,ip)=>{assert.equal(typeof ip,'string');pinned.push(ip as string)});
  return request(new URL(url.pathname+url.search,'http://127.0.0.1:'+port),{...opts,lookup:undefined},reply);
 }};return {options,received,pinned,hosts};
}
const forbidden=['0.0.0.0','10.0.0.1','100.64.0.1','127.0.0.1','169.254.169.254','172.16.1.1','192.168.0.1','192.0.0.1','192.0.2.1','198.18.0.1','198.51.100.1','203.0.113.1','224.0.0.1','255.255.255.255','::','::1','::ffff:127.0.0.1','::ffff:7f00:1','fc00::1','fd00::1','fe80::1','fec0::1','ff02::1','64:ff9b::7f00:1','2001::7f00:1','2001:db8::1','2002:7f00:1::1','3fff::1'];
test('21e web: only public addresses pass; encoded loopback, credentials and non-HTTP URLs cannot open a socket',async()=>{
 for(const address of forbidden)assert.equal(publicWebAddress(address),false,address);
 for(const address of ['1.1.1.1','93.184.215.14','2606:4700:4700::1111','2001:4860:4860::8888'])assert.equal(publicWebAddress(address),true,address);
 let opened=0;const options:WebFetchOptions={resolve:async()=>[{address:'127.0.0.1',family:4}],request:()=>{opened++;throw Error('must not connect')}};
 for(const url of [...forbidden.map(ip=>'http://'+(ip.includes(':')?'['+ip+']':ip)+'/'),'http://2130706433/','http://0x7f000001/','http://127.1/','http://user:secret@example.com/','file:///etc/passwd','ftp://example.com/','http://local.test/'])await assert.rejects(webFetch(url,ready(),options),{code:'web_url_denied'},url);
 assert.equal(opened,0);
});
test('21e web: every DNS answer and redirect is checked before connecting',async t=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','::1']){
  const f=await site(t,(_q,r)=>{r.writeHead(302,{Location:'http://'+(ip.includes(':')?'['+ip+']':ip)+':3777/'});r.end()});
  await assert.rejects(webFetch('http://public.test/',ready(),f.options),{code:'web_url_denied'});assert.equal(f.received.length,1);
 }
 const f=await site(t,(_q,r)=>{r.writeHead(302,{Location:'http://changed.test/'});r.end()});
 f.options.resolve=async host=>[{address:host==='changed.test'?'10.0.0.1':'93.184.215.14',family:4}];
 await assert.rejects(webFetch('http://public.test/',ready(),f.options),{code:'web_url_denied'});assert.equal(f.received.length,1);
 f.options.resolve=async()=>[{address:'93.184.215.14',family:4},{address:'192.168.1.1',family:4}];await assert.rejects(webFetch('http://mixed.test/',ready(),f.options),{code:'web_url_denied'});assert.equal(f.received.length,1);
});
test('21e web: pinned DNS is not resolved again; GET follows relative redirects without cookies or keys and returns text',async t=>{
 const f=await site(t,(q,r)=>{if(q.url==='/'){r.writeHead(302,{Location:'/page','Set-Cookie':'session=not-forwarded'});r.end()}else{r.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});r.end('<html><style>CSS_HIDDEN</style><h1>Example &amp; text</h1><script>JS_HIDDEN</script><p>hello &#128578;</p></html>')}});
 const page=await webFetch('http://public.test/',ready(),f.options);assert.equal(page.text,'Example & text hello 🙂');assert.equal(page.url,'http://public.test/page');assert.equal(page.truncated,false);assert.equal(f.hosts.length,2);assert.deepEqual(f.pinned,['93.184.215.14','93.184.215.14']);
 for(const q of f.received){assert.equal(q.method,'GET');assert.equal(q.headers.cookie,undefined);assert.equal(q.headers.authorization,undefined);assert.equal(q.headers['proxy-authorization'],undefined);assert.equal(q.headers['x-api-key'],undefined);assert.equal(q.headers['accept-encoding'],'identity')}
});
test('21e web: oversized declared and streamed bodies, binary or compressed data, and redirect loops fail with bounded responses',async t=>{
 const f=await site(t,(q,r)=>{if(q.url==='/declared'){r.writeHead(200,{'Content-Type':'text/plain','Content-Length':String(WEB_MAX_BYTES+1)});r.end()}else if(q.url==='/stream'){r.writeHead(200,{'Content-Type':'text/plain'});r.write('a'.repeat(WEB_MAX_BYTES));r.end('x')}else if(q.url==='/binary'){r.writeHead(200,{'Content-Type':'image/png'});r.end('binary')}else if(q.url==='/gzip'){r.writeHead(200,{'Content-Type':'text/html','Content-Encoding':'gzip'});r.end('compressed')}else{r.writeHead(302,{Location:'/loop'});r.end()}});
 for(const path of ['declared','stream'])await assert.rejects(webFetch('http://public.test/'+path,ready(),f.options),{code:'web_too_large'});
 for(const path of ['binary','gzip'])await assert.rejects(webFetch('http://public.test/'+path,ready(),f.options),{code:'web_content_unsupported'});
 const before=f.received.length;await assert.rejects(webFetch('http://public.test/loop',ready(),f.options),{code:'web_redirect_limit'});assert.equal(f.received.length-before,WEB_REDIRECTS+1);
});
test('21e web: output byte bound preserves Unicode and HTML extraction handles malformed input without evaluating it',async t=>{
 const f=await site(t,(q,r)=>{r.writeHead(200,{'Content-Type':q.url==='/html'?'text/html':'text/plain'});r.end(q.url==='/html'?'<'.repeat(WEB_MAX_BYTES):'🙂'.repeat(30000))});
 const page=await webFetch('http://public.test/',ready(),f.options);assert.equal(page.truncated,true);assert.equal(Buffer.byteLength(page.text),WEB_TEXT_BYTES);assert.equal(page.text.includes('\ufffd'),false);
 assert.equal((await webFetch('http://public.test/html',ready(),f.options)).truncated,true);
});
test('21e web: timeout and cancellation abort a hanging request; late DNS cannot open a socket',async t=>{
 const f=await site(t,(_q,r)=>{r.writeHead(200,{'Content-Type':'text/plain'});r.flushHeaders()});
 await assert.rejects(webFetch('http://public.test/',ready(),{...f.options,timeoutMs:30}),{code:'web_timeout'});
 const entered=deferred(),reply=deferred<{address:string;family:number}[]>(),controller=new AbortController();let opened=0;
 const pending=webFetch('http://pending.test/',controller.signal,{resolve:async()=>{entered.resolve();return reply.promise},request:()=>{opened++;throw Error('must not connect')}});
 const stopped=assert.rejects(pending,{code:'cancelled'});await entered.promise;controller.abort();await stopped;reply.resolve([{address:'93.184.215.14',family:4}]);await Promise.resolve();assert.equal(opened,0);
});
test('21e web: cancelling a streamed response closes its socket before the next tool step',{timeout:5000},async t=>{
 const entered=deferred(),closed=deferred(),controller=new AbortController(),f=await site(t,(_q,res)=>{res.once('close',()=>closed.resolve());res.writeHead(200,{'Content-Type':'text/plain'});res.write('partial');entered.resolve()});
 const stopped=assert.rejects(webFetch('http://public.test/',controller.signal,f.options),{code:'cancelled'});await entered.promise;controller.abort();await Promise.all([stopped,closed.promise]);assert.equal(f.received.length,1);
});
test('21e web: API agent exposes only the web reader, redacts route keys and sends no credential to the page',async t=>{
 const f=await site(t,(_q,r)=>{r.writeHead(200,{'Content-Type':'text/plain'});r.end('fixture-route-secret')});const h=agentFixture(t);h.seat.mode='web';h.ctx.env={HTTPS_PROXY:'http://127.0.0.1:3777'};
 const model=modelDouble((_r,i)=>[i===0?end([tool('web_fetch',{url:'http://public.test/'})],'tool-calls'):end()]);model.protection.add('fixture-route-secret');
 await new ApiAgent('local',{service:()=>model.service,web:f.options}).runTurn(h.seat,'task',h.ctx);
 const names=model.requests[0]!.tools!.map(t=>t.name);assert.ok(names.includes('web_fetch'));assert.ok(names.includes('read_file'));for(const name of ['shell','write_file','edit_file','web_search'])assert.equal(names.includes(name),false);
 assert.match(JSON.stringify(model.requests[1]!.messages),/ключ скрыт/);assert.doesNotMatch(JSON.stringify(model.requests[1]!.messages),/fixture-route-secret/);assert.equal(f.received[0]!.headers.authorization,undefined);assert.equal(f.received[0]!.headers.cookie,undefined);
});
test('21e web: live example.com text fetch',{skip:process.env.HARNESS_WEB_LIVE==='1'?false:'HARNESS_WEB_LIVE=1 required',timeout:15000},async()=>{
 const result=await webFetch('https://example.com',ready());assert.equal(result.status,200);assert.match(result.text,/Example Domain/);assert.ok(result.bytes<=WEB_MAX_BYTES);assert.ok(Buffer.byteLength(result.text)<=WEB_TEXT_BYTES);
});
