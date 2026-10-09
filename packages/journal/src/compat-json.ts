// Python JSON whitespace, key order and numeric spelling; no final LF.
const numericStyles=new WeakMap<object,Map<string,{value:number;float:boolean}>>();
function numberText(v:number,float=false):string{
 if(!Number.isFinite(v))return Number.isNaN(v)?'NaN':v<0?'-Infinity':'Infinity';if(Object.is(v,-0))return '-0.0';
 let out=(v!==0&&(!Number.isInteger(v)||float)&&(Math.abs(v)<1e-4||Math.abs(v)>=1e16)?v.toExponential():String(v));
 if(out.includes('e')){const [mantissa,exponent]=out.split('e');return mantissa+'e'+(Number(exponent)>=0?'+':'-')+String(Math.abs(Number(exponent))).padStart(2,'0')}
 return float&&!out.includes('.')?out+'.0':out
}
export function compatJson(value:unknown,indent?:number):string {
 const encode=(v:unknown,depth:number,parent?:object,key?:string):string=>{
 if(typeof v==='number'){const style=parent&&key!==undefined?numericStyles.get(parent)?.get(key):undefined;return numberText(v,!!style&&Object.is(v,style.value)&&style.float)}
 if(v===null||typeof v!=='object'){
 const text=JSON.stringify(v);if(text===undefined)throw new TypeError('значение не представимо в JSON');return text
 }
 const list=Array.isArray(v),entries=list?v.map((x,i)=>encode(x,depth+1,v,String(i))):orderedKeys(v).map(k=>JSON.stringify(k)+': '+encode((v as Record<string,unknown>)[k],depth+1,v,k));
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
 const out={...value,...updates};orders.set(out,[...orderedKeys(value),...orderedKeys(updates).filter(k=>!Object.hasOwn(value,k))]);numericStyles.set(out,new Map([...(numericStyles.get(value)??[]),...(numericStyles.get(updates)??[])]));return out
}
export function parseCompat(source:string):unknown {
 JSON.parse(source);let at=0;
 const ws=()=>{while(/[ \t\r\n]/.test(source[at]??'x'))at++};
 const string=()=>{const start=at++;while(source[at]!=='"'){if(source[at]==='\\')at++;at++}at++;return JSON.parse(source.slice(start,at)) as string};
 let lastNumber:{value:number;float:boolean}|undefined;
 const remember=(parent:object,key:string)=>{if(lastNumber){const map=numericStyles.get(parent)??new Map();map.set(key,lastNumber);numericStyles.set(parent,map)}};
 const value=():unknown=>{lastNumber=undefined;ws();const c=source[at];
 if(c==='"')return string();
 if(c==='['){at++;ws();const out:unknown[]=[];while(source[at]!==']'){const item=value();remember(out,String(out.length));out.push(item);ws();if(source[at]===','){at++;ws()}}at++;lastNumber=undefined;return out}
 if(c==='{'){at++;ws();const out:Record<string,unknown>={},keys:string[]=[];
 while(source[at]!=='}'){const key=string();if(!keys.includes(key))keys.push(key);ws();at++;const item=value();remember(out,key);Object.defineProperty(out,key,{value:item,enumerable:true,writable:true,configurable:true});ws();if(source[at]===','){at++;ws()}}
 at++;orders.set(out,keys);lastNumber=undefined;return out}
 const start=at;while(at<source.length&&!/[ \t\r\n,}\]]/.test(source[at]!))at++;const token=source.slice(start,at),parsed:unknown=JSON.parse(token);if(typeof parsed==='number')lastNumber={value:parsed,float:/[.eE]/.test(token)};return parsed
 };return value()
}
