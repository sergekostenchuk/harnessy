import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,realpathSync,rmSync,existsSync,readFileSync,statSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {TraceStore,traceData} from './trace.ts';
function store(t:any,options=()=>({enabled:true,maxBytes:32768})){const dir=realpathSync(mkdtempSync(join(tmpdir(),'harnessy-trace-')));mkdirSync(join(dir,'.harness/state'),{recursive:true});const s=new TraceStore(dir,options,()=>1800000000000);t.after(async()=>{await s.close();rmSync(dir,{recursive:true,force:true})});return s}
test('233: buffered spans preserve their chain and sequence after restart without blocking the caller',async t=>{
 const s=store(t),click=s.record('ui.action',{actor:'owner',data:{action:'Назначить оркестратора'}});s.run(click,()=>{s.record('http.request');s.record('tool.result',{actor:'model:lead',outcome:'rejected',reason:{code:'approval_policy',text:'Вызов отклонён политикой'}})});assert.equal(existsSync(s.path),false);await s.flush();const rows=await s.read({traceId:click.traceId});assert.equal(rows.length,3);assert.deepEqual(rows.map(r=>r.seq),[1,2,3]);assert.equal(rows[2]!.parentSpanId,click.spanId);assert.equal(rows[2]!.reason.code,'approval_policy');assert.equal((await s.read({outcome:'rejected'})).length,1);const next=new TraceStore(s.project);t.after(()=>next.close());next.record('ui.action');await next.flush();assert.equal((await next.read()).at(-1)!.seq,4);
});
test('238: tool text, secret fields, nested credentials and foreign paths never enter trace bytes',async t=>{
 const s=store(t),secret='fixture-secret-value-not-real';s.record('tool.call',{data:{name:'write_file',token:secret,args:{api_key:secret,text:'opaque private credentials',path:'/outside/project/private.key'},result:'raw provider output '+secret},reason:{code:'provider_error',text:'Failed at /outside/project/file'}});await s.flush();const bytes=readFileSync(s.path,'utf8');assert.ok(!bytes.includes(secret));assert.ok(!bytes.includes('opaque private credentials'));assert.ok(!bytes.includes('/outside'));assert.ok(!bytes.includes('raw provider output'));assert.equal((await s.read())[0]!.truncated,true);assert.equal((traceData({name:'x'.repeat(9000)},s.project).data as any).name.length<=256,true);
});
test('233/238: rotation bounds retained bytes and concurrent engines do not repeat sequence numbers',async t=>{
 const s=store(t),other=new TraceStore(s.project,()=>({enabled:true,maxBytes:32768}));t.after(()=>other.close());for(let n=0;n<5;n++){for(let i=0;i<20;i++){s.record('ui.action',{data:{action:'a'.repeat(100),index:i}});other.record('ui.action',{data:{action:'b'.repeat(100),index:i}})}await Promise.all([s.flush(),other.flush()])}const rows=await s.read();assert.ok(existsSync(s.path+'.1'));assert.ok(statSync(s.path).size+statSync(s.path+'.1').size<=32768);assert.equal(new Set(rows.map(r=>r.seq)).size,rows.length);assert.equal(rows.at(-1)!.seq,200);
});
test('238: disabled tracing writes nothing; an unsafe trace path cannot overwrite another file or interrupt work',async t=>{
 const off=store(t,()=>({enabled:false,maxBytes:32768}));off.record('turn.start');await off.flush();assert.equal(existsSync(off.path),false);const s=store(t),outside=join(s.project,'sentinel');writeFileSync(outside,'unchanged');symlinkSync(outside,s.path);assert.doesNotThrow(()=>s.record('turn.start'));await s.flush();assert.equal(readFileSync(outside,'utf8'),'unchanged');assert.ok(s.status.error);assert.equal(s.status.dropped,1);
});

test('238: reducing the size rotates the retained tail and keeps sequence numbers increasing',async t=>{
 let cap=128*1024;const s=store(t,()=>({enabled:true,maxBytes:cap}));for(let i=0;i<70;i++)s.record('ui.action',{data:{action:'fixture '+i,name:'x'.repeat(200)}});await s.flush();const before=(await s.read()).at(-1)!.seq;cap=32768;s.record('ui.action');await s.flush();assert.equal((await s.read()).at(-1)!.seq,before+1);assert.ok(statSync(s.path).size+statSync(s.path+'.1').size<=cap);
});

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
test('233: two OS processes append and rotate one project without duplicate sequence numbers',async t=>{
 const s=store(t),code="const {TraceStore}=await import(process.argv[2]);const s=new TraceStore(process.argv[1],()=>({enabled:true,maxBytes:32768}));for(let round=0;round<3;round++){for(let i=0;i<12;i++)s.record('ui.action',{data:{action:'fixture'}});await s.flush()}if(s.status.dropped)throw Error('dropped '+s.status.dropped);await s.close();",run=()=>promisify(execFile)(process.execPath,['--input-type=module','-e',code,s.project,new URL('./trace.ts',import.meta.url).href]);await Promise.all([run(),run()]);const rows=await s.read();assert.equal(new Set(rows.map(r=>r.seq)).size,rows.length);assert.equal(rows.at(-1)!.seq,72);
});
test('238: a secret in a reason is masked while a canonical API route remains useful',async t=>{const s=store(t);s.record('http.response',{data:{route:'/api/panes/:id/attempt'},reason:{code:'provider_error',text:'Bearer short-token; password=tiny; sk-short; {"access_token":"quoted"}'}});await s.flush();const row=(await s.read())[0]!;assert.equal((row.data as any).route,'/api/panes/:id/attempt');for(const value of ['short-token','tiny','sk-short','quoted'])assert.ok(!row.reason.text.includes(value));});

test('238: nested numeric payloads are bounded and throwing getters cannot interrupt the model',async t=>{const s=store(t);let payload:unknown=12;for(let i=0;i<4;i++)payload=Array(16).fill(payload);const r=traceData(payload,s.project);assert.ok(Buffer.byteLength(JSON.stringify(r.data))<=4096);assert.equal(r.truncated,true);assert.doesNotThrow(()=>s.record('tool.call',{data:{get broken(){throw Error('private getter')}}}));await s.flush();assert.equal((await s.read())[0]!.truncated,true);});

test('233/234: project-open restoration preserves journal parents; turn lookup never waits for storage',async t=>{const s=store(t),span=s.record('queue.posted',{refs:{journalSeq:7}});await s.flush();const next=new TraceStore(s.project);t.after(()=>next.close());await next.restore();assert.equal(next.parentForJournal([7])?.traceId,span.traceId);next.read=()=>{throw Error('disk read must not precede a turn')};assert.equal(next.parentForJournal([7])?.spanId,span.spanId);assert.equal(next.parentForJournal([999]),undefined);});
