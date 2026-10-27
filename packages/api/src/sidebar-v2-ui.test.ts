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
 let timerSeq=0;const timers=new Map<number,{fn:()=>void;ms:number}>();
 const location:any={pathname:'/sketches/proto/'+file,hash:'',href:''};
 const context:any={document:d.document,location,history:{replaceState(_state:any,_title:string,href:string){location.hash=href}},localStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)},sessionStorage:{getItem:()=>null,setItem(){}},innerWidth:1440,innerHeight:900,matchMedia:()=>({matches:false}),setTimeout:(fn:()=>void,ms:number)=>{const id=++timerSeq;timers.set(id,{fn,ms});return id},clearTimeout:(id:number)=>{timers.delete(id)},CustomEvent:class {detail:any;defaultPrevented=false;type:string;constructor(type:string,options:any={}){this.type=type;this.detail=options.detail}preventDefault(){this.defaultPrevented=true}},dispatchEvent(){return true},addEventListener:d.window.addEventListener.bind(d.window)};
 context.window=context;runInContext(sidebarSource,createContext(context),{timeout:2000});
 const find=(selector:string)=>{const node=d.document.querySelector(selector);assert.ok(node,selector);return node};
 return {...d,context,location,storage,find,timers};
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
test('TS-47.5 F14: role count comes from the project seats, not chat rows',async()=>{
 const v=view();v.context.PS2.setData({live:true,project:{name:'A',path:'/a'},roles:2,chatTotal:1,chats:[{id:'a',pane:'worker'},{id:'',pane:'empty-role'}]});assert.match(v.find('.ps2-current-project').textContent,/A2 роли/);
 await v.find('[data-ps2-release]').emit('click');await v.find('[data-ps2-mode="team"]').emit('click');assert.match(v.find('.ps2-pcard').textContent,/2 роли · 1 чат/);
 v.context.PS2.setData({chatTotal:4,chats:[{id:'a',pane:'worker'},{id:'b',pane:'worker'},{id:'c',pane:'worker'},{id:'d',pane:'worker'}]});assert.match(v.find('.ps2-pcard').textContent,/2 роли · 4 чата/);
 v.context.PS2.setWorkspace({project:{name:'A',path:'/a'},roles:3});assert.match(v.find('.ps2-pcard').textContent,/3 роли · 4 чата/);
 v.context.PS2.setWorkspace({project:{name:'B',path:'/b'}});assert.match(v.find('.ps2-pcard').textContent,/нет данных/);assert.doesNotMatch(v.find('.ps2-pcard').textContent,/3 роли/);
});

test('TS-36A: standalone and project chats use different headers, including Path and Team tabs',()=>{
 const fresh=view('10-new-chat.html');assert.ok(fresh.document.querySelector('.ps2-top'));assert.equal(fresh.document.querySelector('.ps2-tabs'),null);assert.match(fresh.find('.ps2-top').textContent,/Новый чат.*без проекта.*В проект/);
 const project=view('01-chat.html'),main=project.find('.main'),tabs=project.find('.ps2-tabs');assert.match(tabs.textContent,/Чат.*Документы.*Артефакты.*Память.*Исследования.*План · карта.*Путь.*Команда агентов/);tabs.setAttribute('data-ps2-workhead','');
 project.context.PS2.setWorkspace({noProject:true});const direct=main.children.filter(node=>node.tagName!=='#TEXT');assert.equal(direct.some(node=>node.classList.contains('ps2-tabs')),false);const standalone=direct.find(node=>node.classList.contains('ps2-top'));assert.ok(standalone);assert.match(standalone.textContent,/Чат.*без проекта.*В проект/);
});

test('TS-41: desktop uses 232px panel or 60px rail; phone keeps a single column',()=>{
 assert.match(css,/grid-template-columns:232px minmax\(0,1fr\)/);assert.match(css,/grid-template-columns:60px minmax\(0,1fr\)/);assert.match(css,/\.ps2-mode \.newbtn\{display:flex;[^}]*height:34px/);assert.match(css,/\.ps2-mode \.newbtn svg[^}]*width:16px;height:16px/);assert.match(css,/@media\(max-width:759px\)/);assert.match(css,/max-width:100vw/);assert.match(css,/sidebar-v2/);
});


