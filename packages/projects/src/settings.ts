import {validateNetwork,advanceNetworkGenerations,networkGeneration,type NetworkConfig} from './network-config.ts';
import {createHash} from 'node:crypto';
import {validateResolvedRoutes,validRoute,LlmError,type ProviderConfig} from '@harnessy/llm';
import {join,dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {withPathLock,canonicalPath,MODE_IDS} from '@harnessy/team';
import {ownerPaths,readObject,writeJson,object,truthy} from './files.ts';
import {orderedClone,orderedKeys,parseCompat} from '@harnessy/journal';
import {priceList,type ModelPrice} from './price-list.ts';
import {BILLING_KEYS,billingConfig,mergeBilling} from './billing.ts';
import {ProjectError} from './errors.ts';
import {AUTOPILOT_STOP_CASES,autopilotConditions,autopilotExpired,autopilotState,nextMorning,stopAutopilot,type AutopilotPermissionSnapshot,type AutopilotState} from './autopilot.ts';
import {SETTINGS_APPLIES,SETTINGS_SCOPE} from './strings.ts';
function repr(key:string){
 const quote=key.includes("'")&&!key.includes('"')?'"':"'";
 return quote+[...key].map(ch=>{if(ch===quote||ch==='\\')return '\\'+ch;if(ch==='\n')return '\\n';if(ch==='\r')return '\\r';if(ch==='\t')return '\\t';
 if(ch!==' '&&/[\p{C}\p{Z}]/u.test(ch)){const n=ch.codePointAt(0)!;return '\\'+(n<=0xff?'x':n<=0xffff?'u':'U')+n.toString(16).padStart(n<=0xff?2:n<=0xffff?4:8,'0')}return ch}).join('')+quote
}
export class Settings {
 private ownerFile:string;private currentProject:()=>string|null;private now:()=>number;
 constructor(ownerFile=ownerPaths().settings,currentProject:()=>string|null=()=>null,now=()=>Date.now()){this.ownerFile=ownerFile;this.currentProject=currentProject;this.now=now}
 networkStatsPath(){return join(dirname(this.ownerFile),'.harnessy','network','stats.sqlite')}
 private llmListeners=new Set<()=>void>();
 onLlmRoutesChanged(listener:()=>void){this.llmListeners.add(listener);return ()=>{this.llmListeners.delete(listener)}}
 private llmChanged(){for(const fn of this.llmListeners)try{fn()}catch{}}
 llmProviders(){try{const owner=this.readOwner();return validateResolvedRoutes(Object.hasOwn(owner,'llmProviders')?owner.llmProviders:{})}catch{throw new LlmError('settings_unreadable')}}
 llmRevision(value:ProviderConfig|undefined){return value===undefined?null:createHash('sha256').update(JSON.stringify(value)).digest('hex')}
 async changeLlmProvider(id:string,value:ProviderConfig|undefined,revision:unknown,beforeSave?:()=>Promise<void|(()=>Promise<void>)>){
  if(!validRoute(id))throw new LlmError('config_invalid');if(value!==undefined)value=validateResolvedRoutes({[id]:value})[id]!;
  const path=canonicalPath(this.ownerFile);
  const result=await withPathLock(path,async()=>{
   let owner,rows;try{owner=this.readOwner(true,path);rows=validateResolvedRoutes(Object.hasOwn(owner,'llmProviders')?owner.llmProviders:{})}catch{throw new LlmError('settings_unreadable')}
   if(revision!==this.llmRevision(rows[id]))throw new ProjectError('llm_conflict','Настройки маршрута изменились; перечитайте их',409);
   if(value===undefined&&!Object.hasOwn(rows,id))throw new LlmError('provider_unknown');
   // Route and chain share this file and lock: publish their removal in one rename.
   if(value===undefined&&Object.hasOwn(owner,'network')){
    let network:NetworkConfig;try{network=validateNetwork(owner.network)}catch{throw new ProjectError('network_unreadable','Настройки выходов не читаются',409)}
    const before=structuredClone(network);delete network.chains['api:'+id];if(network.policies)delete network.policies['api:'+id];advanceNetworkGenerations(before,network);owner.network=network;
   }
   const rollback=await beforeSave?.();if(value===undefined)delete rows[id];else rows[id]=value;
   try{writeJson(path,{...owner,llmProviders:rows})}catch{if(rollback)await rollback();throw new ProjectError('write_failed','Настройки маршрута не записаны; изменения отменены',500)}return {config:value??null,revision:this.llmRevision(value)};
  });this.llmChanged();return result;
 }
 network(){try{return validateNetwork(this.readOwner().network)}catch(e){if(e instanceof ProjectError&&e.code==='iface_unsupported')throw e;throw new ProjectError('network_unreadable','Настройки выходов не читаются',409)}}
 networkGeneration(provider:string){return networkGeneration(this.network(),provider)}
 async changeNetwork<T>(edit:(config:NetworkConfig,providers:Record<string,ProviderConfig>)=>Promise<{result:T;rollback?:()=>Promise<void>}>) {
  const path=canonicalPath(this.ownerFile);return withPathLock(path,async()=>{
   let owner:Record<string,unknown>,config:NetworkConfig;try{owner=this.readOwner(true,path);config=validateNetwork(owner.network)}catch{throw new ProjectError('network_unreadable','Настройки выходов не читаются',409)}
   const previous=structuredClone(config),before=JSON.stringify(config),changed=await edit(config,validateResolvedRoutes(owner.llmProviders??{}));
   try{const next=validateNetwork(config);advanceNetworkGenerations(previous,next);if(before!==JSON.stringify(next))writeJson(path,{...owner,network:next})}
   catch(e){await changed.rollback?.();if(e instanceof ProjectError&&e.code==='network_invalid')throw e;throw new ProjectError('write_failed','Выходы не записаны; изменения отменены',500)}
   return changed.result;
  });
 }
 projectPath(){const path=this.currentProject();return path?join(path,'.harness','state','settings.json'):null}
 private autopilotPath(){const project=this.currentProject(),path=this.projectPath();if(!project||!path)throw new ProjectError('autopilot_invalid','Сначала откройте проект',409);return {project,path:canonicalPath(path)}}
 private readAutopilotProject(path:string){let raw:unknown;try{raw=parseCompat(new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(path)))}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {};throw new ProjectError('autopilot_unreadable','Настройки проекта для Автопилота не читаются',409,error)}if(!object(raw))throw new ProjectError('autopilot_unreadable','Настройки проекта для Автопилота не читаются',409);return raw}
 autopilot():AutopilotState {const {path}=this.autopilotPath();return autopilotState(this.readAutopilotProject(path).autopilot)}
 async currentAutopilot(clock:()=>number=()=>this.now()):Promise<AutopilotState> {
  const {project,path}=this.autopilotPath(),current=autopilotState(this.readAutopilotProject(path).autopilot);if(!autopilotExpired(current,clock()))return current;
  return withPathLock(project,()=>{const saved=this.readAutopilotProject(path),state=autopilotState(saved.autopilot);if(!autopilotExpired(state,clock()))return state;const stopped=stopAutopilot(state);writeJson(path,{...saved,autopilot:stopped});return stopped})
 }
 async changeAutopilot(input:unknown,clock:()=>number=()=>this.now(),assertActive:()=>void=()=>{}):Promise<AutopilotState> {
  if(!object(input)||Object.keys(input).some(key=>!['on','until','conditions','revision'].includes(key))||typeof input.on!=='boolean'||!Number.isSafeInteger(input.revision)||Number(input.revision)<0)throw new ProjectError('autopilot_invalid','Ожидаются on и ревизия состояния Автопилота',400);
  if(input.on&&!(input.until==='morning'||input.until==='reply')||!input.on&&(input.until!==undefined||input.conditions!==undefined))throw new ProjectError('autopilot_invalid','Выберите срок Автопилота: до утра или до ответа',400);
  const conditions=input.on&&input.conditions!==undefined?autopilotConditions(input.conditions):null,{project,path}=this.autopilotPath();
  return withPathLock(project,()=>{
   assertActive();const now=clock(),saved=this.readAutopilotProject(path),prior=autopilotState(saved.autopilot),current=autopilotExpired(prior,now)?stopAutopilot(prior):prior;
   if(current!==prior)writeJson(path,{...saved,autopilot:current});
   if(input.revision!==current.revision)throw new ProjectError('autopilot_conflict','Условия Автопилота изменились; перечитайте карточку',409);
   const state:AutopilotState=input.on?{on:true,until:input.until==='morning'?{kind:'morning',at:nextMorning(now)}:{kind:'reply',at:null},conditions:conditions??current.conditions,generation:current.generation+1,revision:current.revision+1,startedAt:new Date(now).toISOString()}:stopAutopilot(current);
   writeJson(path,{...saved,autopilot:state});return state;
  })
 }
 ownerAutopilotAction():AutopilotState {
  const {path}=this.autopilotPath(),saved=this.readAutopilotProject(path),state=autopilotState(saved.autopilot);
  if(!state.on||state.until?.kind!=='reply')return state;
  const stopped=stopAutopilot(state);writeJson(path,{...saved,autopilot:stopped});return stopped;
 }
 async withAutopilotGeneration<T>(expectedGeneration:number,apply:(snapshot:AutopilotPermissionSnapshot)=>T|Promise<T>,clock:()=>number=()=>this.now(),assertActive:()=>void=()=>{}):Promise<T>{
  if(!Number.isSafeInteger(expectedGeneration)||expectedGeneration<1)throw new ProjectError('autopilot_generation_mismatch','Поколение разрешений Автопилота изменилось',409);
  const {project,path}=this.autopilotPath();return withPathLock(project,async()=>{
   assertActive();const saved=this.readAutopilotProject(path),state=autopilotState(saved.autopilot);
   if(autopilotExpired(state,clock())){writeJson(path,{...saved,autopilot:stopAutopilot(state)});throw new ProjectError('autopilot_expired','Срок Автопилота истёк',409)}
   if(!state.on)throw new ProjectError('autopilot_off','Автопилот выключен',409);
   if(state.generation!==expectedGeneration)throw new ProjectError('autopilot_generation_mismatch','Поколение разрешений Автопилота изменилось',409);
   const snapshot:AutopilotPermissionSnapshot=Object.freeze({generation:state.generation,revision:state.revision,conditions:Object.freeze({...state.conditions,operations:Object.freeze([...state.conditions.operations]),stopCases:Object.freeze([...state.conditions.stopCases])}),stopCodes:Object.freeze([...AUTOPILOT_STOP_CASES])});
   const result=await apply(snapshot);assertActive();return result;
  })
 }
 private readOwner(writing=false,path=canonicalPath(this.ownerFile)){
  let raw:unknown;try{raw=parseCompat(new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(path)))}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {};if(writing&&(e as NodeJS.ErrnoException).code==='EISDIR')throw new ProjectError('write_failed','не записано: '+String(e),500,e);throw new ProjectError('pricelist_unreadable','прайс-лист владельца не читается',409,e)}
  if(!object(raw))throw new ProjectError('pricelist_unreadable','прайс-лист владельца не читается: настройки должны быть объектом',409);
  return raw;
 }
 private prices(owner:Record<string,unknown>):ModelPrice[]{try{return Object.hasOwn(owner,'priceList')?priceList(owner.priceList):[]}catch(e){throw new ProjectError('pricelist_unreadable','прайс-лист владельца не читается: '+(e as Error).message,409,e)}}
 priceList(){return this.prices(this.readOwner())}
 profileName(){try{const value=this.readOwner().profileName,name=typeof value==='string'?value.trim():'';return name&&[...name].length<=80&&!/[\p{C}]/u.test(name)?name:null}catch{return null}}
 billing(){try{return billingConfig(this.readOwner())}catch(e){throw new ProjectError('billing_unreadable','Настройки подписок не читаются: '+(e as Error).message,409,e)}}
 async patchBilling(changes:unknown){
  const path=canonicalPath(this.ownerFile);
  return withPathLock(path,()=>{
   const owner=this.readOwner(true,path),previous=billingConfig(owner),config=mergeBilling(previous,changes),saved=orderedClone(owner);
   for(const key of ['subscriptionPrices','subscriptionDates'] as const)if(JSON.stringify(previous[key])!==JSON.stringify(config[key]))saved[key]=config[key];
   writeJson(path,saved);return {ok:true as const,scope:'owner' as const,config,ts:Math.floor(this.now()/1000)};
  });
 }
 private merged(owner:Record<string,unknown>,project:Record<string,unknown>){const overrides=orderedClone(project);for(const key of ['network','llmProviders','priceList','traceEnabled','traceMaxMiB',...BILLING_KEYS])delete overrides[key];return orderedClone(owner,overrides)}
 get(){const owner=this.readOwner(),path=this.projectPath(),project=path?readObject(path):{};this.prices(owner);return {ok:true as const,owner,project,effective:this.merged(owner,project),applies:SETTINGS_APPLIES}}
 async setProgramBinary(id:string,binary:string){const path=canonicalPath(this.ownerFile);return withPathLock(path,()=>{const owner=this.readOwner(true,path),saved=orderedClone(owner);saved['programBinary_'+id]=binary;writeJson(path,saved);return binary})}
 // Broken prices must not prevent opening a project or reaching the owner's repair endpoint.
 effective(){const path=this.projectPath();return this.merged(readObject(this.ownerFile),path?readObject(path):{})}
 async patch(scope:unknown,patch:unknown){
 scope=truthy(scope)?String(scope):'owner';if(!['owner','project'].includes(String(scope))||!object(patch)||!Object.keys(patch).length)throw new ProjectError('invalid_settings',SETTINGS_SCOPE);
 const changes=orderedClone(patch);
 if(Object.hasOwn(changes,'autopilot'))throw new ProjectError('autopilot_invalid','Автопилот меняется через /api/autopilot');
 for(const key of orderedKeys(changes)){const value=changes[key];if(key==='network')throw new ProjectError('invalid_settings','Выходы меняются через /api/network');if(key==='llmProviders')throw new ProjectError('invalid_settings','Маршруты меняются через /api/llm/providers');if(key.startsWith('programBinary_'))throw new ProjectError('invalid_settings','Путь к программе меняется через карточку программы');if([...key].length>40||!(/^[\p{L}\p{N}]+$/u.test(key.replaceAll('_',''))))throw new ProjectError('invalid_settings','ключ '+repr(key)+' не годится');
 if(key==='profileName'){if(scope!=='owner')throw new ProjectError('invalid_settings','profileName: только область owner');if(value!==null){if(typeof value!=='string'||![...value.trim()].length||[...value.trim()].length>80||/[\p{C}]/u.test(value))throw new ProjectError('invalid_settings','Имя: от 1 до 80 символов без управляющих',400);changes[key]=value.trim()}}
 if(key==='traceEnabled'||key==='traceMaxMiB'){if(scope!=='owner')throw new ProjectError('invalid_settings',key+': только область owner');if(value!==null&&(key==='traceEnabled'?typeof value!=='boolean':!Number.isSafeInteger(value)||Number(value)<1||Number(value)>128))throw new ProjectError('invalid_settings',key+': нужен флаг или размер от 1 до 128 МиБ')}
 if(key==='priceList'){if(scope!=='owner')throw new ProjectError('invalid_settings','priceList: только область owner');if(value!==null)changes[key]=priceList(value)}
 if(BILLING_KEYS.includes(key as never)){if(scope!=='owner')throw new ProjectError('billing_invalid',key+': только область owner');if(value!==null)billingConfig({[key]:value})}
 if(value!==null&&!['string','number','boolean'].includes(typeof value)&&!Array.isArray(value))throw new ProjectError('invalid_settings','значение '+key+': только строка, число, флаг или список');
 if(key==='defaultMode'&&value!==null&&!MODE_IDS.includes(value as never))throw new ProjectError('invalid_settings','defaultMode: '+[...MODE_IDS].sort().join(', '))}
 const project=this.currentProject(),selected=scope==='owner'?this.ownerFile:project?join(project,'.harness','state','settings.json'):null;if(!selected)throw new ProjectError('invalid_settings','папка не открыта');
 const path=canonicalPath(selected);
 return withPathLock(scope==='project'?project!:path,()=>{
 const cur=scope==='owner'?this.readOwner(true,path):readObject(path),saved=orderedClone(cur);for(const key of orderedKeys(changes)){if(changes[key]===null)delete saved[key];else Object.defineProperty(saved,key,{value:changes[key],enumerable:true,configurable:true,writable:true})}
 const ordered=orderedClone(cur,saved);for(const key of orderedKeys(ordered))if(!Object.hasOwn(saved,key))delete ordered[key];if(scope==='owner')this.prices(ordered);writeJson(path,ordered);
 return {ok:true as const,scope,saved:ordered,effective:this.effective(),applies:SETTINGS_APPLIES,ts:Math.floor(this.now()/1000)}
 })
 }
}
