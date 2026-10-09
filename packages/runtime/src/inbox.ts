import type {Record_} from '@harnessy/journal';
export const INBOX_HELP='Как отвечать: владельцу — обычным текстом ответа (он в чате); на question роли — send kind=answer с reply_to=<seq>; на task — send kind=status; на review-request — send kind=verdict с score и round. Если не ответишь сам, твой итоговый текст уйдёт автоматически как ответ на question и task; на review-request автоответа нет.';
export function renderInbox(records:readonly Record_[],labelOf:(id:string)=>string):string {
 if(records.length===1){const r=records[0]!;if(r.from==='owner'&&['task','note','question'].includes(r.kind))return r.text+(r.thread&&r.kind==='task'?'\n\n(тред '+r.thread+')':'')}
 const out=['Входящие записи: '+records.length+'.'];for(const r of records){let head='[#'+r.seq+' · '+r.kind+' · от '+labelOf(r.from);if(r.thread)head+=' · тред '+r.thread;if(r.reply_to!=null)head+=' · ответ на #'+r.reply_to;if(r.score!=null)head+=' · балл '+r.score+', раунд '+(r.round??'None');out.push(head+']\n'+r.text)}out.push(INBOX_HELP);return out.join('\n\n')
}
export const queueNote=(n:number)=>n+' запис'+(n===1?'ь':'и')+' остались в очереди и уйдут со следующим ходом';
