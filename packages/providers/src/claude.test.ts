import {test} from 'node:test';
import assert from 'node:assert/strict';
import {query,type Query,type SDKUserMessage} from '@anthropic-ai/claude-agent-sdk';
import {ClaudeProvider,claudeOptions,claudeUsage,type ClaudeDependencies} from './claude.ts';
import {ProviderError} from './types.ts';
import {fixture,terminals,until} from './test-support.ts';
const init={type:'system',subtype:'init',session_id:'session'};
const done={type:'result',subtype:'success',is_error:false,session_id:'session',result:'fallback',duration_ms:12,usage:{input_tokens:10,output_tokens:3,cache_read_input_tokens:2}};
function harness(messages:unknown[]|(()=>AsyncGenerator<unknown>)){
 const options:Parameters<typeof query>[0][]=[],steering:SDKUserMessage[]=[];let interrupts=0,closed=0;
 const queryFn=((args:Parameters<typeof query>[0])=>{
 options.push(args);const gen=typeof messages==='function'?messages():(async function*(){yield* messages})();
 return Object.assign(gen,{interrupt:async()=>{interrupts++},streamInput:async(s:AsyncIterable<SDKUserMessage>)=>{for await(const m of s)steering.push(m)},close:()=>{closed++}}) as unknown as Query
 }) as typeof query;
 const deps:Partial<ClaudeDependencies>={queryFn,findBinary:async()=>'/fake/claude',authStatus:async()=>({loggedIn:true}),env:{ANTHROPIC_API_KEY:'not-real',CLAUDECODE:'nested'}};
 return {deps,options,steering,get interrupts(){return interrupts},get closed(){return closed}};
}
test('Claude stream, tool error, usage and early session without duplicate text',async()=>{
 const f=fixture('claude'),h=harness([init,{type:'stream_event',session_id:'session',event:{type:'content_block_delta',delta:{type:'text_delta',text:'hello'}}},
 {type:'assistant',session_id:'session',message:{content:[{type:'text',text:'hello'},{type:'tool_use',name:'Read',input:{file_path:'x'}}]}},
 {type:'user',session_id:'session',message:{content:[{type:'tool_result',is_error:true,content:'bad tool'}]}},done,done]);
 const result=await new ClaudeProvider(h.deps).runTurn(f.seat,'hi',f.ctx);
 assert.equal(result.text,'hello');assert.deepEqual(f.sessions,['session']);assert.equal(terminals(f.events).length,1);
 assert.equal(f.events.filter(e=>e.type==='delta').length,1);assert.ok(f.events.some(e=>e.type==='toolError'));
 const last=f.events.at(-1);assert.ok(last?.type==='done');assert.deepEqual(last.usage,{input:10,output:3,cacheRead:2});
 assert.equal(f.handle,null);assert.equal(h.closed,1);assert.equal(h.options[0]?.options?.env?.ANTHROPIC_API_KEY,undefined);
});
test('TS-51.E: Claude compact boundary reports only known volumes in the main session',async()=>{
 const unbound={type:'system',subtype:'compact_boundary',compact_metadata:{pre_tokens:9,post_tokens:1}},messages=[unbound,init,unbound,{...unbound,session_id:''},{...unbound,session_id:null},{type:'system',subtype:'compact_boundary',session_id:'foreign',compact_metadata:{pre_tokens:9,post_tokens:1}},{type:'system',subtype:'compact_boundary',session_id:'session',parent_tool_use_id:'child',compact_metadata:{pre_tokens:9,post_tokens:1}},
 {type:'system',subtype:'compact_boundary',session_id:'session',compact_metadata:{pre_tokens:120000}},
 {type:'system',subtype:'compact_boundary',session_id:'session',compact_metadata:{pre_tokens:5,post_tokens:0}},done];
 const f=fixture('claude');await new ClaudeProvider(harness(messages).deps).runTurn(f.seat,'x',f.ctx);
 assert.deepEqual(f.events.filter(e=>e.type==='contextChanged'),[{type:'contextChanged',kind:'provider_compaction',before:120000,after:null,source:'claude'},{type:'contextChanged',kind:'provider_compaction',before:5,after:0,source:'claude'}]);
});
test('Claude fallback uses assistant text, result text when assistant absent',async()=>{
 for(const messages of [[init,{type:'assistant',session_id:'session',message:{content:[{type:'text',text:'answer'}]}},done],[init,done]]){
 const f=fixture('claude');const result=await new ClaudeProvider(harness(messages).deps).runTurn(f.seat,'x',f.ctx);
 assert.equal(result.text,messages.length===3?'answer':'fallback');assert.equal(f.events.filter(e=>e.type==='delta').length,1)
 }
});
test('Claude EOF and foreign terminal cannot advance work',async()=>{
 for(const messages of [[init,{type:'assistant',session_id:'session',message:{content:[{type:'text',text:'partial'}]}}],[init,{...done,session_id:'foreign'}]]){
 const f=fixture('claude');await assert.rejects(new ClaudeProvider(harness(messages).deps).runTurn(f.seat,'x',f.ctx),e=>e instanceof ProviderError&&e.code==='transport_lost');
 assert.equal(terminals(f.events).length,1);assert.equal(f.events.at(-1)?.type,'error');assert.deepEqual(f.sessions,['session']);
 }
});
test('Claude error retains session and exact vendor text',async()=>{
 const f=fixture('claude'),h=harness([init,{...done,is_error:true,result:'No conversation found with session ID: x'}]);
 await assert.rejects(new ClaudeProvider(h.deps).runTurn(f.seat,'x',f.ctx),e=>e instanceof ProviderError&&e.code==='session_missing'&&e.sessionId==='session'&&e.vendorText==='No conversation found with session ID: x');
 assert.deepEqual(f.sessions,['session']);assert.equal(terminals(f.events).length,1);
});
test('Claude cancellation before spawn, absent binary and absent login',async()=>{
 const f=fixture('claude');f.controller.abort();const h=harness([done]);let binaries=0;
 await assert.rejects(new ClaudeProvider({...h.deps,findBinary:async()=>{binaries++;return '/fake'}}).runTurn(f.seat,'x',f.ctx),e=>e instanceof ProviderError&&e.code==='cancelled');
 assert.equal(binaries,0);assert.equal(h.options.length,0);
 for(const [deps,code] of [[{findBinary:async()=>null},'no_binary'],[{authStatus:async()=>({loggedIn:false})},'not_logged_in']] as const){
 const g=fixture('claude');await assert.rejects(new ClaudeProvider({...h.deps,...deps}).runTurn(g.seat,'x',g.ctx),e=>e instanceof ProviderError&&e.code===code)
 }
});
test('Claude approval allow, deny, timeout and abort never returns null',async()=>{
 for(const allow of [true,false]){
 const f=fixture('claude');f.ctx.askApproval=async()=>allow;const options=claudeOptions(f.seat,f.ctx,'/fake',{});
 const result=await options.canUseTool!('Bash',{command:'x'},{signal:f.ctx.signal,toolUseID:'tool',requestId:'request'});
 assert.ok(result);assert.equal(result.behavior,allow?'allow':'deny');
 }
 const f=fixture('claude');let late!:(allow:boolean)=>void;f.ctx.askApproval=()=>new Promise(r=>{late=r});
 const call=claudeOptions(f.seat,f.ctx,'/fake',{}).canUseTool!('Bash',{}, {signal:f.ctx.signal,toolUseID:'tool',requestId:'request'});
 await until(()=>!!late);f.controller.abort();const result=await call;assert.equal(result?.behavior,'deny');late(true);
});
test('Claude busy, steer and interrupt are bound to active query; snapshot survives edit',async()=>{
 let finish!:()=>void;const waiting=new Promise<void>(r=>{finish=r});
 const h=harness(async function*(){yield init;await waiting;yield done}),f=fixture('claude'),p=new ClaudeProvider(h.deps);
 const run=p.runTurn(f.seat,'x',f.ctx);await until(()=>h.options.length===1);
 await assert.rejects(p.runTurn(f.seat,'second',f.ctx),e=>e instanceof ProviderError&&e.code==='busy');
 f.seat.cwd='/changed';await f.handle!.steer('correction');await f.handle!.interrupt();finish();await run;
 assert.equal(h.interrupts,1);assert.equal(h.steering[0]?.priority,'now');assert.deepEqual(h.steering[0]?.origin,{kind:'human'});assert.equal(h.steering[0]?.message.content,'correction');assert.equal(h.options[0]?.options?.cwd,'/project');
 assert.equal(terminals(f.events).length,1);assert.equal(f.handle,null);
});
test('24b: Claude streamed input carries ordered base64 image blocks before text',async()=>{
 const f=fixture('claude'),h=harness([init,done]);f.ctx.attachments=[{data:Buffer.from([1,2,3]),mime:'image/png'},{data:Buffer.from([4,5]),mime:'image/webp'}];f.ctx.beforeModel=async()=>{f.ctx.attachments![0]!.data.fill(9)};await new ClaudeProvider(h.deps).runTurn(f.seat,'посмотри',f.ctx);
 const sent:SDKUserMessage[]=[];const source=h.options[0]!.prompt;assert.notEqual(typeof source,'string');for await(const item of source as AsyncIterable<SDKUserMessage>)sent.push(item);
 assert.deepEqual(sent[0]?.message.content,[{type:'image',source:{type:'base64',media_type:'image/png',data:'AQID'}},{type:'image',source:{type:'base64',media_type:'image/webp',data:'BAU='}},{type:'text',text:'посмотри'}]);
});
test('Claude sessions strip digest and merge consecutive assistant messages',async()=>{
 const f=fixture('claude'),h=harness([]);let dir='';
 const provider=new ClaudeProvider({...h.deps,listSessionsFn:async options=>{dir=options?.dir??'';return [{sessionId:'s',summary:'title',lastModified:2000,fileSize:1}]},
 getSessionMessagesFn:async()=>[
 {type:'user',uuid:'1',session_id:'s',parent_tool_use_id:null,parent_agent_id:null,message:{content:'digest\n---\nСообщение тебе:\nhi'}},
 {type:'assistant',uuid:'2',session_id:'s',parent_tool_use_id:null,parent_agent_id:null,message:{content:[{type:'text',text:'one'}]}},
 {type:'assistant',uuid:'3',session_id:'s',parent_tool_use_id:null,parent_agent_id:null,message:{content:[{type:'text',text:'two'}]}},
 {type:'user',uuid:'4',session_id:'s',parent_tool_use_id:null,parent_agent_id:null,message:{content:[{type:'tool_result',content:'omit'}]}}
 ]});
 assert.equal((await provider.listSessions('/project'))[0]?.updated,2);assert.equal(dir,'/project');
 assert.deepEqual(await provider.sessionMessages('/project','s'),[{role:'me',text:'hi'},{role:'ai',text:'one\ntwo'}]);
 assert.deepEqual(await provider.models(),[]);assert.equal((await provider.auth()).loggedIn,true);
});

