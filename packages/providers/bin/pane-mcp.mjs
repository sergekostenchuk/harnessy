#!/usr/bin/env node
import {schemas,KINDS,descriptions} from '../src/schemas.ts';
const PANE_ID=process.env.PANE_ID,APP_URL=process.env.APP_URL,TOKEN=process.env.PANE_TOKEN;
const peers=Object.fromEntries((process.env.SEATS||'').split(';').filter(Boolean).map(s=>{const i=s.indexOf(':');return i>0?[s.slice(0,i),s.slice(i+1)]:[s,s]}));
const others=Object.keys(peers).filter(k=>k!==PANE_ID);
const output=obj=>process.stdout.write(JSON.stringify(obj)+'\n');
const error=text=>({content:[{type:'text',text}],isError:true});
const ok=text=>({content:[{type:'text',text}]});
function clean(text){return TOKEN?String(text).replaceAll(TOKEN,'[redacted]'):String(text)}
function tools(){return Object.entries(schemas).map(([name,schema])=>{
 const inputSchema=schema.toJSONSchema();
 if(name==='ask')inputSchema.properties.to.enum=others;
 if(name==='read_pane')inputSchema.properties.pane.enum=others;
 return {name,description:descriptions[name]+(name==='send'?' Виды записей: '+KINDS.join(', ')+'.':''),inputSchema}
 })}
async function call(name,input){
 if(!PANE_ID||!APP_URL||!TOKEN)return error('protocol: отсутствует PANE_ID, APP_URL или PANE_TOKEN');
 const schema=typeof name==='string'&&Object.hasOwn(schemas,name)?schemas[name]:null;if(!schema)return error('unknown_request: нет такого инструмента');
 const parsed=schema.safeParse(input);if(!parsed.success)return error('protocol: неверные аргументы инструмента');
 const args=parsed.data;
 if(name==='ask'&&!others.includes(args.to)||name==='read_pane'&&!others.includes(args.pane))return error('protocol: нет такого окна');
 try{
 const headers={'Content-Type':'application/json','X-Pane-Token':TOKEN};
 let url,opts;
 if(name==='read_pane'){
 url=new URL('/api/pane_transcript',APP_URL);url.searchParams.set('from',PANE_ID);url.searchParams.set('pane',args.pane);url.searchParams.set('last',String(args.last_n??20));opts={headers};
 }else{
 const path={send:'/api/send',ask:'/api/ask',merge:'/api/merge',assign_role:'/api/assign_role'}[name];
 url=new URL(path,APP_URL);opts={method:'POST',headers,body:JSON.stringify({...args,from:PANE_ID})};
 }
 const response=await fetch(url,opts),d=await response.json();
 if(typeof d!=='object'||d===null||typeof d.ok!=='boolean')return error('protocol: неверный ответ ядра');
 if(!response.ok||!d.ok)return error(clean(d.error||'запрос отклонён ядром'));
 if(name==='send')return ok('Запись #'+d.seq+' отправлена '+(d.to||[]).join(', ')+'; тред '+(d.thread||'без треда')+'.');
 if(name==='ask')return ok(d.reply||'(пустой ответ)');
 if(name==='merge')return ok('Слито: '+String(d.sha).slice(0,12)+' → '+String(d.mergeSha).slice(0,12)+' в '+d.branch+'.');
 if(name==='assign_role')return ok('Назначена роль «'+d.label+'» ('+d.pane+', '+d.model+', '+d.mode+') по поручению №'+d.mandate+'; вводная отправлена.');
 return ok(d.text||'');
 }catch(e){return error('Не удалось связаться с сервером харнесса: '+clean(e.message))}
}
let buffer='',pending=0,ended=false;
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{
 buffer+=chunk;let i;
 while((i=buffer.indexOf('\n'))>=0){
 const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);if(!line)continue;
 let m;try{m=JSON.parse(line)}catch{output({jsonrpc:'2.0',id:null,error:{code:-32700,message:'битая строка'}});continue}
 if(!m||typeof m!=='object'||typeof m.method!=='string'){output({jsonrpc:'2.0',id:m?.id??null,error:{code:-32600,message:'неверный запрос'}});continue}
 const {id,method,params}=m;
 if(method.startsWith('notifications/'))continue;
 if(typeof id!=='string'&&typeof id!=='number'){output({jsonrpc:'2.0',id:null,error:{code:-32600,message:'отсутствует id запроса'}});continue}
 if(method==='initialize')output({jsonrpc:'2.0',id,result:{protocolVersion:['2025-06-18','2025-03-26','2024-11-05'].includes(params?.protocolVersion)?params.protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'panes',version:'0.5.0'}}});
 else if(method==='ping')output({jsonrpc:'2.0',id,result:{}});
 else if(method==='tools/list')output({jsonrpc:'2.0',id,result:{tools:tools()}});
 else if(method==='tools/call'){
 pending++;void call(params?.name,params?.arguments??{}).then(result=>output({jsonrpc:'2.0',id,result})).finally(()=>{pending--;if(ended&&pending===0)process.exit(0)});
 }else output({jsonrpc:'2.0',id,error:{code:-32601,message:'неизвестный метод'}});
 }
});
process.stdin.on('end',()=>{ended=true;if(pending===0)process.exit(0)});
