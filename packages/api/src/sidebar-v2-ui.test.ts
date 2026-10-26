import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {dom,type DomNode} from './ui-dom-test-helpers.ts';

const proto=readFileSync(new URL('../../../ui/deploy/proto.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../../../ui/sketches/disarto/sidebar-v2.css',import.meta.url),'utf8');
const start=proto.indexOf('(function(){',proto.indexOf('/* LIVE_BOOT_END */'));
const end=proto.indexOf('  // ── навигация телефона',start);
assert.ok(start>=0&&end>start);
const sidebarSource=proto.slice(start,end).replace('/*IC*/','const IC={};')+'\n})();';

function view(file='01-chat.html',storage=new Map<string,string>()){
 const d=dom('<div class="frame"><div class="app"><aside class="side ps"></aside><section class="main"><div class="top"><b>Alpha</b></div><div class="body"></div></section></div></div>');
 Object.assign(d.document,{documentElement:d.html,body:d.body});d.html.setAttribute('data-proto','');
 const aside=d.document.querySelector('aside.side')!,parent=aside.parentElement!;
 (aside as DomNode&{after(node:DomNode):void}).after=(node:DomNode)=>{const at=parent.children.indexOf(aside),anchor=parent.children[at+1]??null;parent.insertBefore(node,anchor)};
 (d.html as DomNode&{toggleAttribute(name:string,on:boolean):void}).toggleAttribute=(name:string,on:boolean)=>on?d.html.setAttribute(name,''):d.html.removeAttribute(name);
 const location:any={pathname:'/sketches/proto/'+file,hash:'',href:''};
 const context:any={document:d.document,location,history:{replaceState(_state:any,_title:string,href:string){location.hash=href}},localStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)},sessionStorage:{getItem:()=>null,setItem(){}},innerWidth:1440,innerHeight:900,matchMedia:()=>({matches:false}),setTimeout:()=>1,clearTimeout(){},CustomEvent:class {detail:any;defaultPrevented=false;constructor(_type:string,options:any={}){this.detail=options.detail}preventDefault(){this.defaultPrevented=true}},dispatchEvent(){return true},addEventListener:d.window.addEventListener.bind(d.window)};
 context.window=context;runInContext(sidebarSource,createContext(context),{timeout:2000});
 const find=(selector:string)=>{const node=d.document.querySelector(selector);assert.ok(node,selector);return node};
 return {...d,context,location,storage,find};
}

test('TS-41: exactly one sidebar alternates panel and rail by button and Cmd+backslash, keeping data and selected mode',async()=>{
 const storage=new Map<string,string>(),first=view('01-chat.html',storage);
 const one=(v:ReturnType<typeof view>)=>assert.equal(v.document.querySelectorAll('aside.side').length,1);
 one(first);assert.equal(first.document.querySelector('.rail'),null);assert.ok(first.document.querySelector('aside.ps2-mode'));
 first.context.PS2.setInbox({need:3,info:2});await first.find('[data-ps2-release]').emit('click');one(first);
 assert.equal(first.html.dataset.ps2Panel,'closed');assert.equal(first.document.querySelector('.ps2-mode'),null);
 assert.deepEqual(first.document.querySelectorAll('.rail [data-ps2-mode]').map(node=>node.getAttribute('title')),['Чаты','Входящие','Проект','Команда']);
 assert.equal(first.find('.rail [data-ps2-mode="inbox"] .b').textContent,'3');
 await first.find('.rail [data-ps2-mode="team"]').emit('click');one(first);assert.equal(first.html.dataset.ps2Mode,'team');assert.equal(first.html.dataset.ps2Panel,'open');assert.equal(first.document.querySelector('.rail'),null);
 await first.window.emit('keydown',{key:'\\',metaKey:true,preventDefault(){}});one(first);assert.equal(first.html.dataset.ps2Panel,'closed');
 const restored=view('01-chat.html',storage);one(restored);assert.equal(restored.html.dataset.ps2Mode,'team');assert.equal(restored.html.dataset.ps2Panel,'closed');
 await restored.find('[data-ps2-expand]').emit('click');one(restored);assert.equal(restored.html.dataset.ps2Panel,'open');assert.match(restored.find('.ps2-mode').textContent,/Команда агентов/);
 await restored.window.emit('keydown',{key:'\\',metaKey:true,preventDefault(){}});assert.equal(restored.html.dataset.ps2Panel,'closed');
 restored.context.PS2.setProfile({name:'Тест',email:'',configured:true});await restored.find('.rail [data-ps2-profile]').emit('click');assert.equal(restored.find('.rail>.ps-foot').classList.contains('open'),true);
});

test('TS-36E: absent owner name links the sidebar card directly to profile settings',async()=>{
 const v=view();assert.match(v.find('.ps2-mode .ps2-prof').textContent,/Без имени/);await v.find('.ps2-mode [data-ps2-profile]').emit('click');assert.equal(v.location.href,'06-settings.html#p=profile');assert.equal(v.document.querySelector('.ps-foot.open'),null);
});

