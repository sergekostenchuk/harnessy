import {fixtureSource,fixtureGroups} from './live-fixture.ts';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dom} from './ui-dom-test-helpers.ts';
const read=(path:string)=>readFileSync(new URL('../../../'+path,import.meta.url),'utf8');
export const live=read('ui/deploy/live.js');
const part=(s:string,a:string,b:string)=>{const start=s.indexOf(a),end=s.indexOf(b,start);assert.ok(start>=0&&end>start);return s.slice(start,end)};
export const record=(seq:number,text='Запись '+seq,extra:Record<string,unknown>={})=>({seq,ts:new Date().toISOString(),from:'worker',to:['owner'],kind:'note',thread:null,reply_to:null,text,...extra});
export const status=(project='/a',approvals:any[]=[],panes:any[]=[{id:'worker',label:'воркер',pendingApprovals:approvals.filter(a=>a.pane==='worker').length,waiting:null}])=>({project,panes,approvals,halted:false});
export const journal=(project='/a',records:any[]=[record(1)])=>({project,records,lastSeq:records.at(-1)?.seq??0,summary:{total:records.length,byKind:records.reduce((counts,r)=>(counts[r.kind]=(counts[r.kind]||0)+1,counts),{} as Record<string,number>)}});
export function nowUI(fetch?:(path:string,body?:any)=>Promise<any>){
 const raw=read('ui/sketches/disarto/14-now.html'),d=dom(part(raw,'<body>','<script src='));Object.assign(d.document,{documentElement:d.html,body:d.body});d.html.setAttribute('data-proto','');
 const H:any={on:true,snapshotOnly:false,project:'/a',confirmedProjectGeneration:0,panes:[],liveStatus:status()},requests:{path:string;body?:any}[]=[],streams:any[]=[],toasts:string[]=[];
 const context:any={H,PAGE:'now',KEY:'now',document:d.document,structuredClone,URLSearchParams,location:{},waiting:()=>['m0','limit','defects','w4'],badges(){},S:{dec:{},ui:{}},setTimeout:(fn:()=>void)=>{fn();return 1},clearTimeout(){},requestAnimationFrame:(fn:()=>void)=>fn(),
  esc:(s:any)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)),who:(s:string)=>s,paneName:(p:any)=>p.label||p.id,plural:(n:number)=>n===1?'ждёт':'ждут',toast:(s:string)=>toasts.push(s),refreshChats:async()=>{},sideChats(){},
  api:async(path:string,body?:any)=>{requests.push({path,body});return fetch?fetch(path,body):path==='/api/status'?status(H.project):journal(H.project)},
  addEventListener:d.window.addEventListener.bind(d.window),EventSource:class{onmessage:any;onopen:any;onerror:any;closed=false;constructor(){streams.push(this)}close(){this.closed=true}}};context.window=context;
 context.refreshStatus=async()=>{const result=await context.api('/api/status');if(!result||!result.project||!Array.isArray(result.panes))return false;if(H.project!==result.project){H.confirmedProjectGeneration++;H.project=result.project}H.liveStatus=result;H.panes=result.panes;return true};
 const vm=createContext(context);runInContext(read('ui/sketches/disarto/app.js'),vm);runInContext(part(raw,'<script>','</script>').slice('<script>'.length),vm);
 runInContext(fixtureSource(read('ui/deploy/proto.js'),fixtureGroups.proto_SPEC_to_specificationLabels,{filename:'proto.js',wrapper:1}),vm);
 runInContext(fixtureSource(live,fixtureGroups.live_networkCodes_to_networkWaiting,{filename:'live.js',wrapper:0})+fixtureSource(live,fixtureGroups.live_curD_to_document,{filename:'live.js',wrapper:0})+fixtureSource(live,fixtureGroups.live_md_to_addEventListener,{filename:'live.js',wrapper:0})+fixtureSource(live,fixtureGroups.live_LIVE_EVENTS_to_addEventListener,{filename:'live.js',wrapper:0})+fixtureSource(live,fixtureGroups.live_waitingControls_to_document,{filename:'live.js',wrapper:0})+fixtureSource(live,fixtureGroups.live_eventsValid_to_eventsValid,{filename:'live.js',wrapper:0})+fixtureSource(live,fixtureGroups.live_NOW_to_document,{filename:'live.js',wrapper:0})+'\nglobalThis.testing={state:NOW,live:nowLive,fetch:nowFetch,reset:nowReset,draw:nowDraw,items:nowItems,waitingControls,oldRefresh:refresh};',vm);
 const find=(selector:string)=>{const n=d.document.querySelector(selector);assert.ok(n,selector);return n};
 const start=async()=>{await context.refreshStatus();return context.testing.live()};
 const switchProject=async(project:string)=>{H.project=project;H.confirmedProjectGeneration++;H.liveStatus=status(project);H.panes=H.liveStatus.panes;return d.window.emit('live:status')};
 return {...d,H,context,requests,streams,toasts,find,start,switchProject,functions:context.testing};
}
