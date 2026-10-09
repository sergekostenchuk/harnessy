import {mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setImmediate as immediate} from 'node:timers/promises';
import type {TestContext} from 'node:test';
import {Connections,ProjectRegistry,Settings,Pins} from '@harnessy/projects';
import type {Provider,Seat,TurnContext,Vendor} from '@harnessy/providers';
import {createRuntime,type Runtime,type RuntimeDeps,type RuntimeActions,type RuntimeEvent,type Clock} from './index.ts';
export const OWNER={seat:'owner',trust:'owner'} as const;
export const completedActions:RuntimeActions={async ask(){return {ok:true,reply:'ответ',seq:1}},async merge(){return {ok:true,sha:'a'.repeat(40),mergeSha:'b'.repeat(40),branch:'main'}},async assignRole(){return {ok:true,pane:'tester',label:'тестер',model:'w1',mode:'read',mandate:1}},async afterTurn(){return 'completed'},async restorePendingAcks(){},cancelAsks(){}};
export function deferred<T=void>(){let resolve!:(v:T|PromiseLike<T>)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
export async function until(fn:()=>boolean):Promise<void>{for(let i=0;i<200;i++){if(fn())return;await immediate()}throw Error('условие теста не наступило')}
export class FakeClock implements Clock {time=1791500000125;private seq=0;private timers=new Map<number,{due:number;fn:()=>void}>();now=()=>this.time;setTimeout(fn:()=>void,ms:number){const id=++this.seq;this.timers.set(id,{due:this.time+ms,fn});return id}clearTimeout(id:unknown){this.timers.delete(id as number)}
 advance(ms:number){this.time+=ms;for(const [id,t] of [...this.timers].sort((a,b)=>a[1].due-b[1].due))if(t.due<=this.time&&this.timers.delete(id))t.fn()}
}
export type Result={text:string;sessionId:string|null;interrupted?:boolean};
export class FakeProvider implements Provider {
 calls:{seat:Seat;message:string;ctx:TurnContext}[]=[];resets=0;closes=0;authCalls=0;modelCalls=0;listCalls=0;messageCalls=0;
 onRun:((seat:Seat,text:string,ctx:TurnContext)=>Promise<Result>)|null=null;onReset:(()=>Promise<void>)|null=null;onMessages:(()=>Promise<{role:'me'|'ai';text:string}[]>)|null=null;
 readonly vendor:Vendor;constructor(vendor:Vendor='claude'){this.vendor=vendor}
 async runTurn(seat:Seat,message:string,ctx:TurnContext):Promise<Result>{this.calls.push({seat,message,ctx});if(this.onRun)return this.onRun(seat,message,ctx);ctx.modelStarted?.();ctx.publish({type:'done',sessionId:'s1',model:seat.model,durationMs:5,usage:{input:20,output:3,cacheRead:7}});return {text:'готов: '+seat.id,sessionId:'s1'}}
 async reset(){this.resets++;await this.onReset?.()}async close(){this.closes++}
 async auth(){this.authCalls++;return {loggedIn:true}}async models(){this.modelCalls++;return [{id:this.vendor==='claude'?'w1':'c1',label:'модель'}]}
 async listSessions(_cwd:string){this.listCalls++;return [{id:'old',title:'прежний',updated:1}]}
 async sessionMessages(_cwd:string,_id:string){this.messageCalls++;return this.onMessages?this.onMessages():[{role:'ai' as const,text:'прежний ответ'}]}
}
export function collect(runtime:Runtime){const events:RuntimeEvent[]=[],sub=runtime.subscribe({all:true});void (async()=>{for await(const event of sub.events)events.push(event)})();return {events,sub}}
export async function harness(t:TestContext,options:{seats?:string;deps?:Partial<RuntimeDeps>;actions?:RuntimeActions;before?:(dir:string)=>void}={}){
 const dir=realpathSync(mkdtempSync(join(tmpdir(),'harnessy-runtime-')));mkdirSync(join(dir,'.harness','state'),{recursive:true});
 const seats=options.seats??'  worker: {role: executor, vendor: claude, label: воркер, model: w1, mode: read, digest: false}';
 writeFileSync(join(dir,'.harness','team.yaml'),'version: 1\nintegration_branch: main\nseats:\n'+seats+'\n');options.before?.(dir);
 const provider=new FakeProvider(),clock=new FakeClock();const deps:RuntimeDeps={projectDir:dir,appUrl:'http://127.0.0.1:9000',providers:{claude:provider},clock,models:{claude:[{id:'w1'},{id:'w2'}],codex:[{id:'c1'}]},connections:new Connections(join(dir,'connections.json')),projectRegistry:new ProjectRegistry({projects:join(dir,'projects.json'),lastProject:join(dir,'last')},{noLast:true}),settings:current=>new Settings(join(dir,'owner-settings.json'),current),pins:(current,meta)=>new Pins(join(dir,'pins.json'),current,meta),...options.deps};
 const runtime=await createRuntime(deps,options.actions??completedActions);t.after(async()=>{await runtime.close();rmSync(dir,{recursive:true,force:true})});await runtime.idle();return {runtime,provider,clock,dir,deps}
}
