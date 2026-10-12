import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {CliProvider} from './cli/provider.ts';
import {cliFixture} from './cli/test-support.ts';
import {GEMINI} from './gemini.ts';
import {cliEntry,ProviderCatalog} from './catalog.ts';
import {geminiStream} from './gemini-stream.ts';

test('303/306: Gemini default runs without -m using private system MCP settings and traces raw tool events',async t=>{
 const h=await cliFixture(t,'probe'),binary=join(h.dir,'gemini-fixture'),log=join(h.dir,'gemini-log.json'),account=join(h.dir,'account.json');writeFileSync(account,JSON.stringify({active:'test@example.test'}));
 writeFileSync(binary,'#!'+process.execPath+'\n'+String.raw`
 const fs=require('node:fs'),args=process.argv.slice(2);if(args.includes('--version')){console.log('0.63.0');process.exit(0)}
 const path=process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH,config=JSON.parse(fs.readFileSync(path,'utf8'));fs.writeFileSync(process.env.TEST_LOG,JSON.stringify({args,path,config,mode:fs.statSync(path).mode&511,home:process.env.HOME,key:!!process.env.GEMINI_API_KEY}));
 for(const e of [{type:'init',session_id:'ab123456-1234-1234-1234-123456789abc'},{type:'message',role:'user',content:'echo'},{type:'tool_use',tool_id:'tool-1',tool_name:'read_file',parameters:{path:'test'}},{type:'tool_result',tool_id:'tool-1',status:'success',output:'text'},{type:'message',role:'assistant',content:'готов',delta:true},{type:'result',status:'success',stats:{input:12,cached:3,output_tokens:2}}])console.log(JSON.stringify(e));
 `,{mode:0o700});
 const d={...GEMINI,binary,auth:{...GEMINI.auth,file:()=>account}},env={...process.env,TEST_LOG:log,GEMINI_API_KEY:'should-not-leak'},p=new CliProvider(d,{env,cwd:h.dir,temporaryDirectory:h.dir});t.after(()=>p.close());const seat={...h.seat,vendor:'gemini',model:'default',mode:'all' as const};
 const result=await p.runTurn(seat,'hello',h.ctx);assert.equal(result.text,'готов');const r=JSON.parse(readFileSync(log,'utf8'));assert.ok(!r.args.includes('-m')&&!r.args.includes('--model'));assert.ok(r.args.includes('yolo'));assert.deepEqual(r.config.mcp.allowed,['harnessy']);assert.deepEqual(Object.keys(r.config.mcpServers),['harnessy']);assert.ok(r.config.mcpServers.harnessy.env.PANE_TOKEN);assert.equal(r.config.hooksConfig.enabled,false);assert.equal(r.mode,0o600);assert.equal(r.key,false);assert.equal(r.home,process.env.HOME);assert.equal(existsSync(r.path),false);assert.deepEqual(h.traces.map(v=>v.phase),['call','result']);assert.deepEqual((h.events.at(-1) as any).usage,{input:12,output:2,cacheRead:3});
 const row=(await new ProviderCatalog([cliEntry(d,{env,cwd:h.dir})]).read('gemini')).row;assert.equal(row.login.state,'unknown');assert.deepEqual(row.models,[{id:'default',label:'по умолчанию программы'}]);assert.equal(row.capabilities.turn?.all.ok,true);assert.deepEqual(row.capabilities.probe,{ok:true,note:'полный доступ'});assert.equal(row.capabilities.turn?.read.ok,false);assert.equal(row.capabilities.turn?.edit.ok,false);
 for(const mode of ['read','edit'] as const)await assert.rejects(p.runTurn({...seat,mode},'no',h.ctx),{code:'mode_unsupported'});
});
test('303: Gemini decoder rejects foreign/malformed terminal data and has no fake completion',()=>{
 const d=geminiStream();assert.throws(()=>d({type:'message',role:'assistant',content:'before init'}),{code:'protocol'});d({type:'init',session_id:'s'});assert.throws(()=>d({type:'tool_result',status:'invented',tool_id:'t'}),{code:'protocol'});assert.equal(d({type:'result',status:'error'})[0]?.type,'error');assert.throws(()=>d({type:'result',status:'success'}),{code:'protocol'});
});
