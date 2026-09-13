"""Реестр окон (мест): настройки, занятость, подписчики событий, запросы разрешений,
стенограмма для сводки соседям. Окна строятся из манифеста команды team.yaml."""
from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

APPROVAL_TIMEOUT_SEC = 15 * 60
DIGEST_MAX_CHARS = 6000
DIGEST_ITEM_CHARS = 700

# Режимы доступа к папке — одни названия для обоих вендоров, внутри ложатся на их механизмы.
MODES = [
    {"id": "chat", "label": "Только чат"},
    {"id": "read", "label": "Чтение папки"},
    {"id": "check", "label": "Чтение и команды"},
    {"id": "web", "label": "Чтение и интернет"},
    {"id": "ask", "label": "Спрашивать"},
    {"id": "edit", "label": "Правки без вопросов"},
    {"id": "all", "label": "Всё без вопросов"},
]
MODE_IDS = {m["id"] for m in MODES}


@dataclass
class Approval:
    id: str
    pane: str
    title: str
    detail: str
    future: asyncio.Future


@dataclass
class Pane:
    id: str
    vendor: str
    label: str
    model: str
    mode: str = "chat"
    cwd: str = ""
    role: str = ""
    write_paths: list = field(default_factory=list)
    worktree: str | None = None       # абсолютный путь worktree, если у места своя ветка
    branch: str | None = None
    session_id: str | None = None
    digest: bool = False
    busy: bool = False
    touched: bool = False
    collapsed: bool = False
    subscribers: set[asyncio.Queue] = field(default_factory=set)
    transcript: list[dict] = field(default_factory=list)   # {role: me|ai|peer, text, ts}
    seen: dict[str, int] = field(default_factory=dict)      # сколько реплик соседа уже показано в сводке
    approvals: dict[str, Approval] = field(default_factory=dict)
    interrupt: Callable[[], Awaitable[None]] | None = None
    steer: Callable[[str], Awaitable[None]] | None = None
    tokens: dict = field(default_factory=dict)
    turn_records: list = field(default_factory=list)
    replied: set = field(default_factory=set)
    asking: set = field(default_factory=set)
    nudged: set = field(default_factory=set)
    awaiting: dict = field(default_factory=dict)

    def publish(self, ev: dict) -> None:
        for q in list(self.subscribers):
            try:
                q.put_nowait(ev)
            except asyncio.QueueFull:
                self.subscribers.discard(q)

    def record(self, role: str, text: str) -> None:
        if text and text.strip():
            self.transcript.append({"role": role, "text": text, "ts": time.time()})

    def settings(self) -> dict:
        return {
            "id": self.id, "vendor": self.vendor, "label": self.label, "role": self.role, "model": self.model, "mode": self.mode,
            "cwd": self.cwd, "sessionId": self.session_id, "digest": self.digest, "busy": self.busy, "writePaths": self.write_paths,
            "worktree": self.worktree, "branch": self.branch,
            "touched": self.touched, "pendingApprovals": len(self.approvals),
        }

    def persist(self) -> dict:
        return {"model": self.model, "mode": self.mode, "sessionId": self.session_id, "digest": self.digest}

    async def ask_approval(self, title: str, detail: str, timeout: float = APPROVAL_TIMEOUT_SEC) -> bool:
        """Показать карточку в окне и дождаться решения владельца. Таймаут = отказ."""
        loop = asyncio.get_running_loop()
        a = Approval(id=uuid.uuid4().hex[:12], pane=self.id, title=title, detail=detail, future=loop.create_future())
        self.approvals[a.id] = a
        self.publish({"type": "approval", "id": a.id, "title": title, "detail": detail})
        try:
            return bool(await asyncio.wait_for(a.future, timeout))
        except asyncio.TimeoutError:
            self.publish({"type": "approvalResolved", "id": a.id, "decision": "timeout"})
            return False
        finally:
            self.approvals.pop(a.id, None)

    def resolve_approval(self, approval_id: str, allow: bool) -> bool:
        a = self.approvals.get(approval_id)
        if not a or a.future.done():
            return False
        a.future.set_result(allow)
        self.publish({"type": "approvalResolved", "id": approval_id, "decision": "allow" if allow else "deny"})
        return True