test('[TS-04a:47] Claude modelStarted runs once immediately before queryFn',async()=>{
 const f=fixture('claude'),h=harness([init,done]),order:string[]=[],original=h.deps.queryFn!;let started=0;
 f.ctx.modelStarted=()=>{started++;order.push('started');assert.equal(h.options.length,0)};
 const provider=new ClaudeProvider({...h.deps,queryFn:args=>{assert.equal(started,1);order.push('query');return original(args)}});
 await provider.runTurn(f.seat,'x',f.ctx);assert.deepEqual(order,['started','query']);assert.equal(started,1);assert.equal(terminals(f.events).length,1);await provider.close()
});

for(const [usage,expected] of [
 [{input_tokens:8,output_tokens:2,cache_read_input_tokens:3},{input:8,output:2,cacheRead:3}],
 [{input_tokens:0,output_tokens:0,cache_read_input_tokens:0},{input:0,output:0,cacheRead:0}],
 [{input_tokens:8},{input:8,output:null,cacheRead:null}],
 [{input_tokens:-1,output_tokens:Infinity,cache_read_input_tokens:'3'},{input:null,output:null,cacheRead:null}]
])test('175: Claude raw usage keeps fresh input separate from cache: '+JSON.stringify(usage),async()=>{
 const f=fixture('claude'),p=new ClaudeProvider(harness([init,{...done,usage}]).deps);await p.runTurn(f.seat,'x',f.ctx);const end=f.events.at(-1);assert.ok(end?.type==='done');assert.deepEqual(end.usage,expected);await p.close();
});

