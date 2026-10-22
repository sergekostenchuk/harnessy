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

test('TS-36A: persistent mode rail releases, restores and keeps its selected mode',async()=>{
 const storage=new Map<string,string>(),first=view('01-chat.html',storage);
 assert.deepEqual(first.document.querySelectorAll('.rail [data-ps2-mode]').map(node=>node.getAttribute('title')),['Чаты','Входящие','Проект','Команда']);
 assert.ok(first.document.querySelector('.rail [data-ps2-search]'));assert.ok(first.document.querySelector('.rail [data-go="set"]'));assert.ok(first.document.querySelector('.rail .ps2-ring'));
 let accepted=0;const release=first.document.createElement('button');release.className='release-gate';release.addEventListener('click',()=>accepted++);first.body.appendChild(release);await release.emit('click');assert.equal(accepted,1);assert.equal(first.html.dataset.ps2Mode,'chats');assert.equal(first.html.dataset.ps2Panel,'open');assert.equal(release.closest('[data-ps2-action-mode]'),null);
 await first.find('.rail [data-ps2-mode="team"]').emit('click');assert.equal(first.html.dataset.ps2Mode,'team');assert.equal(first.html.dataset.ps2Panel,'open');assert.equal(storage.get('harnessy-side-mode-v2'),'team');
 await first.find('[data-ps2-release]').emit('click');assert.equal(first.html.dataset.ps2Panel,'closed');assert.equal(storage.get('harnessy-side-panel-v2'),'closed');
 await first.find('.rail [data-ps2-profile]').emit('click');assert.equal(first.find('.rail>.ps-foot').classList.contains('open'),true);assert.match(first.find('.rail .ps2-menu').textContent,/Профиль.*Подключения.*Автопилот.*Журнал.*Клавиши/);
 const restored=view('01-chat.html',storage);assert.equal(restored.html.dataset.ps2Mode,'team');assert.equal(restored.html.dataset.ps2Panel,'closed');
 await restored.find('.rail [data-ps2-mode="team"]').emit('click');assert.equal(restored.html.dataset.ps2Panel,'open');assert.match(restored.find('.ps2-mode').textContent,/Команда агентов/);
});

test('TS-36A: live sidebar exposes honest current counts, states and missing foreign-project data',async()=>{
 const v=view();v.context.PS2.setData({live:true,project:{name:'alpha',path:'/projects/alpha',repo:true},inbox:{need:3,info:2},pinned:[{kind:'chat',id:'foreign',path:'/projects/beta',current:false,title:'из beta',label:'Исполнитель'}],chats:[{id:'a',pane:'lead',title:'строю',role:'Оркестратор',state:'busy'},{id:'b',pane:'worker',title:'жду',role:'Исполнитель',state:'wait'},{id:'c',pane:'review',title:'ошибка',role:'Ревьюер',state:'err'}],rooms:[],projects:[{name:'alpha',path:'/projects/alpha',current:true,seats:3},{name:'beta',path:'/projects/beta',current:false,seats:2}],sections:{docs:7,artifacts:3,memory:12,research:2},profile:{name:'Владелец',email:''},limits:[{name:'Claude',remaining:64,period:'W'}]});
 assert.equal(v.find('.rail [data-ps2-mode="inbox"] .b').textContent,'3');assert.ok(v.document.querySelector('.ps-chat.busy'));assert.ok(v.document.querySelector('.ps-chat.wait'));assert.ok(v.document.querySelector('.ps-chat.err'));
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

test('TS-36A: desktop and phone CSS keep the 56px rail without horizontal overflow',()=>{
 assert.match(css,/grid-template-columns:56px 280px minmax\(0,1fr\)/);assert.match(css,/grid-template-columns:56px minmax\(0,1fr\)/);assert.match(css,/\.ps2-mode \.newbtn\{display:flex;[^}]*height:34px/);assert.match(css,/\.ps2-mode \.newbtn svg[^}]*width:16px;height:16px/);assert.match(css,/@media\(max-width:759px\)/);assert.match(css,/max-width:100vw/);assert.match(css,/sidebar-v2/);
});
