import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {approval,executeCli,paneSchemas,paneDescriptions,record,type Seat,type TurnContext,type CliExecutor,type ToolResult} from '@harnessy/providers';
import type {Tool,Json} from '@harnessy/llm';
import {AgentFiles,AgentFileError} from './agent-files.ts';
import {sandboxedShell,AgentSandboxError} from './agent-sandbox.ts';
import {untilAbort} from './agent-cancel.ts';

type Args=Record<string,Json>;
const string={type:'string'},integer={type:'integer'};
const parameters=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false}) as Tool['parameters'];
const FILE_TOOLS:Tool[]=[
 {name:'read_file',description:'Прочитать UTF-8 файл внутри папки проекта. Предел файла 1 МиБ, ответа 64 КиБ; offset/limit — позиции текста.',parameters:parameters({path:string,offset:{...integer,minimum:0},limit:{...integer,minimum:1,maximum:65536}},['path'])},
 {name:'list_files',description:'Список файлов папки проекта (до 500 записей). Символические ссылки не читаются.',parameters:parameters({path:string},[])},
 {name:'search_files',description:'Найти буквальную строку в текстовых файлах проекта, до 100 совпадений. Служебные файлы .git/.harness не читаются.',parameters:parameters({query:{...string,minLength:1,maxLength:200},path:string},['query'])},
 {name:'write_file',description:'Записать UTF-8 файл внутри области правки места, до 1 МиБ. Служебные файлы движка защищены.',parameters:parameters({path:string,text:string})},
 {name:'edit_file',description:'Заменить ровно одно вхождение old_text в файле проекта. Если текст отсутствует или неоднозначен, правка отклоняется.',parameters:parameters({path:string,old_text:{...string,minLength:1},new_text:string})},
 {name:'shell',description:'Команда оболочки; только Полный доступ. Запись — в проект и личный временный каталог, чтение и сеть разрешены. Максимум 30 с и 64 КиБ вывода; без учётных данных движка в окружении.',parameters:parameters({command:{...string,minLength:1,maxLength:16384},timeout_ms:{...integer,minimum:1,maximum:30000}},['command'])},
];
const names=Object.keys(paneSchemas) as (keyof typeof paneSchemas)[];
const methods={send:'send',ask:'ask',read_pane:'readPane',merge:'merge',assign_role:'assignRole',propose_seats:'proposeSeats',create_seats:'createSeats'} as const;
const failure=(code:string,error:string):ToolResult=>({ok:false,code,error});

