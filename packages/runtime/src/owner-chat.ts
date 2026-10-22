import {pythonTrim,type Initiator} from '@harnessy/journal';
import {RuntimeError} from './errors.ts';
import {owner,place,free,waiting} from './operations.ts';
import type {Runtime} from './runtime.ts';
export const OWNER_KINDS=['task','question','note','stop','resume','decision'] as const;
export function chat(runtime:Runtime,input:Record<string,unknown>,initiator:Initiator) {
 const p=owner(runtime,initiator),pane=place(p,String(input.pane||''),'нет окна'),kind=String(input.kind||'task'),text=pythonTrim(String(input.message||''));
 if((p.editing.has(pane.id)||p.materializing.has(pane.id))&&kind!=='stop')throw new RuntimeError('busy','место сейчас отвечает — дождитесь ответа',409);
 if(pane.status==='recovering'||p.restoreFailed.has(pane.id))free(p,pane);
 const {cwd:_,from:__,by:___,mandate:____,reply_to:_____,...settings}=input;
 if(!p.editing.has(pane.id)&&!p.materializing.has(pane.id)&&p.registry.update(pane,settings))p.state.savePanes(p.registry,p.journal);
 if(!pane.model)throw new RuntimeError('model_required','Сначала выберите модель разговора',400);
 const attachments=runtime.chatAttachments(pane,input.attachments);
 if(!text&&!attachments.length)throw new RuntimeError('text_empty','пустое сообщение',400);
 if(!OWNER_KINDS.includes(kind as typeof OWNER_KINDS[number]))throw new RuntimeError('kind_unknown','владелец пишет виды '+OWNER_KINDS.join(', ')+'; получено '+kind,400);
 let replyTo:number|null=null,thread=typeof input.thread==='string'&&input.thread?input.thread:kind==='task'?'T'+(p.journal.lastSeq+1):null;
 if(input.reply_to!==undefined){
  if(kind!=='decision'||!Number.isSafeInteger(input.reply_to)||Number(input.reply_to)<1)throw new RuntimeError('reply_invalid','Ответ должен ссылаться на вопрос из этого разговора',400);
  replyTo=Number(input.reply_to);const question=p.journal.get(replyTo);
  if(!question||question.kind!=='question'||question.from!==pane.id||!question.to.includes('owner'))throw new RuntimeError('reply_invalid','Вопрос больше не найден в этом разговоре',409);
  if(p.journal.repliesTo(replyTo).some(r=>r.from==='owner'&&['answer','note','decision','ack','rejected'].includes(r.kind)))throw new RuntimeError('reply_closed','На этот вопрос уже ответили',409);
  thread=question.thread;
 }
 const direct=!!input.direct,orchestrator=[...p.registry.panes.values()].some(x=>x.kind==='orchestrator');
 if(orchestrator&&pane.kind!=='orchestrator'&&pane.id!=='room'&&!direct)throw new RuntimeError('direct_required','«'+pane.label+'» — не оркестратор: обращение напрямую требует явного подтверждения',409,{fields:{needDirect:true}});
 p.registry.refreshPolicy();
 const rec=p.channel.postCore({to:[pane.id],kind:kind as typeof OWNER_KINDS[number],text,...(attachments.length?{attachments}:{}),thread,...(replyTo===null?{}:{reply_to:replyTo}),...(direct?{origin:'direct'}:{})},{seat:'owner',trust:'owner'});
 const info=waiting(p,pane);if(info)runtime.publishState(pane.id);
 return {ok:true as const,seq:rec.seq,queued:pane.busy||!!info,thread:rec.thread,...(info?{waiting:info}:{})};
}
