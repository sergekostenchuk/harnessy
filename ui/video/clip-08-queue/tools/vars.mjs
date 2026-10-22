// Словарь переменных клипа №8 «Очередь задач» (ru — значения по умолчанию в композициях, en — data-variable-values в index.html).
// Запуск: node tools/vars.mjs ru|en — переписывает data-composition-variables в compositions/*.html; en прописывает хостам index.html data-variable-values (английский набор), ru снимает.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
export const D = {
  /* панель A1 (скетч 40) */
  proj:['Alpha-Test','Alpha-Test'], new:['Новый чат','New chat'], find:['Найти…','Find…'], inbox:['Входящие','Inbox'],
  g_pinned:['закреплённые','Pinned'], g_chats:['чаты · Alpha-Test','Chats · Alpha-Test'], g_solo:['чаты без проекта','Chats without project'], others:['Другие проекты','Other projects'],
  pin1:['как ты будешь решать задачи в этой папке','how will you solve tasks in this folder'], pin2:['какие задачи ты можешь решать в проекте?','what tasks can you solve in the project?'],
  chat1:['Кто ты? какая ты модель и чем мне можешь помочь?','Who are you? which model, and how can you help?'], chat2:['Я — Исполнитель: реализую самодостаточный модуль…','I am the Executor: building a self-contained module…'], chat3:['ты готов?','are you ready?'],
  role_orch:['Оркестратор','Orchestrator'], role_exec:['Исполнитель','Executor'],
  solo1:['как заварить кофе в турке','how to brew coffee in a cezve'], solo2:['перевод письма партнёру','translating a letter to a partner'],
  av3:['А','A'], user2:['Анна Ветрова','Anna Vetrova'],
  /* полоска вкладок проекта */
  tb_chat:['Чат','Chat'], tb_doc:['Документы','Documents'], tb_art:['Артефакты','Artifacts'], tb_mem:['Память','Memory'], tb_res:['Исследования','Research'], tb_plan:['План · карта','Plan · map'], tb_path:['Путь','Path'], tb_team:['Команда агентов','Agent team'], tb_roles:['6 ролей','6 roles'], tb_conn:['подключено','connected'],
  /* кадр 01 «Работа команды» */
  tb1_ttl:['Команда агентов','Agent team'], tb1_sub:['Alpha-Test · 6 ролей','Alpha-Test · 6 roles'], tb1_st:['канал в норме · 1 сообщение в пути','channel OK · 1 message in flight'], tb1_pill:['ждёт вас · 1','awaiting you · 1'], tb1_role:['роль','role'], tb1_cons:['Открыть конструктор','Open constructor'], tb1_chat:['В чат','To chat'],
  o_name:['Оркестратор','Orchestrator'], o_sub:['Opus 5.5 · усилие высокое · ведёт ход','Opus 5.5 · effort high · leads the turn'], o_st:['думает · 2 с','thinking · 2 s'], o_tag:['тот же чат','same chat'], o_open:['⤢ чат','⤢ chat'],
  o_me:['Что ждёт меня после сдачи TS-35?','What awaits me after TS-35 is handed in?'], o_a1:['Воркер 1','Worker 1'], o_a2:['сдал TS-35 ревьюеру 2 мин назад.','handed TS-35 to the reviewer 2 min ago.'], o_a3:['Ревьюер','Reviewer'], o_a4:['всё ещё ждёт вашу подпись M0 по D8.4d — это держит TS-34 воркера 2.','still waits for your M0 sign-off on D8.4d — it holds Worker 2’s TS-34.'],
  o_typing:['думает 2 с… собирает сдачу TS-35 для ревью','thinking 2 s… assembling the TS-35 hand-in for review'], o_in:['Написать оркестратору…','Write to the orchestrator…'],
  o_f1a:['ход ·','turn ·'], o_f1b:['2,4 % W','2.4 % W'], o_f1c:['· 71 k ток','· 71 k tok'], o_f2a:['прогон H1.5 ·','run H1.5 ·'], o_f3:['последний ход · 23:12','last turn · 23:12'],
  rev_name:['Ревьюер','Reviewer'], rev_st:['ждёт решения · 40 мин','awaiting decision · 40 min'], rev_last:['Нужна подпись M0 по D8.4d — круг 2 прочитан','Need M0 sign-off on D8.4d — round 2 read'], rev_hod:['ход','turn'], rev_sp:['0,6 % W','0.6 % W'], rev_tk:['18 k ток · 23:10','18 k tok · 23:10'],
  w1_name:['Воркер 1','Worker 1'], w1_st:['пишет','writing'], w1_last:['Сдаю TS-35: 14 тестов зелёные, опись в канале','Handing in TS-35: 14 tests green, inventory in channel'], w1_hod:['ход','turn'], w1_sp:['1,1 % W','1.1 % W'], w1_tk:['31 k ток · сейчас','31 k tok · now'],
  w2_name:['Воркер 2','Worker 2'], w2_st:['ждёт соседа · ревьюера','waits for peer · reviewer'], w2_last:['TS-34 сдан, жду круг 1','TS-34 handed in, waiting round 1'], w2_hod:['ход','turn'], w2_sp:['0,3 % W','0.3 % W'], w2_tk:['9 k ток · 22:48','9 k tok · 22:48'],
  res_name:['Ресёрчер','Researcher'], res_st:['молчит 14 мин','silent 14 min'], res_last:['Опись источников по RS5 готова','Source inventory for RS5 ready'], res_hod:['ход','turn'], res_sp:['0,1 % W','0.1 % W'], res_tk:['4 k ток · 22:54','4 k tok · 22:54'],
  test_name:['Тестер','Tester'], test_st:['ошибка · прогон упал','error · run failed'], test_last:['check:backend: typecheck упал в 2 файлах','check:backend: typecheck failed in 2 files'], test_hod:['ход','turn'], test_sp:['0,2 % W','0.2 % W'], test_tk:['6 k ток · 23:06','6 k tok · 23:06'],
  live_lbl:['Воркер 1 → Ревьюер · сдача TS-35 · 2 мин','Worker 1 → Reviewer · hand-in TS-35 · 2 min'],
  zm_fit:['вписать','fit'], lg1:['оргсхема','org chart'], lg2:['живое сообщение','live message'], lg3:['выбранные','selected'], lg_tag:['есть','live'], lg4:['роли · статусы · канал','roles · statuses · channel'],
  q_ttl:['Очередь задач','Task queue'], q_m:['6 · открыто 5','6 · open 5'], q_add:['задача','task'],
  n11a:['№11','#11'], n12a:['№12','#12'], n13a:['№13','#13'], n14a:['№14','#14'], n15a:['№15','#15'], n16a:['№16','#16'],
  t11a:['TS-33 · виджет лимитов в панели','TS-33 · limits widget in the panel'], w11a:['Воркер 2','Worker 2'], s11a:['готово','done'],
  t12a:['TS-35 · очередь задач в движке','TS-35 · task queue in the engine'], w12a:['Воркер 1','Worker 1'], s12a:['на ревью','in review'],
  t13a:['TS-36 · карточка роли на полотне','TS-36 · role card on the canvas'], w13a:['Воркер 2','Worker 2'], s13a:['у воркера 2','with worker 2'],
  t14a:['TS-37 · перетаскивание задачи на роль','TS-37 · drag a task onto a role'], w14a:['— не назначена','— unassigned'], s14a:['в очереди','queued'],
  t15a:['RS-6 · источники по конструктору команд','RS-6 · sources on the team constructor'], w15a:['Ресёрчер','Researcher'], s15a:['в очереди','queued'],
  t16a:['TS-38 · конструктор команды','TS-38 · team constructor'], w16a:['— не назначена','— unassigned'], s16a:['в очереди','queued'],
  q_src1:['источник:','source:'], q_src2:['план · компиляция','plan · compilation'], q_src3:['(когда живое) или','(when live) or'], q_src4:['оркестратор','orchestrator'], q_src5:['· перетащите строку на карточку роли — задача уйдёт ей в канал','· drag a row onto a role card — the task goes to its channel'],
  /* кадр 04 «Очередь задач» */
  tb2_ttl:['Команда агентов · очередь','Agent team · queue'], tb2_proj:['Alpha-Test ·','Alpha-Test ·'], tb2_open:['открытых','open'], tb2_pill:['ждёт вас · 1','awaiting you · 1'], tb2_back:['К полотну','To canvas'],
  f_all:['Все','All'], f_q:['В очереди','Queued'], f_work:['В работе','In progress'], f_rev:['На ревью','In review'], f_done:['Готово','Done'],
  q2_ttl:['Очередь задач','Task queue'], q2_m:['№ · краткое имя · кому · состояние','# · short name · assignee · state'], q2_add:['задача','task'], q2_plan:['из плана ↓','from plan ↓'],
  n11:['№11','#11'], n12:['№12','#12'], n13:['№13','#13'], n14:['№14','#14'], n15:['№15','#15'], n16:['№16','#16'], n17:['№17','#17'],
  t11:['TS-33 · виджет лимитов в панели','TS-33 · limits widget in the panel'], w11:['Воркер 2','Worker 2'], s11:['готово','done'],
  t12:['TS-35 · очередь задач в движке','TS-35 · task queue in the engine'], w12:['Воркер 1','Worker 1'], s12:['на ревью','in review'],
  t13:['TS-36 · карточка роли на полотне','TS-36 · role card on the canvas'], w13:['Воркер 2','Worker 2'], s13:['у воркера 2','with worker 2'],
  t14:['TS-37 · перетаскивание задачи на роль','TS-37 · drag a task onto a role'], w14:['— не назначена','— unassigned'], w14n:['Воркер 2','Worker 2'], s14:['в очереди','queued'], s14n:['у воркера 2','with worker 2'],
  t15:['RS-6 · источники по конструктору команд','RS-6 · sources on the team constructor'], w15:['Ресёрчер','Researcher'], s15:['в очереди','queued'],
  t16:['TS-38 · конструктор команды','TS-38 · team constructor'], w16:['— не назначена','— unassigned'], s16:['в очереди','queued'],
  t17:['TS-39 · карта команды','TS-39 · team map'], w17:['— не назначена','— unassigned'], s17:['в очереди','queued'],
  q2_src1:['источник:','source:'], q2_src2:['план · компиляция','plan · compilation'], q2_src3:['(когда живое) или','(when live) or'], q2_src4:['оркестратор','orchestrator'], q2_src5:['· строка тянется на карточку роли справа','· a row drags onto a role card on the right'],
  tg_lbl:['цели · карточки ролей','targets · role cards'],
  o2_name:['Оркестратор','Orchestrator'], o2_sub:['Opus 5.5 · усилие высокое · ведёт ход','Opus 5.5 · effort high · leads the turn'], o2_st:['думает · 2 с','thinking · 2 s'],
  rev2_name:['Ревьюер','Reviewer'], rev2_st:['ждёт решения · 40 мин','awaiting decision · 40 min'], rev2_last:['Нужна подпись M0 по D8.4d — круг 2 прочитан','Need M0 sign-off on D8.4d — round 2 read'], rev2_hod:['ход','turn'], rev2_sp:['0,6 % W','0.6 % W'], rev2_tk:['18 k ток · 23:10','18 k tok · 23:10'],
  w12_name:['Воркер 1','Worker 1'], w12_st:['пишет','writing'], w12_last:['Сдаю TS-35: 14 тестов зелёные, опись в канале','Handing in TS-35: 14 tests green, inventory in channel'], w12_hod:['ход','turn'], w12_sp:['1,1 % W','1.1 % W'], w12_tk:['31 k ток · сейчас','31 k tok · now'],
  w22_name:['Воркер 2','Worker 2'], w22_st:['ждёт соседа · ревьюера','waits for peer · reviewer'], w22_st2:['пишет · №14','writing · #14'], w22_last:['TS-34 сдан, жду круг 1','TS-34 handed in, waiting round 1'], w22_last2:['№14 назначена: TS-37 · перетаскивание задачи на роль','#14 assigned: TS-37 · drag a task onto a role'], w22_hod:['ход','turn'], w22_sp:['0,3 % W','0.3 % W'], w22_tk:['9 k ток · 22:48','9 k tok · 22:48'], w2_drop:['назначить воркера 2','assign worker 2'],
  res2_name:['Ресёрчер','Researcher'], res2_st:['молчит 14 мин','silent 14 min'], res2_last:['Опись источников по RS5 готова','Source inventory for RS5 ready'], res2_hod:['ход','turn'], res2_sp:['0,1 % W','0.1 % W'], res2_tk:['4 k ток · 22:54','4 k tok · 22:54'],
  test2_name:['Тестер','Tester'], test2_st:['ошибка · прогон упал','error · run failed'], test2_last:['check:backend: typecheck упал в 2 файлах','check:backend: typecheck failed in 2 files'], test2_hod:['ход','turn'], test2_sp:['0,2 % W','0.2 % W'], test2_tk:['6 k ток · 23:06','6 k tok · 23:06'],
  nd:['№14','#14'], td:['TS-37 · перетаскивание задачи на роль','TS-37 · drag a task onto a role'], wd:['— не назначена','— unassigned'], sd:['в очереди','queued'], hint:['тяните на роль → задача уйдёт ей в канал','drag onto a role → the task goes to its channel'],
  /* подписи, плашка, финал */
  cap0:['Команда работает. Внизу — *очередь*','The team works. The *queue* is below'], cap1:['Задачи с *номерами*, по порядку','Tasks with *numbers*, in order'],
  cap2:['Новая — сразу с *номером*','A new one gets its *number*'], cap3:['Перетащите — и она в *работе*','Drag it — and it’s *underway*'], cap4:['Видно, у кого *что*','You see *who* has what'],
  badge:['alpha','alpha'], end_name:['Harnessy','Harnessy'], end_badge:['alpha','alpha'], end_sub:['очередь задач','task queue'],
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
