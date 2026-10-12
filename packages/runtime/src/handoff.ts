import {handoffPrompt} from '@harnessy/context';
import {pythonTrim,type Initiator} from '@harnessy/journal';
import {RuntimeError,slice} from './errors.ts';
import {owner} from './operations.ts';
import type {Runtime} from './runtime.ts';
export function handoff(runtime:Runtime,input:{to?:unknown;from?:unknown;kind?:unknown;chat?:unknown;seqs?:unknown;prompt?:unknown;text?:unknown},initiator:Initiator) {
 const p=owner(runtime,initiator),raw=input.to||[],ids=[...new Set((Array.isArray(raw)?raw:[raw]).map(x=>pythonTrim(String(x||''))).filter(Boolean))];
 const chat=typeof input.chat==='string'&&Object.hasOwn(p.state.chats.chats,input.chat)?p.state.chats.chats[input.chat]:null;
 const from=String(input.from||chat?.pane||'room'),kind=String(input.kind||'note'),src=p.registry.get(from),targets=ids.map(id=>p.registry.get(id));
 if(!ids.length||targets.some(x=>!x))throw new RuntimeError('pane_unknown','нет такого места',404);
 if(ids.includes(from))throw new RuntimeError('self_addressed','чат не может передать контекст сам себе',400);
 if(!['task','note','question'].includes(kind))throw new RuntimeError('kind_unknown','вид '+kind+' не годится: task, note или question',400);
 if(Object.hasOwn(input,'text'))throw new RuntimeError('selection_invalid','передайте chat и seqs выбранных реплик вместо text',400);
 if(!chat||!src||chat.pane!==from||p.state.chats.active[from]!==chat.id)throw new RuntimeError('selection_invalid','разговор-источник не найден или изменился',400);
 if(!Array.isArray(input.seqs)||!input.seqs.length||input.seqs.length>10000||input.seqs.some(n=>!Number.isSafeInteger(n)||n<=0)||new Set(input.seqs).size!==input.seqs.length)throw new RuntimeError('selection_invalid','выберите реплики разговора по их номерам',400);
 if(input.prompt!==undefined&&(typeof input.prompt!=='string'||input.prompt.length>2000))throw new RuntimeError('selection_invalid','вводная должна быть текстом не длиннее 2000 знаков',400);
 if(p.editing.has(from))throw new RuntimeError('busy','место сейчас отвечает — дождитесь ответа');
 p.state.sync(p.registry);
 const wanted=new Set(input.seqs),messages=chat.transcript.filter(m=>wanted.has(m.seq));
 if(messages.length!==wanted.size)throw new RuntimeError('selection_invalid','выбранная реплика не принадлежит этому разговору',400);
 const answers=messages.filter(m=>m.role==='ai').length,prompt=input.prompt===undefined?handoffPrompt(src):pythonTrim(input.prompt as string);
 let text=(prompt?prompt+'\n\n':'')+'--- контекст чата ---\n'+messages.map(m=>(m.role==='me'?'Владелец':m.role==='ai'?'Ответ':'Сосед')+': '+m.text).join('\n\n');
 if([...text].length>60000)text=slice(text,60000)+'\n…(обрезано)';
 p.registry.refreshPolicy();const record=p.channel.postCore({to:ids,kind:kind as 'task'|'note'|'question',text,thread:kind==='task'?'T'+(p.journal.lastSeq+1):null,origin:'handoff'},{seat:'owner',trust:'owner'});
 const names=targets.map(x=>x!.label).join(', '),note='контекст передан: '+names+' · запись №'+record.seq;
 src.record('peer','[от харнесс] '+note);src.publish({type:'note',text:note});p.state.savePanes(p.registry,p.journal);
 return {ok:true as const,seq:record.seq,to:targets.map(x=>x!.settings()),names,chars:[...text].length,answers};
}
