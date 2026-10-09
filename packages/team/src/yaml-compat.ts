import {parseDocument,isMap,isSeq,isScalar} from 'yaml';
const floats=new WeakMap<object,Set<unknown>>();
export type YMap=Map<string,unknown>;
const BOOL=/^(?:yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/;
export function parseYaml(text:string):unknown {
 const doc=parseDocument(text,{version:'1.1',merge:true,uniqueKeys:false,customTags:tags=>[...tags.filter(t=>typeof t==='string'||t.tag!=='tag:yaml.org,2002:bool'),{tag:'tag:yaml.org,2002:bool',default:true,test:BOOL,resolve:(s:string)=>/^(yes|true|on)$/i.test(s)}]});
 if(doc.errors.length||doc.warnings.length)throw Error([...doc.errors,...doc.warnings].map(e=>e.message).join('; '));
 const value:unknown=doc.toJS({mapAsMap:true,maxAliasCount:100});const seen=new Set<object>();
 function check(v:unknown){if(!v||typeof v!=='object')return;if(seen.has(v))throw Error('YAML aliases не поддерживаются при записи');seen.add(v);
 if(v instanceof Map){for(const [k,x] of v){if(!['string','number','boolean'].includes(typeof k)&&k!==null)throw Error('неподдерживаемый ключ YAML');check(x)}}
 else if(Array.isArray(v))v.forEach(check);else throw Error('timestamp/binary/set вне формата манифеста')}
 check(value);
 function numericStyles(node:unknown,v:unknown){
 if(isMap(node)&&v instanceof Map){for(const pair of node.items){const key=isScalar(pair.key)?pair.key.value:pair.key,item=v.get(key);if(isScalar(pair.value)&&typeof pair.value.value==='number'&&/[.eE]/.test(pair.value.source??'')){const set=floats.get(v)??new Set();set.add(key);floats.set(v,set)}numericStyles(pair.value,item)}}
 else if(isSeq(node)&&Array.isArray(v))node.items.forEach((item,i)=>{if(isScalar(item)&&typeof item.value==='number'&&/[.eE]/.test(item.source??'')){const set=floats.get(v)??new Set();set.add(i);floats.set(v,set)}numericStyles(item,v[i])})
 }
 numericStyles(doc.contents,value);return value
}
export function mapping(v:unknown):v is YMap{return v instanceof Map}
export function pyTruthy(v:unknown):boolean{return !!v&&(!(v instanceof Map)||v.size>0)&&(!Array.isArray(v)||v.length>0)}
export function pyString(v:unknown):string {return v===null?'None':v===true?'True':v===false?'False':String(v)}
export function pyDefault(v:unknown,fallback:unknown){return pyTruthy(v)?v:fallback}
function entries(v:unknown):[unknown,unknown][]{return v instanceof Map?[...v]:Object.entries(v as object)}
function collection(v:unknown):boolean{return !!v&&typeof v==='object'}
function empty(v:unknown){return collection(v)&&(Array.isArray(v)?v.length:entries(v).length)===0}
function needsQuote(text:string,key:boolean):boolean {
 if(!text||/^\s|\s$/u.test(text)||/^(?:---|\.\.\.)(?:\s|$)/u.test(text)||/^[#\[\]{}&*!|>'"%@`]/u.test(text)||/^[-?:](?:\s|$)/u.test(text)||/:\s|\s#|:$|\n/u.test(text))return true;
 if(key&&/[\[\]{},]/u.test(text))return true;
 if(BOOL.test(text)||/^(?:null|Null|NULL|~)$/.test(text))return true;
 if(/^[-+]?(?:[0-9][0-9_:]*(?:\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\.[0-9]+|\.(?:inf|Inf|INF|nan|NaN|NAN))$/.test(text)||/^\d{4}-\d\d?-\d\d?(?:$|[Tt ])/.test(text))return true;
 return false
}
function scalar(v:unknown,key:boolean,indent:number,column:number,float=false):string {
 if(v===null)return 'null';if(typeof v==='boolean')return String(v);
 if(typeof v==='number'){if(!Number.isFinite(v))return Number.isNaN(v)?'.nan':v<0?'-.inf':'.inf';if(Object.is(v,-0))return '-0.0';let n=(float&&v!==0&&(Math.abs(v)<1e-4||Math.abs(v)>=1e16)?v.toExponential():String(v));if(n.includes('e')){const [mantissa,exponent]=n.split('e');n=(mantissa!.includes('.')?mantissa:mantissa+'.0')+'e'+(Number(exponent)>=0?'+':'-')+String(Math.abs(Number(exponent))).padStart(2,'0')}else if(float&&!n.includes('.'))n+='.0';return n}
 const s=String(v);if(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\t\r]/u.test(s))return JSON.stringify(s).replace(/\\u00([0-9a-f]{2})/g,'\\x$1');
 const quoted=needsQuote(s,key),start=quoted?"'":'',end=quoted?"'":'';
 let out=start,col=column+start.length;const chars=[...s];
 for(let i=0;i<chars.length;i++){
 const c=chars[i]!;
 if(c==='\n'){
 out+='\n';if(i===0||chars[i-1]!=='\n')out+='\n';
 if(chars[i+1]!=='\n'){out+=' '.repeat(indent);col=indent}continue
 }
 if(c===' '&&col>80&&i>0&&i<chars.length-1&&chars[i-1]!==' '&&chars[i+1]!==' '){out+='\n'+' '.repeat(indent);col=indent;continue}
 const emitted=quoted&&c==="'"?"''":c;out+=emitted;col+=[...emitted].length
 }
 return out+end
}
export function dumpYaml(value:unknown):string {
 function lines(v:unknown,indent:number):string[]{
 const pad=' '.repeat(indent);
 if(!collection(v)||empty(v))return [pad+(empty(v)?Array.isArray(v)?'[]':'{}':scalar(v,false,indent,indent))];
 if(Array.isArray(v))return v.flatMap((item,index)=>{if(!collection(item)||empty(item))return [pad+'- '+(empty(item)?Array.isArray(item)?'[]':'{}':scalar(item,false,indent+2,indent+2,floats.get(v)?.has(index)))];const nested=lines(item,indent+2);return [pad+'- '+nested[0]!.slice(indent+2),...nested.slice(1)]});
 return entries(v).flatMap(([key,item])=>{const name=scalar(key,true,indent+2,indent),prefix=pad+name+':';
 if(!collection(item)||empty(item))return [prefix+' '+(empty(item)?Array.isArray(item)?'[]':'{}':scalar(item,false,indent+2,[...prefix].length+1,floats.get(v as object)?.has(key)))];
 return [prefix,...lines(item,Array.isArray(item)?indent:indent+2)]})
 }
 return lines(value,0).join('\n')+'\n'
}
