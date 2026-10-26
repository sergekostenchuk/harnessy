import type {Seat,TurnContext,TurnEvent} from '@harnessy/providers';
export const seat:Seat={id:'lead',vendor:'claude',label:'Тест',model:'claude-opus-5-5',mode:'read',cwd:'/',sessionId:null,writePaths:[],worktree:null};
export function fakeContext(signal=new AbortController().signal){
 const events:TurnEvent[]=[];
 const ctx={signal,publish:(event:TurnEvent)=>{events.push(event)},modelStarted:()=>{}} as unknown as TurnContext;
 return {ctx,events};
}
