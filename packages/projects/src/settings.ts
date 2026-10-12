import {validateNetwork,type NetworkConfig} from './network-config.ts';
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
    delete network.chains['api:'+id];if(network.policies)delete network.policies['api:'+id];owner.network=network;
   }
   const rollback=await beforeSave?.();if(value===undefined)delete rows[id];else rows[id]=value;
   try{writeJson(path,{...owner,llmProviders:rows})}catch{if(rollback)await rollback();throw new ProjectError('write_failed','Настройки маршрута не записаны; изменения отменены',500)}return {config:value??null,revision:this.llmRevision(value)};
  });this.llmChanged();return result;
 }
 network(){try{return validateNetwork(this.readOwner().network)}catch(e){if(e instanceof ProjectError&&e.code==='iface_unsupported')throw e;throw new ProjectError('network_unreadable','Настройки выходов не читаются',409)}}
 async changeNetwork<T>(edit:(config:NetworkConfig,providers:Record<string,ProviderConfig>)=>Promise<{result:T;rollback?:()=>Promise<void>}>) {
  const path=canonicalPath(this.ownerFile);return withPathLock(path,async()=>{
   let owner:Record<string,unknown>,config:NetworkConfig;try{owner=this.readOwner(true,path);config=validateNetwork(owner.network)}catch{throw new ProjectError('network_unreadable','Настройки выходов не читаются',409)}
   const before=JSON.stringify(config),changed=await edit(config,validateResolvedRoutes(owner.llmProviders??{}));
   try{const next=validateNetwork(config);if(before!==JSON.stringify(next))writeJson(path,{...owner,network:next})}
   catch(e){await changed.rollback?.();if(e instanceof ProjectError&&e.code==='network_invalid')throw e;throw new ProjectError('write_failed','Выходы не записаны; изменения отменены',500)}
   return changed.result;
  });
 }
 projectPath(){const path=this.currentProject();return path?join(path,'.harness','state','settings.json'):null}
 private readOwner(writing=false,path=canonicalPath(this.ownerFile)){
  let raw:unknown;try{raw=parseCompat(new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(path)))}
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {};if(writing&&(e as NodeJS.ErrnoException).code==='EISDIR')throw new ProjectError('write_failed','не записано: '+String(e),500,e);throw new ProjectError('pricelist_unreadable','прайс-лист владельца не читается',409,e)}
  if(!object(raw))throw new ProjectError('pricelist_unreadable','прайс-лист владельца не читается: настройки должны быть объектом',409);
  return raw;
 }
 private prices(owner:Record<string,unknown>):ModelPrice[]{try{return Object.hasOwn(owner,'priceList')?priceList(owner.priceList):[]}catch(e){throw new ProjectError('pricelist_unreadable','прайс-лист владельца не читается: '+(e as Error).message,409,e)}}
 priceList(){return this.prices(this.readOwner())}
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
 // Broken prices must not prevent opening a project or reaching the owner's repair endpoint.
 effective(){const path=this.projectPath();return this.merged(readObject(this.ownerFile),path?readObject(path):{})}
 async patch(scope:unknown,patch:unknown){
 scope=truthy(scope)?String(scope):'owner';if(!['owner','project'].includes(String(scope))||!object(patch)||!Object.keys(patch).length)throw new ProjectError('invalid_settings',SETTINGS_SCOPE);
 const changes=orderedClone(patch);
 for(const key of orderedKeys(changes)){const value=changes[key];if(key==='network')throw new ProjectError('invalid_settings','Выходы меняются через /api/network');if(key==='llmProviders')throw new ProjectError('invalid_settings','Маршруты меняются через /api/llm/providers');if([...key].length>40||!(/^[\p{L}\p{N}]+$/u.test(key.replaceAll('_',''))))throw new ProjectError('invalid_settings','ключ '+repr(key)+' не годится');
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
