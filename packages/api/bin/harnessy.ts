#!/usr/bin/env node
import {bootstrap} from '../src/bootstrap.ts';
import {RuntimeError} from '@harnessy/runtime';
const controller=new AbortController();let app:Awaited<ReturnType<typeof bootstrap>>|undefined;
const stop=()=>{if(controller.signal.aborted)return;controller.abort();if(app)void app.close().then(()=>{process.exitCode=0},e=>{console.error('[harness] завершение: '+String(e));process.exitCode=1})};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
try{app=await bootstrap({signal:controller.signal})}
catch(e){if(e instanceof RuntimeError&&e.code==='cancelled')process.exitCode=0;else{console.error('[harness] запуск: '+(e instanceof Error?e.message:String(e)));process.exitCode=1}}
