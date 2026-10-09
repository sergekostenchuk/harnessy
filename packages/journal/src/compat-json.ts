// Python json.dumps(ensure_ascii=False): spaces in compact JSON; indent=2 without LF.
export function compatJson(value:unknown,indent?:number):string {
 const encode=(v:unknown,depth:number):string=>{
 if(v===null||typeof v!=='object'){
 const text=JSON.stringify(v);if(text===undefined)throw new TypeError('значение не представимо в JSON');return text
 }
 const list=Array.isArray(v),entries=list?v.map(x=>encode(x,depth+1)):orderedKeys(v).map(k=>JSON.stringify(k)+': '+encode((v as Record<string,unknown>)[k],depth+1));
 const open=list?'[':'{',close=list?']':'}';if(!entries.length)return open+close;
 return indent===undefined?open+entries.join(', ')+close:open+'\n'+' '.repeat((depth+1)*indent)+entries.join(',\n'+' '.repeat((depth+1)*indent))+'\n'+' '.repeat(depth*indent)+close
 };return encode(value,0)
}
export function localIso(date:Date):string {
 const pad=(v:number,n=2)=>String(v).padStart(n,'0'),offset=-date.getTimezoneOffset(),sign=offset>=0?'+':'-',minutes=Math.abs(offset);
 return pad(date.getFullYear(),4)+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes())+':'+pad(date.getSeconds())+'.'+pad(date.getMilliseconds(),3)+sign+pad(Math.floor(minutes/60))+':'+pad(minutes%60)
}

export function pythonTrim(value:string):string{return value.replace(/^[\p{White_Space}\u001c-\u001f]+|[\p{White_Space}\u001c-\u001f]+$/gu,'')}

// Object.keys reorders numeric-looking keys. Keep Python insertion order on reload.
const orders=new WeakMap<object,string[]>();
export function orderedKeys(value:object):string[]{return [...(orders.get(value)??[]).filter(k=>Object.hasOwn(value,k)),...Object.keys(value).filter(k=>!orders.get(value)?.includes(k))]}
export function orderedClone<T extends Record<string,unknown>>(value:T,updates:Partial<T>={}):T {
 const out={...value,...updates};orders.set(out,[...orderedKeys(value),...orderedKeys(updates).filter(k=>!Object.hasOwn(value,k))]);return out
}
export function parseCompat(source:string):unknown {
 JSON.parse(source);let at=0;
 const ws=()=>{while(/[ \t\r\n]/.test(source[at]??'x'))at++};
 const string=()=>{const start=at++;while(source[at]!=='"'){if(source[at]==='\\')at++;at++}at++;return JSON.parse(source.slice(start,at)) as string};
 const value=():unknown=>{ws();const c=source[at];
 if(c==='"')return string();
 if(c==='['){at++;ws();const out:unknown[]=[];while(source[at]!==']'){out.push(value());ws();if(source[at]===','){at++;ws()}}at++;return out}
 if(c==='{'){at++;ws();const out:Record<string,unknown>={},keys:string[]=[];
 while(source[at]!=='}'){const key=string();if(!keys.includes(key))keys.push(key);ws();at++;const item=value();Object.defineProperty(out,key,{value:item,enumerable:true,writable:true,configurable:true});ws();if(source[at]===','){at++;ws()}}
 at++;orders.set(out,keys);return out}
 const start=at;while(at<source.length&&!/[ \t\r\n,}\]]/.test(source[at]!))at++;return JSON.parse(source.slice(start,at)) as unknown
 };return value()
}
