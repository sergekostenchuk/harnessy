import {access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {homedir} from 'node:os';
import {FORBIDDEN_ENV,type RouteEnv,type BuiltinVendor} from './types.ts';
const PROXIES=['HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','https_proxy','http_proxy','all_proxy','NO_PROXY','no_proxy','NODE_OPTIONS','NODE_USE_ENV_PROXY','HARNESS_RELAY_PROXY'] as const;
export function childEnv(vendor:BuiltinVendor,route:RouteEnv={},base:NodeJS.ProcessEnv=process.env):NodeJS.ProcessEnv{
 const env={...base};
 for(const key of PROXIES)if(typeof route[key]==='string')env[key]=route[key];
 for(const key of FORBIDDEN_ENV[vendor])delete env[key];
 // Bridge credentials never belong to an agent process.
 delete env.PANE_TOKEN;return env;
}
export async function claudeBinary(env:NodeJS.ProcessEnv=process.env):Promise<string|null>{
 for(const path of [env.CLAUDE_BIN,homedir()+'/.local/bin/claude',homedir()+'/.claude/local/claude','/opt/homebrew/bin/claude','/usr/local/bin/claude']){
  if(!path)continue;try{await access(path,constants.X_OK);return path}catch{}
 }return null;
}