const quotaUsage={five_hour:{utilization:18,resets_at:'2026-10-12T00:00:00Z'},seven_day:{utilization:62.4,resets_at:'2026-10-18T00:00:00Z'},seven_day_sonnet:{utilization:12,resets_at:null}};
test('200: Claude subscription windows use the current OAuth login without exposing credentials',async()=>{
 const requests:{url:string;options:RequestInit|undefined}[]=[];
 const p=new ClaudeProvider({env:{},readOauthLogin:async()=> ({token:'fixture-secret',plan:'Max'}),usageFetch:(async(url,options)=>{requests.push({url:String(url),options});return new Response(JSON.stringify({...quotaUsage,accessToken:'must-not-escape'}))}) as typeof fetch});
 const result=await p.limits();assert.equal(result.ok,true);if(!result.ok)return;
 assert.equal(result.plan,'Max');assert.deepEqual(result.windows.map(w=>[w.label,w.percentUsed,w.windowMinutes]),[['5 ч',18,300],['неделя',62.4,10080],['неделя · Sonnet',12,10080]]);
 assert.equal(result.windows[0]!.resetsAt,Date.parse(quotaUsage.five_hour.resets_at)/1000);assert.equal(requests[0]!.url,'https://api.anthropic.com/api/oauth/usage');assert.equal(requests[0]!.options!.redirect,'error');assert.equal((requests[0]!.options!.headers as Record<string,string>).Authorization,'Bearer fixture-secret');assert.doesNotMatch(JSON.stringify(result),/secret|accessToken/);
});
for(const [status,code] of [[401,'limits_auth'],[403,'limits_auth'],[429,'limits_rate_limited'],[503,'limits_unavailable']] as const)test('200: Claude usage '+status+' preserves a typed safe reason, never the response body',async()=>{
 const p=new ClaudeProvider({env:{},readOauthLogin:async()=> ({token:'fixture-secret',plan:'Max'}),usageFetch:(async()=>new Response('fixture-secret',{status})) as typeof fetch});const result=await p.limits();assert.equal(result.ok,false);if(!result.ok)assert.equal(result.code,code);assert.doesNotMatch(JSON.stringify(result),/fixture-secret/);
});
for(const body of [{},{five_hour:quotaUsage.five_hour},{...quotaUsage,seven_day:{utilization:'62',resets_at:null}},{...quotaUsage,five_hour:{utilization:101,resets_at:null}}])test('200: incomplete or forged Claude quota cannot become a live percentage '+JSON.stringify(body),async()=>{
 const p=new ClaudeProvider({env:{},readOauthLogin:async()=> ({token:'fixture',plan:null}),usageFetch:(async()=>new Response(JSON.stringify(body))) as typeof fetch});const result=await p.limits();assert.equal(result.ok,false);if(!result.ok)assert.equal(result.code,'limits_invalid');
});
test('200: absent login and cancelled usage do not start an authenticated request or leak errors',async()=>{
 const missing=new ClaudeProvider({env:{},readOauthLogin:async()=>null,usageFetch:(async()=>{throw Error('unexpected request')}) as typeof fetch});const no=await missing.limits();assert.equal(no.ok,false);if(!no.ok)assert.equal(no.code,'limits_auth');
 const control=new AbortController();const p=new ClaudeProvider({env:{},readOauthLogin:async()=> ({token:'fixture-secret',plan:'Max'}),usageFetch:(async()=>{control.abort();return new Promise(()=>{})}) as typeof fetch});const result=await p.limits(control.signal);assert.equal(result.ok,false);if(!result.ok)assert.equal(result.code,'limits_timeout');assert.doesNotMatch(JSON.stringify(result),/fixture-secret/);
});

