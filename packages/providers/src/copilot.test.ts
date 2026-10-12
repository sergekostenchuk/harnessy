import test from 'node:test';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync,mkdirSync,statSync,readdirSync,symlinkSync,renameSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {copilotFixture} from './copilot-test-helpers.ts';
import {CliStateStore} from './cli/state.ts';
import {ProviderCatalog,cliEntry} from './catalog.ts';
import {COPILOT_UNAVAILABLE} from './copilot.ts';
import {bridge} from './bridge-test-support.ts';

test('261/281: process metadata uses only RPC reads, masks account, keeps HOME and excludes environment overrides',async t=>{
 const h=await copilotFixture(t),{row}=await new ProviderCatalog([h.entry]).read('copilot');
 assert.equal(row.version,'1.0.12');assert.equal(row.login.state,'ok');assert.equal(row.login.account,'a•••@github.com');assert.deepEqual(row.models,[{id:'cp-model',label:'Copilot Model'}]);assert.deepEqual(row.capabilities,{headless:true,resume:false,mcp:false,limits:true});
 for(const c of h.capture().filter(c=>c.args)){assert.equal(c.home,process.env.HOME);assert.deepEqual(c.forbidden,[]);assert.ok(!c.args.includes('--prompt'))}
 assert.deepEqual(h.capture().filter(c=>c.rpc).map(c=>c.rpc),['auth.getStatus','models.list']);for(const c of h.capture().filter(c=>c.rpc))assert.equal(existsSync(c.config),false);
 assert.equal(readdirSync(h.stateRoot).length,0);
});
for(const scenario of ['logged-out','no-identity','bad-models','wrong-id','broken-rpc'])test('261: absent or forged metadata cannot start Copilot: '+scenario,async t=>{
 const h=await copilotFixture(t,scenario),{row}=await new ProviderCatalog([h.entry]).read('copilot');assert.equal(row.login.state,scenario==='logged-out'?'none':'error');
 await assert.rejects(h.provider.runTurn(h.seat,'do not run',h.ctx));assert.equal(h.capture().some(c=>c.turn),false);assert.equal(h.registered.length,0);
});
test('261: missing Copilot is installed:false, not an empty ready catalog',async t=>{const h=await copilotFixture(t),entry=cliEntry({...h.description,binary:join(h.dir,'missing')},h.deps);assert.equal((await new ProviderCatalog([entry]).read('copilot')).row.installed,false)});
// 293 cancels the old successful Copilot turn/resume invariant. Stream parsing and
// generic CLI execution remain covered separately; this adapter must refuse every mode.
for(const mode of ['chat','read','edit','all'] as const)for(const sessionId of [null,'ab123456-1234-1234-1234-123456789abc'])test('293: direct '+mode+' / '+(sessionId?'resume':'new')+' refuses before any await, token or state mutation',async t=>{
 const h=await copilotFixture(t),store=new CliStateStore('copilot',h.stateRoot),lease=store.acquire(h.dir,h.seat.id);writeFileSync(join(lease.path,'session'),'keep existing history');lease.release();const contents=readdirSync(lease.path),root=readdirSync(h.stateRoot);let callbacks=0;
 await assert.rejects(h.provider.runTurn({...h.seat,mode,sessionId},'no turn',{...h.ctx,beforeModel:async()=>{callbacks++},modelStarted:()=>{callbacks++}}),{code:'capability_unsupported',vendorText:COPILOT_UNAVAILABLE});
 assert.equal(callbacks,0);assert.deepEqual(h.capture(),[]);assert.deepEqual(h.registered,[]);assert.deepEqual(h.revoked,[]);assert.deepEqual(h.events,[]);assert.deepEqual(readdirSync(lease.path),contents);assert.deepEqual(readdirSync(h.stateRoot),root);assert.equal(readFileSync(join(lease.path,'session'),'utf8'),'keep existing history');await h.provider.close();assert.ok(existsSync(lease.path));
});
test('293: catalog entry cannot launch Copilot even with a supplied model and no state input',async t=>{
 const h=await copilotFixture(t),row=(await new ProviderCatalog([h.entry]).read('copilot')).row;assert.equal(row.reason,COPILOT_UNAVAILABLE);assert.equal(row.capabilities.resume,false);assert.equal(row.capabilities.mcp,false);assert.equal(row.capabilities.limits,true);assert.equal(row.login.state,'ok');assert.equal(row.models[0]!.id,'cp-model');const before=h.capture().length;
 await assert.rejects(h.entry.runTurn(undefined as never,'no turn',undefined as never),{code:'capability_unsupported',vendorText:COPILOT_UNAVAILABLE});assert.equal(h.capture().length,before);assert.deepEqual(readdirSync(h.stateRoot),[]);
});
test('293: the MCP bridge has no probe/resume escape hatch',async()=>{
 const r=await bridge(['probe','provider_probe','resume'].map((name,i)=>({jsonrpc:'2.0',id:i+1,method:'tools/call',params:{name,arguments:{provider:'copilot',model:'cp-model',from:'owner'}}})));
 assert.deepEqual(r.requests,[]);for(const row of r.replies){const result=row.result as any;assert.equal(result.isError,true);assert.match(JSON.stringify(result),/unknown_request/)}
});
test('281/282: state cleanup is journaled, preserves neighbours, refuses traversal, symlinks and a running seat',async t=>{
 const h=await copilotFixture(t),store=new CliStateStore('copilot',h.stateRoot),a=store.acquire(h.dir,'worker'),b=store.acquire(h.dir,'reviewer');writeFileSync(join(a.path,'session'),'worker');writeFileSync(join(b.path,'session'),'reviewer');
 assert.equal(statSync(a.path).mode&0o777,0o700);assert.throws(()=>store.acquire(h.dir,'worker'),{code:'busy'});await assert.rejects(store.remove(h.dir,undefined,()=>{}),{code:'busy'});a.release();b.release();
 await assert.rejects(store.remove(h.dir,'../outside',()=>{}),{code:'protocol'});await assert.rejects(store.remove(h.dir,'worker',()=>{throw Error('journal failed')}));assert.ok(existsSync(a.path));
 const journal:any[]=[];await store.remove(h.dir,'worker',e=>{journal.push(e)});assert.equal(existsSync(a.path),false);assert.equal(readFileSync(join(b.path,'session'),'utf8'),'reviewer');assert.equal(journal[0].kind,'provider.state.remove');
 symlinkSync(h.dir,a.path);await assert.rejects(store.remove(h.dir,'worker',()=>{}),{code:'protocol'});assert.ok(existsSync(h.account));
 const root=join(h.stateRoot,'copilot');renameSync(root,root+'-saved');symlinkSync(h.dir,root);await assert.rejects(store.remove(h.dir,'reviewer',()=>{}),{code:'protocol'});assert.ok(existsSync(h.account));
});
test('282: cleanup holds exclusion across the journal await',async t=>{
 const h=await copilotFixture(t),store=new CliStateStore('copilot',h.stateRoot),a=store.acquire(h.dir,'worker');a.release();let resume!:()=>void;const waiting=new Promise<void>(r=>resume=r),job=store.remove(h.dir,'worker',()=>waiting);
 assert.throws(()=>store.acquire(h.dir,'worker'),{code:'busy'});resume();await job;const next=store.acquire(h.dir,'worker');next.release();
});

