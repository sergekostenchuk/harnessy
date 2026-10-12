import {randomUUID} from 'node:crypto';
import {validRoute,keySlot,type KeyStore,type KeyDescription} from '@harnessy/llm';
import type {Settings} from './settings.ts';
import type {Connections} from './connections.ts';
import {object} from './files.ts';
import {ProjectError} from './errors.ts';
import {validateExit,validateSshKey,chainRevision,defaultNetworkPolicy,validateNetworkPolicy,type NetworkPolicy,networkRevision,networkInvalid,validProviderId,type NetworkExit,type NetworkConfig} from './network-config.ts';
type ChainReceipt={policy?:NetworkPolicy;provider:string;configured:boolean;exits:string[];revision:string|null;orphaned?:boolean};
const absent:KeyDescription={present:false,mask:null,updatedAt:null};
function slot(exit:NetworkExit|undefined){return exit?.type==='proxy'&&exit.passwordRef?keySlot(exit.passwordRef,exit.passwordGeneration):null}
function password(value:unknown):asserts value is string {if(typeof value!=='string'||!value.length||Buffer.byteLength(value)>4096||/[\p{C}]/u.test(value))networkInvalid('Пароль: от 1 до 4096 байт, без управляющих символов')}
function conflict(revision:unknown,value:unknown){if(revision!==networkRevision(value))throw new ProjectError('network_conflict','Настройки изменились; перечитайте выход или цепочку',409)}
// Upgrade generated fallback names once. Later owner edits, including the old fallback, are authoritative.
function nameLegacyDirectExits(config:NetworkConfig){
 if(config.legacyLabelsVersion===1)return;
 for(const exit of Object.values(config.exits)){
  const vendor=/^legacy-(claude|codex)(?:-[1-9][0-9]*)?$/.exec(exit.id)?.[1];
  if(exit.type==='direct'&&vendor&&exit.label===vendor){exit.label='Напрямую · прежний маршрут '+(vendor==='claude'?'Claude':'Codex')}
 }
 config.legacyLabelsVersion=1;
}
// The removal receipt describes every affected provider and is checked under the settings lock.
function removal(config:NetworkConfig,id:string){
 const affected=Object.entries(config.chains).filter(([,ids])=>ids.includes(id));
 let direct=Object.values(config.exits).find(e=>e.id!==id&&e.type==='direct'&&!e.expectedIp)?.id;
 if(!direct){direct='direct';for(let n=1;direct===id||Object.hasOwn(config.exits,direct);n++)direct='direct-'+n}
 return {networkRevision:networkRevision(config),chains:Object.fromEntries(affected.map(([provider])=>[provider,chainRevision(config,provider)])),changes:affected.map(([provider,ids])=>{const remaining=ids.filter(x=>x!==id),exits=remaining.length?remaining:[direct!];return {provider,exits,direct:!remaining.length||config.exits[exits[0]!]?.type==='direct',reserve:ids.indexOf(id)>0,label:config.exits[exits[0]!]?.label??'Напрямую'}})};
}
export class NetworkSettings {
 private settings:Settings;private keys:KeyStore;private connections:Connections;private programs:()=>string[];
 constructor(settings:Settings,keys:KeyStore,connections:Connections,programs:()=>string[]){this.settings=settings;this.keys=keys;this.connections=connections;this.programs=programs}
 private knownProvider(id:string,routes:Record<string,unknown>){return validProviderId(id)&&(id.startsWith('api:')?Object.hasOwn(routes,id.slice(4)):this.programs().includes(id))}
 private providerMissing():never{throw new ProjectError('provider_unknown','Провайдер не найден',404)}
 private async erase(refs:string[]){for(const ref of refs)try{await this.keys.delete(ref)}catch{throw new ProjectError('credential_cleanup_failed','Не удалось удалить неиспользуемую версию пароля',500)}}
 private async put(ref:string,value:string){try{await this.keys.put(ref,value)}catch{throw new ProjectError('credential_unavailable','Связка ключей недоступна',503)}}
 // Run only at an owner network door. Legacy bytes remain available to the old traffic path until TS-22c.
 async migrate(){
  const snapshot=this.settings.network();if(snapshot.migrated&&snapshot.legacyLabelsVersion===1)return;
  await this.settings.changeNetwork(async config=>{
   if(config.migrated){nameLegacyDirectExits(config);return {result:undefined}};
   return this.connections.withLegacyRoutes(async rows=>{
    const pending:{exit:NetworkExit;secret:string|undefined;vendor:string}[]=[];
    for(const vendor of ['claude','codex']){
     if(!Object.hasOwn(rows,vendor)||Object.hasOwn(config.chains,vendor))continue;
     const row=rows[vendor];if(!object(row))networkInvalid('Прежний маршрут не читается');
     let id='legacy-'+vendor;for(let n=1;Object.hasOwn(config.exits,id);n++)id='legacy-'+vendor+'-'+n;
     const base={id,label:typeof row.label==='string'&&row.label?row.label:vendor,...(row.expect?{expectedIp:row.expect}:{})};
     let exit:NetworkExit,secret:string|undefined;
     if(row.route==='proxy'){
      let url:URL;try{url=new URL(String(row.proxy))}catch{networkInvalid('Прежний адрес прокси не читается')}
      let login:string;try{login=decodeURIComponent(url!.username);secret=url!.password?decodeURIComponent(url!.password):undefined}catch{networkInvalid('Прежние данные прокси не читаются')}
      url!.username='';url!.password='';
      if(secret!==undefined)password(secret);
      exit=validateExit({...base,type:'proxy',url:url!.toString(),...(login?{login}:{}),...(secret!==undefined?{passwordRef:id,passwordGeneration:randomUUID()}:{})});
     }else exit=validateExit({...base,type:row.route});
     pending.push({exit,secret,vendor});
    }
    const refs:string[]=[];
    try{for(const {exit,secret,vendor} of pending){if(secret!==undefined){const ref=slot(exit)!;refs.push(ref);await this.put(ref,secret)}config.exits[exit.id]=exit;config.chains[vendor]=[exit.id]}}
    catch(e){await this.erase(refs);throw e}
    nameLegacyDirectExits(config);config.migrated=true;return {result:undefined,rollback:()=>this.erase(refs)};
   });
  });
 }
 private async receipt(exit:NetworkExit){const ref=slot(exit);let description=absent;if(ref)try{const value=await this.keys.describe(ref);description={present:value.present,mask:value.present?'••••••••':null,updatedAt:value.updatedAt}}catch{throw new ProjectError('credential_unavailable','Связка ключей недоступна',503)}return {config:exit,revision:networkRevision(exit),password:description}}
 async list(){await this.migrate();const config=this.settings.network();return Promise.all(Object.values(config.exits).map(exit=>this.receipt(exit)))}
 async save(id:string,raw:unknown,revision:unknown,secret?:unknown,use?:{provider:string;revision:unknown;policy?:unknown}){
  const usePolicy=use?.policy===undefined?defaultNetworkPolicy:validateNetworkPolicy(use.policy);
  const proposed=validateExit(raw);if(id!==proposed.id)networkInvalid();if(secret!==undefined&&secret!==null){password(secret);if(proposed.type!=='proxy')networkInvalid('Пароль допустим только для прокси')}
  if(secret===null&&proposed.type!=='proxy')networkInvalid('Пароль допустим только для прокси');
  await this.migrate();
  const result=await this.settings.changeNetwork(async(config,routes)=>{
   if(use){if(!this.knownProvider(use.provider,routes))this.providerMissing();if(use.revision!==chainRevision(config,use.provider))throw new ProjectError('network_conflict','Настройки провайдера изменились; перечитайте их перед сохранением',409)}
   const previous=config.exits[id];conflict(revision,previous);let next=structuredClone(proposed);const before=slot(previous);
   if(next.type==='proxy'){
    // Echoing a version is allowed; selecting another exit's or obsolete secret is not.
    if(next.passwordRef!==undefined&&slot(next)!==before)networkInvalid('Версия пароля устарела или принадлежит другому выходу');
    delete next.passwordRef;delete next.passwordGeneration;
    if(typeof secret==='string'){next.passwordRef=id;next.passwordGeneration=randomUUID()}
    else if(secret!==null&&previous?.type==='proxy'&&before){next.passwordRef=id;next.passwordGeneration=previous.passwordGeneration!}
   }
   const after=slot(next),created=typeof secret==='string'?after:null;
   if(created)try{await this.put(created,secret as string)}catch(e){await this.erase([created]);throw e}
   validateSshKey(next);config.exits[id]=next;if(use){config.chains[use.provider]=[id];(config.policies??={})[use.provider]=usePolicy}const chain=use?{provider:use.provider,configured:true,exits:[id],policy:usePolicy,revision:chainRevision(config,use.provider)}:undefined;return {result:{next,before,after,chain},rollback:()=>this.erase(created?[created]:[])};
  });
  if(result.before&&result.before!==result.after)await this.erase([result.before]);return {...await this.receipt(result.next),...(result.chain?{chain:result.chain}:{})};
 }
 async removal(id:string){if(!validRoute(id))networkInvalid();await this.migrate();const config=this.settings.network(),exit=config.exits[id];if(!exit)throw new ProjectError('exit_unknown','Подключение не найдено',404);return {id,label:exit.label,revision:networkRevision(exit),...removal(config,id)}}
 async delete(id:string,revision:unknown,confirmation?:unknown){if(!validRoute(id))networkInvalid();await this.migrate();const ref=await this.settings.changeNetwork(async config=>{
  const exit=config.exits[id];if(!exit)throw new ProjectError('exit_unknown','Выход не найден',404);conflict(revision,exit);
  const plan=removal(config,id);
  if(confirmation===undefined&&plan.changes.length)throw new ProjectError('exit_in_use','Подключение используется провайдерами; подтвердите последствия удаления',409);
  if(confirmation!==undefined){
   const receipts=object(confirmation)?confirmation.chains:undefined;
   if(!object(confirmation)||Object.keys(confirmation).some(k=>!['networkRevision','chains'].includes(k))||confirmation.networkRevision!==plan.networkRevision||!object(receipts)||Object.keys(receipts).length!==Object.keys(plan.chains).length||Object.entries(plan.chains).some(([key,rev])=>receipts[key]!==rev))throw new ProjectError('network_conflict','Настройки изменились; подтвердите новый список изменений',409);
   for(const change of plan.changes){for(const target of change.exits)if(!config.exits[target])config.exits[target]={id:target,label:'Напрямую',type:'direct'};config.chains[change.provider]=change.exits}
  }
  delete config.exits[id];return {result:slot(exit)};
 });if(ref)await this.erase([ref]);}
 async chain(id:string):Promise<ChainReceipt>{await this.migrate();const known=this.knownProvider(id,this.settings.llmProviders()),config=this.settings.network(),chains=config.chains;if(!known&&(!validProviderId(id)||!Object.hasOwn(chains,id)))this.providerMissing();const value=chains[id];return {provider:id,configured:value!==undefined,exits:value??[],policy:config.policies?.[id]??defaultNetworkPolicy,revision:chainRevision(config,id),...(!known?{orphaned:true}:{})}}
 async saveChain(id:string,exits:unknown,revision:unknown,policy?:unknown){
  const nextPolicy=policy===undefined?undefined:validateNetworkPolicy(policy);
  if(!Array.isArray(exits)||exits.length>32||exits.some(x=>typeof x!=='string')||new Set(exits).size!==exits.length)networkInvalid('Цепочка: упорядоченный список неповторяющихся выходов');await this.migrate();
  return this.settings.changeNetwork<ChainReceipt>(async(config,routes)=>{
   if(!this.knownProvider(id,routes)){
    if(!validProviderId(id)||!Object.hasOwn(config.chains,id)||exits.length)this.providerMissing();
    if(revision!==chainRevision(config,id))throw new ProjectError('network_conflict','Настройки изменились; перечитайте цепочку',409);delete config.chains[id];if(config.policies)delete config.policies[id];
    return {result:{provider:id,configured:false,exits:[] as string[],revision:null,orphaned:true}};
   }
   if(revision!==chainRevision(config,id))throw new ProjectError('network_conflict','Настройки изменились; перечитайте цепочку',409);if(exits.some(x=>!Object.hasOwn(config.exits,x)))networkInvalid('Цепочка содержит неизвестный выход');
   // An explicitly saved empty chain is configured and stops traffic in consumers; it is never implicit direct.
   config.chains[id]=[...exits];if(nextPolicy)(config.policies??={})[id]=nextPolicy;return {result:{provider:id,configured:true,exits:[...exits],policy:config.policies?.[id]??defaultNetworkPolicy,revision:chainRevision(config,id)}};
  });
 }
 // Internal transport API: use the version from a captured exit, never a mutable alias.
 async resolvePassword(exit:NetworkExit){const ref=slot(validateExit(exit));return ref?this.keys.resolveKey(ref):null}
}