test('TS-43: project folder click and arrow expand saved chats, persist and never switch; double click has a separate switch action',async()=>{
 const storage=new Map<string,string>(),v=view('01-chat.html',storage),events:any[]=[];v.context.dispatchEvent=(e:any)=>{events.push(e);return true};
 const data={projects:[{path:'/a',name:'alpha',current:true,chats:[]},{path:'/b',name:'beta',current:false,chats:[{id:'b1',pane:'worker',title:'Проверить договор'}]}]};v.context.PS2.setData(data);await v.find('[data-ps2-others]').emit('click');
 const row=v.find('[data-ps2-project-path="/b"]');await row.emit('click');assert.equal(v.find('[data-ps2-project-chats="/b"] [data-pin-chat="b1"]').dataset.pinPath,'/b');assert.equal(row.getAttribute('aria-expanded'),'true');assert.equal(events.length,0);
 assert.equal(v.find('[data-ps2-project-path="/b"]'),row,'keep original row for native double click');
 const restored=view('01-chat.html',storage);restored.context.PS2.setData(data);await restored.find('[data-ps2-others]').emit('click');assert.match(restored.find('[data-ps2-project-chats="/b"]').textContent,/Проверить договор/);
 await row.querySelector('.pm')!.emit('click');assert.equal(v.document.querySelector('[data-ps2-project-chats="/b"]'),null);assert.equal(events.length,0);
 await row.emit('dblclick');assert.equal(events.at(-1).type,'ps2:project-page');assert.equal(events.at(-1).detail.path,'/b');assert.equal(events.at(-1).detail.key,'chat');
});

test('TS-43: folder distinguishes no chats from unreadable snapshot and escapes titles',async()=>{
 const v=view();v.context.PS2.setData({projects:[{path:'/empty',name:'empty',chats:[]},{path:'/broken',name:'broken',chats:null,chatError:'Не удалось прочитать чаты проекта'},{path:'/markup',name:'markup',chats:[{id:'x',pane:'worker',title:'<img src=x onerror=bad()>'}]}]});await v.find('[data-ps2-others]').emit('click');
 for(const path of ['/empty','/broken','/markup'])await v.find('[data-ps2-project-path="'+path+'"]').emit('click');
 assert.match(v.find('[data-ps2-project-chats="/empty"]').textContent,/чатов пока нет/);assert.match(v.find('[data-ps2-project-chats="/broken"]').textContent,/Не удалось прочитать/);assert.equal(v.document.querySelector('[data-ps2-project-chats="/markup"] img'),null);
});


test('TS-43: live sidebar redraw preserves pending 150 ms menu close',async()=>{
 const v=view();v.context.PS2.setData({projects:[{path:'/b',name:'beta',chats:[]}]});await v.find('[data-ps2-others]').emit('click');await v.find('[data-ps2-project-menu]').emit('click');assert.ok(v.document.querySelector('.ps2-flyout'));
 await v.find('.ps2-flyout').emit('mouseout',{relatedTarget:v.body});assert.equal(v.timers.size,1);const pending=[...v.timers.values()][0]!;assert.equal(pending.ms,150);
 v.context.PS2.setInbox({need:1,info:2});assert.equal(v.timers.size,1);assert.equal([...v.timers.values()][0],pending);pending.fn();assert.equal(v.document.querySelector('.ps2-flyout'),null);
});


test('TS-43: background redraw keeps a mobile project menu bound to its drawer, not the hidden desktop copy',async()=>{
 const v=view(),drawer=v.document.createElement('nav');drawer.className='m-drawer';drawer.innerHTML='<div data-ps2-mobile-projects></div>';v.body.appendChild(drawer);Object.assign(v.context,{innerWidth:390,mobileNav(){},mobileDefaults(){}});
 v.context.PS2.setData({projects:[{path:'/b',name:'beta',chats:[]}]});await v.find('.m-drawer [data-ps2-others]').emit('click');await v.find('.m-drawer [data-ps2-project-menu]').emit('click');
 assert.ok(v.find('.m-drawer [data-ps2-project-path="/b"]').classList.contains('open'));v.context.PS2.setInbox({need:1,info:0});
 assert.ok(v.find('.m-drawer [data-ps2-project-path="/b"]').classList.contains('open'));assert.equal(v.document.querySelector('aside [data-ps2-project-path="/b"]'),null,'mobile layout keeps projects in the drawer, not a duplicate panel');assert.ok(v.document.querySelector('.ps2-flyout'));
});

