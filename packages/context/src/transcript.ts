import {trim,chars,slice} from './strings.ts';
import type {TranscriptMessage} from './types.ts';
export function handoffPrompt(src:{readonly id:string;readonly label:string}){return 'Прочитай контекст чата от '+(src.id==='room'?'разговора без роли':src.label)+' и жди команду.'}
export function transcriptText(transcript:readonly TranscriptMessage[],limit=12000):string{
 const text=transcript.filter(m=>trim(m.text)).map(m=>(m.role==='me'?'Владелец':m.role==='ai'?'Ответ':'Сосед')+': '+trim(m.text)).join('\n\n');
 return chars(text)<=limit?text:'…'+(limit===0?text:slice(text,-limit))
}
