import type {Seat,TurnContext} from './types.ts';
export const SYSTEM_CHAT='Ты ассистент в простом чате. Отвечай на языке собеседника, по существу. Доступа к файлам и к интернету у тебя в этом чате нет.';
export const CHAT_INSTRUCTIONS='Это простой чат. Отвечай на языке собеседника, по существу. Команды не выполняй, файлы не читай, просто отвечай текстом.';
export const DIGEST_MARK='\n---\nСообщение тебе:\n';
export function stripDigest(text:string):string{const i=text.indexOf(DIGEST_MARK);return i>=0?text.slice(i+DIGEST_MARK.length):text}
export function peerNote(seat:Seat,ctx:TurnContext):string{
 const others=ctx.peers.filter(p=>p.id!==seat.id).map(p=>p.id+' — '+p.label+' ('+p.vendor+')').join(', ');
 return ' Рядом работают другие окна чата: '+others+'. Связь с ними ТОЛЬКО инструментами: send — отправить запись и не ждать, ask — спросить и дождаться ответа, read_pane — прочитать их разговор. Записи от соседей приходят тебе входящим сообщением с номером #seq: отвечай на них send с reply_to. Соседи не видят твоей переписки: пиши им полный текст.';
}
export function claudeTeamNote(seat:Seat,ctx:TurnContext):string{return 'Ты работаешь в папке проекта: '+seat.cwd+'. В этой же папке параллельно могут работать агенты из других окон. Перед правкой смотри актуальное состояние файла, чужие изменения не переписывай, коммиты делай только если попросили. В конце ответа кратко перечисли, что сделал и какие файлы изменил.'+peerNote(seat,ctx)}
export function codexTeamNote(seat:Seat,ctx:Pick<TurnContext,'peers'>):string{
 const others=ctx.peers.filter(p=>p.id!==seat.id).map(p=>p.id+' — '+p.label+' ('+p.vendor+')').join(', ');
 return 'Ты работаешь в папке проекта: '+seat.cwd+'. В этой же папке параллельно могут работать агенты из других окон: '+others+'. Связь с ними только инструментами MCP-сервера panes (не командами оболочки): send — отправить запись и не ждать, ask — спросить и дождаться ответа, read_pane — прочитать их разговор. Записи от соседей приходят входящим сообщением с номером #seq: отвечай на них send с reply_to. Соседи не видят твоей переписки: пиши им полный текст. Перед правкой смотри актуальное состояние файла, чужие изменения не переписывай, коммиты делай только если попросили. В конце ответа кратко перечисли, что сделал и какие файлы изменил.';
}
export function toolDetail(input:unknown):string{
 if(typeof input!=='object'||input===null)return '';
 for(const key of ['file_path','path','command','pattern','query','url','text','description']){
 const value=(input as Record<string,unknown>)[key];if(value)return String(value).replace(/\n/g,' ').slice(0,200)
 }return '';
}
export function mergeMessages(messages:{role:'me'|'ai';text:string}[]):{role:'me'|'ai';text:string}[]{
 const out:{role:'me'|'ai';text:string}[]=[];
 for(const m of messages){const text=m.role==='me'?stripDigest(m.text):m.text;if(!text.trim())continue;const prev=out.at(-1);if(prev?.role==='ai'&&m.role==='ai')prev.text+='\n'+text;else out.push({role:m.role,text})}
 return out;
}
