import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync,deflateSync,brotliCompressSync} from 'node:zlib';
import {fixture,call} from './test-helpers.ts';
import {BODY_LIMIT} from './security.ts';

test('7/21/24/66/69: browser authority precedes every API dispatch, including reads, HEAD and old sessions',async t=>{
 const h=await fixture(t),own=h.api.url;
 for(const path of ['/api/status','/api/journal','/api/events/all','/api/sessions/old','/api/sessions'])for(const method of ['GET','HEAD']){
 const a=await call(h.api,path,{method,headers:{Host:'evil.invalid','X-Forwarded-Host':new URL(own).host}});assert.equal(a.status,403);if(method==='GET')assert.deepEqual(a.body,{ok:false,code:'host_denied',error:'запрос не с локального адреса окна'})}
 for(const origin of ['http://evil.invalid','null',own+'/','https://'+new URL(own).host]){const a=await call(h.api,'/api/project',{body:{path:h.dir},headers:{Origin:origin}});assert.equal(a.status,403);assert.deepEqual(a.body,{ok:false,code:'origin_denied',error:'запрос с чужой страницы отклонён'})}
 for(const fetchSite of ['cross-site','same-site'])for(const path of ['/api/project','/api/sessions/old']){const a=await call(h.api,path,{...(path==='/api/project'?{body:{path:h.dir}}:{}),headers:{'Sec-Fetch-Site':fetchSite,'Sec-Fetch-Dest':'image'}});assert.equal(a.status,403)}
 for(const site of ['none','same-origin'])assert.equal((await call(h.api,'/api/project',{body:{path:h.dir},headers:{'Sec-Fetch-Site':site}})).status,200);
 for(const host of ['localhost','127.0.0.1','[::1]'])assert.equal((await call(h.api,'/api/project',{body:{path:h.dir},headers:{Host:host+':'+new URL(own).port,Origin:'http://'+host+':'+new URL(own).port}})).status,200);
 assert.equal((await call(h.api,'/api/project',{body:{path:h.dir}})).status,200);
 assert.deepEqual((await call(h.api,'/api/project',{raw:'{}',headers:{'Content-Type':'text/plain'}})).body,{ok:false,code:'content_type',error:'тело запроса должно быть application/json'});
 assert.equal((await call(h.api,'/api/project',{raw:'{}',headers:{'Content-Type':'text/plain'}})).status,415);
 for(const method of ['GET','HEAD']){assert.equal((await call(h.api,'/api/sessions/old',{method})).status,405);assert.equal((await call(h.api,'/api/sessions/old',{method,headers:{Origin:'null'}})).status,403)}
 assert.equal(h.provider.messageCalls,0);assert.equal(h.runtime.registry.get('worker')!.sessionId,null);
});

test('13/23/69/71: decoded byte cap accepts exact limit, denies chunked and compressed overflow, and rejects nonobjects/invalid UTF8',async t=>{
 const h=await fixture(t);
 for(const raw of ['{','null','[]','42','"hi"',Buffer.from([0x7b,0xff,0x7d])]){const a=await call(h.api,'/api/project',{raw});assert.equal(a.status,400);assert.deepEqual(a.body,{error:'тело не JSON-объект'})}
 const prefix=JSON.stringify({path:h.dir,padding:''}),exact=prefix.replace('"padding":""','"padding":"'+'x'.repeat(BODY_LIMIT-Buffer.byteLength(prefix))+'"');assert.equal(Buffer.byteLength(exact),BODY_LIMIT);
 assert.equal((await call(h.api,'/api/project',{raw:exact})).status,200);
 const over=Buffer.from(exact+' ');
 const cases:{raw:Buffer|Buffer[];headers:Record<string,string>}[]=[{raw:[over.subarray(0,1000),over.subarray(1000)],headers:{'Transfer-Encoding':'chunked'}}];
 for(const [encoding,compress] of [['gzip',gzipSync],['deflate',deflateSync],['br',brotliCompressSync]] as const){assert.equal((await call(h.api,'/api/project',{raw:compress(Buffer.from(exact)),headers:{'Content-Encoding':encoding}})).status,200);cases.push({raw:compress(over),headers:{'Content-Encoding':encoding}})}
 for(const c of cases){const a=await call(h.api,'/api/project',c);assert.equal(a.status,413);assert.equal(a.text,'Maximum request body size 2000000 exceeded.');assert.match(String(a.headers['content-type']),/^text\/plain/)}
 assert.deepEqual((await call(h.api,'/api/project',{raw:Buffer.from('invalid gzip'),headers:{'Content-Encoding':'gzip'}})).body,{error:'тело не JSON-объект'});
 assert.equal(h.runtime.project.dir,h.dir);
});

test('6/19: unknown paths and wrong methods keep aiohttp text, JSON uses Python ascii/spacing',async t=>{
 const h=await fixture(t);
 assert.deepEqual((await call(h.api,'/api/unknown')).body,'404: Not Found');assert.equal((await call(h.api,'/api/unknown')).status,404);
 const a=await call(h.api,'/api/status',{body:{}});assert.equal(a.status,405);assert.equal(a.text,'405: Method Not Allowed');assert.equal(a.headers.allow,'GET,HEAD');
 const b=await call(h.api,'/api/panes/missing',{body:{}});assert.equal(b.text,'{"error": "\\u043d\\u0435\\u0442 \\u043e\\u043a\\u043d\\u0430"}');assert.equal(b.status,404)
});
