import {parseDocument,isMap,isSeq,isScalar} from 'yaml';
const floats=new WeakMap<object,Set<unknown>>();
export type YMap=Map<string,unknown>;
const INT=/^[-+]?(?:0b[01_]+|0[0-7_]+|0|[1-9][0-9_]*|0x[0-9a-fA-F_]+|[1-9][0-9_]*(?::[0-5]?[0-9])+)$/;
const FLOAT=/^(?:[-+]?[0-9][0-9_]*\.[0-9_]*(?:[eE][-+][0-9]+)?|\.[0-9][0-9_]*(?:[eE][-+][0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;
const BREAK=/[\n\u0085\u2028\u2029]/u;
function numeric(source:string):number {const clean=source.replaceAll('_',''),negative=clean.startsWith('-'),body=clean.replace(/^[+-]/,'');
 const value=body.toLowerCase()==='.nan'?NaN:body.toLowerCase()==='.inf'?Infinity:body.includes(':')?body.split(':').reduce((n,v)=>n*60+Number(v),0):/^0[0-7]+$/.test(body)?parseInt(body,8):Number(body);return negative?-value:value
}
const BOOL=/^(?:yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/;
export function parseYaml(text:string):unknown {
 const doc=parseDocument(text,{version:'1.1',merge:true,uniqueKeys:false,customTags:tags=>[...tags.filter(t=>typeof t==='string'||!['bool','int','float'].some(name=>t.tag==='tag:yaml.org,2002:'+name)),{tag:'tag:yaml.org,2002:bool',default:true,test:BOOL,resolve:(s:string)=>/^(yes|true|on)$/i.test(s)},{tag:'tag:yaml.org,2002:int',default:true,test:INT,resolve:numeric},{tag:'tag:yaml.org,2002:float',default:true,test:FLOAT,resolve:numeric}]});
 if(doc.errors.length||doc.warnings.length)throw Error([...doc.errors,...doc.warnings].map(e=>e.message).join('; '));
 // yaml's parser recognises LF/CR; PyYAML also treats Unicode breaks as
 // scalar breaks. Remove continuation indentation without changing escaped breaks.
 function unicodeBreaks(node:unknown):void {
 if(isMap(node)){for(const pair of node.items){unicodeBreaks(pair.key);unicodeBreaks(pair.value)}}
 else if(isSeq(node))node.items.forEach(unicodeBreaks);
 else if(isScalar(node)&&typeof node.value==='string'&&node.range){
 const raw=text.slice(node.range[0],node.range[1]);let value=node.value;
 for(const br of ['\u2028','\u2029'])if(raw.includes(br))value=value.replaceAll(new RegExp(br+'[ \t]*','gu'),br);
 if(raw.includes('\u0085'))value=value.replace(/\u0085[ \t]*/gu,'\u0085').replace(/\u0085+/gu,group=>group.length===1?' ':'\n'.repeat(group.length-1));node.value=value;
 }
 }
 unicodeBreaks(doc.contents);
 const value:unknown=doc.toJS({mapAsMap:true,maxAliasCount:100});const seen=new Set<object>();
 function check(v:unknown){if(!v||typeof v!=='object')return;if(seen.has(v))throw Error('YAML aliases не поддерживаются при записи');seen.add(v);
 if(v instanceof Map){for(const [k,x] of v){if(!['string','number','boolean'].includes(typeof k)&&k!==null)throw Error('неподдерживаемый ключ YAML');check(x)}}
 else if(Array.isArray(v))v.forEach(check);else throw Error('timestamp/binary/set вне формата манифеста')}
 check(value);
 function numericStyles(node:unknown,v:unknown){
 if(isMap(node)&&v instanceof Map){for(const pair of node.items){const key=isScalar(pair.key)?pair.key.value:pair.key,item=v.get(key);if(isScalar(pair.value)&&typeof pair.value.value==='number'&&FLOAT.test(pair.value.source??'')){const set=floats.get(v)??new Set();set.add(key);floats.set(v,set)}numericStyles(pair.value,item)}}
 else if(isSeq(node)&&Array.isArray(v))node.items.forEach((item,i)=>{if(isScalar(item)&&typeof item.value==='number'&&FLOAT.test(item.source??'')){const set=floats.get(v)??new Set();set.add(i);floats.set(v,set)}numericStyles(item,v[i])})
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
function needsQuote(text:string):boolean {
 if(!text||/^[ \n\u0085\u2028\u2029]|[ \n\u0085\u2028\u2029]$/u.test(text)||/^(?:---|\.\.\.)/u.test(text)||/^[#,\[\]{}&*!|>'"%@`]/u.test(text)||/^[-?:](?:[ \t\r\n\u0085\u2028\u2029]|$)/u.test(text)||/:[ \t\r\n\u0085\u2028\u2029]|[ \t\r\n\u0085\u2028\u2029]#|:$/u.test(text)||BREAK.test(text))return true;
 return BOOL.test(text)||/^(?:null|Null|NULL|~|<<|=)$/.test(text)||INT.test(text)||FLOAT.test(text)||/^\d{4}-\d\d-\d\d(?:$|[Tt ])/.test(text)
}
function special(text:string):boolean{return [...text].some(ch=>{const cp=ch.codePointAt(0)!;return !(ch==='\n'||cp>=0x20&&cp<=0x7e||cp===0x85||cp>=0xa0&&cp<=0xd7ff||cp>=0xe000&&cp<=0xfffd&&cp!==0xfeff||cp>=0x10000&&cp<0x10ffff)})}
function doubleQuoted(text:string,indent:number,column:number):string {
 const escapes:Record<string,string>={'\0':'0','\x07':'a','\b':'b','\t':'t','\n':'n','\v':'v','\f':'f','\r':'r','\x1b':'e','"':'"','\\':'\\','\x85':'N','\xa0':'_','\u2028':'L','\u2029':'P'};
 let out='"',col=column+1;const chars=[...text];
 for(let i=0;i<chars.length;i++){const ch=chars[i]!,cp=ch.codePointAt(0)!;
 const escaped=Object.hasOwn(escapes,ch)?'\\'+escapes[ch]:cp===0xfeff||cp<0x20||cp>=0x7f&&cp<0xa0||cp>=0xd800&&cp<=0xdfff||cp>0xffff?'\\'+(cp<=0xff?'x':cp<=0xffff?'u':'U')+cp.toString(16).toUpperCase().padStart(cp<=0xff?2:cp<=0xffff?4:8,'0'):ch;
 out+=escaped;col+=[...escaped].length;
 if(i>0&&i<chars.length-1&&col>80&&(ch===' '||escaped!==ch)){out+='\\\n'+' '.repeat(indent)+(chars[i+1]===' '?'\\':'');col=indent+(chars[i+1]===' '?1:0)}
 }return out+'"'
}
function scalar(v:unknown,key:boolean,indent:number,column:number,float=false):string {
 if(v===null)return 'null';if(typeof v==='boolean')return String(v);
 if(typeof v==='number'){if(!Number.isFinite(v))return Number.isNaN(v)?'.nan':v<0?'-.inf':'.inf';if(Object.is(v,-0))return '-0.0';let n=(float&&v!==0&&(Math.abs(v)<1e-4||Math.abs(v)>=1e16)?v.toExponential():String(v));if(n.includes('e')){const [mantissa,exponent]=n.split('e');n=(mantissa!.includes('.')?mantissa:mantissa+'.0')+'e'+(Number(exponent)>=0?'+':'-')+String(Math.abs(Number(exponent))).padStart(2,'0')}else if(float&&!n.includes('.'))n+='.0';return n}
 const s=String(v);if(special(s)||/[\n\u0085\u2028\u2029] | [\n\u0085\u2028\u2029]/u.test(s))return doubleQuoted(s,indent,column);
 const quoted=needsQuote(s),start=quoted?"'":'',end=quoted?"'":'';
 let out=start,col=column+start.length;const chars=[...s];
 for(let i=0;i<chars.length;i++){
 const c=chars[i]!;
 if(BREAK.test(c)){
 if(c==='\n'&&(i===0||!BREAK.test(chars[i-1]!)))out+='\n';out+=c;
 if(!BREAK.test(chars[i+1]??'')){out+=' '.repeat(indent);col=indent}continue
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
 return entries(v).flatMap(([key,item])=>{const explicit=typeof key==='string'&&(!key||BREAK.test(key)||[...key].length>=128),name=scalar(key,true,indent+2,indent+(explicit?2:0)),prefix=explicit?pad+'? '+name+'\n'+pad+':':pad+name+':';
 if(!collection(item)||empty(item))return [prefix+' '+(empty(item)?Array.isArray(item)?'[]':'{}':scalar(item,false,indent+2,[...prefix.split('\n').at(-1)!].length+1,floats.get(v as object)?.has(key)))];
 return [prefix,...lines(item,Array.isArray(item)?indent:indent+2)]})
 }
 return lines(value,0).join('\n')+'\n'
}
