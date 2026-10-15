type Versions=Record<string,string|undefined>;

/** Node children must re-enter Electron's embedded Node when the engine itself runs there. */
export function electronNodeRuntime(runtimeEnv:NodeJS.ProcessEnv=process.env,versions:Versions=process.versions):boolean{
 return typeof versions.electron==='string'&&versions.electron.length>0||runtimeEnv.ELECTRON_RUN_AS_NODE==='1'
}

/** Ordinary Node receives the exact original environment object; Electron gets only its mode flag. */
export function nodeChildEnv<T extends NodeJS.ProcessEnv>(env:T,runtimeEnv:NodeJS.ProcessEnv=process.env,versions:Versions=process.versions):T{
 if(!electronNodeRuntime(runtimeEnv,versions))return env;
 return {...env,ELECTRON_RUN_AS_NODE:'1'}
}
