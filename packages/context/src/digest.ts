import {trim,chars,slice,DIGEST_MARK,DIGEST_ITEM_CHARS,DIGEST_MAX_CHARS} from './strings.ts';
import type {DigestViewer,DigestPane} from './types.ts';
export function digest(viewer:DigestViewer,others:readonly DigestPane[],canObserve:(viewer:string,target:string)=>boolean):{text:string;nextSeen:Record<string,number>}{
 const nextSeen={...viewer.seen};if(!viewer.digest)return {text:'',nextSeen};const parts:string[]=[];let total=0;
 for(const other of others){
 if(other.id===viewer.id||!canObserve(viewer.id,other.id))continue;
 const added=other.transcript.slice(viewer.seen[other.id]??0).filter(m=>trim(m.text));Object.defineProperty(nextSeen,other.id,{value:other.transcript.length,enumerable:true,writable:true,configurable:true});if(!added.length)continue;
 const out=['['+other.id+' · '+other.label+' · '+other.vendor+' · '+other.model+' · режим '+other.mode+']'];
 for(const m of added){const who=m.role==='me'?'владелец':m.role==='ai'?'агент':m.role==='peer'?'сосед':m.role;let text=trim(m.text).replaceAll('\r','');if(chars(text)>DIGEST_ITEM_CHARS)text=slice(text,0,DIGEST_ITEM_CHARS)+' …';out.push(who+': '+text)}
 let block=out.join('\n');if(total+chars(block)>DIGEST_MAX_CHARS)block=slice(block,0,Math.max(0,DIGEST_MAX_CHARS-total))+' …';parts.push(block);total+=chars(block);if(total>=DIGEST_MAX_CHARS)break
 }
 return {text:parts.length?DIGEST_MARK+parts.join('\n\n'):'',nextSeen}
}
