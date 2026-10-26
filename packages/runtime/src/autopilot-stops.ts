import {AUTOPILOT_STOP_CASES} from '@harnessy/projects';
import type {ToolApprovalRequest} from '@harnessy/providers';
import {RuntimeError,object} from './errors.ts';
export type StopCode=typeof AUTOPILOT_STOP_CASES[number];
const unknown=():never=>{throw new RuntimeError('stop_checks_missing','Для операции и её параметров нет полной проверки стоп-случаев',409)};
const nonempty=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
const command=(v:unknown)=>nonempty(v)||Array.isArray(v)&&v.length>0&&v.every(nonempty);
const paths=(v:unknown)=>Array.isArray(v)&&v.every(nonempty);
const result=(...blocked:StopCode[])=>({checked:[...AUTOPILOT_STOP_CASES],blocked:[...new Set(blocked)]});
/** Parameters come from the adapter's real permission request, never the proposal or its explanation. */
export function classifyAutopilotApproval(request:Readonly<ToolApprovalRequest>|undefined){
 if(!request||!object(request.parameters)||!nonempty(request.operation))return unknown();
 const p=request.parameters;
 if(request.provider==='claude'){
  switch(request.operation){
   // Arbitrary execution can pay, publish, delete, install, connect and create unbounded model spend.
   // Do not parse a shell string and claim that a benign-looking command bounds those capabilities.
   case 'Bash':if(!command(p.command))return unknown();return result(...AUTOPILOT_STOP_CASES);
   case 'WebFetch':{if(!nonempty(p.url))return unknown();let url:URL;try{url=new URL(p.url)}catch{return unknown()}if(!['http:','https:'].includes(url.protocol))return unknown();return result('external_network')}
   case 'WebSearch':if(!nonempty(p.query))return unknown();return result('external_network');
   // An overwrite/edit grant can destroy existing data even when the proposed description says "append".
   case 'Write':if(!nonempty(p.file_path)||typeof p.content!=='string')return unknown();return result('data_delete');
   case 'Edit':if(!nonempty(p.file_path)||typeof p.old_string!=='string'||typeof p.new_string!=='string')return unknown();return result('data_delete');
   case 'MultiEdit':if(!nonempty(p.file_path)||!Array.isArray(p.edits)||!p.edits.length||p.edits.some(e=>!object(e)||typeof e.old_string!=='string'||typeof e.new_string!=='string'))return unknown();return result('data_delete');
   case 'Read':if(!nonempty(p.file_path))return unknown();return result();
   case 'Glob':if(!nonempty(p.pattern))return unknown();return result();
   case 'Grep':if(!nonempty(p.pattern))return unknown();return result();
   default:return unknown();
  }
 }
 if(request.provider==='codex'){
  switch(request.operation){
   case 'item/commandExecution/requestApproval':if(!command(p.command))return unknown();return result(...AUTOPILOT_STOP_CASES);
   case 'item/fileChange/requestApproval':{const changes=p.changes??p.files;if(!Array.isArray(changes)||!changes.length||changes.some(c=>!object(c)||!nonempty(c.path)))return unknown();return result('data_delete')}
   case 'item/permissions/requestApproval':{
    const permissions=p.permissions;if(!object(permissions)||Object.keys(permissions).some(k=>!['network','fileSystem'].includes(k)))return unknown();
    const network=permissions.network,fs=permissions.fileSystem;
    if(network!=null&&(!object(network)||Object.keys(network).some(k=>k!=='enabled')||typeof network.enabled!=='boolean'))return unknown();
    if(fs!=null&&(!object(fs)||Object.keys(fs).some(k=>!['read','write'].includes(k))||Object.values(fs).some(v=>v!==null&&!paths(v))))return unknown();
    return result(...(object(network)&&network.enabled===true?['external_network' as const]:[]),...(object(fs)&&Array.isArray(fs.write)&&fs.write.length?['data_delete' as const]:[]));
   }
   default:return unknown();
  }
 }
 return unknown();
}
