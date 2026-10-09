import {HANDOFF_MARKS,slice} from './strings.ts';
import {estTokens,contextWindow,pythonRound} from './tokens.ts';
import type {CardPane,CardDeps,ContextPart,ContextItem} from './types.ts';
export function contextCard(pane:CardPane,deps:CardDeps){
 const t=pane.tokens,measured=!!t&&Object.keys(t).length>0,inp=Math.trunc(t?.input??0),out=Math.trunc(t?.output??0),cr=Math.trunc(t?.cacheRead??0),value=measured?inp+cr+out:null;
 const instr=deps.instructionText+(pane.id==='room'?'':'\n'+deps.roleNote),history:ContextItem[]=[],handoff:ContextItem[]=[];let onboarding=0;
 pane.transcript.forEach((m,i)=>{const text=m.text||'',item={i,title:slice(text.split('\n')[0]??'',0,80),tokens:estTokens(text),ts:Math.trunc(m.ts??0)};
 if(m.role==='me'&&HANDOFF_MARKS.some(mark=>text.startsWith(mark)))handoff.push(item);else if(m.role==='peer'&&text.startsWith('[от харнесс]'))onboarding+=item.tokens;else history.push({i,role:m.role,title:item.title,tokens:item.tokens,ts:item.ts})});
 const eInstr=estTokens(instr)+onboarding,eHist=history.reduce((n,m)=>n+m.tokens,0),eHand=handoff.reduce((n,m)=>n+m.tokens,0),parts:ContextPart[]=[{key:'instructions',label:'вводная и инструкции',tokens:eInstr,est:true},{key:'history',label:'история',tokens:eHist,est:true,count:history.length},{key:'handoff',label:'переданное',tokens:eHand,est:true,count:handoff.length}];
 if(value!==null)parts.push({key:'system',label:'система и инструменты модели',tokens:Math.max(value-eInstr-eHist-eHand,0),est:true,residual:true});
 const used=value??eInstr+eHist+eHand,window=contextWindow(pane.model);if(window!==null)parts.push({key:'free',label:'свободно',tokens:Math.max(window-used,0),est:false});
 return {ok:true as const,pane:pane.id,label:pane.label,model:pane.model,window,measured,used,pct:window?pythonRound(used*100/window,1):null,cache:measured?{hitPct:inp+cr?pythonRound(cr*100/(inp+cr)):null,cached:cr,new:inp}:null,last:measured?{input:inp,output:out,cacheRead:cr}:null,parts,history:history.slice(-60),handoff,turns:pane.transcript.filter(m=>m.role==='me').length,chat:deps.chat,busy:pane.busy}
}
