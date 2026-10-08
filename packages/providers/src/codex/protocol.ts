import {approval,ProviderError,record,type TurnContext} from '../types.ts';
import {toolDetail} from '../text.ts';
export async function serverRequest(method:string,input:unknown,ctx:TurnContext|null,threadId:string|null,turnId:string|null):Promise<unknown>{
 const p=record(input)?input:{};
 const current=!!ctx&&p.threadId===threadId&&turnId!==null&&(!('turnId'in p)||p.turnId===null||p.turnId===turnId)&&!ctx.signal.aborted;
 const ask=async(title:string,detail:string)=>current&&ctx?approval(ctx,title,detail):false;
 if(method==='item/commandExecution/requestApproval'){
 const command=Array.isArray(p.command)?p.command.join(' '):String(p.command??'');
 const allow=await ask('Codex просит выполнить команду',command.slice(0,300)+(p.reason?'\nПричина: '+String(p.reason).slice(0,300):''));
 return {decision:allow?'accept':'decline'}
 }
 if(method==='item/fileChange/requestApproval'){
 const changes=p.changes??p.files??[];const detail=Array.isArray(changes)?changes.map(c=>record(c)?c.path??'':String(c)).join(', ').slice(0,300):String(changes).slice(0,300);
 return {decision:await ask('Codex просит изменить файлы',detail+(p.reason?'\nПричина: '+String(p.reason).slice(0,300):''))?'accept':'decline'}
 }
 if(method==='item/permissions/requestApproval'){
 const permissions=record(p.permissions)?p.permissions:null;
 const network=permissions?.network,fs=permissions?.fileSystem;
 const valid=permissions&&Object.keys(permissions).every(k=>['network','fileSystem'].includes(k))&&
 (network==null||record(network)&&Object.keys(network).every(k=>k==='enabled')&&typeof network.enabled==='boolean')&&
 (fs==null||record(fs)&&Object.keys(fs).every(k=>['read','write'].includes(k))&&Object.values(fs).every(v=>v===null||Array.isArray(v)&&v.every(path=>typeof path==='string')));
 const allow=valid&&await ask('Codex просит расширить права',JSON.stringify(permissions).slice(0,400));
 return {permissions:allow?Object.fromEntries(Object.entries(permissions!).filter(([,v])=>v!==null)):{},scope:'turn'}
 }
 if(method==='mcpServer/elicitation/request'){
 const meta=record(p._meta)?p._meta:{},own=p.serverName==='panes'&&meta.codex_approval_kind==='mcp_tool_call';
 const allow=current&&(own||await ask('Codex просит вызвать инструмент MCP «'+String(p.serverName??'')+'»',String(p.message??'').slice(0,200)+(toolDetail(meta)?'\n'+toolDetail(meta):'')));
 const schema=record(p.requestedSchema)?p.requestedSchema:null;
 // A yes/no card cannot supply required form fields; never invent their values.
 const missing=p.mode!=='url'&&schema&&Array.isArray(schema.required)&&schema.required.length>0;
 return {action:allow&&!missing?'accept':'decline',content:allow&&!missing?(p.mode==='url'?null:{}):null,_meta:null}
 }
 if(ctx){ctx.publish({type:'toolError',text:'неизвестный запрос разрешения '+method});console.error('[providers:codex] unknown_request')}
 throw new ProviderError('unknown_request','неизвестный запрос разрешения '+method)
}
