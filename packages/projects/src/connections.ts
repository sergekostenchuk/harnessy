import {withPathLock} from '@harnessy/team';
import {execute} from './gitops.ts';
import {ownerPaths,readObject,writeJson,object,pythonTrim} from './files.ts';
import {orderedClone} from './compat-json.ts';
import {ProjectError} from './errors.ts';
import type {RouteConfig,RouteEnv,CheckResult,CurlRunner} from './types.ts';
export const ROUTES=['direct','proxy','iface'] as const;
const PROXY=/^(https?|socks5h?|socks4a?):\/\/[A-Za-z0-9_.@%:-]+(:\d{1,5})?\/?$/,IFACE=/^[a-z][a-z0-9]{1,14}$/,IP=/^[0-9a-fA-F.:]{3,45}$/;
const systemCurl:CurlRunner=(args,timeout)=>execute('curl',['-sS','-m',String(timeout),...args],undefined,(timeout+3)*1000);
const counter=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:0;
export class Connections {
 private path:string;private options:{curl?:CurlRunner;now?:()=>number};
 constructor(path=ownerPaths().connections,options:{curl?:CurlRunner;now?:()=>number}={}){this.path=path;this.options=options}
 private config(raw:unknown):RouteConfig {const c=object(raw)?raw:{},last=object(c.lastCheck)?c.lastCheck as unknown as CheckResult:null;
 return {route:ROUTES.includes(c.route as never)?c.route as RouteConfig['route']:'direct',proxy:String(c.proxy||''),iface:String(c.iface||''),label:String(c.label||''),expect:String(c.expect||''),lastCheck:last,state:last?.state||'not_checked',rev:counter(c.rev),seq:counter(c.seq??last?.seq)}
 }
 get(vendor:string){return this.config(readObject(this.path)[vendor])}
 async setRoute(vendor:string,route:string='direct',proxy='',iface='',label='',expect=''){return withPathLock(this.path,()=>{
 vendor=pythonTrim(vendor||'');route=pythonTrim(route||'direct');proxy=pythonTrim(proxy||'');iface=pythonTrim(iface||'');label=[...pythonTrim(label||'')].slice(0,40).join('');expect=pythonTrim(expect||'');
 const fail=(s:string):never=>{throw new ProjectError('invalid_route',s)};
 if(!/^[a-z][a-z0-9_-]{1,30}$/.test(vendor))fail('провайдер: латиница и цифры');if(!ROUTES.includes(route as never))fail('маршрут: direct, proxy или iface');
 if(route==='proxy'&&!PROXY.test(proxy))fail('прокси: адрес вида http://host:port или socks5h://host:port');if(route==='iface'&&!IFACE.test(iface))fail('интерфейс: имя вида utun4 или en0');if(expect&&!IP.test(expect))fail('ожидаемый выход: IP-адрес');
 const data=readObject(this.path),prev=this.config(data[vendor]),cur={route,proxy:route==='proxy'?proxy:'',iface:route==='iface'?iface:'',label,expect,ts:Math.floor((this.options.now?.()??Date.now())/1000)};
 const changed=prev.route!==cur.route||prev.proxy!==cur.proxy||prev.iface!==cur.iface;
 const raw={...cur,lastCheck:changed?null:prev.lastCheck,rev:prev.rev+1,seq:prev.seq};writeJson(this.path,orderedClone(data,{[vendor]:raw}));
 return {...this.config(raw),processRestartNeeded:changed}
 })}
 proxyEnv(vendor:string):RouteEnv {const c=this.get(vendor);return c.route==='proxy'&&c.proxy?Object.fromEntries(['HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','https_proxy','http_proxy','all_proxy'].map(k=>[k,c.proxy])):{} }
 async check(vendor:string):Promise<CheckResult>{
 const c=this.get(vendor),prev=c.lastCheck,curl=this.options.curl??systemCurl,via=c.route==='proxy'?['--proxy',c.proxy]:c.route==='iface'?['--interface',c.iface]:[];
 const echo=await curl([...via,'-w','\n%{time_total}','https://api.ipify.org?format=json'],10);
 const res:CheckResult={ts:Math.floor((this.options.now?.()??Date.now())/1000),route:c.route,ok:false,ip:'',country:'',ms:null,error:'',state:'failed'};
 if(echo.code!==0||!pythonTrim(echo.stdout))res.error=[...pythonTrim(echo.stderr||'нет ответа')].slice(0,200).join('');
 else{const out=echo.stdout.replace(/\n+$/,''),split=out.lastIndexOf('\n'),body=split<0?'':out.slice(0,split),timing=split<0?out:out.slice(split+1);
 try{const d:unknown=JSON.parse(body);if(!object(d))throw Error();res.ip=String(d.ip||'')}catch{res.error='ответ не разобран'}
 if(timing.trim()&&Number.isFinite(Number(timing)))res.ms=Math.trunc(Number(timing)*1000);
 if(res.ip){res.ok=true;const geo=await curl([...via,'https://ipapi.co/'+res.ip+'/json/'],6);
 if(geo.code===0)try{const d:unknown=JSON.parse(geo.stdout);if(object(d)){res.country=[...String(d.country_name||d.country||'')].slice(0,40).join('');res.city=[...String(d.city||'')].slice(0,40).join('')}}catch{}
 res.state=c.expect?res.ip===c.expect?'matches':'mismatch':prev?.ip&&prev.ip!==res.ip?'changed':'checked';if(res.state==='changed')res.prevIp=prev!.ip}
 }
 return withPathLock(this.path,()=>{
 const data=readObject(this.path),current=this.config(data[vendor]);if(current.rev!==c.rev)return {...res,state:'stale'};
 if(res.ok&&current.expect)res.state=res.ip===current.expect?'matches':'mismatch';
 res.seq=current.seq+1;const raw=object(data[vendor])?data[vendor]:{route:c.route};const next=orderedClone(raw,{lastCheck:res,seq:res.seq});writeJson(this.path,orderedClone(data,{[vendor]:next}));return res
 })
 }
}
