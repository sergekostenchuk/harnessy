import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {GitOps,execute} from './gitops.ts';
import {openProjectGit,writableRoots} from './project.ts';
import {temp,repo,git,failure,response} from './test-support.ts';
import type {Seat} from '@harnessy/team';
const seat:Seat={id:'executor',role:'executor',label:'воркер',vendor:'codex',model:'model',mode:'ask',digest:false,writePaths:[],instructions:null,worktree:'.worktrees/executor'};
test('[10-12,22] real worktree ownership, branch, symlink boundary and repeated opening',async()=>{
 const t=temp(),outside=temp(),g=new GitOps();try{
 git(t.root,'init','-q','-b','main');assert.equal((await g.ensureWorktree(t.root,'executor','.worktrees/executor','main')).note,'нет ветки main: сделай первый коммит, потом worktree появятся');repo(t.root);
 const opened=await openProjectGit(t.root,[seat,{...seat,id:'orchestrator',worktree:null}],'main',g);assert.deepEqual(opened.lineErrors,[]);assert.equal(opened.branchBySeat.executor,'seat/executor');assert.equal(opened.cwdBySeat.orchestrator,t.root);
 assert.deepEqual((await openProjectGit(t.root,[seat],'main',g)).worktreeBySeat, {executor:join(t.root,'.worktrees/executor')});
 assert.match(readFileSync(join(t.root,'.git/info/exclude'),'utf8'),/\.worktrees\//);assert.deepEqual(writableRoots(t.root,true),[join(t.root,'.git'),join(t.root,'.harness/evidence')]);assert.deepEqual(writableRoots(null,true),[]);
 const wt=opened.cwdBySeat.executor!;git(wt,'checkout','-q','--detach');assert.match((await g.ensureWorktree(t.root,'executor','.worktrees/executor','main')).note!,/не worktree этого репозитория/);git(wt,'checkout','-q','seat/executor');
 const foreign=join(t.root,'foreign');mkdirSync(foreign);repo(foreign);assert.match((await g.ensureWorktree(t.root,'foreign','foreign','main')).note!,/не worktree этого репозитория/);
 mkdirSync(join(t.root,'plain'));assert.match((await g.ensureWorktree(t.root,'plain','plain','main')).note!,/не worktree/);
 symlinkSync(outside.root,join(t.root,'outside'),'dir');assert.equal((await g.ensureWorktree(t.root,'outside','outside/new','main')).note,'worktree outside/new вне проекта');
 const nested=join(t.root,'plain'),o=await openProjectGit(nested,[seat],'main',g);assert.equal(o.repoRoot,null);assert.ok(o.lineErrors.some(x=>x.includes('чужого git-репозитория')));
 }finally{t.close();outside.close()}
});
test('[13,14,25,34] merge validates parents, repeated merge is idempotent, tracked dirt and conflict refuse',async()=>{
 const t=temp(),g=new GitOps();try{const base=repo(t.root);git(t.root,'checkout','-qb','feature');writeFileSync(join(t.root,'feature.txt'),'feature');git(t.root,'add','.');git(t.root,'commit','-qm','feature');const sha=git(t.root,'rev-parse','HEAD');
 assert.equal((await g.mergeInto(t.root,sha,'main','merge')).ok,false);git(t.root,'checkout','-q','main');
 assert.equal(await g.mergeCommitFor(t.root,sha,'main'),null);writeFileSync(join(t.root,'base.txt'),'dirty');const dirty=await g.mergeInto(t.root,sha,'main','merge');assert.equal(dirty.ok,false);git(t.root,'checkout','--','base.txt');
 assert.equal((await g.mergeInto(t.root,'deadbeef','main','merge')).ok,false);writeFileSync(join(t.root,'untracked.txt'),'allowed');const merged=await g.mergeInto(t.root,sha,'main','merge');assert.equal(merged.ok,true);if(!merged.ok)return;
 assert.deepEqual(git(t.root,'rev-list','--parents','-n','1','HEAD').split(' '),[merged.mergeSha,base,sha]);assert.equal(await g.mergeCommitFor(t.root,sha,'main'),merged.mergeSha);
 const repeat=await g.mergeInto(t.root,sha,'main','again');assert.equal(repeat.ok&&repeat.alreadyMerged,true);assert.equal(git(t.root,'rev-parse','HEAD'),merged.mergeSha);
 git(t.root,'checkout','-qb','conflict',base);writeFileSync(join(t.root,'base.txt'),'left');git(t.root,'commit','-qam','left');const conflict=git(t.root,'rev-parse','HEAD');git(t.root,'checkout','-q','main');writeFileSync(join(t.root,'base.txt'),'right');git(t.root,'commit','-qam','right');const before=git(t.root,'rev-parse','HEAD');
 const failed=await g.mergeInto(t.root,conflict,'main','conflict');assert.ok(!failed.ok&&failed.error.startsWith('слияние не прошло, откачено:'));assert.equal(git(t.root,'rev-parse','HEAD'),before);assert.equal(git(t.root,'status','--porcelain','--untracked-files=no'),'');
 }finally{t.close()}
});
test('[25] abort failure and successful git with wrong parents never claim success',async()=>{
 const t=temp();try{for(const mode of ['abort','parents'] as const){let merged=false;const g=new GitOps(async args=>{
 if(args[0]==='rev-parse'&&args[1]==='--abbrev-ref')return response('main');if(args[0]==='status')return response();if(args[0]==='rev-parse'&&args[1]==='--verify')return response('b'.repeat(40));if(args[0]==='merge-base')return response('',1);
 if(args[0]==='rev-parse')return response((merged?'c':'a').repeat(40));if(args[0]==='merge'){if(mode==='abort')return response('',1,args[1]==='--abort'?'abort failed':'conflict');merged=true;return response()}
 return response('c'.repeat(40)+' '+'a'.repeat(40)+' '+'d'.repeat(40))});
 const r=await g.mergeInto(t.root,'bbb','main','m');assert.equal(r.ok,false);if(!r.ok)assert.match(r.error,mode==='abort'?/откат не удался: abort failed/:/слияние не подтверждено: родители/)}
 }finally{t.close()}
});
test('[26] missing tool and real bounded subprocess timeout are typed',async()=>{
 await assert.rejects(execute('/nonexistent/harnessy-tool',[],undefined,100),failure('tool_missing'));
 await assert.rejects(execute(process.execPath,['-e','setInterval(()=>{},1000)'],undefined,25),failure('tool_timeout'));
});
