import test from 'node:test';
import assert from 'node:assert/strict';
import {parse} from 'smol-toml';
import {OllamaProvider,OLLAMA_LOGIN_UNKNOWN,ollamaVersion} from './ollama.ts';
import {ProviderCatalog} from './catalog.ts';
import {ollamaFixture} from './ollama-test-helpers.ts';
import {cliFixture} from './cli/test-support.ts';
import {MODES} from './modes.ts';
import {codexExecStream} from './codex/exec-stream.ts';

test('334: Ollama catalog projects CLI version, daemon, cloud/local models, unknown cloud login and no limits',async t=>{
 const f=await ollamaFixture(t),catalog=new ProviderCatalog([f.entry]);t.after(()=>catalog.close());const {row}=await catalog.read('ollama');assert.equal(row.installed,true);assert.equal(row.version,'0.40.2');assert.equal(row.kind,'local');assert.equal(row.subtitle,'облако и локально');assert.deepEqual(row.service,{ok:true,version:'0.40.2'});assert.equal(row.login.state,'unknown');assert.equal(row.login.reason,OLLAMA_LOGIN_UNKNOWN);assert.equal(row.login.unverifiedAllowed,true);assert.equal(row.models.length,2);assert.match(row.models[0]!.label,/облако/);assert.match(row.models[1]!.label,/локально/);assert.equal(row.capabilities.limits,false);assert.equal(catalog.limitsEntries().length,0);for(const mode of Object.keys(MODES))assert.equal(row.capabilities.turn![mode as 'read']!.ok,true);assert.equal(f.capture().length,0);assert.ok(f.requests.every(p=>['/api/version','/api/tags'].includes(p)));
 f.setOffline(true);const down=(await catalog.read('ollama')).row;assert.equal(down.installed,true);assert.equal(down.service?.ok,false);assert.match(down.service!.reason!,/демон не запущен/);assert.equal(down.service!.command,'ollama serve');assert.equal(down.models.length,0);assert.equal(down.capabilities.probe?.ok,false);for(const mode of Object.keys(MODES))assert.equal(down.capabilities.turn![mode as 'read']!.ok,false);
 f.setOffline(false);assert.equal((await catalog.read('ollama')).row.models.length,2);assert.equal(f.capture().length,0);
});

for(const mode of Object.keys(MODES) as (keyof typeof MODES)[])test('334: '+mode+' uses Codex exec OSS with mode boundaries, private Harnessy MCP, resume and no API keys',async t=>{
 const f=await ollamaFixture(t),h=await cliFixture(t,'probe'),p=new OllamaProvider(f.options);t.after(()=>p.close());const seat={...h.seat,vendor:'ollama',cwd:f.dir,model:'glm-5.3:cloud',mode};const first=await p.runTurn(seat,'one',h.ctx);assert.equal(first.text,'готов');assert.equal(first.sessionId,'00000000-0000-4000-8000-000000000001');await p.runTurn({...seat,sessionId:first.sessionId},'two',h.ctx);
 const rows=f.capture();assert.equal(rows.length,2);for(const row of rows){const args:string[]=row.args;assert.equal(args[0],'exec');assert.ok(args.includes('--oss'));assert.equal(args[args.indexOf('--local-provider')+1],'ollama');assert.equal(args[args.indexOf('-m')+1],seat.model);assert.equal(args[args.indexOf('-s')+1],mode==='check'&&seat.worktree?'workspace-write':MODES[mode].sandbox);assert.ok(args.includes('--ignore-user-config'));assert.ok(args.includes('--ignore-rules'));assert.equal(row.apiKey,false);assert.equal(row.openaiKey,false);assert.equal(row.host,null);const settings=Object.assign({},...args.flatMap((a,i)=>a==='-c'?[parse(args[i+1]!)]:[]));assert.ok(args.some(a=>a.startsWith('mcp_servers.panes.env=')&&a.includes('PANE_TOKEN')));assert.ok(args.includes('features.hooks=false'));assert.ok(args.includes('approval_policy="'+MODES[mode].approval+'"'));assert.ok(args.some(a=>a.startsWith('sandbox_workspace_write.writable_roots=')));assert.ok(settings.developer_instructions)}
 assert.ok(!rows[0].args.includes('resume'));assert.ok(rows[1].args.includes('resume'));assert.equal(rows[1].args[rows[1].args.indexOf('resume')+1],first.sessionId);
});

test('334: unavailable daemon, forged/missing models and bounded HTTP never launch Codex',async t=>{
 const f=await ollamaFixture(t),h=await cliFixture(t,'probe'),p=new OllamaProvider(f.options),seat={...h.seat,vendor:'ollama',cwd:f.dir,model:'glm-5.3:cloud'};t.after(()=>p.close());f.setOffline(true);await assert.rejects(p.runTurn(seat,'never',h.ctx),{code:'transport_lost'});f.setOffline(false);
 for(const tags of [{},{models:[{name:'--host=evil'}]},{models:[{name:'valid',remote_model:'<img>'}]},{models:[{name:'same'},{name:'same'}]}]){f.setTags(tags);await assert.rejects(p.models(),{code:'models_unavailable'})}
 const slow=new OllamaProvider({...f.options,httpTimeoutMs:10,fetch:()=>new Promise(()=>{})});t.after(()=>slow.close());await assert.rejects(slow.models(),{code:'transport_lost'});assert.equal(f.capture().length,0);
});

