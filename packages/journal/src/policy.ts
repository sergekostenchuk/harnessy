import {readFileSync,statSync} from 'node:fs';
import {parseDocument} from 'yaml';
import {KINDS,object,freeze,type Route,type Decision,type PolicyView} from './types.ts';
export class PolicyError extends Error {constructor(message:string){super(message);this.name='PolicyError'}}
function pyString(value:unknown):string {return value===true?'True':value===false?'False':value===null?'None':String(value)}
function asList(value:unknown):string[]{if(value==null)return [];if(typeof value==='string')return [value];if(Array.isArray(value))return value.map(pyString);throw new PolicyError('comms-policy.yaml: ожидалась строка или список')}
function truthy(value:unknown):boolean{return !!value&&(!Array.isArray(value)||value.length>0)&&(!object(value)||Object.keys(value).length>0)}
function acyclic(value:unknown,ancestors=new Set<object>()){
 if(!value||typeof value!=='object')return;if(ancestors.has(value))throw new PolicyError('comms-policy.yaml не читается: циклический якорь');
 ancestors.add(value);for(const item of Object.values(value))acyclic(item,ancestors);ancestors.delete(value)
}
export class PolicySnapshot implements PolicyView {
 readonly version:number;readonly default:string;readonly routes:readonly Route[];readonly observe:Readonly<Record<string,'*'|readonly string[]>>;
 constructor(version:number,default_:string,routes:Route[],observe:Record<string,'*'|string[]>){this.version=version;this.default=default_;this.routes=freeze(routes);this.observe=freeze(observe);Object.freeze(this)}
 routeFor(from:string,to:string,kind:string):Route|null {return this.routes.find(r=>(r.from.includes('*')||r.from.includes(from))&&(r.to.includes('*')||r.to.includes(to))&&(r.kinds==='*'||r.kinds.includes(kind)))??null}
 allowedKinds(from:string,to:string):string[]{const out:string[]=[];for(const r of this.routes)if((r.from.includes('*')||r.from.includes(from))&&(r.to.includes('*')||r.to.includes(to)))for(const kind of r.kinds==='*'?KINDS:r.kinds)if(!out.includes(kind))out.push(kind);return out}
 checkSend(from:string,to:string,kind:string):Decision {
 const route=this.routeFor(from,to,kind);if(!route){const allowed=this.allowedKinds(from,to),hint=allowed.length?from+' может писать '+to+' только: '+allowed.join(', '):'у роли '+from+' нет маршрута к '+to;
 return {allow:false,pending:false,reason:'политика v'+this.version+': '+hint,route:null,bounds:{},trigger:null}}
 const pending=route.trigger==='owner-ack';return {allow:true,pending,reason:pending?'ждёт подтверждения владельца':'',route,bounds:route.bounds??{},trigger:route.trigger}
 }
 canObserve(role:string,targetRole:string):boolean{if(role==='owner')return true;const value=Object.hasOwn(this.observe,role)?this.observe[role]:undefined;return value==='*'||!!value?.includes(targetRole)}
 summaryFor(role:string,seatRoles:Record<string,string>,labels:Record<string,string>):string {
 const lines:string[]=[];
 for(const [sid,r] of Object.entries(seatRoles)){
 if(r===role&&Object.values(seatRoles).filter(x=>x===role).length===1)continue;
 const kinds=this.allowedKinds(role,r);if(!kinds.length)continue;
 const rt=this.routes.filter(x=>(x.from.includes('*')||x.from.includes(role))&&(x.to.includes('*')||x.to.includes(r))&&x.trigger);
 const extra=rt.length?' ('+rt.map(x=>(x.kinds==='*'?KINDS:x.kinds).join(', ')+': '+x.trigger).join('; ')+')':'';
 lines.push('- '+sid+' ('+(labels[sid]??sid)+'): '+kinds.join(', ')+extra)
 }
 const allowed=this.allowedKinds(role,'owner');if(allowed.length)lines.push('- owner (владелец): '+allowed.join(', '));
 const obs=Object.hasOwn(this.observe,role)?this.observe[role]:undefined,watch=obs==='*'?'все окна':obs?.length?Object.entries(seatRoles).filter(([,r])=>obs.includes(r)).map(([sid])=>sid).join(', ')||'никого':'никого';
 return 'Твои маршруты по политике связи (кому какие виды записей ты можешь отправлять):\n'+lines.join('\n')+'\nЧитать чужие разговоры (read_pane, сводка) ты можешь у: '+watch+'. Запись вне маршрута сервер отклонит с причиной.'
 }
}
export class Policy implements PolicyView {
 readonly path:string;private view=new PolicySnapshot(0,'deny',[],{});private mtime=0;private _broken=false;private _error:PolicyError|null=null;
 get broken(){return this._broken}get error(){return this._error}get version(){return this.view.version}get default(){return this.view.default}get routes(){return this.view.routes}get observe(){return this.view.observe}
 constructor(path:string){this.path=path;this.load()}
 snapshot():PolicySnapshot{return this.view}
 load():void {
 try{
 const before=statSync(this.path).mtimeMs,source=readFileSync(this.path,'utf8'),after=statSync(this.path).mtimeMs;
 if(before!==after)throw new Error('файл изменился во время чтения');
 const doc=parseDocument(source,{version:'1.1',merge:true,uniqueKeys:false});
 if(doc.errors.length||doc.warnings.length)throw new Error([...doc.errors,...doc.warnings].map(e=>e.message).join('; '));
 const data:unknown=doc.toJS({maxAliasCount:100});acyclic(data);
 if(!object(data)||!Array.isArray(data.routes))throw new PolicyError('comms-policy.yaml: нужен список routes');
 const routes:Route[]=data.routes.map((raw:unknown,index:number)=>{
 const n=index+1;if(!object(raw))throw new PolicyError('comms-policy.yaml: маршрут №'+n+' должен быть таблицей');
 const kinds=raw.kinds==='*'||raw.kinds===undefined?'*':asList(raw.kinds);
 if(kinds!=='*')for(const kind of kinds)if(!KINDS.includes(kind as never))throw new PolicyError('comms-policy.yaml: маршрут №'+n+': неизвестный вид '+kind);
 const trigger=raw.trigger??null;if(trigger!==null&&trigger!=='owner-ack'&&!(typeof trigger==='string'&&trigger.startsWith('reply-to:')))throw new PolicyError('comms-policy.yaml: маршрут №'+n+': триггер «'+pyString(trigger)+'» не поддерживается');
 const bounds=truthy(raw.bounds)?raw.bounds:null;if(bounds!==null&&!object(bounds))throw new PolicyError('comms-policy.yaml: маршрут №'+n+': bounds должен быть таблицей');
 return {from:asList(truthy(raw.from)?raw.from:'*'),to:asList(truthy(raw.to)?raw.to:'*'),kinds,trigger:trigger as string|null,bounds:bounds as Record<string,unknown>|null,n}
 });
 const rawVersion=truthy(data.version)?data.version:1;
 const version=typeof rawVersion==='boolean'?Number(rawVersion):Number(rawVersion);
 if(!Number.isFinite(version)||!Number.isInteger(version))throw new PolicyError('comms-policy.yaml: version должен быть целым');
 const observe:Record<string,'*'|string[]>={};if(object(data.observe))for(const [key,value] of Object.entries(data.observe))Object.defineProperty(observe,key,{value:value==='*'?'*':asList(value),enumerable:true,writable:true,configurable:true});
 const view=new PolicySnapshot(version,pyString(truthy(data.default)?data.default:'deny'),routes,observe);
 this.view=view;this.mtime=after;this._broken=false;this._error=null;
 }catch(e){const error=e instanceof PolicyError?e:new PolicyError('comms-policy.yaml не читается: '+(e instanceof Error?e.message:String(e)));this._broken=true;this._error=error;throw error}
 }
 maybeReload():boolean {
 let mtime:number;try{mtime=statSync(this.path).mtimeMs}catch(e){const error=new PolicyError('comms-policy.yaml не читается: '+(e instanceof Error?e.message:String(e)));this._broken=true;this._error=error;throw error}
 if(this._broken||mtime!==this.mtime){this.load();return true}return false
 }
 routeFor(from:string,to:string,kind:string){return this.view.routeFor(from,to,kind)}allowedKinds(from:string,to:string){return this.view.allowedKinds(from,to)}checkSend(from:string,to:string,kind:string){return this._broken?{allow:false,pending:false,reason:'политика связи не читается; исправь comms-policy.yaml',route:null,bounds:{},trigger:null}:this.view.checkSend(from,to,kind)}
 canObserve(role:string,targetRole:string){return this.view.canObserve(role,targetRole)}summaryFor(role:string,seatRoles:Record<string,string>,labels:Record<string,string>){return this.view.summaryFor(role,seatRoles,labels)}
}
