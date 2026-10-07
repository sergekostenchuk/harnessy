#!/bin/sh
# Сервер харнесса в отсоединённой сессии tmux: переживает закрытие окна Claude Code и Терминала.
#   bin/serve.sh          — запустить (или сообщить, что уже работает)
#   bin/serve.sh attach   — подключиться к экрану сервера (выход: Ctrl-b d)
#   bin/serve.sh restart  — перезапустить сервер в той же сессии
#   bin/serve.sh stop     — остановить сервер и закрыть сессию
#   bin/serve.sh log      — хвост журнала logs/server.log
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
S=harness
cd "$ROOT"
mkdir -p logs
running() { tmux has-session -t "$S" 2>/dev/null; }
start() {
  tmux new-session -d -s "$S" -c "$ROOT" -n server
  tmux send-keys -t "$S:server" './run.sh 2>&1 | tee -a logs/server.log' Enter
  for i in $(seq 1 40); do curl -sf http://localhost:3777/api/status >/dev/null 2>&1 && break; sleep 0.5; done
  if curl -sf http://localhost:3777/api/status >/dev/null 2>&1; then
    echo "сервер работает: http://localhost:3777 · экран: bin/serve.sh attach"
  else
    echo "сервер не ответил за 20 с, смотри: bin/serve.sh attach"; exit 1
  fi
}
case "${1:-start}" in
  start)   if running; then echo "сессия tmux '$S' уже есть: bin/serve.sh attach"; else start; fi ;;
  attach)  exec tmux attach -t "$S" ;;
  restart) if running; then tmux send-keys -t "$S:server" C-c; sleep 1; tmux kill-session -t "$S"; fi
           for i in $(seq 1 20); do lsof -nP -iTCP:3777 -sTCP:LISTEN >/dev/null 2>&1 || break; sleep 0.5; done
           start ;;
  stop)    if running; then tmux send-keys -t "$S:server" C-c; sleep 1; tmux kill-session -t "$S"; echo "остановлен"; else echo "не запущен"; fi ;;
  log)     tail -n "${2:-40}" logs/server.log ;;
  *)       echo "bin/serve.sh [start|attach|restart|stop|log]"; exit 2 ;;
esac
