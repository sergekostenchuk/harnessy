import {mkdtempSync,realpathSync,mkdirSync,writeFileSync,rmSync,utimesSync,statSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Journal,type JournalOptions} from './journal.ts';
import {Policy} from './policy.ts';
import {Channel,type ChannelDeps} from './channel.ts';
import {JournalError,type JournalCode,type ChannelEvent,type CorePostInput,type AgentPostInput} from './types.ts';
export const fixtureDir=fileURLToPath(new URL('./fixtures/',import.meta.url));
export const template=readFileSync(join(fixtureDir,'comms-policy.yaml'),'utf8');
export function temp(){const root=realpathSync(mkdtempSync(join(tmpdir(),'harnessy-journal-')));return {root,close:()=>rmSync(root,{recursive:true,force:true})}}
export function fixture(source=template,options:JournalOptions={}){
 const t=temp(),policyPath=join(t.root,'.harness','comms-policy.yaml');mkdirSync(join(t.root,'.harness'),{recursive:true});writeFileSync(policyPath,source);
 const journal=new Journal(t.root,options),policy=new Policy(policyPath),events:ChannelEvent[]=[];
 const roles:Record<string,string>={worker:'executor',reviewer:'reviewer',orchestrator:'orchestrator',tester:'tester',architect:'architect',researcher:'researcher',assistant:'assistant'};
 const deps:ChannelDeps={journal,policy,projectDir:t.root,liveSeats:()=>Object.keys(roles),roleOf:seat=>Object.hasOwn(roles,seat)?roles[seat]!:null,labelOf:seat=>seat==='reviewer'?'ревьюер':seat,hasRepo:()=>true,resolveSha:sha=>sha==='abc'||sha==='a'.repeat(40)?'a'.repeat(40):null,mergeCommitFor:()=>null};
 const channel=new Channel(deps);channel.on(event=>events.push(event));
 const agent=(seat:string,input:AgentPostInput)=>channel.post(input,{seat,trust:'agent'});
 const core=(input:CorePostInput,seat:'owner'|'harness'='owner')=>channel.postCore(input,{seat,trust:seat});
 const reload=(source:string)=>{writeFileSync(policyPath,source);const stamp=statSync(policyPath).mtimeMs/1000+5;utimesSync(policyPath,stamp,stamp)};
 const report=(thread='T',round=1,text='# Ran\nтесты\n# Skipped\n—\n# Planned\n—\n# Manual\n—\n')=>{
 const dir=join(t.root,'.harness','evidence',thread,'r'+round);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'report.md'),text);return '.harness/evidence/'+thread+'/r'+round+'/report.md'
 };
 const request=(thread='T')=>agent('worker',{to:'reviewer',kind:'review-request',text:'проверь',thread,sha:'abc'});
 return {...t,journal,policy,policyPath,deps,roles,channel,events,agent,core,reload,report,request}
}
export const error=(code:JournalCode,text?:string)=>(e:unknown)=>e instanceof JournalError&&e.code===code&&(text===undefined||e.message===text);
export const ackPolicy=template.replace('kinds: [report, question, answer, note, escalation]','kinds: [report, question, answer, note, escalation]\n    trigger: owner-ack');
export const verdictAckPolicy=template.replace('trigger: reply-to:review-request','trigger: owner-ack');