class Registry:
    """Окна линии, построенные из мест манифеста."""

    def __init__(self, default_cwd: str, models: dict[str, list[dict]], seats: list | None = None):
        self.default_cwd = default_cwd
        self.models = models
        self.panes: dict[str, Pane] = {}
        self.providers: dict[str, Any] = {}
        self.policy = None      # app.policy.Policy, ставит сервер
        for s in seats or []:
            self.panes[s.id] = Pane(id=s.id, vendor=s.vendor, label=s.label, model=s.model, mode=s.mode, cwd=default_cwd,
                                    role=s.role, write_paths=list(s.write_paths), digest=bool(s.digest))

    @property
    def ids(self) -> list[str]:
        return list(self.panes)

    def get(self, pid: str) -> Pane | None:
        return self.panes.get(pid)

    def others(self, pid: str) -> list[Pane]:
        return [p for k, p in self.panes.items() if k != pid]

    def role_of(self, seat: str) -> str:
        if seat == "owner":
            return "owner"
        p = self.panes.get(seat)
        return p.role if p else seat

    def can_observe(self, viewer: str, target: str) -> bool:
        if self.policy is None:
            return True
        return self.policy.can_observe(self.role_of(viewer), self.role_of(target))

    def update(self, p: Pane, body: dict, valid_dir: Callable[[str], bool]) -> bool:
        """Настройки от страницы. Во время хода ничего не меняем: страница не может перебить идущий ход."""
        if p.busy:
            return False
        p.touched = True
        model = body.get("model")
        known = self.models.get(p.vendor, [])
        if isinstance(model, str) and model and (any(m["id"] == model for m in known) or (p.vendor == "codex" and len(known) <= 1)):
            p.model = model
        mode = body.get("mode")
        if mode in MODE_IDS:
            p.mode = mode
        cwd = body.get("cwd")
        if isinstance(cwd, str) and valid_dir(cwd):
            if cwd != p.cwd:
                p.transcript.clear(); p.seen.clear()
            p.cwd = cwd
        if "sessionId" in body:
            sid = body.get("sessionId")
            new = sid if isinstance(sid, str) and sid else None
            if new != p.session_id:
                p.transcript.clear(); p.seen.clear()
            p.session_id = new
        if "digest" in body:
            p.digest = bool(body.get("digest"))
        return True

    def build_digest(self, p: Pane) -> str:
        """Что нового у соседей с прошлого хода — только у тех, кого роль вправе наблюдать."""
        if not p.digest:
            return ""
        parts: list[str] = []
        total = 0
        for o in self.others(p.id):
            if not self.can_observe(p.id, o.id):
                continue
            start = p.seen.get(o.id, 0)
            new = o.transcript[start:]
            p.seen[o.id] = len(o.transcript)
            if not new:
                continue
            lines = [f"[{o.id} · {o.label} · {o.vendor} · {o.model} · режим {o.mode}]"]
            for m in new:
                who = {"me": "владелец", "ai": "агент", "peer": "сосед"}.get(m["role"], m["role"])
                t = m["text"].strip().replace("\r", "")
                if len(t) > DIGEST_ITEM_CHARS:
                    t = t[:DIGEST_ITEM_CHARS] + " …"
                lines.append(f"{who}: {t}")
            block = "\n".join(lines)
            if total + len(block) > DIGEST_MAX_CHARS:
                block = block[: max(0, DIGEST_MAX_CHARS - total)] + " …"
            parts.append(block)
            total += len(block)
            if total >= DIGEST_MAX_CHARS:
                break
        if not parts:
            return ""
        return "Что нового у соседних окон с твоего прошлого хода (для сведения, это не задания тебе):\n" + "\n\n".join(parts)

    def transcript_of(self, pid: str, last_n: int = 20) -> str:
        p = self.panes.get(pid)
        if not p:
            return f"нет окна {pid}"
        msgs = p.transcript[-last_n:] if last_n > 0 else p.transcript
        if not msgs:
            return f"{p.id} ({p.label}): разговор пуст"
        out = [f"{p.id} · {p.label} · {p.vendor} · {p.model} · режим {p.mode} · последние {len(msgs)} реплик"]
        for m in msgs:
            who = {"me": "владелец", "ai": "агент", "peer": "сосед"}.get(m["role"], m["role"])
            out.append(f"{who}: {m['text'][:2000]}")
        return "\n".join(out)