test('200: API-only credentials are not applicable to subscription windows and do not call usage',async()=>{
 let requests=0;const p=new ClaudeProvider({env:{ANTHROPIC_API_KEY:'fixture-only'},readOauthLogin:async()=>null,usageFetch:(async()=>{requests++;throw Error('unexpected request')}) as typeof fetch});const result=await p.limits();assert.equal(result.ok,false);if(!result.ok)assert.equal(result.code,'limits_not_applicable');assert.equal(requests,0);assert.doesNotMatch(JSON.stringify(result),/fixture-only/);
});


test('213: Claude usage keeps Fable and additional named model windows, and skips absent windows',()=>{
 const raw={five_hour:quotaUsage.five_hour,seven_day:quotaUsage.seven_day,seven_day_fable:{utilization:95,resets_at:null},seven_day_haiku:{utilization:80,resets_at:null},seven_day_sonnet:null};const r=claudeUsage(raw);assert.equal(r.ok,true);if(!r.ok)return;assert.deepEqual(r.windows.map(w=>[w.label,w.percentUsed]),[['5 ч',18],['неделя',62.4],['неделя · Fable',95],['неделя · Haiku',80]]);
 const missing=claudeUsage({five_hour:quotaUsage.five_hour,seven_day:quotaUsage.seven_day});assert.equal(missing.ok,true);if(missing.ok)assert.equal(missing.windows.length,2);
});
for(const value of [{utilization:101,resets_at:null},{utilization:'95',resets_at:null},{utilization:12},{utilization:12,resets_at:'invalid'}])test('213: malformed additional Claude model quota is a typed refusal '+JSON.stringify(value),()=>{const r=claudeUsage({...quotaUsage,seven_day_fable:value});assert.equal(r.ok,false);if(!r.ok)assert.equal(r.code,'limits_invalid')});


