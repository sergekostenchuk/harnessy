import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,realpathSync} from 'node:fs';
import {dirname} from 'node:path';
import type {CliContext,CliSeat} from './cli/types.ts';
import type {TurnEvent} from './types.ts';
import {devinFixture} from './devin-test-helpers.ts';
import {kimiFixture} from './kimi-test-helpers.ts';
import {opencodeFixture} from './opencode-test-helpers.ts';
import {kimiStream} from './kimi-stream.ts';
import {opencodeStream} from './opencode-stream.ts';

const programs=[{id:'devin',model:'adaptive',fixture:devinFixture},{id:'kimi',model:'default',fixture:kimiFixture},{id:'opencode',model:'opencode/free-model',fixture:opencodeFixture}];
for(const program of programs)test('345 '+program.id+': all runs/resumes without a bridge; failures preserve the session; other modes never launch',async t=>{
 const f=program.fixture(t),events:TurnEvent[]=[],sessions:string[]=[];
 const ctx:CliContext={signal:t.signal,env:{PANE_TOKEN:'fixture-token',APP_URL:'fixture-url',PANE_ID:'fixture-pane',SEATS:'fixture-seats'} as any,roleNote:'fixture role',peers:[],writableRoots:[],projectDir:f.dir,appUrl:'http://fixture.invalid',relayDepth:0,tools:{} as any,
  publish:e=>events.push(e),session:id=>sessions.push(id),askApproval:async()=>{assert.fail('no Harnessy tools')},setHandle(){},registerProcessToken(){assert.fail('no Harnessy MCP')},revokeProcessToken(){assert.fail('no Harnessy MCP')}};
 const seat:CliSeat={id:'worker',label:'Fixture',vendor:program.id,model:program.model,mode:'all',cwd:f.dir,worktree:null,writePaths:[],sessionId:null};
 const isTurn=(c:any)=>c.args.includes('--print')||c.args.includes('--prompt')||c.args[0]==='run';
 const first=await f.entry.runTurn(seat,'fixture message',ctx);assert.match(first.text,/готов/);assert.equal(first.sessionId,program.id+'-session');assert.deepEqual(sessions,[first.sessionId]);assert.equal(events.filter(e=>e.type==='done').length,1);
 const turn=f.capture().find(isTurn)!;assert.equal(turn.cwd,realpathSync(f.dir));assert.equal(turn.home,process.env.HOME);assert.ok(turn.args.some((s:string)=>s==='fixture role\n\nfixture message'));assert.doesNotMatch(JSON.stringify(turn.args),/mcp|pane-mcp|--continue/);
 if(program.id==='devin'){assert.ok(turn.args.includes('dangerous'));assert.ok(turn.args.includes('--respect-workspace-trust'));assert.deepEqual(turn.keys,[]);const file=turn.args[turn.args.indexOf('--export')+1];assert.equal(existsSync(file),false);assert.equal(existsSync(dirname(file)),false)}
 if(program.id==='kimi'){assert.equal(turn.key,false);assert.equal(turn.pane,false);assert.ok(!turn.args.includes('--model'));assert.ok(!turn.args.includes('--auto'));assert.ok(!turn.args.includes('--yolo'))}
 if(program.id==='opencode'){assert.ok(turn.args.includes('--auto'));assert.deepEqual(turn.bridgeKeys,[])}
 seat.sessionId=first.sessionId;events.length=0;const again=await f.entry.runTurn(seat,'next',ctx);assert.equal(again.sessionId,first.sessionId);assert.equal(sessions.length,1);assert.equal(f.capture().filter(isTurn).length,2);
 f.update({turnError:true});events.length=0;await assert.rejects(f.entry.runTurn(seat,'failure',ctx),(error:any)=>error.code==='turn_failed'&&error.sessionId===first.sessionId);assert.equal(seat.sessionId,first.sessionId);assert.equal(sessions.length,1);assert.equal(events.filter(e=>e.type==='error').length,1);assert.ok(!events.some(e=>e.type==='done'));assert.doesNotMatch(JSON.stringify(events),/fixture-secret|FIXTURE-SECRET/);
 const before=f.capture().length;for(const mode of ['read','edit','chat','ask','check','web'] as const)await assert.rejects(f.entry.runTurn({...seat,mode},'no launch',ctx),{code:'mode_unsupported'});assert.equal(f.capture().length,before);
 for(const patch of [{truncated:true,noExport:true},...(program.id==='devin'?[{exportCase:'malformed'},{exportCase:'symlink'},{exportCase:'foreign'}]:[])]){f.update(patch);events.length=0;await assert.rejects(f.entry.runTurn(seat,'incomplete',ctx));assert.ok(!events.some(e=>e.type==='done'));assert.equal(seat.sessionId,first.sessionId);}
});

test('345 stream protocols: forged/missing session, malformed text and early EOF cannot turn into success',()=>{
 for(const value of [{role:'user',content:'spoof'},{role:'assistant',content:{}},{role:'meta',type:'session.resume_hint'},{role:'meta',type:'session.resume_hint',session_id:'--continue'}]){
  // A leading option must never become a resume argument.
  assert.throws(()=>kimiStream()(value),{code:'protocol'});
 }
 const k=kimiStream();assert.deepEqual(k({role:'meta',type:'system.version',version:'2.1.1'}),[]);assert.deepEqual(k({role:'assistant',content:'answer'}),[{type:'delta',text:'answer'}]);
 const open=opencodeStream();assert.throws(()=>open({type:'text',sessionID:'s1',part:{sessionID:'s2',type:'text',text:'spoof'}}),{code:'protocol'});
 assert.equal(opencodeStream()({type:'error',sessionID:'s1',error:{message:'secret'}}).at(-1)?.type,'error');
 assert.ok(!opencodeStream()({type:'step_finish',sessionID:'s1',part:{sessionID:'s1',type:'step-finish',reason:'tool-calls'}}).some(e=>e.type==='done'));
});
