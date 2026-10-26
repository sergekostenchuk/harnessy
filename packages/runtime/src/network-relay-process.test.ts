import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {fixture,call} from '../../api/src/test-helpers.ts';
import {CLI_DESCRIPTORS} from '@harnessy/providers';
import {listen,proxy} from './network-test-helpers.ts';

// Slow integration: each id must receive a fresh process and its own preload environment.
// The child exit/HTTP response proves completion; 120 s only bounds a hung integration,
// not an acceptable machine speed. This file remains in the normal full npm test.
const cert=readFileSync(new URL('./fixtures/network-test-cert.pem',import.meta.url),'utf8'),key=readFileSync(new URL('./fixtures/network-test-key.pem',import.meta.url),'utf8');
async function save(h:Awaited<ReturnType<typeof fixture>>,id:string,url:string){return call(h.api,'/api/network/exits/'+id+'/save',{body:{config:{id,label:id,type:'proxy',url},revision:null}})}
async function chain(h:Awaited<ReturnType<typeof fixture>>,provider:string,exits:string[]){return h.runtime.settings.changeNetwork(async config=>{config.migrated=true;config.chains[provider]=exits;return {result:undefined}})}

test('22c [slow local processes]: every program catalog id receives the relay; real Node http and fetch children count CONNECT without model calls',{timeout:120000},async t=>{
 const target=http.createServer((_q,r)=>{r.setHeader('Connection','close');r.end('node')}),port=await listen(t,target),p=await proxy(t,port),h=await fixture(t,{deps:{networkRelayOptions:{timeoutMs:30000}}});await save(h,'proxy',p.url);
 for(const id of ['claude','codex',...CLI_DESCRIPTORS.map(d=>d.id)]){
  // Configure catalog ids directly so no installed program, login or model is queried.
  await h.runtime.settings.changeNetwork(async config=>{config.migrated=true;config.chains[id]=['proxy'];return {result:undefined}});
  assert.equal((await h.runtime.networkRelay.status(id)).verification,'unverified');const env=await h.runtime.networkRelay.environment(id,t.signal);assert.equal(new URL(env!.HTTPS_PROXY!).username,'harnessy');assert.match(new URL(env!.HTTPS_PROXY!).password,/^[A-Za-z0-9_-]{43}$/);const before=p.connects.length;
  const script="const http=require('node:http');http.get('http://fixture.invalid/agent',r=>{r.resume();r.on('end',async()=>{console.log(await(await fetch('http://fixture.invalid/fetch')).text());process.exit(0)})}).on('error',e=>{console.error(e);process.exit(1)});";
  const result=await new Promise<string>((resolve,reject)=>execFile(process.execPath,['-e',script],{env:{...process.env,...env},signal:t.signal},(error,out)=>error?reject(error):resolve(out)));assert.equal(result.trim(),'node',id);assert.equal(p.connects.length-before,2,id);assert.equal((await h.runtime.networkRelay.status(id)).verification,'verified');
 }
});


test('22c r2 [slow local processes]: every CLI id accepts authenticated HTTPS_PROXY in Node https and fetch doubles',{timeout:120000},async t=>{
 const target=https.createServer({cert,key},(_q,r)=>{r.setHeader('Connection','close');r.end('secure-node')}),port=await listen(t,target),p=await proxy(t,port),h=await fixture(t,{deps:{networkRelayOptions:{timeoutMs:30000}}});await save(h,'proxy',p.url);
 for(const id of ['claude','codex',...CLI_DESCRIPTORS.map(d=>d.id)]){
  await chain(h,id,['proxy']);const env=await h.runtime.networkRelay.environment(id,t.signal),before=p.connects.length;
  const script="const https=require('node:https');https.get('https://api-origin.invalid/agent',r=>{r.resume();r.on('end',async()=>{try{console.log(await(await fetch('https://api-origin.invalid/fetch')).text());process.exit(0)}catch{process.exit(1)}})}).on('error',()=>process.exit(1));";
  const output=await new Promise<string>((resolve,reject)=>execFile(process.execPath,['-e',script],{env:{...process.env,...env,NODE_EXTRA_CA_CERTS:fileURLToPath(new URL('./fixtures/network-test-cert.pem',import.meta.url))},signal:t.signal},(error,out)=>error?reject(error):resolve(out)));
  assert.equal(output.trim(),'secure-node',id);assert.equal(p.connects.length-before,2,id);assert.equal((await h.runtime.networkRelay.status(id)).verification,'verified');assert.ok(p.connects.every(c=>c.headers['proxy-authorization']===undefined));
 }
});

