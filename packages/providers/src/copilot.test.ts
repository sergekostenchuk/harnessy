import test from 'node:test';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync,mkdirSync,statSync,readdirSync,symlinkSync,renameSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {copilotFixture} from './copilot-test-helpers.ts';
import {CliProvider} from './cli/provider.ts';
import {CliStateStore} from './cli/state.ts';
import {ProviderCatalog,cliEntry} from './catalog.ts';

test('261/281: process metadata uses only RPC reads, masks account, keeps HOME and excludes environment overrides',async t=>{
 const h=await copilotFixture(t),{row}=await new ProviderCatalog([h.entry]).read('copilot');
 assert.equal(row.version,'1.0.12');assert.equal(row.login.state,'ok');assert.equal(row.login.account,'a•••@github.com');assert.deepEqual(row.models,[{id:'cp-model',label:'Copilot Model'}]);assert.deepEqual(row.capabilities,{headless:true,resume:true,mcp:true,limits:true});
 for(const c of h.capture().filter(c=>c.args)){assert.equal(c.home,process.env.HOME);assert.deepEqual(c.forbidden,[]);assert.ok(!c.args.includes('--prompt'))}
 assert.deepEqual(h.capture().filter(c=>c.rpc).map(c=>c.rpc),['auth.getStatus','models.list']);for(const c of h.capture().filter(c=>c.rpc))assert.equal(existsSync(c.config),false);
 assert.equal(readdirSync(h.stateRoot).length,0);
});
for(const scenario of ['logged-out','no-identity','bad-models','wrong-id','broken-rpc'])test('261: absent or forged metadata cannot start Copilot: '+scenario,async t=>{
 const h=await copilotFixture(t,scenario),{row}=await new ProviderCatalog([h.entry]).read('copilot');assert.equal(row.login.state,scenario==='logged-out'?'none':'error');
 await assert.rejects(h.provider.runTurn(h.seat,'do not run',h.ctx));assert.equal(h.capture().some(c=>c.turn),false);assert.equal(h.registered.length,0);
});
test('261: missing Copilot is installed:false, not an empty ready catalog',async t=>{const h=await copilotFixture(t),entry=cliEntry({...h.description,binary:join(h.dir,'missing')},h.deps);assert.equal((await new ProviderCatalog([entry]).read('copilot')).row.installed,false)});
test('261/281: read/edit/all use documented permissions, isolated MCP and process tool traces',async t=>{
 const h=await copilotFixture(t,'bridge');
 for(const mode of ['read','edit','all'] as const){const r=await h.provider.runTurn({...h.seat,id:mode,mode},'a literal $(touch /never)',h.ctx);assert.equal(r.text,'готов');const c=h.capture().filter(c=>c.turn).at(-1)!,args=h.capture().filter(c=>c.args?.includes('--prompt')).at(-1)!.args;
  assert.equal(c.mode,0o700);assert.ok(c.config.startsWith(realpathSync(h.stateRoot)));assert.ok(args.includes('--disable-builtin-mcps'));assert.ok(args.includes('--no-bash-env'));assert.ok(args.includes('--no-custom-instructions'));
  if(mode==='all'){assert.ok(args.includes('--allow-all-tools'));assert.ok(args.includes('--allow-all-paths'))}else{assert.ok(args.includes('--deny-tool=shell'));assert.ok(args.includes(mode==='read'?'--deny-tool=write':'--allow-tool=write'));assert.equal(args.includes('--allow-all-paths'),false)}
 }
 assert.equal(h.requests.length,3);assert.deepEqual(h.traces.map(t=>t.phase),['call','result','call','result','call','result']);assert.equal(h.traces.every(e=>e.phase==='call'||e.outcome==='ok'),true);
 for(const c of h.capture().filter(c=>c.mcp)){assert.equal(c.mcpMode,0o600);assert.equal(existsSync(c.mcp),false)}assert.deepEqual(h.registered,h.revoked);
 for(const e of h.events)if(e.type==='done')assert.deepEqual(e.usage,{input:null,output:null,cacheRead:null});
});
test('281: new instance resumes only its own project/seat; close preserves history',async t=>{
 const h=await copilotFixture(t),first=await h.provider.runTurn(h.seat,'first',h.ctx),state=h.capture().find(c=>c.turn).config;await h.provider.close();
 const restarted=new CliProvider(h.description,h.deps);t.after(()=>restarted.close());await restarted.runTurn({...h.seat,sessionId:first.sessionId},'second',h.ctx);assert.equal(h.capture().filter(c=>c.turn).at(-1)!.config,state);assert.ok(existsSync(join(state,'session-state',first.sessionId!)));
 const other=join(h.dir,'other-project');mkdirSync(other);await assert.rejects(restarted.runTurn({...h.seat,sessionId:first.sessionId},'foreign',{...h.ctx,projectDir:other}),{code:'session_missing'});
 await assert.rejects(restarted.runTurn({...h.seat,id:'other-seat',sessionId:first.sessionId},'foreign',h.ctx),{code:'session_missing'});
 assert.equal(readFileSync(join(state,'session-state',first.sessionId!),'utf8'),'own conversation');
});
test('281: private login mismatch, unsupported mode and missing project fail before model',async t=>{
 const h=await copilotFixture(t,'state-account');await assert.rejects(h.provider.runTurn(h.seat,'x',h.ctx),{code:'login_changed'});
 await assert.rejects(h.provider.runTurn({...h.seat,mode:'web'},'x',h.ctx),{code:'capability_unsupported'});
 await assert.rejects(h.provider.runTurn(h.seat,'x',{...h.ctx,projectDir:null}),{code:'protocol'});assert.equal(h.capture().some(c=>c.turn),false);assert.deepEqual(h.registered,h.revoked);
});
for(const scenario of ['denied','crash','truncated'])test('261: process '+scenario+' is an explicit failure and releases MCP',async t=>{
 const h=await copilotFixture(t,scenario);await assert.rejects(h.provider.runTurn(h.seat,'x',h.ctx),{code:scenario==='denied'?'permission_denied':'transport_lost'});assert.deepEqual(h.registered,h.revoked);assert.equal(h.events.some(e=>e.type==='done'),false);
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

test('281: cancellation kills the process, revokes MCP and releases the persistent seat for another instance',async t=>{
 const h=await copilotFixture(t,'hang'),job=h.provider.runTurn(h.seat,'wait',h.ctx),rejected=assert.rejects(job,{code:'cancelled'});
 for(let n=0;n<800&&!h.capture().some(c=>c.mcp);n++)await delay(10);assert.ok(h.capture().some(c=>c.mcp));h.controller.abort();await rejected;
 assert.deepEqual(h.registered,h.revoked);for(const c of h.capture().filter(c=>c.mcp))assert.equal(existsSync(c.mcp),false);
 const store=new CliStateStore('copilot',h.stateRoot),lease=store.acquire(h.dir,h.seat.id);lease.release();assert.equal(h.events.some(e=>e.type==='done'),false);
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

for(const target of ['seat','project','root','replacement'])test('286: state '+target+' substitution during the final async check cannot start Copilot',async t=>{
 const h=await copilotFixture(t),root=join(realpathSync(h.stateRoot),'copilot'),hash=createHash('sha256').update(realpathSync(h.dir)).digest('hex'),state=join(root,hash,h.seat.id),outside=join(h.dir,'outside-state');mkdirSync(outside);writeFileSync(join(outside,'untouched'),'keep');let starts=0;
 await assert.rejects(h.provider.runTurn(h.seat,'must not run',{...h.ctx,modelStarted:()=>{starts++},beforeModel:async()=>{
  const path=target==='root'?root:target==='project'?join(root,hash):state;renameSync(path,path+'-saved');if(target==='replacement')mkdirSync(path);else symlinkSync(outside,path);
 }}),{code:'state_dir_tampered'});
 assert.equal(starts,0);assert.equal(h.capture().some(c=>c.turn),false);assert.equal(h.events.some(e=>e.type==='done'),false);assert.deepEqual(h.registered,h.revoked);assert.deepEqual(readdirSync(outside),['untouched']);assert.equal(readFileSync(join(outside,'untouched'),'utf8'),'keep');
});