for(const model of ['', 'fable_', 'fable__extra', '<img>', 'fable-name', 'fable'+'x'.repeat(44)])test('213 r2: malformed model-window name is a typed invalid response, including HTTP 200: '+model,async()=>{
 const raw={...quotaUsage,['seven_day_'+model]:{utilization:21,resets_at:null}},direct=claudeUsage(raw);assert.equal(direct.ok,false);if(!direct.ok)assert.equal(direct.code,'limits_invalid');
 const p=new ClaudeProvider({env:{},readOauthLogin:async()=>({token:'fixture-secret',plan:'Max'}),usageFetch:(async()=>new Response(JSON.stringify(raw),{status:200})) as typeof fetch});const result=await p.limits();assert.equal(result.ok,false);if(!result.ok)assert.equal(result.code,'limits_invalid');
});
test('213 r2: model names with nonempty segments and the maximum supported length remain valid',()=>{for(const model of ['fable_5', 'fable'+'x'.repeat(43)]){const r=claudeUsage({...quotaUsage,['seven_day_'+model]:{utilization:21,resets_at:null}});assert.equal(r.ok,true);if(r.ok)assert.equal(r.windows.at(-1)!.percentUsed,21)}});

for(const status of [429,503])for(const format of ['seconds','date','invalid'])test('214: Claude '+status+' exposes only parsed Retry-After ('+format+')',async()=>{
 const retry=format==='seconds'?'720':format==='date'?new Date(Date.now()+720000).toUTCString():'secret-header',p=new ClaudeProvider({env:{},readOauthLogin:async()=>({token:'fixture-secret',plan:'Max'}),usageFetch:(async()=>new Response('fixture-secret',{status,headers:{'retry-after':retry}})) as typeof fetch});
 const result=await p.limits();assert.equal(result.ok,false);if(result.ok)return;assert.equal(result.code,status===429?'limits_rate_limited':'limits_unavailable');if(format==='invalid')assert.equal(result.retryAfterSeconds,undefined);else assert.ok(result.retryAfterSeconds!>=719&&result.retryAfterSeconds!<=720);assert.doesNotMatch(JSON.stringify(result),/fixture-secret|secret-header/);
});
test('218: subscription level and extra usage flag come from login/usage, never from credential text',async()=>{
 const p=new ClaudeProvider({env:{},readOauthLogin:async()=>({token:'fixture-secret',plan:'Max',planLevel:'20x'}),usageFetch:(async()=>new Response(JSON.stringify({...quotaUsage,extra_usage:{is_enabled:true,accessToken:'never-return'}}))) as typeof fetch});
 const r=await p.limits();assert.equal(r.ok,true);if(r.ok){assert.equal(r.planLevel,'20x');assert.equal(r.extraUsageEnabled,true)}assert.doesNotMatch(JSON.stringify(r),/fixture-secret|never-return/);

});

