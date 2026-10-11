#!/usr/bin/env node
import {realpath} from 'node:fs/promises';
import {TraceStore,traceId} from '@harnessy/runtime';
const [query,flag,value]=process.argv.slice(2);
try{
 if(!traceId(query)&&query!=='failed'||query==='failed'&&(flag!=='--since'||!value||!/^\d+[mhd]$/.test(value)))throw Error('Использование: node packages/api/bin/trace.ts <traceId|failed --since 2h>');
 const store=new TraceStore(await realpath(process.cwd()),()=>({enabled:false,maxBytes:128*1024*1024})),since=query==='failed'?Date.now()-Number(value!.slice(0,-1))*({m:60000,h:3600000,d:86400000}[value!.at(-1)! as 'm'|'h'|'d']):undefined;
 const all=await store.read({...since?{since}:{},...traceId(query)?{traceId:query}:{}}),ids=new Set(all.filter(row=>row.outcome==='failed').map(row=>row.traceId)),rows=query==='failed'?all.filter(row=>ids.has(row.traceId)):all;
 if(!rows.length)console.log('Записей цепочки в этом проекте нет.');
 for(const id of new Set(rows.map(row=>row.traceId))){console.log('trace:'+id+' · harnessy://trace/'+id);const spans=new Map(rows.filter(row=>row.traceId===id).map(row=>[row.spanId,row]));for(const row of spans.values()){let depth=0,parent=row.parentSpanId;const seen=new Set([row.spanId]);while(parent&&spans.has(parent)&&!seen.has(parent)&&depth<16){seen.add(parent);depth++;parent=spans.get(parent)!.parentSpanId}console.log('  '.repeat(depth)+row.kind+' · '+row.outcome+(row.durationMs===null?'':' · '+row.durationMs+' мс')+' · '+row.reason.code+(row.reason.text?' · '+row.reason.text:'')+' · '+JSON.stringify(row.refs)+(row.truncated?' · усечено':''))}}
}catch(e){console.error((e as Error).message);process.exitCode=1}
