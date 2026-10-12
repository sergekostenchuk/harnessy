# Harnessy

Окно владельца над командой ИИ-агентов: один человек ведёт проекты, принимает решения, которых ждут агенты, смотрит план, стаю, расход и журнал. Мозг — харнесс (локальная служба `~/HARNESS`, Claude Agent SDK + Codex SDK по подпискам); здесь — окно: экраны, прототип, оболочка Electron, вход на сайт.

## Что в репозитории
- `sketches/disarto/` — живые скетчи экранов 00–22 (дизайн-код «графит и коньяк», лист 00); общий `style.css`, механика карточек `app.js`.
- `deploy/` — сборка прототипа (`build.py`), рабочий слой `live.js`, поле ввода `cx.js`, стили прототипа `proto.css/js`, сервис входа `auth/` (Telegram · GitHub · Google), nginx для `harnessy.ai`, `deploy.sh` для сервера NL99.
- `desktop/` — оболочка Electron (`electron.sh`), лаунчер движка (`run.sh`): окно вокруг прототипа, который отдаёт харнесс на `localhost:3777`.
- `evidence/`, `data/` (не в git) — материалы исследования и экспорт карты OMG.

## Запуск для себя
```bash
~/HARNESS/run.sh                                   # мозг на :3777 (нужны claude login и вход Codex)
~/Harnessy/ui/desktop/electron.sh          # окно Electron
open http://localhost:3777/sketches/proto/10-new-chat.html   # или в браузере
```

Сайт: https://harnessy.ai (вход по Telegram / GitHub / Google, допуск владельцем).

## Живой слой и скетчи
- Скетчи `ui/sketches/disarto/00–25`; дизайн-код — `00-design-code.html` (новые элементы сначала там). Сборка в `ui/deploy/out/site/sketches/{disarto,proto}`: `python3 ui/deploy/build.py`.
- Рабочий слой окна: `live.js`, `cx.js`, `ctx.js`, `set.js`, `conn.js`; модели по API — `llm.js`; прокси и VPS — `network.js`, `network-add.js` (добавление в два шага), `network-recovery.js` (объяснение сетевого отказа и путь «Подключить через прокси или VPS»), `network-stats.js`.
- Путь «прокси и VPS» — скетч `25-proxy-path.html`, словарь — раздел `proxy-path-spec` дизайн-кода.
