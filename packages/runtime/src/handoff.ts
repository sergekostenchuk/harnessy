import {handoffPrompt,markdownVisible,isConversationMessage} from '@harnessy/context';
import {pythonTrim,type Initiator} from '@harnessy/journal';
import {RuntimeError,slice} from './errors.ts';
import {owner} from './operations.ts';
import type {Runtime} from './runtime.ts';
type QuoteInput={seq:number;text:string;comment:string};
const normalized=(value:string)=>value.replace(/\r\n?/g,'\n');
const quoteBlock=(text:string,index:number)=>normalized(text).split('\n').map((line,i)=>(i?'':'['+index+'] ') +'> '+line).join('\n');
const quoteComparable=(value:string)=>normalized(value).replace(/\s+/g,' ').trim();
function quoteTime(seconds:number):string {
 if(!Number.isFinite(seconds)||seconds<=0)return '';
 const date=new Date(seconds*1000);if(!Number.isFinite(date.getTime()))return '';const two=(value:number)=>String(value).padStart(2,'0');
 return two(date.getDate())+'.'+two(date.getMonth()+1)+'.'+date.getFullYear()+' '+two(date.getHours())+':'+two(date.getMinutes());
}
export function handoff(runtime:Runtime,input:{to?:unknown;from?:unknown;kind?:unknown;chat?:unknown;seqs?:unknown;quotes?:unknown;prompt?:unknown;text?:unknown},initiator:Initiator) {
 const p=owner(runtime,initiator),raw=input.to||[],ids=[...new Set((Array.isArray(raw)?raw:[raw]).map(x=>pythonTrim(String(x||''))).filter(Boolean))];
 const chat=typeof input.chat==='string'&&Object.hasOwn(p.state.chats.chats,input.chat)?p.state.chats.chats[input.chat]:null;
 const from=String(input.from||chat?.pane||'room'),kind=String(input.kind||'note'),src=p.registry.get(from),targets=ids.map(id=>p.registry.get(id));
 if(!ids.length||targets.some(x=>!x))throw new RuntimeError('pane_unknown','нет такого места',404);
 if(ids.includes(from))throw new RuntimeError('self_addressed','чат не может передать контекст сам себе',400);
 if(!['task','note','question'].includes(kind))throw new RuntimeError('kind_unknown','вид '+kind+' не годится: task, note или question',400);
 if(Object.hasOwn(input,'text'))throw new RuntimeError('selection_invalid','передайте chat и seqs выбранных реплик вместо text',400);
 if(!chat||!src||chat.pane!==from||p.state.chats.active[from]!==chat.id)throw new RuntimeError('selection_invalid','разговор-источник не найден или изменился',400);
 const quoteMode=Object.hasOwn(input,'quotes');
 if(quoteMode&&Object.hasOwn(input,'seqs'))throw new RuntimeError('selection_invalid','передайте либо цитаты, либо реплики целиком',400);
 if(!quoteMode&&(!Array.isArray(input.seqs)||!input.seqs.length||input.seqs.length>10000||input.seqs.some(n=>!Number.isSafeInteger(n)||n<=0)||new Set(input.seqs).size!==input.seqs.length))throw new RuntimeError('selection_invalid','выберите реплики разговора по их номерам',400);
 if(input.prompt!==undefined&&(typeof input.prompt!=='string'||input.prompt.length>2000))throw new RuntimeError('selection_invalid','вводная должна быть текстом не длиннее 2000 знаков',400);
 if(quoteMode&&pythonTrim(String(input.prompt||'')))throw new RuntimeError('selection_invalid','при передаче цитат отправляются только цитаты, комментарии и источник',400);
 if(p.editing.has(from))throw new RuntimeError('busy','место сейчас отвечает — дождитесь ответа');
 p.state.sync(p.registry);
 let answers=0,text:string;
 if(quoteMode){
  if(!Array.isArray(input.quotes)||!input.quotes.length||input.quotes.length>100)throw new RuntimeError('selection_invalid','выберите от одной до ста цитат',400);
  const bySeq=new Map(chat.transcript.filter(isConversationMessage).map(message=>[message.seq,message])),quotes:QuoteInput[]=input.quotes.map(value=>{
   if(!value||typeof value!=='object'||!Number.isSafeInteger((value as any).seq)||(value as any).seq<=0||typeof (value as any).text!=='string'||typeof ((value as any).comment??'')!=='string')throw new RuntimeError('selection_invalid','неверная форма выбранной цитаты',400);
   const selected=normalized(pythonTrim((value as any).text)),comment=normalized(pythonTrim((value as any).comment??''));
   if(!selected||[...selected].length>10000||[...comment].length>4000)throw new RuntimeError('selection_invalid','цитата или комментарий слишком длинные',400);
   const message=bySeq.get((value as any).seq),visible=message?.role==='ai'?markdownVisible(message.text):normalized(message?.text||'');
   if(!message||!['me','ai'].includes(message.role)||!quoteComparable(visible).includes(quoteComparable(selected)))throw new RuntimeError('selection_invalid','цитата не принадлежит выбранной реплике',400);
   return {seq:(value as any).seq,text:selected,comment};
  });
  text='--- выбранные цитаты ---\n'+quotes.map((quote,index)=>{const message=bySeq.get(quote.seq)!,time=quoteTime(message.ts),source=message.role==='me'?'из вопроса владельца':'из ответа '+src.label;answers+=message.role==='ai'?1:0;return quoteBlock(quote.text,index+1)+(quote.comment?'\n'+quote.comment:'')+'\nИсточник: '+source+(time?', '+time:'')}).join('\n\n');
  if([...text].length>60000)throw new RuntimeError('selection_invalid','выбранные цитаты и комментарии длиннее 60000 знаков',400);
 }else{
  const wanted=new Set(input.seqs as number[]),messages=chat.transcript.filter(m=>isConversationMessage(m)&&m.seq!==undefined&&wanted.has(m.seq));
  if(messages.length!==wanted.size)throw new RuntimeError('selection_invalid','выбранная реплика не принадлежит этому разговору',400);
  answers=messages.filter(m=>m.role==='ai').length;const prompt=input.prompt===undefined?handoffPrompt(src):pythonTrim(input.prompt as string);
  text=(prompt?prompt+'\n\n':'')+'--- контекст чата ---\n'+messages.map(m=>(m.role==='me'?'Владелец':m.role==='ai'?'Ответ':'Сосед')+': '+m.text).join('\n\n');
  if([...text].length>60000)text=slice(text,60000)+'\n…(обрезано)';
 }
 p.registry.refreshPolicy();const record=p.channel.postCore({to:ids,kind:kind as 'task'|'note'|'question',text,thread:kind==='task'?'T'+(p.journal.lastSeq+1):null,origin:'handoff'},{seat:'owner',trust:'owner'});
 const names=targets.map(x=>x!.label).join(', '),note='контекст передан: '+names+' · запись №'+record.seq;
 src.record('peer','[от харнесс] '+note);src.publish({type:'note',text:note});p.state.savePanes(p.registry,p.journal);runtime.ownerAutopilotAction(p,initiator);
 return {ok:true as const,seq:record.seq,to:targets.map(x=>x!.settings()),names,chars:[...text].length,answers};
}
