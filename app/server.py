"""Сервер чата: три окна (Claude, Claude, Codex) над одной папкой проекта.
Запуск: .venv/bin/python -m app.server  →  http://localhost:3777"""
from __future__ import annotations

import asyncio
import json
import os
import logging
import subprocess
import sys
import time
from pathlib import Path

from aiohttp import web

from .bridge import Bridge
from .claude_provider import CLAUDE_BIN, ClaudeProvider, child_env
from .codex_provider import CodexProvider
from .panes import MODES, PANE_IDS, Pane, Registry

ROOT = Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("PORT", "3777"))
APP_URL = f"http://127.0.0.1:{PORT}"
DEFAULT_DIR = os.environ.get("CHAT_WORK_DIR", "/Users/Shared/simple-claude-chat")
NODE = os.environ.get("NODE_BIN") or next((p for p in [os.path.expanduser("~/.local/bin/node"), "/opt/homebrew/bin/node", "/usr/local/bin/node"] if os.path.exists(p)), "node")
CLAUDE_MODELS = [
    {"id": "claude-sonnet-5", "label": "Sonnet 5"}, {"id": "claude-fable-5-1", "label": "Fable 5.1"},
    {"id": "claude-opus-5", "label": "Opus 5"}, {"id": "claude-haiku-4-5-20251001", "label": "Haiku 4.5"},
]


def valid_dir(p) -> bool:
    return isinstance(p, str) and os.path.isabs(p) and os.path.isdir(p)


def claude_auth() -> dict:
    if not CLAUDE_BIN:
        return {"loggedIn": False, "error": "claude не найден"}
    try:
        r = subprocess.run([CLAUDE_BIN, "auth", "status"], env=child_env(), capture_output=True, text=True, timeout=8, cwd=DEFAULT_DIR)
        return json.loads(r.stdout)
    except Exception as e:  # noqa: BLE001
        return {"loggedIn": False, "error": str(e)[:200]}


