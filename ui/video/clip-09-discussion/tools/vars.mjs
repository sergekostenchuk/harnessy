// Словарь переменных клипа №9 «Режим общения» (ru — значения по умолчанию в композициях, en — data-variable-values у хостов index.html).
// Запуск: node tools/vars.mjs ru|en — переписывает data-composition-variables в compositions/*.html; en прописывает хостам index.html data-variable-values (английский набор), ru снимает.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
export const D = {
  // панель (как в clip-01 / clip-04)
  proj:['Alpha-Test','Alpha-Test'], new:['Новый чат','New chat'], find:['Найти…','Find…'], inbox:['Входящие','Inbox'],
  g_pinned:['закреплённые','Pinned'], g_chats:['чаты · Alpha-Test','Chats · Alpha-Test'], g_solo:['чаты без проекта','Chats without project'], others:['Другие проекты','Other projects'],
  pin1:['как ты будешь решать задачи в этой папке','how will you solve tasks in this folder'], pin2:['какие задачи ты можешь решать в проекте?','what tasks can you solve in the project?'],
  chat0:['приём накладной','invoice intake'], role_orch0:['Оркестратор','Orchestrator'],
  chat1:['Кто ты? какая ты модель и чем мне можешь помочь?','Who are you? which model, and how can you help?'], chat2:['Я — Исполнитель: реализую самодостаточный модуль…','I am the Executor: building a self-contained module…'], chat3:['ты готов?','are you ready?'],
  role_orch:['Оркестратор','Orchestrator'], role_exec:['Исполнитель','Executor'],
  solo1:['как заварить кофе в турке','how to brew coffee in a cezve'], solo2:['перевод письма партнёру','translating a letter to a partner'],
  av:['А','A'], user:['Анна Ветрова','Anna Vetrova'],
  // проектная полоска (кадр A1·c)
  tab_chat:['Чат','Chat'], tab_doc:['Документы','Documents'], tab_art:['Артефакты','Artifacts'], tab_mem:['Память','Memory'], tab_res:['Исследования','Research'],
  tab_plan:['План · карта','Plan · map'], tab_path:['Путь','Path'], tab_team:['Команда агентов','Agent team'], tab_team_m:['2 роли','2 roles'], conn:['подключено','connected'],
  // лента чата
  me0:['Что сейчас делает команда?','What is the team doing now?'], th0:['думал 0,9 с','thought 0.9 s'],
  ai0:['Воркер 1 сдал TS-35, ревьюер проверяет. Прогон H1.5 на шаге 3 из 7, сбоев нет.','Worker 1 handed in TS-35, the reviewer is checking it. Run H1.5 is at step 3 of 7, no failures.'],
  me1:['а если переписать модуль приёма накладной?','what if we rewrite the invoice intake module?'], th1:['думал 1,2 с','thought 1.2 s'], dchip:['обсуждение','discussion'],
  ai1:['Можно. Плюс: один модуль вместо трёх, проще тесты. Минус: 2–3 дня и риск для импорта накладных у клиентов. Сначала посмотреть, где он используется?','We could. Pro: one module instead of three, simpler tests. Con: 2–3 days and a risk to clients’ invoice import. Shall we first see where it is used?'],
  me2:['делай','do it'], th2:['думал 0,8 с','thought 0.8 s'],
  ai2:['Начинаю: сначала тесты на приём накладной, потом сам модуль.','Starting: tests for invoice intake first, then the module itself.'],
  card_h:['Действия','Actions'], card_m:['2','2'],
  act1:['Запись файла · src/intake/invoice.test.ts','Writing file · src/intake/invoice.test.ts'], act_go:['идёт…','running…'], act1_t:['0,4 с','0.4 s'],
  act2:['Запись файла · src/intake/invoice.ts','Writing file · src/intake/invoice.ts'], act_go2:['идёт…','running…'],
  // композер варианта (в) из скетча 41
  seg_chat:['Чат','Chat'], seg_team:['Команда','Team'], cx_chat:['приём накладной','invoice intake'], cx_role:['Оркестратор','Orchestrator'],
  cx_ph:['Написать оркестратору…','Write to the orchestrator…'], cx_perm:['Всё без вопросов','Everything, no questions'], cx_tg:['Обсуждение','Discussion'], cx_eff:['Усилие: —','Effort: —'],
  status1:['папка Alpha-Test · git · ролей 2','folder Alpha-Test · git · 2 roles'], status1b:['обсуждение · проект не меняется','discussion · project unchanged'],
  status2a:['команды','commands'], status2b:['панель','panel'],
  // подписи (≤ 7 слов, одно слово коньяком)
  cap1:['*Поговорить*, не трогая проект','*Talk* it over, hands off the project'],
  cap2:['Помощник только *обсуждает*. Ничего не меняет','Assistant only *discusses*. Changes nothing'],
  cap3:['Плюсы, минусы, *вопрос* — без действий','Pros, cons, a *question* — no actions'],
  cap4:['*Выключили* — можно делать','Toggle *off* — now it can act'],
  cap5:['Сказали *«делай»* — делает','Say *“do it”* — and it does'],
  // финал и плашка
  end_name:['Harnessy','Harnessy'], end_badge:['alpha','alpha'], end_sub:['режим общения','discussion mode'], badge:['alpha','alpha'],
};
const esc = s => s.replace(/&/g,'&amp;').replace(/'/g,'&#39;');
const idsIn = html => [...new Set([...html.matchAll(/data-var-text="([^"]+)"/g)].map(m=>m[1]))];
const used = {};
for (const f of fs.readdirSync(path.join(ROOT,'compositions'))) {
  if (!f.endsWith('.html') || f.startsWith('_')) continue;
  const p = path.join(ROOT,'compositions',f); let html = fs.readFileSync(p,'utf8');
  const ids = idsIn(html); const miss = ids.filter(i=>!D[i]); if (miss.length) throw new Error(f+': нет в словаре: '+miss.join(', '));
  const m = html.match(/data-composition-id="([^"]+)"/); used[m[1]] = ids;
  const decl = ids.map(i=>({id:i,type:'string',label:i,default:D[i][0]}));
  html = html.replace(/data-composition-variables='[^']*'/, "data-composition-variables='"+esc(JSON.stringify(decl))+"'");
  // значения по умолчанию в разметке = ru из словаря
  for (const i of ids) html = html.replace(new RegExp('(data-var-text="'+i+'"[^>]*>)[^<]*','g'), '$1'+D[i][0]);
  fs.writeFileSync(p, html);
}
const mode = (process.argv[2] || 'ru').toLowerCase();
let idx = fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
idx = idx.replace(/ data-variable-values='[^']*'/g, '');
if (mode === 'en') for (const [comp, ids] of Object.entries(used)) {
  const vals = Object.fromEntries(ids.map(i=>[i,D[i][1]]));
  idx = idx.replace(new RegExp('(data-composition-id="'+comp+'" data-composition-src="[^"]+")'), "$1 data-variable-values='"+esc(JSON.stringify(vals))+"'");
}
idx = idx.replace(/<html lang="[a-z]+">/, '<html lang="'+(mode==='en'?'en':'ru')+'">');
fs.writeFileSync(path.join(ROOT,'index.html'), idx);
console.log('lang:', mode, '| vars:', Object.entries(used).map(([k,v])=>k+'='+v.length).join(' '));
