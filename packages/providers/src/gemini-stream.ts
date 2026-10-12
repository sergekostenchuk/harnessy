import {ProviderError,record} from './types.ts';
import type {CliEvent} from './cli/types.ts';
// Gemini CLI 0.63 stream-json: init/message/tool_use/tool_result/error/result.
export function geminiStream(){let initialized=false,finished=false;return (v:unknown):CliEvent[]=>{
 const invalid=():never=>{throw new ProviderError('protocol','Gemini: неверный поток')};
 if(!record(v)||finished)return invalid();
 if(v.type==='init'){if(initialized||typeof v.session_id!=='string'||!v.session_id)return invalid();initialized=true;return [{type:'session',id:v.session_id}]}
 if(!initialized)return invalid();
 if(v.type==='message'){if(typeof v.content!=='string'||!['user','assistant'].includes(v.role as string))return invalid();return v.role==='assistant'?[{type:'delta',text:v.content}]:[]}
 if(v.type==='tool_use'){if(typeof v.tool_id!=='string'||typeof v.tool_name!=='string')return invalid();return [{type:'tool.call',id:v.tool_id,name:v.tool_name,input:v.parameters}]}
 if(v.type==='tool_result'){if(typeof v.tool_id!=='string'||!['success','error'].includes(v.status as string))return invalid();return [{type:'tool.result',id:v.tool_id,outcome:v.status==='success'?'ok':'failed',output:v.output,...(record(v.error)&&typeof v.error.message==='string'?{reason:v.error.message}:{})}]}
 if(v.type==='error'){if(typeof v.message!=='string')return invalid();return v.severity==='warning'?[]:[{type:'error',code:'turn_failed',text:v.message}]}
 if(v.type==='result'){finished=true;if(v.status!=='success')return [{type:'error',code:'turn_failed',text:'Gemini: ход завершился с ошибкой'}];const s=record(v.stats)?v.stats:{},n=(k:string)=>typeof s[k]==='number'&&Number.isFinite(s[k])&&s[k]>=0?s[k] as number:null;return [{type:'done',usage:{input:n('input'),output:n('output_tokens'),cacheRead:n('cached')}}]}
 return invalid();
}}
