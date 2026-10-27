import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {qwenStream} from './qwen-stream.ts';
import {QWEN} from './qwen.ts';
import {CliProvider} from './cli/provider.ts';
import {fixture} from './test-support.ts';
import {safeDiagnostic} from './diagnostic.ts';

// Raw Qwen default receipt captured on 2026-10-27. No init or model turn occurred.
const raw=readFileSync(new URL('./fixtures/qwen-startup-error.ndjson',import.meta.url),'utf8');
const receipt=()=>JSON.parse(raw);
test('TS-47.12: Qwen startup failure retains its actual reason without establishing a session',()=>{
 const value=receipt(),decode=qwenStream();
 assert.deepEqual(decode(value),[{type:'error',code:'turn_failed',text:value.error.message}]);
 assert.throws(()=>decode(value),{code:'protocol'});
 assert.deepEqual(qwenStream(value.session_id)(value),[{type:'error',code:'turn_failed',text:value.error.message}]);
 assert.throws(()=>qwenStream('foreign')(value),{code:'protocol'});
 assert.throws(()=>qwenStream('foreign')({type:'system',subtype:'init',session_id:value.session_id}),{code:'protocol'});
});
test('TS-47.12: missing or forged startup failure cannot become an answer or override a resumed session',()=>{
 for(const extra of [
  {session_id:undefined},{session_id:''},{is_error:undefined},{is_error:false},{is_error:'true'},
  {type:'assistant'},{subtype:'success',result:'fake'},{subtype:undefined},{error:undefined},
  {error:{message:42}},{error:{message:''}},{parent_tool_use_id:'child'},{parent_tool_use_id:42},
 ])assert.throws(()=>qwenStream()({...receipt(),...extra}),{code:'protocol'});
});
test('TS-47.12: real CLI driver surfaces the recorded Qwen refusal even with process exit 1',{timeout:5000},async t=>{
 const h=fixture(),provider=new CliProvider(QWEN,{env:{},cwd:'/project',execute:async(_request,_signal,hooks)=>{
  assert.ok(hooks?.stdout);hooks.started?.();
  for(let i=0;i<raw.length;i+=11)hooks.stdout(raw.slice(i,i+11));
  return {stdout:raw,stderr:'',code:1,signal:null};
 }});t.after(()=>provider.close());
 const seat={...h.seat,vendor:'qwen',model:'default',mode:'all' as const};
 await assert.rejects(provider.runTurn(seat,'Ответь одним словом: готов. Инструменты и файлы не использовать.',h.ctx),{code:'turn_failed',message:safeDiagnostic(receipt().error.message)});
 assert.deepEqual(h.sessions,[]);assert.equal(h.events.some(e=>e.type==='done'||e.type==='delta'),false);
 assert.deepEqual(h.tokens,h.revoked);
});