export class AgentTools {
 private seat:Seat;private ctx:TurnContext;private signal:AbortSignal;private shell:CliExecutor;readonly definitions:Tool[];private files:AgentFiles|null;private permitted:Set<string>;private redact:<T>(value:T)=>T;
 constructor(seat:Seat,ctx:TurnContext,signal:AbortSignal,shell:CliExecutor=executeCli,redact:<T>(value:T)=>T=value=>value){this.seat=seat;this.ctx=ctx;this.signal=signal;this.shell=shell;this.redact=redact;
  this.files=seat.mode==='chat'?null:new AgentFiles(seat.cwd,[...seat.writePaths]);
  const fs=FILE_TOOLS.filter(t=>seat.mode!=='chat'&&(t.name==='shell'?seat.mode==='all':['write_file','edit_file'].includes(t.name)?['ask','edit','all'].includes(seat.mode):true));
  this.definitions=[...names.map(name=>({name,description:paneDescriptions[name],parameters:paneSchemas[name].toJSONSchema() as Tool['parameters']})),...fs];this.permitted=new Set(this.definitions.map(t=>t.name));
 }
 async call(name:string,args:unknown):Promise<ToolResult>{
  if(this.signal.aborted)return failure('cancelled','Ход отменён');
  name=this.redact(name);args=this.redact(args);
  const id=randomUUID(),metadata={name,...(record(args)&&typeof args.path==='string'?{path:args.path}:{})};this.ctx.traceEvent?.({id,name,phase:'call',data:metadata});let result:ToolResult;
  try{result=await untilAbort(this.signal,()=>this.execute(name,args))}catch(e){result=e instanceof AgentFileError||e instanceof AgentSandboxError?failure(e.code,e.message):this.signal.aborted?failure('cancelled','Ход отменён'):(e as NodeJS.ErrnoException).code==='ENOENT'?failure('file_not_found','Файл не найден'):failure('tool_failed','Инструмент не завершён')}
  result=result.ok?{...this.redact(result),text:this.protectText(result.text)}:{...this.redact(result),error:this.protectText(result.error)};
  this.ctx.traceEvent?.({id,name,phase:'result',outcome:result.ok?'ok':result.code==='cancelled'?'cancelled':'rejected',reason:result.ok?'none':result.code??'tool_failed',data:{name,bytes:Buffer.byteLength(result.ok?result.text:result.error)}});
  if(!result.ok)this.ctx.publish({type:'toolError',text:result.code+': '+result.error});return result;
 }
 private async execute(name:string,raw:unknown):Promise<ToolResult>{
  if(!this.permitted.has(name))return failure('tool_denied','Инструмент недоступен в текущем режиме');
  if(Object.hasOwn(paneSchemas,name)){
   const tool=name as keyof typeof paneSchemas,parsed=paneSchemas[tool].safeParse(raw);if(!parsed.success)return failure('tool_invalid','Неверные аргументы инструмента');
   if(this.signal.aborted)return failure('cancelled','Ход отменён');
   const fn=this.ctx.tools[methods[tool]] as (a:unknown)=>Promise<ToolResult>;const result=await fn.call(this.ctx.tools,parsed.data);
   return result.ok?{ok:true,text:result.text.length<=65536?result.text:result.text.slice(0,65536)+'\n[ответ сокращён]'}:result;
  }
  if(!record(raw))return failure('tool_invalid','Неверные аргументы инструмента');const args=raw as Args,definition=this.definitions.find(t=>t.name===name)!,props=definition.parameters.properties as Record<string,Record<string,Json>>,required=definition.parameters.required as string[];
  if(Object.keys(args).some(k=>!Object.hasOwn(props,k))||required.some(k=>!Object.hasOwn(args,k)))return failure('tool_invalid','Неверные аргументы инструмента');
  for(const [key,value]of Object.entries(args)){const schema=props[key]!;if(schema.type==='string'&&(typeof value!=='string'||value.includes('\0')||typeof schema.minLength==='number'&&value.length<schema.minLength||typeof schema.maxLength==='number'&&value.length>schema.maxLength)||schema.type==='integer'&&(!Number.isSafeInteger(value)||typeof schema.minimum==='number'&&Number(value)<schema.minimum||typeof schema.maximum==='number'&&Number(value)>schema.maximum))return failure('tool_invalid','Неверные аргументы инструмента')}
  const path=typeof args.path==='string'?args.path:'.';let data:unknown;
  if(['write_file','edit_file'].includes(name)&&this.seat.mode==='ask'){
   const expected=this.files!.stamp(path);if(!await approval(this.ctx,'Правка файла',path,this.signal))return failure('approval_declined','Владелец не разрешил правку');
   if(this.signal.aborted)return failure('cancelled','Ход отменён');data=name==='write_file'?this.files!.write(path,args.text as string,expected):this.files!.edit(path,args.old_text as string,args.new_text as string,expected);
  }else if(name==='read_file')data=this.files!.read(path,args.offset as number|undefined,args.limit as number|undefined);
  else if(name==='list_files')data=this.files!.list(path);
  else if(name==='search_files')data=this.files!.search(args.query as string,path);
  else if(name==='write_file')data=this.files!.write(path,args.text as string);
  else if(name==='edit_file')data=this.files!.edit(path,args.old_text as string,args.new_text as string);
  else if(name==='shell'){
   this.ctx.publish({type:'tool',name,detail:'Команда в папке проекта'});
   const result=await sandboxedShell({binary:'/bin/sh',args:['-c',args.command as string],cwd:this.files!.directory(),env:{PATH:process.env.PATH??'/usr/bin:/bin:/usr/sbin:/sbin',HOME:this.files!.root,LANG:'C.UTF-8'},timeoutMs:typeof args.timeout_ms==='number'?args.timeout_ms:30000,maxBytes:65536},this.signal,this.shell);
   if(result.code!==0)return failure('shell_failed',JSON.stringify(result));data=result;
  }
  if(name==='write_file'||name==='edit_file')this.ctx.publish({type:'tool',name:name==='write_file'?'Write':'Edit',detail:resolve(this.files!.root,path)});
  return {ok:true,text:JSON.stringify(data)};
 }
 private protectText(text:string){try{return JSON.stringify(this.redact(JSON.parse(text)))}catch{return this.redact(text)}}
}