test('TS-44: layout keeps fixed viewport geometry and switches narrow desktop to rail',async()=>{
 const v=view();const frame=v.find('.frame'),app=v.find('.app');
 v.context.PS2.render();assert.equal(app.style.width,'1440px');assert.equal(app.style.height,'900px');assert.equal(app.style.transform,'none');
 v.context.innerWidth=1050;v.context.PS2.render();assert.ok(v.document.querySelector('aside.rail'));assert.equal(frame.style.width,'1050px');await v.find('[data-ps2-mode="inbox"]').emit('click');assert.equal(v.location.href,'44-inbox.html');
 v.context.innerWidth=1100;v.context.PS2.render();assert.ok(v.document.querySelector('aside.ps2-mode'));assert.equal(app.style.transform,'none');
});
test('TS-44: sidebar delegated controls are keyboard reachable and activate by Enter',async()=>{
 const v=view();const button=v.find('[data-ps2-search]');assert.equal(button.getAttribute('tabindex'),'0');assert.equal(button.getAttribute('role'),'button');
 let clicks=0;(button as any).click=()=>button.emit('click');button.addEventListener('click',()=>clicks++);await button.emit('keydown',{key:'Enter',preventDefault(){}});assert.equal(clicks,1);
});

test('TS-44: per-seat active chats do not all become the selected sidebar chat',()=>{
 const start=readFileSync(new URL('../../../ui/deploy/live.js',import.meta.url),'utf8');const chunk=start.slice(start.indexOf('      const liveChats='),start.indexOf('      const projects=',start.indexOf('      const liveChats=')));
 const context:any={S:{ui:{pane:'worker'}},H:{active:{worker:'w',lead:'l'},panes:[{id:'worker'},{id:'lead'},{id:'room'}]},seats:[{id:'worker'},{id:'lead'}],all:[{id:'w',pane:'worker',active:true},{id:'l',pane:'lead',active:true},{id:'r',pane:'room',active:true}],rooms:[{id:'r',pane:'room',active:true}],pins:[{kind:'chat',chat:'w',current:true,path:'/a'}],paneName:(p:any)=>p.id,point:()=>'',base:()=>'',};
 runInContext(chunk+';globalThis.selected=[...liveChats,...roomRows,...pinRows].filter(row=>row.active).map(row=>row.id)',createContext(context));assert.deepEqual(JSON.parse(JSON.stringify(context.selected)),['w']);
});


test('TS-44 rebase: keyboard opens the TS-43 project folder once and preserves its chats',async()=>{
 const v=view(),data={projects:[{path:'/b',name:'beta',current:false,chats:[{id:'b1',pane:'worker',title:'Проверить договор'}]}]};v.context.PS2.setData(data);await v.find('[data-ps2-others]').emit('click');
 const row=v.find('[data-ps2-project-path="/b"]');(row as any).click=()=>row.emit('click');
 await row.emit('keydown',{key:'Enter',preventDefault(){}});assert.equal(row.getAttribute('aria-expanded'),'true');assert.equal(v.find('[data-ps2-project-chats="/b"] [data-pin-chat="b1"]').dataset.pinPath,'/b');
 await row.emit('keydown',{key:' ',preventDefault(){}});assert.equal(row.getAttribute('aria-expanded'),'false');assert.equal(v.document.querySelector('[data-ps2-project-chats="/b"]'),null);
});


test('TS-44 r2: sidebar redraw keeps focus on its project/chat identity, never a foreign chat with the same id',async()=>{
 const v=view(),chat={id:'same-id',pane:'worker',title:'Первый чат',active:true};
 v.context.PS2.setData({project:{path:'/a',name:'A'},chats:[chat]});v.find('[data-chat="same-id"]').focus();
 v.context.PS2.setInbox({need:1,info:1});assert.equal(v.document.activeElement,v.find('[data-chat="same-id"]'));
 v.context.PS2.setData({chats:[{id:'second',pane:'reviewer',title:'Соседний'},chat]});const current=v.find('[data-chat="same-id"]');assert.equal(v.document.activeElement,current);
 let clicks=0;(current as any).click=()=>current.emit('click');current.addEventListener('click',()=>clicks++);await current.emit('keydown',{key:'Enter'});assert.equal(clicks,1);
 v.context.PS2.setData({project:{path:'/b',name:'B'},chats:[chat]});assert.notEqual(v.document.activeElement,v.find('[data-chat="same-id"]'));
});

