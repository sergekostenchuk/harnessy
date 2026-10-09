import {RuntimeError,slice} from './errors.ts';
import {prepareAskDepth,saveAskDepth,MAX_ASK_DEPTH} from './action-state.ts';
import type {AskArgs} from '@harnessy/providers';
import type {Record_} from '@harnessy/journal';
import type {ActionContext,AskResult,ProjectState,TurnScope} from './types.ts';
export const ASK_TIMEOUT_MS=1_800_000;
export {MAX_ASK_DEPTH};
interface Waiting {scope:TurnScope;target:string;seq:number|null;cancel():void}
export class Asks {
 private waiting=new Set<Waiting>();
 private reaches(from:string,to:string,seen=new Set<string>()):boolean {if(from===to)return true;if(seen.has(from))return false;seen.add(from);return [...this.waiting].some(w=>w.scope.seatId===from&&this.reaches(w.target,to,seen))}
 async ask(a:AskArgs,ctx:ActionContext):Promise<AskResult>{
 ctx.assertActive();const p=ctx.runtime.project,src=p.registry.get(ctx.scope.seatId),dst=p.registry.get(a.to);
 if(!src)throw new RuntimeError('sender_unknown','нет окна '+ctx.scope.seatId);
 if(!dst||dst===src)throw new RuntimeError('to_unknown','нет такого окна: '+a.to);
 if(ctx.relayDepth>=MAX_ASK_DEPTH)throw new RuntimeError('ask_failed','цепочка вопросов длиннее '+MAX_ASK_DEPTH);
 if(this.reaches(dst.id,src.id))throw new RuntimeError('ask_failed',dst.label+' само ждёт ответа от тебя; ответь ему записью send, а не встречным вопросом');
 let resolve!:(r:Record_)=>void,reject!:(e:Error)=>void;
 const future=new Promise<Record_>((a,b)=>{resolve=a;reject=b});let timer:unknown,unsubscribe=()=>{};
 const w:Waiting={scope:ctx.scope,target:dst.id,seq:null,cancel:()=>reject(new RuntimeError('cancelled','ход отменён'))};
 const matches=(r:Record_)=>w.seq!==null&&r.seq>w.seq&&r.reply_to===w.seq&&r.from===dst.id&&r.kind==='answer'&&r.to.includes(src.id)&&(r.ack!=='pending'||p.channel.ackDecision(r.seq)?.kind==='ack');
 this.waiting.add(w);
 unsubscribe=p.channel.on(e=>{if(e.type==='delivered'&&matches(e.record))resolve(e.record)});
 try{
 ctx.assertActive();prepareAskDepth(p);const question=p.channel.postAgentEffect({to:[dst.id],kind:'question',text:a.text,thread:a.thread||null},{seat:src.id,trust:'agent'},'ask');w.seq=question.seq;saveAskDepth(p,question.seq,ctx.relayDepth+1);
 // Include a synchronous reply published while post() was returning.
 const saved=p.journal.repliesTo(question.seq).find(matches);if(saved)resolve(saved);
 timer=ctx.runtime.clock.setTimeout(()=>reject(new RuntimeError('ask_failed','адресат не ответил за отведённое время')),ASK_TIMEOUT_MS);
 const reply=await future;ctx.assertActive();src.publish({type:'peerReply',from:dst.id,text:slice(reply.text,4000),seq:reply.seq});return {ok:true,reply:reply.text,seq:reply.seq};
 }finally{ctx.runtime.clock.clearTimeout(timer);unsubscribe();this.waiting.delete(w)}
 }
 cancel(scope:TurnScope):void {for(const w of this.waiting)if(w.scope===scope)w.cancel()}
 close(p:ProjectState):void {for(const w of this.waiting)if(w.scope.projectDir===p.dir)w.cancel()}
}