test('234: successful and failed Claude tool results keep the call id; pane tools use their own bridge trace',async()=>{
 const f=fixture('claude'),traces:any[]=[];f.ctx.traceEvent=e=>traces.push(e);const h=harness([init,{type:'assistant',session_id:'session',message:{content:[{type:'tool_use',id:'a',name:'Read',input:{file_path:'x'}},{type:'tool_use',id:'b',name:'Write',input:{file_path:'y'}},{type:'tool_use',id:'c',name:'mcp__panes__send',input:{}}]}},{type:'user',session_id:'session',message:{content:[{type:'tool_result',tool_use_id:'a',content:'success'},{type:'tool_result',tool_use_id:'b',content:'failure',is_error:true},{type:'tool_result',tool_use_id:'c',content:'sent'}]}},done]);await new ClaudeProvider(h.deps).runTurn(f.seat,'fixture',f.ctx);assert.deepEqual(traces.map(t=>[t.id,t.phase,t.outcome??null]),[['a','call',null],['b','call',null],['a','result','ok'],['b','result','failed']]);
});

test('220: current Claude usage keys retain subscription windows alongside seven_day_breakdown metadata',async()=>{
 const body={five_hour:{utilization:29,resets_at:'2026-10-12T12:00:00Z'},seven_day:{utilization:39,resets_at:'2026-10-18T00:00:00Z'},seven_day_opus:{utilization:0,resets_at:null},seven_day_sonnet:{utilization:12,resets_at:null},seven_day_cowork:null,seven_day_omelette:null,seven_day_breakdown:{as_of:'2026-10-12T06:12:00Z',window_started_at:'2026-10-11T00:00:00Z',rows:[]},weekly_scoped_shares:[],extra_usage:{is_enabled:false},limits:{},spend:{}};
 const p=new ClaudeProvider({env:{},readOauthLogin:async()=>({token:'fixture-secret',plan:'Max'}),usageFetch:(async()=>new Response(JSON.stringify(body),{status:200})) as typeof fetch}),result=await p.limits();assert.equal(result.ok,true);if(!result.ok)return;
 assert.deepEqual(result.windows.map(w=>[w.label,w.percentUsed,w.windowMinutes]),[['5 ч',29,300],['неделя',39,10080],['неделя · Opus',0,10080],['неделя · Sonnet',12,10080]]);assert.equal(result.extraUsageEnabled,false);assert.equal(result.windows[0]!.resetsAt,Date.parse(body.five_hour.resets_at)/1000);assert.doesNotMatch(JSON.stringify(result),/fixture-secret|breakdown|window_started_at/);
});

test('220: objects without utilization do not invalidate five-hour and weekly windows or invent model windows',()=>{
 const base={five_hour:quotaUsage.five_hour,seven_day:quotaUsage.seven_day},expected=claudeUsage(base,123);
 for(const key of ['seven_day_breakdown','seven_day_future_metadata','seven_day_'])for(const value of [{},{as_of:'2026-10-12T06:12:00Z',rows:[]},{rows:[{utilization:150,resets_at:'not-a-window'}]}])assert.deepEqual(claudeUsage({...base,[key]:value},123),expected);
});

test('22c: Claude child gets the complete relay environment including Node transport and loopback bypass',{timeout:10000},async t=>{
 const f=fixture('claude'),h=harness([init,done]),p=new ClaudeProvider(h.deps);t.after(()=>p.close());
 f.ctx.env={HTTP_PROXY:'http://127.0.0.1:19999',HTTPS_PROXY:'http://127.0.0.1:19999',ALL_PROXY:'http://127.0.0.1:19999',NO_PROXY:'localhost,127.0.0.1',NODE_OPTIONS:'--require /fixture/relay.cjs',NODE_USE_ENV_PROXY:'1',HARNESS_RELAY_PROXY:'http://127.0.0.1:19999'};await p.runTurn(f.seat,'fixture',f.ctx);
 for(const [key,value]of Object.entries(f.ctx.env))assert.equal(h.options[0]!.options!.env![key],value);
});

test('38.5 Claude forwards the native permission parameters separately from truncated description',async()=>{
 const f=fixture('claude'),input={command:'x'.repeat(500),description:'harmless',nested:{target:'private'}};let request:unknown;
 f.ctx.askApproval=async(_title,_detail,native)=>{request=native;return false};
 await claudeOptions(f.seat,f.ctx,'/fake',{}).canUseTool!('Bash',input,{signal:f.ctx.signal,toolUseID:'tool',requestId:'request'});
 assert.deepEqual(request,{provider:'claude',operation:'Bash',parameters:input});
});
