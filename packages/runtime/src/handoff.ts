import {handoffPrompt,transcriptText} from '@harnessy/context';
import {pythonTrim,type Initiator} from '@harnessy/journal';
import {RuntimeError,slice} from './errors.ts';
import {owner} from './operations.ts';
import type {Runtime} from './runtime.ts';
export function handoff(runtime:Runtime,input:{to?:unknown;from?:unknown;kind?:unknown;text?:unknown},initiator:Initiator) {
 const p=owner(runtime,initiator),raw=input.to||[],ids=[...new Set((Array.isArray(raw)?raw:[raw]).map(x=>pythonTrim(String(x||''))).filter(Boolean))];
 const from=String(input.from||'room'),kind=String(input.kind||'note'),src=p.registry.get(from),targets=ids.map(id=>p.registry.get(id));
 if(!ids.length||targets.some(x=>!x))throw new RuntimeError('pane_unknown','нет такого места',404);
 if(ids.includes(from))throw new RuntimeError('self_addressed','чат не может передать контекст сам себе',400);
 if(!['task','note','question'].includes(kind))throw new RuntimeError('kind_unknown','вид '+kind+' не годится: task, note или question',400);
 if(!src?.transcript.length)throw new RuntimeError('text_empty','передавать нечего: чат-источник пуст',400);
 if(p.editing.has(from))throw new RuntimeError('busy','место сейчас отвечает — дождитесь ответа');
 const answers=src.transcript.filter(m=>m.role==='ai').length;let text=pythonTrim(String(input.text||''));
 if(!text){if(answers>=2)throw new RuntimeError('selection_required','в чате '+answers+' ответа(ов) модели — выберите, что передать',409,{fields:{needSelection:true,answers}});text=handoffPrompt(src)+'\n\n--- контекст чата ---\n'+transcriptText(src.transcript)}
 if([...text].length>60000)text=slice(text,60000)+'\n…(обрезано)';
 p.registry.refreshPolicy();const record=p.channel.postCore({to:ids,kind:kind as 'task'|'note'|'question',text,thread:kind==='task'?'T'+(p.journal.lastSeq+1):null,origin:'handoff'},{seat:'owner',trust:'owner'});
 const names=targets.map(x=>x!.label).join(', '),note='контекст передан: '+names+' · запись №'+record.seq;
 src.record('peer','[от харнесс] '+note);src.publish({type:'note',text:note});p.state.savePanes(p.registry,p.journal);
 return {ok:true as const,seq:record.seq,to:targets.map(x=>x!.settings()),names,chars:[...text].length,answers};
}
