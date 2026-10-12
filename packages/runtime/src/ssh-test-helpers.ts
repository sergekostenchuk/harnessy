import {mkdtempSync,mkdirSync,writeFileSync,chmodSync,readFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {TestContext} from 'node:test';
import {deferred,FakeClock} from './test-helpers.ts';
import {SshTunnels,type SshTunnelSnapshot,type SshTunnelConfig} from './ssh-tunnels.ts';
import type {SshCommand,SshExit,SshProcess} from './ssh-process.ts';

export function sshFiles(t:TestContext){const directory=mkdtempSync(join(realpathSync(tmpdir()),'ssh-test-')),home=join(directory,'home'),keys=join(home,'.ssh');mkdirSync(keys,{recursive:true});writeFileSync(join(keys,'key'),'FIXTURE-NOT-A-PRIVATE-KEY',{mode:0o600});writeFileSync(join(keys,'known_hosts'),'fixture.invalid dummy-host-key');t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const config:SshTunnelConfig={host:'fixture.invalid',port:2222,user:'tester',keyPath:join(keys,'key')};return {directory,home,keys,config};}
export function stateWhen(tunnels:SshTunnels,id:string,fn:(s:SshTunnelSnapshot)=>boolean){const current=tunnels.get(id);if(current&&fn(current))return Promise.resolve(current);return new Promise<SshTunnelSnapshot>(resolve=>{const off=tunnels.subscribe(state=>{if(state.id===id&&fn(state)){off();resolve(state)}})})}
export function sshDouble(t:TestContext){const f=sshFiles(t),clock=new FakeClock(),commands:SshCommand[]=[],workers:{command:SshCommand;process:SshProcess;exit:(result:SshExit)=>void}[]=[],controlEntered=deferred(),controls:((result:SshExit)=>void)[]=[];let result:SshExit|null=null,hold=false,stops=0;
 const spawn=(command:SshCommand):SshProcess=>{commands.push(command);const done=deferred<SshExit>(),child={done:done.promise,async stop(){stops++;done.resolve({code:0,stderr:''});await done.promise}};
  if(command.args.includes('-O')){controls.push(done.resolve);controlEntered.resolve();if(!hold)done.resolve({code:result?255:0,stderr:''})}
  else {workers.push({command,process:child,exit:done.resolve});writeFileSync(command.args[command.args.indexOf('-S')+1]!,'fixture-control');if(result)done.resolve(result)}return child;
 };
 const tunnels=new SshTunnels({home:f.home,temporaryDirectory:f.directory,spawn,clock});t.after(()=>tunnels.close());
 return {...f,clock,tunnels,commands,workers,spawn,controlEntered,controls,setExit(value:SshExit|null){result=value},holdControl(value:boolean){hold=value},get stops(){return stops}};
}
/** Real child process, but never SSH/network to the destination; only local control/SOCKS listeners. */
export function sshBinary(t:TestContext){const f=sshFiles(t),binary=join(f.directory,'ssh-double.mjs'),settings=join(f.directory,'behavior.json'),log=join(f.directory,'commands.ndjson');writeFileSync(settings,'{}');
 writeFileSync(binary,'#!'+process.execPath+'\n'+String.raw`
import {readFileSync,appendFileSync} from 'node:fs';import {createServer,createConnection} from 'node:net';import {dirname,join} from 'node:path';import {fileURLToPath} from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url)),args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1],behavior=JSON.parse(readFileSync(join(dir,'behavior.json'),'utf8'));
appendFileSync(join(dir,'commands.ndjson'),JSON.stringify({args,pid:process.pid,cwd:process.cwd(),env:Object.keys(process.env),home:process.env.HOME})+'\n');
if(args.includes('-O')){const c=createConnection(value('-S'));c.on('connect',()=>c.write('forward'));c.on('data',data=>process.exit(String(data)==='ok'?0:255));c.on('error',()=>process.exit(255));}
else if(behavior.error){process.stderr.write(behavior.error);process.exit(255)}
else if(behavior.hang){setInterval(()=>{},1000)}
else{
 const socks=createServer(c=>{c.on('data',()=>c.end(Buffer.from([5,0])))}),control=createServer(c=>c.on('data',()=>c.end('ok')));
 socks.on('error',()=>{process.stderr.write('Address already in use');process.exit(255)});
 socks.listen(Number(value('-D').split(':').at(-1)),'127.0.0.1',()=>control.listen(value('-S')));
 if(behavior.ignoreTerm)process.on('SIGTERM',()=>{});
 process.on('SIGUSR1',()=>{process.stderr.write('Connection reset by peer PRIVATE-ERROR');process.exit(255)});
}
`);chmodSync(binary,0o700);
 return {...f,binary,behavior:(value:Record<string,unknown>)=>writeFileSync(settings,JSON.stringify(value)),commands:()=>{try{return readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(row=>JSON.parse(row))}catch{return []}}};
}
