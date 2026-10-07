# Harnessy

Окно владельца над командой ИИ-агентов: один человек ведёт проекты, принимает решения, которых ждут агенты, смотрит план, стаю, расход и журнал. Мозг — харнесс (локальная служба `~/HARNESS`, Claude Agent SDK + Codex SDK по подпискам); здесь — окно: экраны, прототип, оболочка Electron, вход на сайт.

## Что в репозитории
- `sketches/disarto/` — живые скетчи экранов 00–22 (дизайн-код «графит и коньяк», лист 00); общий `style.css`, механика карточек `app.js`.
- `deploy/` — сборка прототипа (`build.py`), рабочий слой `live.js`, поле ввода `cx.js`, стили прототипа `proto.css/js`, сервис входа `auth/` (Telegram · GitHub · Google), nginx для `harnessy.ai`, `deploy.sh` для сервера NL99.
- `desktop/` — оболочка Electron (`run.sh`): окно вокруг прототипа, который отдаёт харнесс на `localhost:3777`.
- `evidence/`, `data/` (не в git) — материалы исследования и экспорт карты OMG.

## Запуск для себя
```bash
~/HARNESS/run.sh                                   # мозг на :3777 (нужны claude login и вход Codex)
~/REPORTS/workbench-design/desktop/run.sh          # окно Electron
open http://localhost:3777/sketches/proto/10-new-chat.html   # или в браузере
```

Сайт: https://harnessy.ai (вход по Telegram / GitHub / Google, допуск владельцем).
