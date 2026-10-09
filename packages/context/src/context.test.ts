import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {memorySections,onboarding,roleNote,handoffPrompt,transcriptText,digest,estTokens,contextWindow,contextCard,DIGEST_MARK,type SeatView,type RoleNoteDeps,type OnboardingDeps,type TranscriptMessage,type DigestViewer,type DigestPane,type CardPane,type CardDeps} from './index.ts';
import {pythonRound} from './tokens.ts';
interface Golden {
 memory:{text:string;expected:[string,string][]}[];
 roleNotes:{name:string;seat:SeatView;deps:RoleNoteDeps;expected:string}[];
 onboarding:{name:string;seat:SeatView;how:string;deps:Omit<OnboardingDeps,'now'>&{now:string};expected:string}[];
 transcripts:{transcript:TranscriptMessage[];limit:number;expected:string}[];
 digests:{name:string;viewer:DigestViewer;others:DigestPane[];allowed:string[];expected:{text:string;nextSeen:Record<string,number>}}[];
 cards:{name:string;pane:CardPane;deps:CardDeps;expected:unknown}[];
 rounds:{value:number;digits:number;expected:number}[]
}
const golden=JSON.parse(readFileSync(new URL('./fixtures/python.json',import.meta.url),'utf8')) as Golden;
function freeze<T>(value:T):T {if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value)}return value}
for(const [i,c] of golden.memory.entries())test('[39] Python memory sections '+i+': placeholders, duplicate headings, order and Unicode',()=>{assert.deepEqual([...memorySections(c.text)],c.expected)});
for(const c of golden.roleNotes)test('[39] Python roleNote '+c.name,()=>{assert.equal(roleNote(freeze(c.seat),freeze(c.deps)),c.expected)});
for(const c of golden.onboarding)test('[18,39,45] Python onboarding '+c.name,()=>{const deps={...c.deps,now:new Date(c.deps.now)};assert.equal(onboarding(freeze(c.seat),c.how,freeze(deps)),c.expected)});
for(const [i,c] of golden.transcripts.entries())test('[39,46] Python transcript '+i+' with empty result skipped',()=>{assert.equal(transcriptText(freeze(c.transcript),c.limit),c.expected)});
for(const c of golden.digests)test('[29,39,46] Python digest '+c.name+' returns unconsumed nextSeen',()=>{const before=structuredClone(c.viewer);assert.deepEqual(digest(freeze(c.viewer),freeze(c.others),(_,target)=>c.allowed.includes(target)),c.expected);assert.deepEqual(c.viewer,before)});
for(const c of golden.cards)test('[21,39] Python contextCard '+c.name,()=>{assert.deepEqual(contextCard(freeze(c.pane),freeze(c.deps)),c.expected)});
for(const c of golden.rounds)test('[21,39] Python rounding '+c.value+'/'+c.digits,()=>{assert.equal(pythonRound(c.value,c.digits),c.expected)});

test('[21] model windows and estimate match test_context, including code points and unknown models',()=>{
 for(const [model,size] of [['claude-haiku-4-5-20251001',200000],['gpt-5.3-codex-spark',128000],['gpt-6-astra',400000],['qwen3-coder:cloud',128000],['GLM-test',128000],['prefix/kimi-test',256000],['deepseek-test',128000],['mystery-model',null],['',null]] as const)assert.equal(contextWindow(model),size);
 assert.equal(estTokens(''),0);assert.equal(estTokens('а'.repeat(32)),11);assert.equal(estTokens('😀'.repeat(32)),11)
});
test('[39] handoff prompt retains the source label and room phrase',()=>{
 assert.equal(handoffPrompt({id:'room',label:'другое имя'}),'Прочитай контекст чата от разговора без роли и жди команду.');assert.equal(handoffPrompt({id:'reviewer',label:'Юрист'}),'Прочитай контекст чата от Юрист и жди команду.')
});
test('[29,39] denied digest never reads a forbidden transcript and disabled digest never observes',()=>{
 const hidden:DigestPane={id:'hidden',label:'hidden',vendor:'codex',model:'gpt',mode:'ask',get transcript():readonly TranscriptMessage[]{throw Error('forbidden transcript')}};
 assert.deepEqual(digest({id:'me',digest:true,seen:{}},[hidden],()=>false),{text:'',nextSeen:{}});
 assert.deepEqual(digest({id:'me',digest:false,seen:{hidden:1}},[hidden],()=>{throw Error('must not observe')}),{text:'',nextSeen:{hidden:1}})
});
test('[39] digest preserves the historical block budget rather than clipping the entire result',()=>{
 const c=golden.digests.find(c=>c.name==='limit')!,r=digest(c.viewer,c.others,()=>true);assert.equal(r.text,c.expected.text);assert.ok([...r.text].length>6000);assert.ok(r.text.startsWith(DIGEST_MARK));assert.equal(r.nextSeen.a,9);assert.equal(r.nextSeen.b,undefined)
});
