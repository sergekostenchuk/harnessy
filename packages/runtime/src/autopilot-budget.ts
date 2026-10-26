import {constants,closeSync,fstatSync,lstatSync,openSync,readFileSync,writeFileSync,renameSync,fsyncSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {withPathLock} from '@harnessy/team';
import {RuntimeError} from './errors.ts';
import type {AutopilotBudgetPort,AutopilotBudgetCall} from './autopilot-council.ts';

/** Points of a verified provider weekly window. Credits are never monetary capacity. */
export interface AutopilotSpendQuote {window:string;percentUsed:number;upperPercent:number;basis:string}
export type AutopilotSpendQuotes=(calls:readonly AutopilotBudgetCall[])=>Promise<readonly AutopilotSpendQuote[]>;
interface Reservation {generation:number;window:string;baseline:number;amount:number;uses:number}
const invalid=()=>new RuntimeError('spend_unknown','Нет подтверждённой верхней оценки вызова в пунктах недельного лимита; решение ждёт владельца',409);
const percentage=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100;
export class AutopilotSpendBudget implements AutopilotBudgetPort {
 private readonly path:string;private project:string;private quotes:AutopilotSpendQuotes;
 constructor(project:string,quotes:AutopilotSpendQuotes){this.project=project;this.quotes=quotes;this.path=join(project,'.harness','state','autopilot-spend.json')}
 private read():Reservation[]{
  const parent=join(this.project,'.harness','state');if(realpathSync(parent)!==parent||lstatSync(parent).uid!==process.getuid?.())throw invalid();
  let fd:number|undefined;
  try{const info=lstatSync(this.path);if(!info.isFile()||info.isSymbolicLink()||info.size>4*1024*1024||info.uid!==process.getuid?.()||(info.mode&0o077)!==0)throw invalid();fd=openSync(this.path,constants.O_RDONLY|constants.O_NOFOLLOW);const stat=fstatSync(fd);if(!stat.isFile()||stat.size>4*1024*1024)throw invalid();const data=JSON.parse(readFileSync(fd,'utf8'));if(!Array.isArray(data)||data.some(r=>!r||!Number.isSafeInteger(r.generation)||r.generation<1||typeof r.window!=='string'||!r.window||!percentage(r.baseline)||!Number.isFinite(r.amount)||r.amount<=0||!Number.isSafeInteger(r.uses)||r.uses<0))throw invalid();return data}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e}finally{if(fd!==undefined)closeSync(fd)}
 }
 private write(rows:Reservation[]){const tmp=this.path+'.'+randomUUID()+'.tmp';let fd:number|undefined;try{fd=openSync(tmp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);writeFileSync(fd,JSON.stringify(rows));fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(tmp,this.path)}finally{if(fd!==undefined)closeSync(fd)}}
 private async checked(calls:readonly AutopilotBudgetCall[]){const rows=await this.quotes(calls);if(rows.length!==calls.length||rows.some(q=>typeof q.window!=='string'||!q.window||!percentage(q.percentUsed)||!percentage(q.upperPercent)||q.upperPercent===0||typeof q.basis!=='string'||!q.basis.trim()))throw invalid();return rows}
 async reserve(input:Parameters<AutopilotBudgetPort['reserve']>[0]){
  if(input.project!==this.project||!input.calls.length||!Number.isSafeInteger(input.generation)||input.generation<1||!percentage(input.maxSpendPercent))throw invalid();
  const quotes=await this.checked(input.calls),groups=new Map<string,{amount:number;observed:number}>();
  for(const q of quotes){const group=groups.get(q.window)??{amount:0,observed:0};group.amount+=q.upperPercent;group.observed=Math.max(group.observed,q.percentUsed);groups.set(q.window,group)}
  const indices=new Map<string,number>();
  await withPathLock(this.path,()=>{const rows=this.read();for(const [window,group]of groups){const old=rows.filter(r=>r.generation===input.generation&&r.window===window),baseline=old.length?Math.min(...old.map(r=>r.baseline)):group.observed,reserved=old.reduce((n,r)=>n+r.amount,0),spent=Math.max(reserved,group.observed-baseline);if(!Number.isFinite(group.amount)||spent+group.amount>input.maxSpendPercent||group.observed+group.amount>100)throw new RuntimeError('spend_over_cap','Потолок расхода Автопилота исчерпан; решение ждёт владельца',409);indices.set(window,rows.length);rows.push({generation:input.generation,window,baseline,amount:group.amount,uses:0})}this.write(rows)});
  const remaining=input.calls.map((call,index)=>({call,quote:quotes[index]!}));let closed=false;
  return {use:async(call:AutopilotBudgetCall)=>{if(closed)throw invalid();const at=remaining.findIndex(({call:c})=>c.seat===call.seat&&c.model===call.model&&c.vendor===call.vendor&&c.purpose===call.purpose&&(c.purpose==='effect'||c.round===call.round));if(at<0)throw invalid();const held=remaining.splice(at,1)[0]!,fresh=(await this.checked([call]))[0]!;if(fresh.window!==held.quote.window||fresh.upperPercent>held.quote.upperPercent)throw invalid();await withPathLock(this.path,()=>{const rows=this.read(),row=rows[indices.get(fresh.window)!];if(!row||row.generation!==input.generation||row.window!==fresh.window)throw invalid();const reserved=rows.filter(r=>r.generation===input.generation&&r.window===fresh.window).reduce((sum,r)=>sum+r.amount,0);if(fresh.percentUsed-row.baseline+reserved-held.quote.upperPercent+fresh.upperPercent>input.maxSpendPercent||fresh.percentUsed+fresh.upperPercent>100)throw new RuntimeError('spend_over_cap','Потолок расхода Автопилота исчерпан',409);row.uses++;this.write(rows)})},close:async(_result:'applied'|'owner')=>{closed=true;const latest=await this.checked(input.calls);if(latest.some((q,index)=>q.window!==quotes[index]!.window))throw invalid();await withPathLock(this.path,()=>{const rows=this.read();for(const quote of latest){const row=rows[indices.get(quote.window)!];if(!row)throw invalid();if(quote.percentUsed-row.baseline>input.maxSpendPercent)throw new RuntimeError('spend_over_cap','Измеренный расход превысил потолок Автопилота',409)}})}};
  // Never refund a cancelled or unmeasured call as zero. The upper reservation survives restart.
 }
}
