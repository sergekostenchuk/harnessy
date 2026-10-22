// Словарь переменных клипа №6 «Полотно работы команды» (ru — значения по умолчанию в композициях, en — data-variable-values у хостов index.html).
// Запуск: node tools/vars.mjs ru|en — переписывает data-composition-variables в compositions/*.html; en прописывает хостам index.html data-variable-values (английский набор), ru снимает.
// Механика скопирована из clip-01 / clip-04; EN-меню — как в clip-01 (Agent team, Orchestrator / Executor / Reviewer / Worker / Researcher / Tester).
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
export const D = {
  // панель (как в clip-01 / clip-04)
  proj:['Alpha-Test','Alpha-Test'], new:['Новый чат','New chat'], find:['Найти…','Find…'], inbox:['Входящие','Inbox'],
  g_pinned:['закреплённые','Pinned'], g_chats:['чаты · Alpha-Test','Chats · Alpha-Test'], g_solo:['чаты без проекта','Chats without project'], others:['Другие проекты','Other projects'],
  pin1:['как ты будешь решать задачи в этой папке','how will you solve tasks in this folder'], pin2:['какие задачи ты можешь решать в проекте?','what tasks can you solve in the project?'],
  chat1:['Кто ты? какая ты модель и чем мне можешь помочь?','Who are you? which model, and how can you help?'], chat2:['Я — Исполнитель: реализую самодостаточный модуль…','I am the Executor: building a self-contained module…'], chat3:['ты готов?','are you ready?'],
  role_orch:['Оркестратор','Orchestrator'], role_exec:['Исполнитель','Executor'],
  solo1:['как заварить кофе в турке','how to brew coffee in a cezve'], solo2:['перевод письма партнёру','translating a letter to a partner'],
  av:['А','A'], user:['Анна Ветрова','Anna Vetrova'],
  // проектная полоска A1·c
  tab_chat:['Чат','Chat'], tab_doc:['Документы','Documents'], tab_art:['Артефакты','Artifacts'], tab_mem:['Память','Memory'], tab_res:['Исследования','Research'], tab_plan:['План · карта','Plan · map'], tab_path:['Путь','Path'],
  tab_team:['Команда агентов','Agent team'], tab_team_m5:['5 ролей','5 roles'], tab_team_m6:['6 ролей','6 roles'], conn:['подключено','connected'],
  // чат проекта (кадр 03 скетча 41, разметка 01-chat)
  c_me1:['Что сейчас делает команда и что ждёт меня?','What is the team doing now, and what is waiting for me?'], c_th1:['думал 2,8 с','thought for 2.8 s'],
  c_ai1a:['Двое ждут вас:','Two are waiting for you:'], c_ai1b:['ревьюер','the reviewer'], c_ai1c:['— подпись M0 по D8.4d,','— M0 sign-off on D8.4d,'], c_ai1d:['воркер 2','worker 2'],
  c_ai1e:['— круг 1 по TS-34. Воркер 1 заканчивает TS-35.','— round 1 on TS-34. Worker 1 is finishing TS-35.'],
  c_dl:['нужно ваше решение · 40 мин','your decision needed · 40 min'], c_dp:['Ревьюер держит D8.4d до подписи M0. Подписать сейчас или открыть сдачу?','The reviewer is holding D8.4d until M0 is signed. Sign now or open the handoff?'],
  c_b1:['Подписать M0','Sign M0'], c_b2:['Открыть D8.4d','Open D8.4d'], c_b3:['Полотно команды','Team canvas'],
  cx_chat:['Кто ты? какая ты модель…','Who are you? which model…'], cx_role:['Оркестратор','Orchestrator'], cx_ph:['Написать оркестратору…','Message the orchestrator…'], cx_perm:['Всё без вопросов','No questions asked'], cx_eff:['Усилие: —','Effort: —'],
  status1:['папка Alpha-Test · git · ролей 5 · прогон 3/7 идёт','folder Alpha-Test · git · 5 roles · run 3/7 going'], status2a:['команды','commands'], status2b:['панель','sidebar'],
  // панель действий экрана «Команда агентов»
  tb_t:['Команда агентов','Agent team'], tb_m5:['Alpha-Test · 5 ролей','Alpha-Test · 5 roles'], tb_m6:['Alpha-Test · 6 ролей','Alpha-Test · 6 roles'], tb_st:['канал в норме · 1 сообщение в пути','channel ok · 1 message in flight'], tb_pill:['ждёт вас · 1','waiting for you · 1'],
  tb_plus:['роль','role'], tb_cons:['Открыть конструктор','Open the builder'], tb_chat:['В чат','To chat'],
  // меню «+ роль» (библиотека ролей)
  pm_hd:['назначить роль','assign a role'], pm_tag:['есть','live'], pm_orch:['Оркестратор','Orchestrator'], pm_rev:['Ревьюер','Reviewer'], pm_worker:['Воркер','Worker'], pm_res:['Ресёрчер','Researcher'], pm_test:['Тестер','Tester'], pm_ux:['UX-ревьюер','UX reviewer'],
  pm_own:['Своя роль…','Custom role…'], pm_ownm:['из конструктора','from the builder'], pm_cons:['Открыть конструктор →','Open the builder →'],
  pm_ft:['назначение — место в канале с моделью по умолчанию; перестройка связей — в конструкторе','assigning gives the role a seat in the channel with its default model; links are rewired in the builder'],
  // карточка оркестратора (встроенный чат)
  o_name:['Оркестратор','Orchestrator'], o_sub:['Opus 5.5 · усилие высокое · ведёт ход','Opus 5.5 · high effort · leads the turn'], o_st:['думает · 2 с','thinking · 2 s'], o_tag:['тот же чат','same chat'], o_open:['⤢ чат','⤢ chat'],
  o_me:['Что ждёт меня после сдачи TS-35?','What is waiting for me after the TS-35 handoff?'],
  o_ai1:['Воркер 1','Worker 1'], o_ai2:['заканчивает TS-35 — сдача уйдёт ревьюеру с минуты на минуту.','is finishing TS-35 — the handoff goes to the reviewer any minute now.'], o_ai3:['Ревьюер','The reviewer'], o_ai4:['ждёт вашу подпись M0 по D8.4d — это держит TS-34 воркера 2.','is waiting for your M0 sign-off on D8.4d — it is holding worker 2’s TS-34.'],
  o_typing:['думает 2 с… собирает сдачу TS-35 для ревью','thinking 2 s… preparing the TS-35 handoff for review'], o_in:['Написать оркестратору…','Message the orchestrator…'],
  o_f1:['ход','turn'], o_f2:['71 k ток','71 k tok'], o_f3:['прогон H1.5','run H1.5'], o_f4:['последний ход · 23:12','last turn · 23:12'],
  // карточки ролей · 4 строки
  r1_n:['Ревьюер','Reviewer'], r1_s:['ждёт решения · 40 мин','awaiting decision · 40 min'], r1_l:['Нужна подпись M0 по D8.4d — круг 2 прочитан','Need M0 sign-off on D8.4d — round 2 read'], r1_h:['ход','turn'], r1_t:['18 k ток','18 k tok'],
  r2_n:['Воркер 1','Worker 1'], r2_s:['пишет','writing'], r2_l:['Сдаю TS-35: 14 тестов зелёные, опись в канале','Handing off TS-35: 14 tests green, summary in channel'], r2_h:['ход','turn'], r2_t:['31 k ток','31 k tok'], r2_at:['сейчас','now'],
  r3_n:['Воркер 2','Worker 2'], r3_s:['ждёт соседа · ревьюера','waiting on peer · reviewer'], r3_l:['TS-34 сдан, жду круг 1','TS-34 handed off, waiting for round 1'], r3_h:['ход','turn'], r3_t:['9 k ток','9 k tok'],
  r4_n:['Ресёрчер','Researcher'], r4_s:['молчит 14 мин','silent 14 min'], r4_l:['Опись источников по RS5 готова','Source list for RS5 is ready'], r4_h:['ход','turn'], r4_t:['4 k ток','4 k tok'],
  r5_n:['Тестер','Tester'], r5_s:['свободно · без задачи','free · no task'], r5_l:['задачи нет — назначьте из очереди','no task yet — assign one from the queue'], r5_h:['ход','turn'], r5_t:['0 ток','0 tok'], r5_at:['только что','just now'],
  lbl_live:['Воркер 1 → Ревьюер · сдача TS-35 · сейчас','Worker 1 → Reviewer · TS-35 handoff · now'],
  z_fit:['вписать','fit'], lg1:['оргсхема','org chart'], lg2:['живое сообщение','live message'], lg3:['выбранные','selected'], lg_tag:['есть','live'], lg4:['роли · статусы · канал','roles · states · channel'],
  // очередь задач внизу полотна
  q_t:['Очередь задач','Task queue'], q_m:['6 · открыто 5','6 · 5 open'], q_add:['задача','task'],
  q1:['TS-33 · виджет лимитов в панели','TS-33 · limits widget in the sidebar'], q1w:['Воркер 2','Worker 2'], q1s:['готово','done'],
  q2:['TS-35 · очередь задач в движке','TS-35 · task queue in the engine'], q2w:['Воркер 1','Worker 1'], q2s:['на ревью','in review'],
  q3:['TS-36 · карточка роли на полотне','TS-36 · role card on the canvas'], q3w:['Воркер 2','Worker 2'], q3s:['у воркера 2','with worker 2'],
  q4:['TS-37 · перетаскивание задачи на роль','TS-37 · drag a task onto a role'], q4w:['— не назначена','— unassigned'], q4s:['в очереди','queued'],
  q5:['RS-6 · источники по конструктору команд','RS-6 · sources on team builders'], q5w:['Ресёрчер','Researcher'], q5s:['в очереди','queued'],
  q6:['TS-38 · конструктор команды','TS-38 · team builder'], q6w:['— не назначена','— unassigned'], q6s:['в очереди','queued'],
  q_src1:['источник:','source:'], q_src2:['план','plan'], q_src3:['или','or'], q_src4:['оркестратор','orchestrator'], q_src5:['· перетащите строку на карточку роли — задача уйдёт ей в канал','· drag a row onto a role card — the task goes to its channel'],
  // подписи (одно слово коньяком между *…*), плашка, финал
  cap1:['Видно, *кто* чем занят','See *who* does what'], cap2:['Кто ждёт вас — *подсвечен*','Waiting for you — *highlighted*'], cap3:['*Стрелка* — кто кому пишет','The *arrow*: who writes to whom'],
  cap4:['Добавьте помощника *одним нажатием*','Add a helper with *one click*'], cap5:['Новый помощник уже *в команде*','The new helper is *on the team*'],
  badge:['alpha','alpha'], end_name:['Harnessy','Harnessy'], end_badge:['alpha','alpha'], end_sub:['полотно команды','team canvas'],
};
const esc = s => s.replace(/&/g,'&amp;').replace(/'/g,'&#39;');
const idsIn = html => [...new Set([...html.matchAll(/data-var-text="([^"]+)"/g)].map(m=>m[1]))];
const used = {};
for (const f of fs.readdirSync(path.join(ROOT,'compositions'))) {
  const p = path.join(ROOT,'compositions',f); let html = fs.readFileSync(p,'utf8');
  const ids = idsIn(html); const miss = ids.filter(i=>!D[i]); if (miss.length) throw new Error(f+': нет в словаре: '+miss.join(', '));
  const m = html.match(/data-composition-id="([^"]+)"/); used[m[1]] = ids;
  const decl = ids.map(i=>({id:i,type:'string',label:i,default:D[i][0]}));
  html = html.replace(/data-composition-variables='[^']*'/, "data-composition-variables='"+esc(JSON.stringify(decl))+"'");
  // значения по умолчанию в разметке = ru из словаря
  for (const i of ids) html = html.replace(new RegExp('(data-var-text="'+i+'"[^>]*>)[^<]*'), '$1'+D[i][0]);
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
