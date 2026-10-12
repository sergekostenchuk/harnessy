import type {TestContext} from 'node:test';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {ollamaEntry,OLLAMA_URL,type OllamaOptions} from './ollama.ts';
export async function ollamaFixture(t:TestContext,bridge=false){
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'harnessy-ollama-'))),binary=join(dir,'ollama'),codexBinary=join(dir,'codex'),captureFile=join(dir,'calls.jsonl');
 let offline=false,tags:unknown={models:[{name:'glm-5.3:cloud',remote_model:'glm-5.3'},{name:'gemma4:latest'}]};const requests:string[]=[];
 const server=createServer((req,res)=>{requests.push(req.url??'');res.setHeader('Content-Type','application/json');if(offline){res.statusCode=503;res.end(JSON.stringify({error:'SECRET-SERVER-BODY'}));return}res.end(JSON.stringify(req.url==='/api/version'?{version:'0.40.2'}:tags))});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const port=(server.address() as {port:number}).port;
 writeFileSync(binary,'#!'+process.execPath+'\n'+`if(JSON.stringify(process.argv.slice(2))!=='["--version"]')process.exit(90);console.log('ollama version is 0.40.2');`,{mode:0o700});
 writeFileSync(codexBinary,'#!'+process.execPath+'\n'+String.raw`
 const fs=require('node:fs'),args=process.argv.slice(2);let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>input+=s);process.stdin.on('end',async()=>{
 fs.appendFileSync(process.env.FIXTURE_LOG,JSON.stringify({args,input,apiKey:!!process.env.OLLAMA_API_KEY,openaiKey:!!process.env.OPENAI_API_KEY,host:process.env.OLLAMA_HOST??null})+'\n');
 if(process.env.FIXTURE_BRIDGE==='1'){
  const {parse}=require(process.env.FIXTURE_TOML),get=key=>{const raw=args.find(a=>a.startsWith(key+'='));if(!raw)throw Error('missing MCP configuration');return parse(raw).mcp_servers.panes},server={};
  for(const key of ['command','args','env'])server[key]=get('mcp_servers.panes.'+key)[key];
  const output=await new Promise((resolve,reject)=>{const child=require('node:child_process').spawn(server.command,server.args,{env:{...process.env,...server.env},stdio:['pipe','pipe','pipe']});let out='';child.stdout.on('data',b=>out+=b);child.on('error',reject);child.on('close',code=>code?reject(Error('MCP bridge failed')):resolve(JSON.parse(out.trim()).result));child.stdin.end(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'send',arguments:{to:'reviewer',kind:'status',text:'ollama fixture'}}})+'\n')});
  if(output.isError)throw Error('MCP rejected fixture');
 }
 for(const e of [{type:'thread.started',thread_id:'00000000-0000-4000-8000-000000000001'},{type:'turn.started'},{type:'item.started',item:{id:'tool-1',type:'mcp_tool_call',server:'panes',tool:'send',arguments:{text:'fixture'},status:'in_progress'}},{type:'item.completed',item:{id:'tool-1',type:'mcp_tool_call',server:'panes',tool:'send',result:{ok:true},status:'completed'}},{type:'item.completed',item:{id:'msg-1',type:'agent_message',text:'готов'}},{type:'turn.completed',usage:{input_tokens:12,cached_input_tokens:3,output_tokens:2}}])console.log(JSON.stringify(e));});`,{mode:0o700});
 const env={PATH:process.env.PATH,FIXTURE_LOG:captureFile,FIXTURE_BRIDGE:bridge?'1':'0',FIXTURE_TOML:createRequire(import.meta.url).resolve('smol-toml'),OLLAMA_API_KEY:'SECRET-API-KEY',OPENAI_API_KEY:'SECRET-OPENAI-KEY',OLLAMA_HOST:'https://must-not-use.invalid'};
 const options:OllamaOptions={binary,codexBinary,env,cwd:dir,temporaryDirectory:dir,fetch:((url,init)=>{if(!String(url).startsWith(OLLAMA_URL+'/api/'))throw Error('unexpected daemon address');return fetch(String(url).replace(OLLAMA_URL,'http://127.0.0.1:'+port),init)}) as typeof fetch},entry=ollamaEntry(options);
 t.after(async()=>{await entry.close?.();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));rmSync(dir,{recursive:true,force:true})});
 return {dir,entry,options,requests,setOffline(v:boolean){offline=v},setTags(v:unknown){tags=v},capture:():any[]=>existsSync(captureFile)?readFileSync(captureFile,'utf8').trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)):[]};
}
