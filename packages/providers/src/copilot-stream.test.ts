import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {COPILOT} from './copilot.ts';
import {CliProvider} from './cli/provider.ts';
import {fixture} from './test-support.ts';
import {CopilotStream} from './copilot-stream.ts';
import {MetadataRpc} from './cli/rpc.ts';
const event=(type:string,data:unknown)=>({type,data}),sid='ab123456-1234-1234-1234-123456789abc';
test('261: JSONL deltas and final message yield one answer, session result does not double-charge history',()=>{
 const s=new CopilotStream();assert.deepEqual(s.push(event('session.start',{sessionId:sid})),[{type:'session',id:sid}]);
 assert.deepEqual(s.push(event('assistant.message_delta',{messageId:'a',deltaContent:'При'})),[{type:'delta',text:'При'}]);
 assert.deepEqual(s.push(event('assistant.message',{messageId:'a',content:'Привет'})),[{type:'delta',text:'вет'}]);
 assert.deepEqual(s.push({type:'result',sessionId:sid,exitCode:0,usage:{premiumRequests:444}}),[{type:'done',sessionId:sid,usage:{input:null,output:null,cacheRead:null}}]);
 assert.throws(()=>s.push(event('assistant.message',{messageId:'x',content:'late'})),{code:'protocol'});
});
test('261: tools preserve call/result IDs, rejection and error classes',()=>{
 const s=new CopilotStream();assert.deepEqual(s.push(event('tool.execution_start',{toolCallId:'t',toolName:'harnessy.send',arguments:{to:'owner'}})),[{type:'tool.call',id:'t',name:'harnessy.send',input:{to:'owner'}}]);
 assert.deepEqual(s.push(event('tool.execution_complete',{toolCallId:'t',success:false,error:{code:'permission_denied',message:'denied'}})),[{type:'tool.result',id:'t',outcome:'rejected',reason:'denied'}]);
 assert.equal(s.push(event('session.error',{errorType:'authentication',message:'login'}))[0]!.type,'error');
});
test('261: missing, replayed or foreign stream fields are not success',()=>{
 for(const bad of [null,{},event('assistant.message_delta',{messageId:'a'}),event('tool.execution_complete',{toolCallId:'x',success:false}),{type:'result',sessionId:sid},event('unknown',{})])assert.throws(()=>new CopilotStream().push(bad),{code:'protocol'});
 const s=new CopilotStream();s.push(event('session.start',{sessionId:sid}));assert.throws(()=>s.push({type:'result',sessionId:'other',exitCode:0}),{code:'protocol'});
 const a=new CopilotStream(),b=new CopilotStream();a.push(event('assistant.message',{messageId:'one',content:'A'}));assert.throws(()=>a.push(event('assistant.message',{messageId:'one',content:'A'})),{code:'protocol'});assert.equal(b.push(event('assistant.message',{messageId:'one',content:'B'}))[0]!.type,'delta');
});
test('261: RPC framing counts UTF-8 bytes and rejects mismatched/error/truncated replies',()=>{
 const raw=JSON.stringify({jsonrpc:'2.0',id:1,result:{models:[{id:'русский'}]}}),bytes=Buffer.from('Content-Length: '+Buffer.byteLength(raw)+'\r\n\r\n'+raw),rpc=new MetadataRpc();let value:string|undefined;
 for(const byte of bytes){const r=rpc.push(Buffer.from([byte]));if(r!==undefined)value=r}rpc.finish();assert.deepEqual(JSON.parse(value!),{models:[{id:'русский'}]});
 for(const v of [{jsonrpc:'2.0',id:2,result:{}},{jsonrpc:'2.0',id:1,error:{message:'secret'}},{jsonrpc:'2.0',id:1,result:null}]){const text=JSON.stringify(v);assert.throws(()=>new MetadataRpc().push(Buffer.from('Content-Length: '+Buffer.byteLength(text)+'\r\n\r\n'+text)),{code:'protocol'})}
 const incomplete=new MetadataRpc();incomplete.push(Buffer.from('Content-Length: 12\r\n\r\n{'));assert.throws(()=>incomplete.finish(),{code:'protocol'});
});
// Raw Copilot GPT-4.1 JSONL captured on 2026-10-27 with the exact text-only prompt.
const recorded=readFileSync(new URL('./fixtures/copilot-text.ndjson',import.meta.url),'utf8');
const frames=()=>recorded.trim().split('\n').map(line=>JSON.parse(line));
test('TS-47.12: recorded MCP notifications precede a real answer and do not become model output',()=>{
 const stream=new CopilotStream(),events=frames().flatMap(frame=>stream.push(frame));
 assert.deepEqual(events.map(e=>e.type),['delta','done']);
 assert.equal(events[0]?.type==='delta'&&events[0].text,'готов');
 assert.deepEqual(events[1],{type:'done',sessionId:frames().at(-1).sessionId,usage:{input:null,output:null,cacheRead:null}});
});
test('TS-47.12: service notifications cannot establish a session or bypass known event validation',()=>{
 const services=frames().filter(v=>['session.mcp_server_status_changed','session.mcp_servers_loaded','session.tools_updated'].includes(v.type));
 for(const value of services){
  assert.deepEqual(new CopilotStream().push(value),[]);
  assert.throws(()=>new CopilotStream().push({...value,data:null}),{code:'protocol'});
  const s=new CopilotStream();s.push(event('session.start',{sessionId:sid}));
  assert.deepEqual(s.push({...value,data:{sessionId:'other',content:'fake',exitCode:0}}),[]);
  assert.throws(()=>s.push({...frames().at(-1),sessionId:'other'}),{code:'protocol'});
  assert.throws(()=>s.push(event('assistant.message_delta',{messageId:'x'})),{code:'protocol'});
  assert.throws(()=>s.push({...frames().at(-1),sessionId:sid,exitCode:'0'}),{code:'protocol'});
  assert.equal(s.push({...frames().at(-1),sessionId:sid,exitCode:1})[0]?.type,'error');
 }
});
test('TS-47.12: CLI driver replays the actual Copilot stream once and rejects a foreign resumed session',{timeout:5000},async t=>{
 const root=mkdtempSync(join(tmpdir(),'harnessy-ts4712-'));
 const description={...COPILOT,auth:{command:{args:[]},parse:()=>({loggedIn:true,email:'fixture@github.com'})},models:{list:[{id:'gpt-4.1',label:'GPT-4.1'}],reason:'recorded stream test'}};
 const provider=new CliProvider(description,{env:{},cwd:root,stateRoot:join(root,'states'),execute:async(request,_signal,hooks)=>{
  if(!hooks?.stdout)return {stdout:'{}',stderr:'',code:0,signal:null};assert.equal(request.args[request.args.indexOf('--model')+1],'gpt-4.1');
  hooks.started?.();for(let at=0;at<recorded.length;at+=11)hooks.stdout(recorded.slice(at,at+11));
  return {stdout:recorded,stderr:'',code:0,signal:null};
 }});t.after(async()=>{await provider.close();rmSync(root,{recursive:true,force:true})});
 const h=fixture(),seat={...h.seat,vendor:'copilot',model:'gpt-4.1',mode:'read' as const,cwd:root};
 const answer=await provider.runTurn(seat,'Ответь одним словом: готов. Инструменты и файлы не использовать.',{...h.ctx,projectDir:root});
 assert.equal(answer.text,'готов');assert.equal(answer.sessionId,frames().at(-1).sessionId);
 assert.equal(h.events.filter(e=>e.type==='done').length,1);
 assert.equal(h.events.filter(e=>e.type==='delta').map(e=>e.text).join(''),'готов');
 assert.deepEqual(h.tokens,h.revoked);
 const other=fixture();await assert.rejects(provider.runTurn({...seat,sessionId:sid},'same prompt',{...other.ctx,projectDir:root}),{code:'protocol'});
 assert.equal(other.events.some(e=>e.type==='done'),false);assert.deepEqual(other.tokens,other.revoked);
});