test('334: exec decoder rejects fabricated completion, missing usage and incomplete tools',()=>{
 for(const event of [{type:'turn.completed',usage:{}},{type:'item.completed',item:{id:'1',type:'agent_message',text:'looks done'}}])assert.throws(()=>codexExecStream()(event),{code:'protocol'});
 const decode=codexExecStream();decode({type:'thread.started',thread_id:'00000000-0000-4000-8000-000000000001'});decode({type:'turn.started'});assert.throws(()=>decode({type:'turn.completed',usage:{input_tokens:2,output_tokens:1}}),{code:'protocol'});
});

test('334: installed CLI version survives a missing daemon or client/server mismatch',()=>{assert.equal(ollamaVersion('Warning: could not connect to a running Ollama instance\nWarning: client version is 0.40.2\n'),'0.40.2');assert.equal(ollamaVersion('ollama version is 0.39.1\nWarning: client version is 0.40.2\n'),'0.40.2');assert.throws(()=>ollamaVersion('login token: SECRET'),{code:'protocol'})});


test('334: Codex subprocess calls the real Harnessy bridge with its turn token and cleanup revokes it',async t=>{
 const f=await ollamaFixture(t,true),h=await cliFixture(t,'probe'),p=new OllamaProvider(f.options);t.after(()=>p.close());await p.runTurn({...h.seat,vendor:'ollama',model:'glm-5.3:cloud',cwd:f.dir},'fixture',h.ctx);
 assert.equal(h.requests.length,1);assert.deepEqual(h.requests[0]!.body,{from:'worker',to:'reviewer',kind:'status',text:'ollama fixture'});assert.equal(h.registered.length,1);assert.equal(h.requests[0]!.token,h.registered[0]);assert.deepEqual(h.revoked,h.registered);assert.ok(h.traces.some(e=>e.phase==='result'&&e.outcome==='ok'));
});

test('334: malformed, oversized and cancelled daemon responses are bounded typed refusals without model calls',async t=>{
 const f=await ollamaFixture(t);
 for(const response of [new Response('bad JSON SECRET'),new Response('x'.repeat(1_048_577)),Response.json({version:'spoofed-version SECRET'})]){
  const p=new OllamaProvider({...f.options,fetch:async()=>response});t.after(()=>p.close());await assert.rejects(p.auth(),(e:any)=>e.code==='protocol'&&!e.message.includes('SECRET'));
 }
 const p=new OllamaProvider({...f.options,fetch:()=>new Promise(()=>{})});t.after(()=>p.close());const abort=new AbortController();abort.abort();await assert.rejects(p.models(abort.signal),{code:'cancelled'});assert.equal(f.capture().length,0);
});

test('334: stream rejects missing tool names and terminal success with an unfinished call',()=>{
 const start=()=>{const d=codexExecStream();d({type:'thread.started',thread_id:'session-1'});d({type:'turn.started'});return d};
 assert.throws(()=>start()({type:'item.started',item:{id:'t1',type:'mcp_tool_call',status:'in_progress'}}),{code:'protocol'});
 const d=start();d({type:'item.started',item:{id:'t1',type:'mcp_tool_call',server:'panes',tool:'send',status:'in_progress'}});assert.throws(()=>d({type:'turn.completed',usage:{input_tokens:1,output_tokens:1,cached_input_tokens:0}}),{code:'protocol'});
});

for(const source of ['process','turn'] as const)test('337: '+source+' cannot redirect Codex away from the checked local daemon',async t=>{
 const f=await ollamaFixture(t),h=await cliFixture(t,'probe');const foreign={CODEX_OSS_BASE_URL:'https://foreign.invalid/v1',CODEX_OSS_PORT:'45678',OLLAMA_HOST:'https://foreign.invalid',OLLAMA_BASE_URL:'https://foreign.invalid',OLLAMA_URL:'https://foreign.invalid',OPENAI_BASE_URL:'https://foreign.invalid',OPENAI_API_BASE:'https://foreign.invalid',HTTP_PROXY:'https://foreign.invalid',HTTPS_PROXY:'https://foreign.invalid',ALL_PROXY:'https://foreign.invalid',http_proxy:'https://foreign.invalid',https_proxy:'https://foreign.invalid',all_proxy:'https://foreign.invalid',CODEX_FUTURE_ENDPOINT:'https://foreign.invalid',OTHER_API_KEY:'SECRET'};let captured:any;
 const p=new OllamaProvider({...f.options,env:{PATH:process.env.PATH,...(source==='process'?foreign:{})},execute:async(r,signal,hooks)=>{captured=r;return f.options.execute!(r,signal,hooks)}});t.after(()=>p.close());
 await p.runTurn({...h.seat,vendor:'ollama',model:'glm-5.3:cloud',cwd:f.dir},'fixture',{...h.ctx,env:source==='turn'?foreign:{}});
 assert.ok(f.requests.includes('/api/version')&&f.requests.includes('/api/tags'));assert.equal(captured.env.CODEX_OSS_BASE_URL,'http://127.0.0.1:11434/v1');assert.deepEqual(Object.keys(captured.env).sort(),['CODEX_OSS_BASE_URL','NO_PROXY','PATH','no_proxy']);assert.doesNotMatch(JSON.stringify(captured.env),/foreign|SECRET|45678/);assert.ok(captured.args.includes('--oss'));assert.equal(captured.args[captured.args.indexOf('--local-provider')+1],'ollama');
});
