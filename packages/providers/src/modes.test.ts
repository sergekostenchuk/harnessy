import {test} from 'node:test';
import assert from 'node:assert/strict';
import {claudeOptions} from './claude.ts';
import {codexMode} from './modes.ts';
import {childEnv} from './env.ts';
import {fixture} from './test-support.ts';
import {snapshot,ProviderError,type Mode,type Seat,type TurnContext} from './types.ts';
import {vendorError} from './errors.ts';
const rows:[Mode,string[],string,string,string][]=[
 ['chat',[],'default','read-only','never'],
 ['read',['Read','Glob','Grep','Edit','Write','MultiEdit'],'default','read-only','never'],
 ['check',['Read','Glob','Grep','Bash','Edit','Write','MultiEdit'],'default','read-only','on-request'],
 ['web',['Read','Glob','Grep','WebFetch','WebSearch','Edit','Write','MultiEdit'],'default','read-only','on-request'],
 ['ask',['Read','Edit','Write','MultiEdit','Bash','Glob','Grep','WebFetch','WebSearch','NotebookEdit'],'default','workspace-write','on-request'],
 ['edit',['Read','Edit','Write','MultiEdit','Bash','Glob','Grep','WebFetch','WebSearch','NotebookEdit'],'acceptEdits','workspace-write','on-request'],
 ['all',['Read','Edit','Write','MultiEdit','Bash','Glob','Grep','WebFetch','WebSearch','NotebookEdit'],'bypassPermissions','danger-full-access','never']
];
for(const [mode,tools,permission,sandbox,policy] of rows)test('rights and isolation: '+mode,()=>{
 const f=fixture('claude');f.seat.mode=mode;
 const c=claudeOptions(f.seat,f.ctx,'/external/claude',{});assert.deepEqual(c.tools,tools);assert.equal(c.permissionMode,permission);
 assert.equal(c.pathToClaudeCodeExecutable,'/external/claude');assert.deepEqual(c.settingSources,[]);assert.equal(c.strictMcpConfig,true);assert.equal(c.includePartialMessages,true);
 assert.equal(c.allowDangerouslySkipPermissions,mode==='all'?true:undefined);
 assert.ok(c.allowedTools?.includes('Write(src/**)'));assert.ok(c.allowedTools?.includes('Write(//project/.harness/evidence/**)'));
 assert.equal(c.allowedTools?.includes('Bash(npm test:*)'),['check','edit'].includes(mode));
 const m=codexMode({...f.seat,vendor:'codex'},f.ctx);assert.equal(m.sandbox,sandbox);assert.equal(m.approvalPolicy,policy);
 assert.equal(m.sandboxPolicy.type,sandbox==='read-only'?'readOnly':sandbox==='workspace-write'?'workspaceWrite':'dangerFullAccess');
});
test('check worktree adds sandbox write access, web does not',()=>{
 const f=fixture();f.seat.worktree='/worktree';f.seat.mode='check';assert.equal(codexMode(f.seat,f.ctx).sandbox,'workspace-write');
 f.seat.mode='web';assert.equal(codexMode(f.seat,f.ctx).sandbox,'read-only');
});
test('route env cannot restore API keys or bridge token',()=>{
 const malicious={HTTPS_PROXY:'http://proxy',ANTHROPIC_API_KEY:'injected',OPENAI_API_KEY:'injected',PANE_TOKEN:'injected'};
 const base={ANTHROPIC_API_KEY:'old',CLAUDECODE:'old',CLAUDE_CODE_SIMPLE:'old',OPENAI_API_KEY:'old',PANE_TOKEN:'old',ELECTRON_RUN_AS_NODE:'1',ELECTRON_ENABLE_LOGGING:'1'};
 const c=childEnv('claude',malicious,base);for(const key of ['ANTHROPIC_API_KEY','CLAUDECODE','CLAUDE_CODE_SIMPLE','PANE_TOKEN','ELECTRON_RUN_AS_NODE','ELECTRON_ENABLE_LOGGING'])assert.equal(c[key],undefined);
 const x=childEnv('codex',malicious,base);for(const key of ['OPENAI_API_KEY','PANE_TOKEN','ELECTRON_RUN_AS_NODE','ELECTRON_ENABLE_LOGGING'])assert.equal(x[key],undefined);assert.equal(x.HTTPS_PROXY,'http://proxy');
});
test('missing context and seat fields reject with protocol',()=>{
 const f=fixture();
 for(const key of Object.keys(f.ctx)){const ctx={...f.ctx};delete (ctx as unknown as Record<string,unknown>)[key];assert.throws(()=>snapshot(f.seat,ctx as TurnContext),e=>e instanceof ProviderError&&e.code==='protocol',key)}
 for(const key of Object.keys(f.seat)){const seat={...f.seat};delete (seat as unknown as Record<string,unknown>)[key];assert.throws(()=>snapshot(seat as Seat,f.ctx),e=>e instanceof ProviderError&&e.code==='protocol',key)}
});
test('snapshot owns write paths and does not follow mutable settings',()=>{
 const f=fixture(),s=snapshot(f.seat,f.ctx);f.seat.cwd='/other';f.seat.writePaths.push('secret');assert.equal(s.cwd,'/project');assert.deepEqual(s.writePaths,['src']);
});
test('attachment context requires verified bytes and rejects byte-like masquerades',()=>{
 const f=fixture();f.ctx.attachments=[{data:Buffer.from('verified'),mime:'image/png'}];assert.doesNotThrow(()=>snapshot(f.seat,f.ctx));
 for(const attachment of [{mime:'image/png'},{data:new Uint8Array([1]),mime:'image/png'},{data:Buffer.alloc(0),mime:'image/png'},{data:Buffer.from('x'),path:'',mime:'image/png'}])assert.throws(()=>snapshot(f.seat,{...f.ctx,attachments:[attachment]} as TurnContext),e=>e instanceof ProviderError&&e.code==='protocol');
});
test('only agreed vendor observations classify failure',()=>{
 assert.equal(vendorError('claude','No conversation found with session ID: fake').code,'session_missing');
 assert.equal(vendorError('codex','missing','thread/resume').code,'session_missing');
 assert.equal(vendorError('codex','model is not supported when using Codex with a ChatGPT account').code,'model_unsupported');
 assert.equal(vendorError('codex','selected model denied',undefined,'unauthorized').code,'model_unsupported');
 const err=vendorError('codex','opaque failure');assert.equal(err.code,'turn_failed');assert.equal(err.vendorText,'opaque failure');
});
