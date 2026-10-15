import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fixture,call} from './test-helpers.ts';

test('TS-28: HTTP spans carry only typed path identities; a forged credential in path, body or query is absent',async t=>{
 const h=await fixture(t),paths=[['/api/network/exits/fixture-exit/removal','exit','fixture-exit'],['/api/network/providers/claude','providerId','claude'],['/api/panes/worker','paneId','worker'],['/api/chats/cdeadbeef','chatId','cdeadbeef'],['/api/llm/providers/fixture-route','routeId','fixture-route']] as const;
 for(const [path,key,id] of paths){await call(h.api,path);const rows=await h.runtime.project.trace.read();assert.ok(rows.some(row=>row.kind==='http.request'&&(row.data as Record<string,unknown>)[key]===id),path)}
 const secret='sk_test_syntheticsecret1234567890',reply=await call(h.api,'/api/network/exits/'+secret+'/save?password='+secret,{body:{password:secret}});assert.equal(reply.text.includes(secret),false);
 const records=await call(h.api,'/api/trace');assert.equal(records.text.includes(secret),false);await h.runtime.project.trace.flush();assert.equal(readFileSync(h.runtime.project.trace.path,'utf8').includes(secret),false);
});

test('TS-28: healthy background reads aggregate; bound, rejected and slow reads retain individual spans',async t=>{
 const h=await fixture(t);for(let i=0;i<31;i++)assert.equal((await call(h.api,'/api/status')).status,200);
 let rows=await h.runtime.project.trace.read();assert.ok(rows.some(row=>row.kind==='http.poll'&&(row.data as any).route==='/api/status'&&(row.data as any).count===30));assert.equal(rows.filter(row=>['http.request','http.response'].includes(row.kind)&&(row.data as any).route==='/api/status').length,0);
 const traceId=randomUUID(),spanId=randomUUID();await call(h.api,'/api/status',{headers:{'X-Harness-Trace-Id':traceId,'X-Harness-Span-Id':spanId,'X-Harness-Project':encodeURIComponent(h.dir),'X-Harness-Instance':h.runtime.project.trace.instanceId}});
 rows=await h.runtime.project.trace.read({traceId});assert.deepEqual(rows.filter(row=>row.kind.startsWith('http.')).map(row=>row.kind),['http.request','http.response']);
 const missing=await call(h.api,'/api/context/missing');assert.ok(missing.status>=400);h.provider.auth=async()=>{h.clock.advance(2500);return {loggedIn:true}};await call(h.api,'/api/connections');
 const stale=await call(h.api,'/api/status',{headers:{'X-Harness-Trace-Id':'sk_test_syntheticsecret1234567890'}});assert.equal(stale.status,409);
 rows=await h.runtime.project.trace.read();assert.ok(rows.some(row=>row.kind==='http.response'&&(row.data as any).route==='/api/context/:id'&&row.outcome!=='ok'));assert.ok(rows.some(row=>row.kind==='http.response'&&(row.data as any).route==='/api/connections'&&row.durationMs!==null&&row.durationMs>=2000));assert.ok(rows.some(row=>row.kind==='http.response'&&(row.data as any).route==='/api/status'&&row.reason.code==='project_changed'));assert.equal(JSON.stringify(rows).includes('sk_test_syntheticsecret1234567890'),false);
});

test('TS-28: three-part provider kind and fixed Electron events survive validation without exposing error text',async t=>{
 const h=await fixture(t),store=h.runtime.project.trace;store.record('provider.login_terminal.start',{data:{id:'claude'}});
 const binding={project:h.dir,instanceId:store.instanceId},body={action:'render-process-gone',page:'desktop',kind:'electron.outcome',outcome:'failed',reason:'internal',traceId:randomUUID(),spanId:randomUUID(),binding};
 assert.equal((await call(h.api,'/api/trace',{body})).status,200);assert.equal((await call(h.api,'/api/trace',{body:{...body,action:'sk_test_syntheticsecret1234567890',traceId:randomUUID()}})).status,400);
 const rows=await store.read();assert.ok(rows.some(row=>row.kind==='provider.login_terminal.start'));assert.ok(rows.some(row=>row.kind==='electron.outcome'&&(row.data as any).action==='render-process-gone'));
 const require=createRequire(import.meta.url),{reportDesktopTrace}=require('../../../ui/desktop/trace.js');const sent:any[]=[],secret='sk_test_syntheticsecret1234567890';
 const request=async(url:string,options?:{body?:string})=>{sent.push({url,body:options?.body});return url.endsWith('/api/status')?{json:async()=>({project:h.dir,trace:{instanceId:store.instanceId}})}:{ok:true}};
 assert.equal(await reportDesktopTrace('http://127.0.0.1:3777','did-fail-load',request,()=>{}),true);assert.equal(await reportDesktopTrace('http://127.0.0.1:3777',secret,request,()=>{}),false);assert.equal(JSON.stringify(sent).includes(secret),false);assert.equal(JSON.parse(sent[1].body).kind,'electron.outcome');
});
