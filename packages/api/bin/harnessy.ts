#!/usr/bin/env node
import {bootstrap} from '../src/bootstrap.ts';
import {RuntimeError} from '@harnessy/runtime';
const controller=new AbortController();let app:Awaited<ReturnType<typeof bootstrap>>|undefined;
const finish=(code:number)=>{process.exitCode=code;if(process.connected)process.disconnect()};
const stop=()=>{if(controller.signal.aborted)return;controller.abort();if(app)void app.close().then(()=>finish(0),e=>{console.error('[harness] завершение: '+String(e));finish(1)});else finish(0)};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
if(process.connected)process.once('disconnect',stop);
try{app=await bootstrap({signal:controller.signal})}
catch(e){if(e instanceof RuntimeError&&e.code==='cancelled')finish(0);else{console.error('[harness] запуск: '+(e instanceof Error?e.message:String(e)));finish(1)}}
