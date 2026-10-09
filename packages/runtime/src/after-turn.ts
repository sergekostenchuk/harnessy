import {JournalError,pythonTrim} from '@harnessy/journal';
import {readActions,saveReview,type ReviewAction} from './action-state.ts';
import type {AfterTurnContext} from './types.ts';
const HARNESS={seat:'harness',trust:'harness'} as const;
export async function afterTurn(ctx:AfterTurnContext):Promise<'completed'>{
 const {project:p,pane,turnInstanceId,text,interrupted,records}=ctx;readActions(p);
 for(const r of records){
 if(['owner','harness'].includes(r.from))continue;
 if(r.kind==='question'||r.kind==='task'){
 if(!pythonTrim(text)||p.journal.repliesTo(r.seq).some(a=>a.from===pane.id))continue;
 try{p.channel.postAgentEffect({to:[r.from],kind:r.kind==='question'?'answer':'status',text,thread:r.thread,reply_to:r.seq},{seat:pane.id,trust:'agent'},'auto')}
 catch(e){if(!(e instanceof JournalError)||e.code==='write_failed')throw e;pane.publish({type:'toolError',text:'автоответ не записан: '+e.message})}
 }else if(r.kind==='review-request'&&!readActions(p).reviews.some(a=>a.sid===pane.id&&a.reviewSeq===r.seq))saveReview(p,{sid:pane.id,reviewSeq:r.seq,firstTurnInstanceId:turnInstanceId,stage:'awaiting'});
 }
 for(const stored of readActions(p).reviews.filter(r=>r.sid===pane.id&&!['closed','escalated'].includes(r.stage))){
 const r=p.journal.get(stored.reviewSeq)!;
 if(p.journal.repliesTo(r.seq).some(a=>a.kind==='verdict')){saveReview(p,{...stored,stage:'closed'});continue}
 if(interrupted)continue;
 const effects=p.journal.repliesTo(r.seq).filter(a=>a.from==='harness'&&a.origin==='nudge');
 let review:ReviewAction={...stored};
 if(effects.some(a=>a.kind==='escalation')){saveReview(p,{...review,stage:'escalated'});continue}
 if(review.stage==='awaiting'){
 if(!effects.some(a=>a.kind==='note'&&a.to.includes(pane.id)))p.channel.postCore({to:[pane.id],kind:'note',text:'Вердикт на review-request #'+r.seq+' не получен. Пришли send kind=verdict reply_to='+r.seq+' с score (0..10), round и путём к отчёту в evidence.',thread:r.thread,reply_to:r.seq,origin:'nudge'},HARNESS);
 review={...review,stage:'nudged',firstTurnInstanceId:turnInstanceId};saveReview(p,review);
 }else if(review.firstTurnInstanceId!==turnInstanceId){
 p.channel.postCore({to:['owner',r.from],kind:'escalation',text:pane.label+' дважды не дало вердикт на review-request #'+r.seq+'.',thread:r.thread,reply_to:r.seq,origin:'nudge'},HARNESS);
 saveReview(p,{...review,stage:'escalated'});
 }
 }
 return 'completed';
}