test('TS-36A: live sidebar exposes honest current counts, states and missing foreign-project data',async()=>{
 const v=view();v.context.PS2.setData({live:true,project:{name:'alpha',path:'/projects/alpha',repo:true},inbox:{need:3,info:2},pinned:[{kind:'chat',id:'foreign',path:'/projects/beta',current:false,title:'из beta',label:'Исполнитель'}],chats:[{id:'a',pane:'lead',title:'строю',role:'Оркестратор',state:'busy'},{id:'b',pane:'worker',title:'жду',role:'Исполнитель',state:'wait'},{id:'c',pane:'review',title:'ошибка',role:'Ревьюер',state:'err'}],rooms:[],projects:[{name:'alpha',path:'/projects/alpha',current:true,seats:3},{name:'beta',path:'/projects/beta',current:false,seats:2}],sections:{docs:7,artifacts:3,memory:12,research:2},profile:{name:'Владелец',email:''},limits:[{name:'Claude',remaining:64,period:'W'}]});
 assert.equal(v.find('.ps2-inbox .b').textContent,'3');assert.ok(v.document.querySelector('.ps-chat.busy'));assert.ok(v.document.querySelector('.ps-chat.wait'));assert.ok(v.document.querySelector('.ps-chat.err'));
 const pin=v.find('.ps2-mode [data-pin-chat="foreign"]');assert.equal(pin.dataset.pinPath,'/projects/beta');assert.equal(pin.dataset.cur,'0');assert.equal(pin.getAttribute('data-chat'),null);
 for(const limits of v.document.querySelectorAll('[data-spend-limits]')){assert.equal(limits.getAttribute('role'),'button');assert.equal(limits.getAttribute('tabindex'),'0');assert.equal(limits.getAttribute('data-go'),null)}
 const current=v.find('.ps2-mode .ps2-mh .ps2-pmenu').textContent;assert.match(current,/Документы7/);assert.match(current,/Артефакты3/);assert.match(current,/Память проекта12 правил/);assert.match(current,/Исследования2 вопроса/);
 await v.find('[data-ps2-others]').emit('click');const foreign=v.find('.ps2-others-list .ps2-pmenu').textContent;assert.match(foreign,/Документынет данных/);assert.match(foreign,/Память проектанет данных/);assert.doesNotMatch(foreign,/7|12 правил/);
});

test('TS-36A: absent engine data stays neutral and never masquerades as a connected sample',()=>{
 const v=view(),panel=v.find('.ps2-mode'),header=v.find('.ps2-tabs');assert.equal(v.context.PS2.state.live,false);assert.equal(v.context.PS2.state.project.path,'');assert.equal(v.context.PS2.state.chats.length,0);assert.equal(v.context.PS2.state.pinned.length,0);
 assert.doesNotMatch(panel.textContent,/Alpha-Test|Анна Ветрова|как ты будешь|ты готов/);assert.match(panel.textContent,/Без проекта|нет данных/);assert.match(panel.textContent,/Лимиты недоступны/);assert.equal(v.document.querySelector('.rail [data-ps2-mode="inbox"] .b'),null);assert.match(header.textContent,/нет связи/);assert.doesNotMatch(header.textContent,/подключено/);
});

test('TS-36A: standalone and project chats use different headers, including Path and Team tabs',()=>{
 const fresh=view('10-new-chat.html');assert.ok(fresh.document.querySelector('.ps2-top'));assert.equal(fresh.document.querySelector('.ps2-tabs'),null);assert.match(fresh.find('.ps2-top').textContent,/Новый чат.*без проекта.*В проект/);
 const project=view('01-chat.html'),main=project.find('.main'),tabs=project.find('.ps2-tabs');assert.match(tabs.textContent,/Чат.*Документы.*Артефакты.*Память.*Исследования.*План · карта.*Путь.*Команда агентов/);tabs.setAttribute('data-ps2-workhead','');
 project.context.PS2.setWorkspace({noProject:true});const direct=main.children.filter(node=>node.tagName!=='#TEXT');assert.equal(direct.some(node=>node.classList.contains('ps2-tabs')),false);const standalone=direct.find(node=>node.classList.contains('ps2-top'));assert.ok(standalone);assert.match(standalone.textContent,/Чат.*без проекта.*В проект/);
});

test('TS-41: desktop uses 232px panel or 60px rail; phone keeps a single column',()=>{
 assert.match(css,/grid-template-columns:232px minmax\(0,1fr\)/);assert.match(css,/grid-template-columns:60px minmax\(0,1fr\)/);assert.match(css,/\.ps2-mode \.newbtn\{display:flex;[^}]*height:34px/);assert.match(css,/\.ps2-mode \.newbtn svg[^}]*width:16px;height:16px/);assert.match(css,/@media\(max-width:759px\)/);assert.match(css,/max-width:100vw/);assert.match(css,/sidebar-v2/);
});