class App:
    def __init__(self):
        self.registry = Registry(DEFAULT_DIR, {"claude": CLAUDE_MODELS, "codex": [{"id": "gpt-5.6-sol", "label": "gpt-5.6-sol"}]})
        self.bridge = Bridge(self.registry)
        self.claude = ClaudeProvider(self.registry, self.bridge)
        self.codex = CodexProvider(self.registry, APP_URL, [NODE, str(ROOT / "bin" / "pane-mcp.mjs")])
        self.registry.providers = {"claude": self.claude, "codex": self.codex}
        self.bridge.run_turn = self.run_turn

    def provider(self, pane: Pane):
        return self.registry.providers[pane.vendor]

    # ---- один ход окна: от владельца или от соседа ----
    async def run_turn(self, pane: Pane, message: str, origin: str = "owner", depth: int = 0, from_label: str | None = None) -> str:
        if pane.busy:
            raise RuntimeError(f"{pane.label} занято")
        if not valid_dir(pane.cwd):
            raise RuntimeError(f"папки нет: {pane.cwd}")
        pane.busy = True
        pane.touched = True
        pane.interrupt = None
        try:
            if origin == "peer":
                pane.publish({"type": "relayStart", "from": from_label, "text": message})
                pane.record("peer", f"[от {from_label}] {message}")
                body = (f"[Сообщение от соседнего окна ({from_label})]\n{message}\n\n"
                        "(Ответь обычным текстом: твой ответ вернётся отправителю автоматически. "
                        "Инструментом send_to для ответа на это сообщение не пользуйся.)")
            else:
                pane.record("me", message)
                body = message
            digest = self.registry.build_digest(pane)
            full = f"{digest}\n\n---\nСообщение тебе:\n{body}" if digest else body
            if digest:
                pane.publish({"type": "note", "text": f"в сообщение добавлена сводка соседей ({len(digest)} символов)"})
            text = await self.provider(pane).run_turn(pane, full, depth)
            pane.record("ai", text)
            return text
        except asyncio.CancelledError:
            pane.publish({"type": "error", "message": "ход прерван"})
            raise
        except Exception as e:  # noqa: BLE001
            pane.publish({"type": "error", "message": str(e)[:600], "sessionId": pane.session_id})
            raise
        finally:
            pane.busy = False
            pane.interrupt = None
            pane.publish({"type": "state", **pane.settings()})

    # ---- HTTP ----
    async def index(self, request):
        return web.FileResponse(ROOT / "index.html")

    async def status(self, request):
        info = await self.codex.info()
        self.registry.models["codex"] = info["models"]
        for p in self.registry.panes.values():
            if p.vendor == "codex" and not any(m["id"] == p.model for m in info["models"]) and info["models"]:
                p.model = info["models"][0]["id"]
        return web.json_response({
            "defaultDir": DEFAULT_DIR, "models": self.registry.models, "modes": MODES,
            "panes": [p.settings() for p in self.registry.panes.values()],
            "auth": {"claude": claude_auth(), "codex": info["account"]},
        })

    async def dir_check(self, request):
        cwd = request.query.get("cwd", "")
        if not valid_dir(cwd):
            return web.json_response({"ok": False, "error": f"папки нет или это не папка: {cwd}"}, status=400)
        return web.json_response({"ok": True, "cwd": cwd, "hasClaudeMd": os.path.exists(os.path.join(cwd, "CLAUDE.md")),
                                  "hasAgentsMd": os.path.exists(os.path.join(cwd, "AGENTS.md"))})

    async def pane_set(self, request):
        p = self.registry.get(request.match_info["id"])
        if not p:
            return web.json_response({"error": "нет окна"}, status=404)
        body = await request.json()
        self.registry.update(p, body, valid_dir)
        return web.json_response({"ok": True, "pane": p.settings()})

    async def events(self, request):
        p = self.registry.get(request.match_info["id"])
        if not p:
            return web.json_response({"error": "нет окна"}, status=404)
        resp = web.StreamResponse(headers={"Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
        await resp.prepare(request)
        q: asyncio.Queue = asyncio.Queue(maxsize=2000)
        p.subscribers.add(q)
        try:
            await resp.write(b": ok\n\n")
            for a in list(p.approvals.values()):   # висящие вопросы показать заново после перезагрузки страницы
                await resp.write(f"data: {json.dumps({'type': 'approval', 'id': a.id, 'title': a.title, 'detail': a.detail}, ensure_ascii=False)}\n\n".encode())
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), 15)
                    await resp.write(f"data: {json.dumps(ev, ensure_ascii=False)}\n\n".encode())
                except asyncio.TimeoutError:
                    await resp.write(b": ka\n\n")
        except (ConnectionResetError, asyncio.CancelledError, RuntimeError):
            pass
        finally:
            p.subscribers.discard(q)
        return resp

    async def chat(self, request):
        body = await request.json()
        p = self.registry.get(str(body.get("pane") or ""))
        if not p:
            return web.json_response({"error": "нет окна"}, status=404)
        self.registry.update(p, body, valid_dir)
        message = str(body.get("message") or "").strip()
        if not message:
            return web.json_response({"error": "пустое сообщение"}, status=400)
        if not valid_dir(p.cwd):
            return web.json_response({"error": f"папки нет или это не папка: {p.cwd}"}, status=400)
        if p.busy:
            return web.json_response({"error": f"{p.label} занято: идёт ход"}, status=409)
        asyncio.create_task(self._safe_turn(p, message))
        return web.json_response({"ok": True})

    async def _safe_turn(self, p: Pane, message: str):
        try:
            await self.run_turn(p, message)
        except Exception as e:  # noqa: BLE001
            print(f"[chat] {p.id}: {e}", file=sys.stderr)

    async def approve(self, request):
        body = await request.json()
        p = self.registry.get(str(body.get("pane") or ""))
        if not p:
            return web.json_response({"error": "нет окна"}, status=404)
        ok = p.resolve_approval(str(body.get("id") or ""), body.get("decision") == "allow")
        print(f"[approve] {p.id} {body.get('id')} {body.get('decision')} ok={ok} от {request.remote} {request.headers.get('User-Agent', '')[:60]}", flush=True)
        return web.json_response({"ok": ok, "error": None if ok else "вопрос уже закрыт"})

    async def interrupt(self, request):
        body = await request.json()
        p = self.registry.get(str(body.get("pane") or ""))
        if not p:
            return web.json_response({"error": "нет окна"}, status=404)
        for a in list(p.approvals.keys()):
            p.resolve_approval(a, False)
        if p.interrupt:
            try:
                await p.interrupt()
            except Exception as e:  # noqa: BLE001
                return web.json_response({"ok": False, "error": str(e)[:200]})
            return web.json_response({"ok": True})
        return web.json_response({"ok": False, "error": "нечего прерывать"})

    async def sessions(self, request):
        p = self.registry.get(request.query.get("pane", "left"))
        cwd = request.query.get("cwd") or (p.cwd if p else DEFAULT_DIR)
        if not p or not valid_dir(cwd):
            return web.json_response({"error": "нет окна или папки"}, status=400)
        try:
            return web.json_response({"sessions": await self.provider(p).list_sessions(cwd)})
        except Exception as e:  # noqa: BLE001
            return web.json_response({"sessions": [], "error": str(e)[:300]})

    async def session_one(self, request):
        p = self.registry.get(request.query.get("pane", "left"))
        cwd = request.query.get("cwd") or (p.cwd if p else DEFAULT_DIR)
        sid = request.match_info["id"]
        if not p or not valid_dir(cwd):
            return web.json_response({"error": "нет окна или папки"}, status=400)
        if p.busy:
            return web.json_response({"error": f"{p.label} занято: идёт ход"}, status=409)
        try:
            msgs = await self.provider(p).session_messages(cwd, sid)
        except Exception as e:  # noqa: BLE001
            return web.json_response({"error": str(e)[:300]}, status=404)
        p.session_id = sid
        p.cwd = cwd
        p.touched = True
        p.transcript = [{"role": m["role"], "text": m["text"], "ts": 0} for m in msgs]
        p.seen = {}
        return web.json_response({"id": sid, "messages": msgs})

    async def relay(self, request):
        body = await request.json()
        r = await self.bridge.relay(str(body.get("from") or ""), str(body.get("to") or ""), str(body.get("text") or ""), int(body.get("depth") or 0))
        return web.json_response(r, status=200 if r.get("ok") else 409)

    async def pane_transcript(self, request):
        pid = request.query.get("pane", "")
        try:
            n = int(request.query.get("last", "20"))
        except ValueError:
            n = 20
        if pid not in PANE_IDS:
            return web.json_response({"error": "нет окна"}, status=404)
        return web.json_response({"text": self.registry.transcript_of(pid, n)})

    def routes(self, app: web.Application):
        app.router.add_get("/", self.index)
        app.router.add_get("/api/status", self.status)
        app.router.add_get("/api/dir", self.dir_check)
        app.router.add_post("/api/panes/{id}", self.pane_set)
        app.router.add_get("/api/events/{id}", self.events)
        app.router.add_post("/api/chat", self.chat)
        app.router.add_post("/api/approve", self.approve)
        app.router.add_post("/api/interrupt", self.interrupt)
        app.router.add_get("/api/sessions", self.sessions)
        app.router.add_get("/api/sessions/{id}", self.session_one)
        app.router.add_post("/api/relay", self.relay)
        app.router.add_get("/api/pane_transcript", self.pane_transcript)


def main():
    os.makedirs(DEFAULT_DIR, exist_ok=True)
    core = App()
    app = web.Application(client_max_size=2_000_000)
    core.routes(app)

    async def on_startup(_):
        asyncio.create_task(core.codex.info())   # список моделей и аккаунт Codex — заранее, не дожидаясь страницы

    async def on_shutdown(_):
        await core.codex.close()
    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)
    print(flush=True); print(f"[chat] {APP_URL}\n[chat] claude: {CLAUDE_BIN or 'НЕ НАЙДЕН'}; node для моста Codex: {NODE}\n[chat] папка по умолчанию: {DEFAULT_DIR}")
    a = claude_auth()
    print(f"[chat] вход Claude по подписке: {'да (' + str(a.get('authMethod')) + ')' if a.get('loggedIn') else 'НЕТ — выполни в Терминале: claude login'}")
    sys.stdout.flush()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    web.run_app(app, host="127.0.0.1", port=PORT, print=None, access_log_format='%a %r %s "%{User-Agent}i"')


if __name__ == "__main__":
    main()