test('281/282: process-owned lease excludes a second engine and recovers after a crashed engine',async t=>{
 const h=await copilotFixture(t),module=new URL('./cli/state.ts',import.meta.url).href;
 const script='import {CliStateStore} from '+JSON.stringify(module)+'; new CliStateStore("copilot",process.argv[1]).acquire(process.argv[2],"worker"); console.log("locked"); setInterval(()=>{},1000)';
 const child=spawn(process.execPath,['--input-type=module','-e',script,h.stateRoot,h.dir],{stdio:['ignore','pipe','pipe']});t.after(()=>child.kill('SIGKILL'));
 const exited=new Promise<void>((resolve,reject)=>{child.on('error',reject);child.on('close',()=>resolve())});let errors='';child.stderr.on('data',b=>errors+=b);
 await Promise.race([new Promise<void>(resolve=>child.stdout.once('data',()=>resolve())),exited.then(()=>{throw Error(errors)})]);
 const store=new CliStateStore('copilot',h.stateRoot);assert.throws(()=>store.acquire(h.dir,'worker'),{code:'busy'});child.kill('SIGKILL');await exited;
 const recovered=store.acquire(h.dir,'worker');recovered.release();let journal=0;await store.remove(h.dir,undefined,()=>{journal++});assert.equal(journal,1);assert.equal(existsSync(recovered.path),false);
});

test('293: an executor-boundary directory replacement is unreachable; outside files and saved state remain intact',async t=>{
 const h=await copilotFixture(t),store=new CliStateStore('copilot',h.stateRoot),lease=store.acquire(h.dir,h.seat.id),outside=join(h.dir,'outside');writeFileSync(join(lease.path,'session'),'safe state');lease.release();mkdirSync(outside);writeFileSync(join(outside,'keep'),'safe neighbour');
 // This is the reviewer's replacement boundary. No metadata or model executor may reach it.
 const {CliProvider}=await import('./cli/provider.ts');let calls=0;const provider=new CliProvider(h.description,{...h.deps,execute:async()=>{calls++;renameSync(lease.path,lease.path+'-saved');symlinkSync(outside,lease.path);throw Error('unsafe executor reached')}});t.after(()=>provider.close());
 await assert.rejects(provider.runTurn(h.seat,'no turn',h.ctx),{code:'capability_unsupported'});assert.equal(calls,0);assert.equal(readFileSync(join(lease.path,'session'),'utf8'),'safe state');assert.equal(readFileSync(join(outside,'keep'),'utf8'),'safe neighbour');assert.deepEqual(readdirSync(outside),['keep']);assert.equal(existsSync(lease.path+'-saved'),false);
});
