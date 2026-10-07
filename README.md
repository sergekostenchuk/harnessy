# Harnessy

Окно владельца над командой ИИ-агентов — один репозиторий, две части:

- **`core/`** — движок (Python, aiohttp): места-роли команды, чаты, журнал обмена `.harness/state/channel.ndjson` в папке проекта, адаптеры Claude (Agent SDK по подписке Max) и Codex (SDK по подписке ChatGPT). Запуск `core/run.sh` → `http://localhost:3777`. Окружение: `core/.venv` (срез — `core/requirements.txt`).
- **`ui/`** — окно: скетчи экранов и дизайн-код (`ui/sketches/disarto`), прототип с рабочим слоем (`ui/deploy`), оболочка Electron (`ui/desktop`), вход на сайт и nginx (`ui/deploy/auth`, `ui/deploy/nginx`). Подробнее — `ui/README.md`.

Движок отдаёт собранный прототип из `ui/deploy/out/site` под `/sketches/…`, поэтому окно и API живут на одном адресе.

```bash
~/Harnessy/core/run.sh            # движок (нужны claude login и вход Codex)
~/Harnessy/ui/desktop/run.sh      # окно Electron
python3 ~/Harnessy/ui/deploy/build.py   # пересобрать прототип после правок
```

История двух прежних репозиториев (`~/HARNESS`, `~/REPORTS/workbench-design`) сохранена целиком; старые пути — символические ссылки сюда.
