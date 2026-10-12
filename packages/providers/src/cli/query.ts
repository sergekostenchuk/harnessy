import {ProviderError} from '../types.ts';
import {executeCli} from './process.ts';
import type {CliDependencies,CliProbe} from './types.ts';

/** Metadata only: literal arguments, bounded process, no credential-file access. */
export async function readCliMetadata<T>(binary:string,forbiddenEnv:readonly string[],probe:CliProbe<T>,deps:Partial<CliDependencies>={}):Promise<T>{
 const env={...(deps.env??process.env)};
 for(const key of [...forbiddenEnv,'PANE_TOKEN','PANE_ID','APP_URL','SEATS'])delete env[key];
 const timeoutMs=deps.probeTimeoutMs??15000;
 const r=await (deps.execute??executeCli)({binary,args:[...probe.command.args],...(probe.command.input!==undefined?{input:probe.command.input}:{}),cwd:deps.cwd??process.cwd(),env,timeoutMs,maxBytes:1024*1024},AbortSignal.timeout(timeoutMs));
 if(r.signal||r.code===null||!(probe.exitCodes??[0]).includes(r.code))throw new ProviderError('protocol','CLI: метаданные не прочитаны');
 try{return probe.parse(r)}catch(e){if(e instanceof ProviderError)throw e;throw new ProviderError('protocol','CLI: неверные метаданные')}
}
