import {ProviderError,record} from './types.ts';
import type {CliEvent} from './cli/types.ts';

// OpenCode 1.18.4 `run --format json`: message.part.updated envelopes, followed
// by session idle (EOF). A final step-finish is required; tool-call steps aren't done.
export function opencodeStream(){
 let session:string|undefined;
 return (value:unknown):CliEvent[]=>{
  const bad=()=>new ProviderError('protocol','OpenCode: неверный поток хода');
  if(!record(value)||typeof value.type!=='string'||typeof value.sessionID!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value.sessionID))throw bad();
  if(session&&session!==value.sessionID)throw bad();session=value.sessionID;
  const events:CliEvent[]=[{type:'session',id:session}];
  if(value.type==='error')return [...events,{type:'error',code:'turn_failed',text:'OpenCode: программа отклонила ход; проверьте вход и модель'}];
  const part=value.part;if(!record(part)||part.sessionID!==session)throw bad();
  if(value.type==='text'){if(part.type!=='text'||typeof part.text!=='string')throw bad();events.push({type:'delta',text:part.text})}
  else if(value.type==='step_finish'){
   if(part.type!=='step-finish'||typeof part.reason!=='string')throw bad();
   if(part.reason!=='tool-calls'){
    if(part.reason!=='stop')return [...events,{type:'error',code:'turn_failed',text:'OpenCode: ответ не завершён'}];
    events.push({type:'done'});
   }
  }else if(value.type==='tool_use'){
   if(part.type!=='tool'||typeof part.callID!=='string'||typeof part.tool!=='string'||!record(part.state)||!['completed','error'].includes(String(part.state.status)))throw bad();
   events.push({type:'tool.call',id:part.callID,name:part.tool,input:part.state.input},{type:'tool.result',id:part.callID,outcome:part.state.status==='completed'?'ok':'failed',output:part.state.status==='completed'?part.state.output:undefined,...(part.state.status==='error'?{reason:'OpenCode: инструмент завершился с ошибкой'}:{})});
  }else if(value.type==='step_start'){if(part.type!=='step-start')throw bad()}
  else if(value.type==='reasoning'){if(part.type!=='reasoning')throw bad()}
  else throw bad();
  return events;
 };
}
