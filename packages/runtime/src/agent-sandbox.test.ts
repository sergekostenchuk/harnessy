import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,statSync,symlinkSync,writeFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {sandboxedShell,seatbeltProfile} from './agent-sandbox.ts';
import {agentFixture} from './agent-test-helpers.ts';
import type {CliProcessRequest} from '@harnessy/providers';

const quote=(value:string)=>"'"+value.replaceAll("'","'\\''")+"'";
const request=(cwd:string,command:string):CliProcessRequest=>({binary:'/bin/sh',args:['-c',command],cwd,env:{PATH:'/usr/bin:/bin',HOME:cwd},timeoutMs:3000,maxBytes:65536});
const ready=()=>new AbortController().signal;

test('21b sandbox: child writes through absolute, traversal and symlink paths cannot leave the workspace; external reads remain allowed',{skip:process.platform!=='darwin'},async t=>{
 const project=agentFixture(t),outside=agentFixture(t),target=join(outside.dir,'target');writeFileSync(target,'OUTSIDE_READ_ALLOWED');symlinkSync(outside.dir,join(project.dir,'escape'));
 for(const path of [target,relative(project.dir,target),'escape/target']){
  const result=await sandboxedShell(request(project.dir,'/bin/sh -c '+quote('printf changed > '+quote(path))),ready());assert.notEqual(result.code,0);assert.equal(readFileSync(target,'utf8'),'OUTSIDE_READ_ALLOWED');
 }
 const read=await sandboxedShell(request(project.dir,'cat escape/target'),ready());assert.equal(read.code,0);assert.equal(read.stdout,'OUTSIDE_READ_ALLOWED');
 const write=await sandboxedShell(request(project.dir,'printf own > result; printf temp > "$TMPDIR/result"; printf "%s" "$TMPDIR"'),ready());assert.equal(write.code,0);assert.equal(readFileSync(join(project.dir,'result'),'utf8'),'own');assert.equal(existsSync(write.stdout),false);
});

test('21b sandbox: private temporary directory is 0700 and removed on success, failure and cancellation',async t=>{
 const project=agentFixture(t);
 for(const outcome of ['success','failure','cancel']){let temporary='';const controller=new AbortController();
  const job=sandboxedShell(request(project.dir,'unused'),controller.signal,async(req,signal)=>{temporary=req.env!.TMPDIR!;assert.equal(statSync(temporary).mode&0o777,0o700);assert.equal(req.env!.TMP,temporary);assert.equal(req.env!.TEMP,temporary);assert.equal(req.binary,'/usr/bin/sandbox-exec');assert.ok(req.args[1]!.includes(project.dir));writeFileSync(join(temporary,'fixture'),'temporary');
   if(outcome==='cancel'){controller.abort();assert.equal(signal.aborted,true);throw Error('cancelled')}if(outcome==='failure')throw Error('fixture failure');return {stdout:'ok',stderr:'',code:0,signal:null};
  },{platform:'darwin'});
  if(outcome==='success')assert.equal((await job).code,0);else await assert.rejects(job);assert.ok(temporary);assert.equal(existsSync(temporary),false);
 }
});

test('21b sandbox: unavailable protection refuses without falling back to an unconfined shell',async t=>{
 const h=agentFixture(t);let launches=0;const execute=async()=>{launches++;return {stdout:'',stderr:'sandbox-exec: sandbox_init: Operation not permitted',code:1,signal:null}};
 for(const options of [{platform:'linux' as const},{binary:join(h.dir,'missing'),platform:'darwin' as const}])await assert.rejects(sandboxedShell(request(h.dir,'touch unsafe'),ready(),execute,options),{code:'sandbox_unavailable'});
 assert.equal(launches,0);await assert.rejects(sandboxedShell(request(h.dir,'touch unsafe'),ready(),execute,{platform:'darwin'}),{code:'sandbox_unavailable'});assert.equal(launches,1);assert.equal(existsSync(join(h.dir,'unsafe')),false);
});

test('21b sandbox: read-only profile prevents project and temporary writes without enabling check mode',{skip:process.platform!=='darwin'},async t=>{
 const h=agentFixture(t);for(const command of ['printf bad > denied','printf bad > "$TMPDIR/denied"'])assert.notEqual((await sandboxedShell(request(h.dir,command),ready(),undefined,{mode:'read-only'})).code,0);
 assert.equal(existsSync(join(h.dir,'denied')),false);assert.throws(()=>seatbeltProfile(h.dir+'\n','/tmp','workspace-write'),{code:'sandbox_unavailable'});
});
