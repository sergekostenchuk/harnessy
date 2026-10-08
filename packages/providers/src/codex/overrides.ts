import {readFile,access} from 'node:fs/promises';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {parse,stringify} from 'smol-toml';
import {ProviderError,type Seat,type TurnContext,record} from '../types.ts';
export const BASE_OVERRIDES=['features.hooks=false','features.multi_agent=false','features.apps=false','features.memories=false','features.plugins=false','features.browser_use=false','features.computer_use=false','project_doc_max_bytes=0','notify=[]'];
export function tomlValue(value:unknown):string{
 if(record(value))return '{'+Object.entries(value).map(([key,v])=>JSON.stringify(key)+'='+tomlValue(v)).join(',')+'}';
 if(value===undefined||value===null)throw new ProviderError('protocol','invalid TOML override value');
 return stringify({value}).trim().replace(/^value\s*=\s*/,'')
}
export function configServers(text:string):string[]{
 let cfg:unknown;try{cfg=parse(text)}catch{throw new ProviderError('protocol','invalid codex config TOML')}
 if(!record(cfg))throw new ProviderError('protocol','invalid codex config');const servers=cfg.mcp_servers;
 if(servers===undefined)return [];if(!record(servers))throw new ProviderError('protocol','invalid mcp_servers');
 return Object.keys(servers)
}
export async function userServers():Promise<string[]>{
 try{return configServers(await readFile(homedir()+'/.codex/config.toml','utf8'))}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e}
}
export async function sparkRouter():Promise<string[]|null>{
 const dir=homedir()+'/.codex/tools/sol-spark-router';try{await access(dir+'/.venv/bin/python');await access(dir+'/server.py');return [dir+'/.venv/bin/python',dir+'/server.py']}catch{return null}
}
// Имя таблицы в -c: голый ключ TOML без кавычек, если имя из [A-Za-z0-9_-]; иначе в кавычках. Codex 0.160.0 отвергает
// `mcp_servers."node_repl".enabled=false` («invalid transport»: кавычки создают новую пустую запись) — найдено живой пробой 09.10.2026.
export function tomlKey(name:string):string{return /^[A-Za-z0-9_-]+$/.test(name)?name:JSON.stringify(name)}
export function overrides(seat:Seat,ctx:TurnContext,token:string,servers:string[],router:string[]|null=null):string[]{
 const bridge=fileURLToPath(new URL('../../bin/pane-mcp.mjs',import.meta.url));
 const env={PANE_ID:seat.id,APP_URL:ctx.appUrl,SEATS:ctx.peers.map(p=>p.id+':'+p.label).join(';').replaceAll('"',''),PANE_TOKEN:token};
 const out=[...BASE_OVERRIDES,...servers.filter(n=>n!=='panes'&&n!=='sol-spark-router').map(n=>'mcp_servers.'+tomlKey(n)+'.enabled=false'),
 'mcp_servers.panes.enabled=true','mcp_servers.panes.command='+tomlValue(process.execPath),'mcp_servers.panes.args='+tomlValue([bridge]),'mcp_servers.panes.env='+tomlValue(env)];
 out.push('sandbox_workspace_write.writable_roots='+tomlValue(ctx.writableRoots));
 if(router)out.push('mcp_servers.sol-spark-router.enabled=true','mcp_servers.sol-spark-router.command='+tomlValue(router[0]),'mcp_servers.sol-spark-router.args='+tomlValue([router[1]]),'mcp_servers.sol-spark-router.startup_timeout_sec=20','mcp_servers.sol-spark-router.tool_timeout_sec=3600');
 return out
}
export function argumentsFor(overrides:string[]):string[]{return ['app-server',...overrides.flatMap(v=>['-c',v])]}
