import type {TextRedactor} from './types.ts';

const HIDDEN='[ключ скрыт]';
/** Keys enter only after the service resolves a credential for its captured route. */
export class SecretRedactor {
 private keys:string[]=[];
 add(key:string){if(key&&!this.keys.includes(key))this.keys.push(key);this.keys.sort((a,b)=>b.length-a.length)}
 private text(text:string,partial:boolean):{text:string;tail:string}{
  let at=0,out='';
  while(at<text.length){
   let next=-1,match='';for(const key of this.keys){const index=text.indexOf(key,at);if(index!==-1&&(next===-1||index<next)){next=index;match=key}}
   if(next===-1)break;
   out+=text.slice(at,next)+HIDDEN;at=next+match.length;
  }
  const rest=text.slice(at);let keep=0;
  if(partial)for(const key of this.keys)for(let size=Math.min(key.length-1,rest.length);size>keep;size--)if(rest.endsWith(key.slice(0,size))){keep=size;break}
  return {text:out+rest.slice(0,rest.length-keep),tail:keep?rest.slice(-keep):''};
 }
 redact=<T>(value:T):T=>{
  if(typeof value==='string')return this.text(value,false).text as T;
  if(Array.isArray(value))return value.map(item=>this.redact(item)) as T;
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[this.redact(key),this.redact(item)])) as T;
  return value;
 };
 textRedactor=():TextRedactor=>{let tail='';return {push:(value:string)=>{const result=this.text(tail+value,true);tail=result.tail;return result.text},finish:()=>{const result=this.text(tail,false).text;tail='';return result}}};
}
