// Словарь переменных клипа №7 «Конструктор команды» (ru — значения по умолчанию в композициях, en — data-variable-values у хостов index.html).
// Запуск: node tools/vars.mjs ru|en — переписывает data-composition-variables в compositions/*.html; en прописывает хостам index.html английский набор, ru снимает.
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
export const D = {
  // панель A1 (как в clip-01/02)
  proj:['Alpha-Test','Alpha-Test'], new:['Новый чат','New chat'], find:['Найти…','Find…'], inbox:['Входящие','Inbox'],
  g_pinned:['закреплённые','Pinned'], g_chats:['чаты · Alpha-Test','Chats · Alpha-Test'], g_solo:['чаты без проекта','Chats without project'], others:['Другие проекты','Other projects'],
  pin1:['как ты будешь решать задачи в этой папке','how will you solve tasks in this folder'], pin2:['какие задачи ты можешь решать в проекте?','what tasks can you solve in the project?'],
  chat1:['Кто ты? какая ты модель и чем мне можешь помочь?','Who are you? which model, and how can you help?'], chat2:['Я — Исполнитель: реализую самодостаточный модуль…','I am the Executor: building a self-contained module…'], chat3:['ты готов?','are you ready?'],
  role_orch:['Оркестратор','Orchestrator'], role_exec:['Исполнитель','Executor'],
  solo1:['как заварить кофе в турке','how to brew coffee in a cezve'], solo2:['перевод письма партнёру','translating a letter to a partner'],
  av3:['А','A'], user2:['Анна Ветрова','Anna Vetrova'],
  // проектная полоска
  tb_chat:['Чат','Chat'], tb_doc:['Документы','Documents'], tb_art:['Артефакты','Artifacts'], tb_mem:['Память','Memory'], tb_res:['Исследования','Research'], tb_plan:['План · карта','Plan · map'], tb_path:['Путь','Path'], tb_team:['Команда агентов','Agent team'], tb_n5:['5 ролей','5 roles'], tb_n6:['6 ролей','6 roles'], conn:['подключено','connected'],
  tb_chat2:['Чат','Chat'], tb_doc2:['Документы','Documents'], tb_art2:['Артефакты','Artifacts'], tb_mem2:['Память','Memory'], tb_res2:['Исследования','Research'], tb_plan2:['План · карта','Plan · map'], tb_path2:['Путь','Path'], tb_team2:['Команда агентов','Agent team'], tb_n5b:['5 ролей','5 roles'], tb_n6b:['6 ролей','6 roles'], conn2:['подключено','connected'],
  // работа команды: шапка, оркестратор, карточки, легенда, очередь
  w_ttl:['Команда агентов','Agent team'], w_m5:['Alpha-Test · 5 ролей','Alpha-Test · 5 roles'], w_m6:['Alpha-Test · 6 ролей','Alpha-Test · 6 roles'], w_st:['канал в норме · 1 сообщение в пути','channel ok · 1 message in flight'], w_wait:['ждёт вас · 1','waiting for you · 1'],
  w_role:['роль','role'], w_open:['Открыть конструктор','Open constructor'], w_chat:['В чат','To chat'],
  orch:['Оркестратор','Orchestrator'], orch_sub:['Opus 5.5 · усилие высокое · ведёт ход','Opus 5.5 · high effort · leads the turn'], orch_st:['думает · 2 с','thinking · 2 s'],
  o_me:['Что ждёт меня после сдачи TS-35?','What awaits me after TS-35 is handed in?'], o_w1:['Воркер 1','Worker 1'], o_a1:['сдал TS-35 ревьюеру 2 мин назад.','handed TS-35 to the reviewer 2 min ago.'], o_rv:['Ревьюер','Reviewer'], o_a2:['всё ещё ждёт вашу подпись M0 по D8.4d — это держит TS-34 воркера 2.','is still waiting for your M0 sign-off on D8.4d — it holds worker 2’s TS-34.'],
  o_typ:['думает 2 с… собирает сдачу TS-35 для ревью','thinking 2 s… assembling the TS-35 hand-in for review'], o_in:['Написать оркестратору…','Write to the orchestrator…'],
  o_f1:['ход','turn'], o_f2:['71 k ток','71 k tok'], o_f3:['прогон H1.5','run H1.5'], o_f4:['последний ход','last turn'],
  rev:['Ревьюер','Reviewer'], wr_s:['ждёт решения · 40 мин','awaiting decision · 40 min'], wr_l:['Нужна подпись M0 по D8.4d — круг 2 прочитан','Need M0 sign-off on D8.4d — round 2 read'], wr_t:['18 k ток','18 k tok'],
  w1:['Воркер 1','Worker 1'], ww1_s:['пишет','writing'], ww1_l:['Сдаю TS-35: 14 тестов зелёные, опись в канале','Handing in TS-35: 14 tests green, inventory in channel'], ww1_t:['31 k ток · сейчас','31 k tok · now'],
  w2:['Воркер 2','Worker 2'], ww2_s:['ждёт соседа · ревьюера','waiting on peer · reviewer'], ww2_l:['TS-34 сдан, жду круг 1','TS-34 handed in, waiting for round 1'], ww2_t:['9 k ток','9 k tok'],
  res:['Ресёрчер','Researcher'], wres_s:['молчит 14 мин','silent 14 min'], wres_l:['Опись источников по RS5 готова','Source inventory for RS5 ready'], wres_t:['4 k ток','4 k tok'],
  test:['Тестер','Tester'], wt_s:['свободно','free'], wt_l:['ждёт первую задачу','waiting for the first task'], wt_t:['0 ток','0 tok'], wt_now:['только что','just now'],
  turn1:['ход','turn'], turn2:['ход','turn'], turn3:['ход','turn'], turn4:['ход','turn'], turn5:['ход','turn'],
  w_live:['Воркер 1 → Ревьюер · сдача TS-35 · 2 мин','Worker 1 → Reviewer · TS-35 hand-in · 2 min'],
  z_fit:['вписать','fit'], z_fit2:['вписать','fit'], lg_org:['оргсхема','org chart'], lg_live:['живое сообщение','live message'], lg_sel:['выбранные','selected'],
  q_ttl:['Очередь задач','Task queue'], q_m:['6 · открыто 5','6 · open 5'], q_add:['задача','task'],
  q11:['TS-33 · виджет лимитов в панели','TS-33 · limits widget in the panel'], q11w:['Воркер 2','Worker 2'], q11s:['готово','done'],
  q12:['TS-35 · очередь задач в движке','TS-35 · task queue in the engine'], q12w:['Воркер 1','Worker 1'], q12s:['на ревью','in review'],
  q13:['TS-36 · карточка роли на полотне','TS-36 · role card on the canvas'], q13w:['Воркер 2','Worker 2'], q13s:['у воркера 2','with worker 2'],
  q14:['TS-37 · перетаскивание задачи на роль','TS-37 · dragging a task onto a role'], q14w:['— не назначена','— unassigned'], q14s:['в очереди','queued'],
  q15:['RS-6 · источники по конструктору команд','RS-6 · sources on team constructors'], q15w:['Ресёрчер','Researcher'], q15s:['в очереди','queued'],
  q16:['TS-38 · конструктор команды','TS-38 · team constructor'], q16w:['— не назначена','— unassigned'], q16s:['в очереди','queued'],
  q_src1:['источник:','source:'], q_src2:['план · компиляция','plan · compilation'], q_src3:['или','or'], q_src4:['оркестратор','orchestrator'], q_src5:['· перетащите строку на карточку роли — задача уйдёт ей в канал','· drag a row onto a role card — the task goes to its channel'],
  // конструктор: шапка, библиотека, карточки, связи, меню, легенда
  c_ttl:['Конструктор команды','Team constructor'], c_m1:['правка · 5 ролей · 7 связей','editing · 5 roles · 7 links'], c_m2:['правка · 6 ролей · 7 связей','editing · 6 roles · 7 links'], c_m3:['правка · 6 ролей · 8 связей','editing · 6 roles · 8 links'],
  c_saved:['сохранено','saved'], c_chg1:['не сохранено · 1','unsaved · 1'], c_chg2:['не сохранено · 2','unsaved · 2'], c_bad:['без модели · 1','no model · 1'],
  c_new:['Новая','New'], c_save:['Сохранить','Save'], c_apply:['Применить к проекту','Apply to project'],
  l_hd:['библиотека ролей','role library'], l_find:['найти роль…','find a role…'],
  l_orch:['Оркестратор','Orchestrator'], l_orch_d:['ведёт ход, раздаёт задачи','leads the turn, hands out tasks'], l_in1:['в команде · 1','in team · 1'],
  l_rev:['Ревьюер','Reviewer'], l_rev_d:['принимает или возвращает сдачу','accepts or returns a hand-in'], l_in1b:['в команде · 1','in team · 1'],
  l_worker:['Воркер','Worker'], l_worker_d:['пишет код в своей копии','writes code in its own copy'], l_in2:['в команде · 2','in team · 2'],
  l_res:['Ресёрчер','Researcher'], l_res_d:['читает репозиторий и веб','reads the repository and the web'], l_in1c:['в команде · 1','in team · 1'],
  l_test:['Тестер','Tester'], l_test_d:['гоняет прогоны, читает падения','runs the checks, reads failures'], l_in1d:['в команде · 1','in team · 1'],
  l_ux:['UX-ревьюер','UX reviewer'], l_ux_d:['смотрит экраны и путь пользователя','looks at screens and the user path'],
  l_own:['Своя роль','Custom role'], l_own_d:['имя · инструкция · модель','name · instruction · model'],
  l_ft:['перетащите роль на холст или кликните — появится карточка без связей; модель и права — на карточке','drag a role onto the canvas or click it — a card without links appears; model and rights are on the card'],
  d_test:['Тестер','Tester'], d_test_d:['гоняет прогоны, читает падения','runs the checks, reads failures'],
  n_orch:['Оркестратор','Orchestrator'], n_orch_r:['Всё без вопросов','Everything, no questions'], n_w1:['Воркер 1','Worker 1'], n_w1_r:['Своя копия · без push','Own copy · no push'], n_w2:['Воркер 2','Worker 2'], n_w2_r:['Своя копия · без push','Own copy · no push'],
  n_res:['Ресёрчер','Researcher'], n_res_r:['Только чтение · веб','Read only · web'], n_rev:['Ревьюер','Reviewer'], n_rev_r:['Только чтение','Read only'], n_test:['Тестер','Tester'], n_chg:['изменено','changed'],
  n_seat1:['место в канале','seat in channel'], n_seat2:['место в канале','seat in channel'], n_seat3:['место в канале','seat in channel'], n_seat4:['место в канале','seat in channel'], n_seat5:['место в канале','seat in channel'], n_seat6:['место в канале','seat in channel'],
  r_model1:['модель','model'], r_model2:['модель','model'], r_model3:['модель','model'], r_model4:['модель','model'], r_model5:['модель','model'], r_model6:['модель','model'],
  r_rights1:['права','rights'], r_rights2:['права','rights'], r_rights3:['права','rights'], r_rights4:['права','rights'], r_rights5:['права','rights'], r_rights6:['права','rights'],
  r_instr1:['инструкция','instruction'], r_instr2:['инструкция','instruction'], r_instr3:['инструкция','instruction'], r_instr4:['инструкция','instruction'], r_instr5:['инструкция','instruction'], r_instr6:['инструкция','instruction'],
  nt_s1:['test · новая · нет модели','test · new · no model'], nt_s2:['test · новая','test · new'], nt_pick:['выбрать модель','choose a model'], nt_r1:['Только чтение','Read only'], nt_r2:['Запуск прогонов','Run checks'],
  nt_bad:['нельзя применить без модели','cannot apply without a model'], nt_unsaved:['не сохранено','unsaved'],
  e_task1:['задача','task'], e_task2:['задача','task'], e_q:['вопрос','question'], e_sub1:['сдаёт','hands in'], e_sub2:['сдаёт','hands in'], e_ret:['возврат','return'], e_verdict:['вердикт','verdict'], e_report:['отчёт прогона','check report'],
  mm_hd:['модель роли','role model'], mm_g1:['Codex · подписка','Codex · subscription'], mm_sol_d:['по умолчанию для тестера','default for the tester'], mm_g2:['Claude Code · подписка','Claude Code · subscription'], mm_g3:['provider-router · локально','provider-router · local'],
  rm_hd:['режим роли','role mode'], rm_1:['Только обсуждение','Discussion only'], rm_1d:['обсуждает и ничего не делает','discusses and does nothing'], rm_2:['Всё без вопросов','Everything, no questions'], rm_2d:['делает, не спрашивая','acts without asking'],
  rm_3:['Спрашивать перед действием','Ask before acting'], rm_3d:['стоп-случаи из настроек','stop cases from settings'], rm_4:['Только чтение','Read only'], rm_4d:['читает папку, ничего не пишет','reads the folder, writes nothing'], rm_5:['Запуск прогонов','Run checks'], rm_5d:['гоняет прогоны, в код не пишет','runs the checks, never edits code'],
  lg_sub:['пишет · сдаёт','writes · hands in'], lg_ret:['возврат','return'], lg_new:['новая','new'], lg_sel2:['выбранные','selected'],
  // подписи, финал, плашка
  cap1:['В команде нет *Тестера*','The team has no *Tester*'], cap2:['Соберите команду как *схему*','Build the team like a *diagram*'], cap3:['Красная подсказка: выберите *модель*','Red hint: choose a *model*'],
  cap4:['У каждого помощника — *модель* и права','Each assistant has a *model* and rights'], cap5:['Стрелка — кому *сдавать* отчёт','The arrow: who gets the *report*'], cap6:['Сохранить и *применить* к проекту','Save and *apply* to the project'], cap7:['Применили — команда в *работе*','Applied — the team is at *work*'],
  end_name:['Harnessy','Harnessy'], end_badge:['alpha','alpha'], end_sub:['конструктор команды','team constructor'], badge:['alpha','alpha'],
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
