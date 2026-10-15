import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../../../ui/deploy/program-missing.js',import.meta.url),'utf8');
const escape=(text:unknown)=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

test('TS-33: both screens render one actionable card; an invalid path leaves it visible without echoing input',async()=>{
 const calls:{path:string;body:unknown}[]=[],window:any={LIVE:{esc:escape,api:async(path:string,body:unknown)=>{calls.push({path,body});return {ok:false,error:'Это не codex. Выберите файл программы codex.'}},firstModelsDraw(){}} ,harnessy:{pickFile:async()=>'/tmp/not-codex'}};
 runInNewContext(source,{window,navigator:{clipboard:{writeText:async()=>{}}}});
 const row={id:'codex',title:'Codex',binary:'codex',installed:false,searchedPaths:['/usr/bin','/Users/person/.local/bin'],install:{command:'npm install -g @openai/codex@latest',url:'https://developers.openai.com/codex'}};
 assert.match(window.LIVE.programMissing.html(row),/Не нашли codex/);assert.match(window.LIVE.programMissing.html(row,'first-program'),/data-first-program-pick/);
 let draws=0;await window.LIVE.programMissing.choose(row,{current:()=>true,refresh:async()=>{},redraw:()=>{draws++}});
 assert.equal(calls[0]?.path,'/api/providers/codex/binary');assert.equal((calls[0]?.body as {path:string}).path,'/tmp/not-codex');assert.equal(draws,1);
 assert.match(window.LIVE.programMissing.html(row),/Это не codex/);assert.doesNotMatch(window.LIVE.programMissing.html(row),/not-codex/);
 assert.equal(window.LIVE.programMissing.html({...row,installed:true}),'');
});
