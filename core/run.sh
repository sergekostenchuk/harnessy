#!/bin/sh
# Запуск чата: три окна (Claude, Claude, Codex) над одной папкой проекта → http://localhost:3777
cd "$(dirname "$0")" || exit 1
exec ./.venv/bin/python -m app.server
