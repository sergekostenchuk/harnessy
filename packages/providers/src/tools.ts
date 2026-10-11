import {tool,createSdkMcpServer} from '@anthropic-ai/claude-agent-sdk';
import type {TurnContext,ToolResult} from './types.ts';
import {schemas,descriptions} from './schemas.ts';
export {schemas,KINDS} from './schemas.ts';
function compact<T extends object>(value:T):{[K in keyof T]:Exclude<T[K],undefined>}{
 return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined)) as {[K in keyof T]:Exclude<T[K],undefined>}
}
export async function invokeTool(name:string,input:unknown,ctx:TurnContext):Promise<ToolResult>{
 if(ctx.signal.aborted)return {ok:false,error:'ход отменён',code:'cancelled'};
 switch(name){
 case 'propose_seats':return ctx.tools.proposeSeats(compact(schemas.propose_seats.parse(input)));
 case 'create_seats':return ctx.tools.createSeats(schemas.create_seats.parse(input));
 case 'send':return ctx.tools.send(compact(schemas.send.parse(input)));
 case 'ask':return ctx.tools.ask(compact(schemas.ask.parse(input)));
 case 'read_pane':return ctx.tools.readPane(compact(schemas.read_pane.parse(input)));
 case 'merge':return ctx.tools.merge(compact(schemas.merge.parse(input)));
 case 'assign_role':return ctx.tools.assignRole(compact(schemas.assign_role.parse(input)));
 default:return {ok:false,error:'нет такого инструмента',code:'unknown_request'}
 }
}
export function sdkServer(ctx:TurnContext){
 const tools=Object.entries(schemas).map(([name,schema])=>tool(name,descriptions[name as keyof typeof descriptions],schema.shape,async input=>{
  try{const r=await invokeTool(name,input,ctx);return {content:[{type:'text' as const,text:r.ok?r.text:r.error}],...(!r.ok?{isError:true}:{})}}
  catch{return {content:[{type:'text' as const,text:'неверные аргументы инструмента'}],isError:true}}
 }));
 return createSdkMcpServer({name:'panes',version:'0.5.0',tools});
}