test('TS-48.2: current folder owns active chats and persists expansion by project without changing the role count',async()=>{
 const storage=new Map<string,string>(),v=view('01-chat.html',storage),a={name:'Проект A',path:'/a'},b={name:'Проект B',path:'/b'};
 const chats=[{id:'a1',pane:'worker',title:'Первый',active:true},{id:'a2',pane:'lead',title:'Второй'}];
 v.context.PS2.setData({live:true,project:a,roles:2,chatTotal:2,chats,rooms:[{id:'solo',pane:'room',title:'Без проекта'}],projects:[{...a,current:true},{...b,current:false}]});
 let toggle=v.find('.ps2-current-toggle'),body=v.find('.ps2-current-chats');assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(body.hasAttribute('hidden'),false);assert.ok(body.querySelector('[data-chat="a1"].act'));assert.equal(body.querySelector('[data-chat="solo"]'),null);assert.match(v.find('.ps2-current-project .m').textContent,/2 роли/);
 await toggle.emit('click');assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(body.hasAttribute('hidden'),true);await toggle.emit('keydown',{key:'ArrowRight'});assert.equal(toggle.getAttribute('aria-expanded'),'true');await toggle.emit('keydown',{key:'ArrowLeft'});assert.equal(toggle.getAttribute('aria-expanded'),'false');
 v.context.PS2.setData({chatTotal:5,chats:[...chats,{id:'a3',pane:'worker'},{id:'a4',pane:'worker'},{id:'a5',pane:'worker'}]});assert.match(v.find('.ps2-current-project .m').textContent,/2 роли/);assert.equal(v.find('.ps2-current-chats').hasAttribute('hidden'),true);
 v.context.PS2.setData({project:b,roles:1,chats:[{id:'b1',pane:'worker'}]});assert.equal(v.find('.ps2-current-toggle').getAttribute('aria-expanded'),'true');assert.ok(v.find('.ps2-current-chats [data-chat="b1"]'));
 v.context.PS2.setData({project:a,roles:2,chats});assert.equal(v.find('.ps2-current-toggle').getAttribute('aria-expanded'),'false');const restored=view('01-chat.html',storage);restored.context.PS2.setData({project:a,roles:2,chats,live:true});assert.equal(restored.find('.ps2-current-chats').hasAttribute('hidden'),true);
});

test('TS-48.2: current project menu is keyboard accessible and survives counter updates, including on the phone',async()=>{
 const v=view(),drawer=v.document.createElement('nav');drawer.className='m-drawer';drawer.innerHTML='<div data-ps2-mobile-projects></div>';v.body.appendChild(drawer);Object.assign(v.context,{innerWidth:390,innerHeight:844,mobileNav(){},mobileDefaults(){}});
 v.context.PS2.setData({live:true,project:{name:'Проект A',path:'/a'},roles:2,chats:[{id:'a1',pane:'worker',active:true}]});
 const row=v.find('.m-drawer .ps2-current-project');(row as any).getBoundingClientRect=()=>({left:16,right:232,top:30,bottom:64,width:216,height:34});const trigger=v.find('.m-drawer .ps2-current-menu');trigger.focus();await trigger.emit('click');
 let menu=v.find('.ps2-flyout'),items=menu.querySelectorAll('[role=menuitem]');assert.ok(items.length>1);assert.equal(v.document.activeElement,items[0]);assert.equal(trigger.getAttribute('aria-expanded'),'true');assert.equal(menu.getAttribute('role'),'menu');assert.ok(parseFloat(menu.style.left??'NaN')>=0);assert.ok(parseFloat(menu.style.left??'NaN')+parseFloat(menu.style.width??'NaN')<=390);assert.ok(parseFloat(menu.style.top??'NaN')>=0);
 await items[0]!.emit('keydown',{key:'ArrowDown'});assert.equal(v.document.activeElement,items[1]);v.context.PS2.setData({roles:3});menu=v.find('.ps2-flyout');items=menu.querySelectorAll('[role=menuitem]');assert.equal(v.document.activeElement,items[1]);assert.match(v.find('.m-drawer .ps2-current-project .m').textContent,/3 роли/);assert.equal(v.find('.m-drawer .ps2-current-menu').getAttribute('aria-expanded'),'true');await v.find('.m-drawer .ps2-current-project .m').emit('click');assert.ok(v.document.querySelector('.ps2-flyout'));assert.equal(v.find('.m-drawer .ps2-current-toggle').getAttribute('aria-expanded'),'true');
 await items[1]!.emit('keydown',{key:'Escape'});assert.equal(v.document.querySelector('.ps2-flyout'),null);assert.equal(v.document.activeElement,v.find('.m-drawer .ps2-current-menu'));assert.equal(v.find('.m-drawer .ps2-current-menu').getAttribute('aria-expanded'),'false');
 const events:any[]=[];v.context.LIVE={};v.context.dispatchEvent=(event:any)=>{events.push(event);return true};await v.find('.m-drawer .ps2-current-menu').emit('click');await v.find('.ps2-flyout [data-go="chat"]').emit('click');assert.equal(v.document.querySelector('.ps2-flyout'),null);assert.equal(events.at(-1).type,'ps2:project-page');assert.equal(events.at(-1).detail.path,'/a');assert.equal(events.at(-1).detail.key,'chat');
});
