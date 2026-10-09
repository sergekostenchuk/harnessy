import {Approval,type ApprovalDecision} from './pane.ts';
import {RuntimeError,message,slice} from './errors.ts';
import type {ProjectState} from './types.ts';
import type {Runtime} from './runtime.ts';
export const ACK_TIMEOUT_MS=86_400_000;
export class OwnerAcks {
 private cards=new Map<ProjectState,Map<number,Approval>>();
 restore(runtime:Runtime,p:ProjectState):void {
 if(p.closed)return;let cards=this.cards.get(p);if(!cards){cards=new Map();this.cards.set(p,cards)}
 for(const r of p.channel.pendingAcks()){
 if(cards.has(r.seq))continue;const pane=p.registry.get(r.from)??p.owner,id='ack:'+r.seq;
 const decide=(requested:ApprovalDecision)=>{
 if(p.closed)throw new RuntimeError('project_changed','проект сменился');
 try{
 const previous=p.channel.ackDecision(r.seq);
 const complete=previous&&p.journal.ackEventRecorded(previous,previous.kind==='ack'?'confirmed':'notification');
 const resolution=complete?previous:previous?.kind==='ack'?p.channel.confirmAck(r.seq):previous?.kind==='rejected'?p.channel.confirmAck(r.seq):requested==='allow'?p.channel.confirmAck(r.seq):p.channel.rejectAck(r.seq);
 const decision:ApprovalDecision=resolution.kind==='ack'?'allow':!previous&&requested==='timeout'?'timeout':'deny';
 cards!.delete(r.seq);
 return {decision,...(previous&&requested!=='timeout'&&(requested==='allow')!==(resolution.kind==='ack')?{error:new RuntimeError('ack_closed','решение по записи #'+r.seq+' уже принято')}: {})};
 }catch(e){pane.publish({type:'error',message:message(e),sessionId:pane.sessionId,code:e instanceof RuntimeError?e.code:'write_failed'});throw e}
 };
 const title='Подтвердить отправку #'+r.seq+' '+r.kind+' → '+r.to.map(t=>runtime.labelOf(t,p)).join(', ')+'?';
 const age=runtime.clock.now()-Date.parse(r.ts),remaining=Math.max(0,ACK_TIMEOUT_MS-(Number.isFinite(age)?Math.max(0,age):ACK_TIMEOUT_MS));
 const card=new Approval(id,pane,title,slice(r.text,600),remaining,runtime.clock,decide);cards.set(r.seq,card);pane.approvals.set(id,card);
 const previous=p.channel.ackDecision(r.seq);
 if(previous||remaining===0){try{card.finish(previous?.kind==='ack'?'allow':previous?'deny':'timeout')}catch{/* A failed durable effect keeps its card available. */}if(pane.approvals.has(id))pane.publish(card.event())}
 else pane.publish(card.event());
 }
 }
 close(p:ProjectState):void {for(const card of this.cards.get(p)?.values()??[])card.detach();this.cards.delete(p)}
}
