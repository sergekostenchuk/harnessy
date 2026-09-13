"""Сервер харнесса: окна над одной папкой проекта, журнал линии в `.harness/state`,
очередь входящих на окно и автоход, инструменты связи между окнами.
Запуск: .venv/bin/python -m app.server  →  http://localhost:3777"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import sys
import time
from pathlib import Path

from aiohttp import web

from .bridge import Bridge
from .claude_provider import CLAUDE_BIN, ClaudeProvider, child_env
from .codex_provider import CodexProvider
from .journal import KINDS, REPLY_KIND, Journal, JournalError
from .panes import MODES, PANE_IDS, PANE_LABEL, Pane, Registry

ROOT = Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("PORT", "3777"))
APP_URL = f"http://127.0.0.1:{PORT}"
DEFAULT_DIR = os.environ.get("CHAT_WORK_DIR", "/Users/Shared/simple-claude-chat")
LAST_PROJECT_FILE = Path(os.path.expanduser("~/.harness-last-project"))
NODE = os.environ.get("NODE_BIN") or next((p for p in [os.path.expanduser("~/.local/bin/node"), "/opt/homebrew/bin/node", "/usr/local/bin/node"] if os.path.exists(p)), "node")
CLAUDE_MODELS = [
    {"id": "claude-sonnet-5", "label": "Sonnet 5"}, {"id": "claude-fable-5-1", "label": "Fable 5.1"},
    {"id": "claude-opus-5", "label": "Opus 5"}, {"id": "claude-haiku-4-5-20251001", "label": "Haiku 4.5"},
]
ASK_TIMEOUT_SEC = 30 * 60
MAX_ASK_DEPTH = 3
OWNER = "owner"
HARNESS = "harness"
FROM_LABEL = {OWNER: "владелец", HARNESS: "харнесс"}


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
        self.bridge.app = self
        self.claude = ClaudeProvider(self.registry, self.bridge)
        self.codex = CodexProvider(self.registry, APP_URL, [NODE, str(ROOT / "bin" / "pane-mcp.mjs")])
        self.registry.providers = {"claude": self.claude, "codex": self.codex}
        self.owner = Pane(id=OWNER, vendor="human", label="владелец", model="")   # только для событий владельцу
        self.journal: Journal | None = None
        self.project_dir: str | None = None
        self.pumps: dict[str, asyncio.Task] = {}
        self.waiting: dict[int, asyncio.Future] = {}

    def provider(self, pane: Pane):
        return self.registry.providers[pane.vendor]

    def label_of(self, seat: str) -> str:
        p = self.registry.get(seat)
        return p.label if p else FROM_LABEL.get(seat, seat)

    # ---------- линия проекта ----------
    def open_project(self, path: str) -> None:
        self.project_dir = path
        self.journal = Journal(path)
        saved = self.journal.load_panes()
        for p in self.registry.panes.values():
            p.cwd = path
            p.transcript.clear(); p.seen.clear(); p.nudged.clear()
            st = saved.get(p.id) or {}
            if st:
                self.registry.update(p, {"model": st.get("model"), "mode": st.get("mode"), "sessionId": st.get("sessionId"), "digest": st.get("digest")}, valid_dir)
                p.touched = True
        if not os.environ.get("HARNESS_NO_LAST"):
            try:
                LAST_PROJECT_FILE.write_text(path, encoding="utf-8")
            except OSError:
                pass
        print(f"[harness] линия: {path} · журнал {self.journal.channel} · записей {self.journal.last_seq}", flush=True)

    def save_panes(self) -> None:
        if self.journal:
            self.journal.save_panes({pid: p.persist() for pid, p in self.registry.panes.items()})

    # ---------- журнал и доставка ----------
    def post(self, sender: str, to, kind: str, text: str, thread=None, reply_to=None, evidence=None,
             score=None, round_=None, origin=None) -> dict:
        """Положить запись в журнал и разбудить адресатов. Единственная точка записи для агентов и владельца."""
        if isinstance(to, str):
            to = [to]
        to = list(to or [])
        if "*" in to:
            to = [p for p in PANE_IDS if p != sender] + ([OWNER] if sender != OWNER else [])
        for t in to:
            if t != OWNER and not self.registry.get(t):
                raise JournalError("to_unknown", f"нет такого окна: {t}; есть {', '.join(PANE_IDS)} и owner")
            if t == sender:
                raise JournalError("self_addressed", "запись самому себе не нужна")
        if kind == "verdict":
            if score is None or not isinstance(score, int) or not (0 <= score <= 10):
                raise JournalError("score_invalid", "verdict требует score — целое от 0 до 10")
            if round_ is None or not isinstance(round_, int) or round_ < 1:
                raise JournalError("round_invalid", "verdict требует round — целое от 1")
            if reply_to is None:
                raise JournalError("reply_to_required", "verdict — только ответ на review-request (reply_to)")
        if reply_to is not None:
            target = self.journal.get(reply_to)
            if target is None or target.get("kind") in ("protocol", "policy"):
                raise JournalError("reply_to_missing", f"нет записи #{reply_to}, на которую можно ответить")
        rec = self.journal.append(sender=sender, to=to, kind=kind, text=text, thread=thread, reply_to=reply_to,
                                  evidence=evidence, score=score, round=round_, origin=origin)
        src = self.registry.get(sender)
        if src:
            src.publish({"type": "sent", "record": rec})
            if reply_to is not None:
                src.replied.add(reply_to)
        for t in to:
            if t == OWNER:
                self.owner.publish({"type": "owner", "record": rec})
            else:
                p = self.registry.get(t)
                p.publish({"type": "queued", "record": rec, "pending": len(self.journal.pending_for(t))})
                self.kick(p)
        fut = self.waiting.get(reply_to) if reply_to is not None else None
        if fut and not fut.done():
            fut.set_result(rec)
        return rec

    def kick(self, pane: Pane) -> None:
        t = self.pumps.get(pane.id)
        if t and not t.done():
            return
        self.pumps[pane.id] = asyncio.get_running_loop().create_task(self.pump(pane))

    async def pump(self, pane: Pane) -> None:
        """Доставка: пока окно свободно и есть входящие — один ход на все накопившиеся записи."""
        while not pane.busy:
            recs = self.journal.pending_for(pane.id)
            if not recs:
                return
            self.journal.advance(pane.id, recs[-1]["seq"])
            pane.publish({"type": "delivered", "records": recs})
            for r in recs:
                pane.record("me" if r["from"] == OWNER else "peer", r["text"] if r["from"] == OWNER else f"[от {self.label_of(r['from'])}] {r['text']}")
            work = [r for r in recs if r["kind"] not in ("stop",)]
            if not work:
                continue
            try:
                await self.run_turn(pane, self.render_inbox(work, pane), origin="inbox", records=work)
            except Exception as e:  # noqa: BLE001
                print(f"[harness] {pane.id}: {e}", file=sys.stderr, flush=True)

    def render_inbox(self, recs: list[dict], pane: Pane) -> str:
        if len(recs) == 1 and recs[0]["from"] == OWNER and recs[0]["kind"] in ("task", "note", "question"):
            return recs[0]["text"]
        lines = [f"Входящие записи: {len(recs)}."]
        for r in recs:
            head = f"[#{r['seq']} · {r['kind']} · от {self.label_of(r['from'])}"
            if r.get("thread"):
                head += f" · тред {r['thread']}"
            if r.get("reply_to") is not None:
                head += f" · ответ на #{r['reply_to']}"
            lines.append(head + "]\n" + r["text"])
        lines.append("Как отвечать: на question — send kind=answer с reply_to=<seq>; на task — send kind=status; на review-request — "
                     "send kind=verdict с score и round. Если не ответишь сам, твой итоговый текст уйдёт автоматически как ответ "
                     "на question и task; на review-request автоответа нет.")
        return "\n\n".join(lines)

    def after_turn(self, pane: Pane, records: list[dict], text: str) -> None:
        """Страховка после хода: автоответы на question и task соседей, напоминание и эскалация по вердиктам."""
        for r in records or []:
            if r["from"] in (OWNER, HARNESS) or r["seq"] in pane.replied:
                continue
            k = r["kind"]
            if k in ("question", "task") and text.strip():
                try:
                    self.post(pane.id, [r["from"]], REPLY_KIND[k], text, thread=r.get("thread"), reply_to=r["seq"], origin="auto")
                except JournalError as e:
                    print(f"[harness] автоответ не записан: {e}", file=sys.stderr, flush=True)
            elif k == "review-request":
                pane.awaiting[r["seq"]] = r
        for seq, r in list(pane.awaiting.items()):
            if any(x.get("kind") == "verdict" for x in self.journal.replies_to(seq)):
                pane.awaiting.pop(seq, None)
                continue
            if seq not in pane.nudged:
                pane.nudged.add(seq)
                self.post(HARNESS, [pane.id], "note",
                          f"Вердикт на review-request #{seq} не получен. Пришли send kind=verdict reply_to={seq} с score (0..10), round и путём к отчёту в evidence.",
                          thread=r.get("thread"), origin="nudge")
            else:
                pane.awaiting.pop(seq, None)
                self.post(HARNESS, [OWNER, r["from"]], "escalation",
                          f"{pane.label} дважды не дало вердикт на review-request #{seq}.", thread=r.get("thread"), origin="nudge")

    async def ask(self, src: Pane, to: str, text: str, thread, depth: int = 0) -> dict:
        dst = self.registry.get(to)
        if dst is None or dst is src:
            raise JournalError("to_unknown", f"нет такого окна: {to}")
        if depth >= MAX_ASK_DEPTH:
            raise RuntimeError(f"цепочка вопросов длиннее {MAX_ASK_DEPTH}")
        if src.id in dst.asking:
            raise RuntimeError(f"{dst.label} само ждёт ответа от тебя; ответь ему записью send, а не встречным вопросом")
        rec = self.post(src.id, [to], "question", text, thread=thread, origin="ask")
        fut = asyncio.get_running_loop().create_future()
        self.waiting[rec["seq"]] = fut
        src.asking.add(to)
        self.bridge.set_depth(dst, depth + 1)
        try:
            reply = await asyncio.wait_for(fut, ASK_TIMEOUT_SEC)
        except asyncio.TimeoutError:
            raise RuntimeError("адресат не ответил за отведённое время")
        finally:
            src.asking.discard(to)
            self.waiting.pop(rec["seq"], None)
        src.publish({"type": "peerReply", "from": to, "text": reply.get("text", "")[:4000], "seq": reply.get("seq")})
        return reply

    # ---------- один ход окна ----------
    async def run_turn(self, pane: Pane, message: str, origin: str = "inbox", records=None, depth: int = 0) -> str:
        if pane.busy:
            raise RuntimeError(f"{pane.label} занято")
        if not valid_dir(pane.cwd):
            raise RuntimeError(f"папки нет: {pane.cwd}")
        pane.busy = True
        pane.touched = True
        pane.interrupt = None
        pane.steer = None
        pane.turn_records = list(records or [])
        pane.replied = set()
        pane.publish({"type": "state", **pane.settings()})
        try:
            digest = self.registry.build_digest(pane)
            full = f"{digest}\n\n---\nСообщение тебе:\n{message}" if digest else message
            if digest:
                pane.publish({"type": "note", "text": f"в сообщение добавлена сводка соседей ({len(digest)} символов)"})
            text = await self.provider(pane).run_turn(pane, full, depth)
            pane.record("ai", text)
            self.after_turn(pane, pane.turn_records, text)
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
            pane.steer = None
            self.save_panes()
            pane.publish({"type": "state", **pane.settings(), "pending": len(self.journal.pending_for(pane.id)) if self.journal else 0})
            self.kick(pane)

    # ---------- HTTP ----------
    async def index(self, request):
        return web.FileResponse(ROOT / "index.html")

    async def status(self, request):
        info = await self.codex.info()
        self.registry.models["codex"] = info["models"]
        for p in self.registry.panes.values():
            if p.vendor == "codex" and not any(m["id"] == p.model for m in info["models"]) and info["models"]:
                p.model = info["models"][0]["id"]
        return web.json_response({
            "project": self.project_dir, "defaultDir": DEFAULT_DIR, "models": self.registry.models, "modes": MODES, "kinds": KINDS,
            "panes": [{**p.settings(), "pending": len(self.journal.pending_for(p.id))} for p in self.registry.panes.values()],
            "auth": {"claude": claude_auth(), "codex": info["account"]},
            "journal": {"lastSeq": self.journal.last_seq, "path": str(self.journal.channel)},
        })

    async def dir_check(self, request):
        cwd = request.query.get("cwd", "")
        if not valid_dir(cwd):
            return web.json_response({"ok": False, "error": f"папки нет или это не папка: {cwd}"}, status=400)
        return web.json_response({"ok": True, "cwd": cwd, "hasClaudeMd": os.path.exists(os.path.join(cwd, "CLAUDE.md")),
                                  "hasAgentsMd": os.path.exists(os.path.join(cwd, "AGENTS.md")), "hasHarness": os.path.isdir(os.path.join(cwd, ".harness"))})

    async def project_set(self, request):
        body = await request.json()
        path = str(body.get("path") or "")
        if not valid_dir(path):
            return web.json_response({"ok": False, "error": f"папки нет или это не папка: {path}"}, status=400)
        if path == self.project_dir:
            return web.json_response({"ok": True, "project": path, "changed": False})
        if any(p.busy for p in self.registry.panes.values()):
            return web.json_response({"ok": False, "error": "идёт ход: смени папку, когда все окна свободны"}, status=409)
        self.open_project(path)
        for p in self.registry.panes.values():
            self.kick(p)
        return web.json_response({"ok": True, "project": path, "changed": True, "panes": [p.settings() for p in self.registry.panes.values()]})

    async def pane_set(self, request):
        p = self.registry.get(request.match_info["id"])
        if not p:
            return web.json_response({"error": "нет окна"}, status=404)
        body = await request.json()
        body.pop("cwd", None)    # папка задаётся линией, не окном
        changed = self.registry.update(p, body, valid_dir)
        if changed:
            self.save_panes()
        return web.json_response({"ok": True, "pane": p.settings()})

    async def events(self, request):
        pid = request.match_info["id"]
        p = self.owner if pid == OWNER else self.registry.get(pid)
        if not p:
            return web.json_response({"error": "нет окна"}, status=404)
        resp = web.StreamResponse(headers={"Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
        await resp.prepare(request)
        q: asyncio.Queue = asyncio.Queue(maxsize=2000)
        p.subscribers.add(q)
        try:
            await resp.write(b": ok\n\n")
            for a in list(p.approvals.values()):
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
        """Сообщение владельца окну: запись в журнал и в очередь; идущий ход не прерывается."""
        body = await request.json()
        p = self.registry.get(str(body.get("pane") or ""))
        if not p:
            return web.json_response({"error": "нет окна"}, status=404)
        body.pop("cwd", None)
        if self.registry.update(p, body, valid_dir):
            self.save_panes()
        message = str(body.get("message") or "").strip()
        kind = str(body.get("kind") or "task")
        if not message:
            return web.json_response({"error": "пустое сообщение"}, status=400)
        if kind not in ("task", "question", "note", "stop", "resume", "decision"):
            return web.json_response({"error": f"владелец пишет виды task, question, note, stop, resume, decision; получено {kind}"}, status=400)
        try:
            rec = self.post(OWNER, [p.id], kind, message, thread=body.get("thread") or None)
        except JournalError as e:
            return web.json_response({"ok": False, "code": e.code, "error": str(e)}, status=400)
        if kind == "stop" and p.busy and p.interrupt:
            try:
                await p.interrupt()
            except Exception as e:  # noqa: BLE001
                print(f"[harness] stop {p.id}: {e}", file=sys.stderr, flush=True)
        return web.json_response({"ok": True, "seq": rec["seq"], "queued": p.busy})

    async def steer(self, request):
        """Прямая инструкция владельца в идущий ход. Если хода нет — обычная запись в очередь."""
        body = await request.json()
        p = self.registry.get(str(body.get("pane") or ""))
        text = str(body.get("text") or "").strip()
        if not p:
            return web.json_response({"error": "нет окна"}, status=404)
        if not text:
            return web.json_response({"error": "пустое сообщение"}, status=400)
        if p.busy and p.steer:
            rec = self.journal.append(sender=OWNER, to=[p.id], kind="note", text=text, origin="steer")
            self.journal.advance(p.id, rec["seq"])
            p.record("me", text)
            try:
                await p.steer(text)
            except Exception as e:  # noqa: BLE001
                return web.json_response({"ok": False, "error": f"вмешаться не удалось: {str(e)[:200]}"})
            p.publish({"type": "steered", "record": rec})
            return web.json_response({"ok": True, "seq": rec["seq"], "steered": True})
        rec = self.post(OWNER, [p.id], "task", text)
        return web.json_response({"ok": True, "seq": rec["seq"], "steered": False})

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
        if not p:
            return web.json_response({"error": "нет окна"}, status=400)
        try:
            return web.json_response({"sessions": await self.provider(p).list_sessions(p.cwd)})
        except Exception as e:  # noqa: BLE001
            return web.json_response({"sessions": [], "error": str(e)[:300]})

    async def session_one(self, request):
        p = self.registry.get(request.query.get("pane", "left"))
        sid = request.match_info["id"]
        if not p:
            return web.json_response({"error": "нет окна"}, status=400)
        if p.busy:
            return web.json_response({"error": f"{p.label} занято: идёт ход"}, status=409)
        try:
            msgs = await self.provider(p).session_messages(p.cwd, sid)
        except Exception as e:  # noqa: BLE001
            return web.json_response({"error": str(e)[:300]}, status=404)
        p.session_id = sid
        p.touched = True
        p.transcript = [{"role": m["role"], "text": m["text"], "ts": 0} for m in msgs]
        p.seen = {}
        self.save_panes()
        return web.json_response({"id": sid, "messages": msgs})

    async def api_send(self, request):
        body = await request.json()
        sender = str(body.get("from") or "")
        if not self.registry.get(sender):
            return web.json_response({"ok": False, "error": f"неизвестный отправитель {sender}"}, status=400)
        r = await self.bridge.do_send(sender, body)
        return web.json_response(r, status=200 if r.get("ok") else 400)

    async def api_ask(self, request):
        body = await request.json()
        sender = str(body.get("from") or "")
        if not self.registry.get(sender):
            return web.json_response({"ok": False, "error": f"неизвестный отправитель {sender}"}, status=400)
        r = await self.bridge.do_ask(sender, body)
        return web.json_response(r, status=200 if r.get("ok") else 409)

    async def pane_transcript(self, request):
        r = self.bridge.do_read(request.query.get("from", ""), {"pane": request.query.get("pane", ""), "last_n": request.query.get("last", "20")})
        return web.json_response(r, status=200 if r.get("ok") else 404)

    async def journal_read(self, request):
        try:
            since = int(request.query.get("since", "0"))
            limit = int(request.query.get("limit", "100"))
        except ValueError:
            since, limit = 0, 100
        recs = self.journal.read(since=since, limit=limit, thread=request.query.get("thread") or None)
        return web.json_response({"records": recs, "lastSeq": self.journal.last_seq, "cursors": self.journal.cursors})

    def routes(self, app: web.Application):
        app.router.add_get("/", self.index)
        app.router.add_get("/api/status", self.status)
        app.router.add_get("/api/dir", self.dir_check)
        app.router.add_post("/api/project", self.project_set)
        app.router.add_post("/api/panes/{id}", self.pane_set)
        app.router.add_get("/api/events/{id}", self.events)
        app.router.add_post("/api/chat", self.chat)
        app.router.add_post("/api/steer", self.steer)
        app.router.add_post("/api/approve", self.approve)
        app.router.add_post("/api/interrupt", self.interrupt)
        app.router.add_get("/api/sessions", self.sessions)
        app.router.add_get("/api/sessions/{id}", self.session_one)
        app.router.add_post("/api/send", self.api_send)
        app.router.add_post("/api/ask", self.api_ask)
        app.router.add_get("/api/pane_transcript", self.pane_transcript)
        app.router.add_get("/api/journal", self.journal_read)


def main():
    os.makedirs(DEFAULT_DIR, exist_ok=True)
    core = App()
    start_dir = DEFAULT_DIR
    if LAST_PROJECT_FILE.exists():
        last = LAST_PROJECT_FILE.read_text("utf-8").strip()
        if valid_dir(last):
            start_dir = last
    app = web.Application(client_max_size=2_000_000)
    core.routes(app)

    async def on_startup(_):
        core.open_project(start_dir)
        asyncio.create_task(core.codex.info())
        for p in core.registry.panes.values():
            core.kick(p)

    async def on_shutdown(_):
        await core.codex.close()
    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)
    print(f"[harness] {APP_URL}\n[harness] claude: {CLAUDE_BIN or 'НЕ НАЙДЕН'}; node для моста Codex: {NODE}", flush=True)
    a = claude_auth()
    print(f"[harness] вход Claude по подписке: {'да (' + str(a.get('authMethod')) + ')' if a.get('loggedIn') else 'НЕТ — выполни в Терминале: claude login'}", flush=True)
    logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(message)s")
    web.run_app(app, host="127.0.0.1", port=PORT, print=None, access_log=None)


if __name__ == "__main__":
    main()
