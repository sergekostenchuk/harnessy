"""Сервер харнесса: места из манифеста команды над одной папкой проекта, журнал линии,
очередь входящих и автоход, политика связи, инструменты связи между окнами.
Запуск: .venv/bin/python -m app.server  →  http://localhost:3777"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import secrets, subprocess, time
import sys
from pathlib import Path

from aiohttp import web

from . import gitops
from .bridge import Bridge
from .claude_provider import CLAUDE_BIN, ClaudeProvider, child_env
from .codex_provider import CodexProvider
from .evidence import check_report, resolve_evidence
from .journal import KINDS, REPLY_KIND, Journal, JournalError
from .panes import MODE_IDS, MODES, Pane, Registry, TaggedSubscriber
from .policy import Policy, PolicyError
from .team import Seat, Team, TeamError, ensure_line, load_team, seed_orchestrator
from . import connections as conn

ROOT = Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("PORT", "3777"))
APP_URL = f"http://127.0.0.1:{PORT}"
DEFAULT_DIR = os.environ.get("CHAT_WORK_DIR", "/Users/Shared/simple-claude-chat")
LAST_PROJECT_FILE = Path(os.path.expanduser("~/.harness-last-project"))
# Прототип Harnessy (экраны из ../ui, сборка ui/deploy/build.py) отдаётся с того же адреса, что и API:
# страницы под /sketches/ ходят в /api/* без CORS. Переопределить папку — HARNESSY_SITE; нет папки — маршрута нет.
SITE_DIR = Path(os.path.expanduser(os.environ["HARNESSY_SITE"])) if os.environ.get("HARNESSY_SITE") else ROOT.parent / "ui" / "deploy" / "out" / "site" / "sketches"   # окно лежит рядом: ~/Harnessy/{core,ui}
NODE = os.environ.get("NODE_BIN") or next((p for p in [os.path.expanduser("~/.local/bin/node"), "/opt/homebrew/bin/node", "/usr/local/bin/node"] if os.path.exists(p)), "node")
CLAUDE_MODELS = [
    {"id": "claude-sonnet-5", "label": "Sonnet 5"}, {"id": "claude-fable-5-1", "label": "Fable 5.1"},
    {"id": "claude-opus-5", "label": "Opus 5"}, {"id": "claude-haiku-4-5-20251001", "label": "Haiku 4.5"},
]
ASK_TIMEOUT_SEC = 30 * 60
ACK_TIMEOUT_SEC = 24 * 60 * 60
MAX_ASK_DEPTH = 3
OWNER = "owner"
HARNESS = "harness"
FROM_LABEL = {OWNER: "владелец", HARNESS: "харнесс"}
OWNER_KINDS = ("task", "question", "note", "stop", "resume", "decision")
# Разговор без роли и роли по ходу (слово владельца 07.10.2026): место «room» вне манифеста; роли назначаются разговорам,
# новое место дописывается в team.yaml с моделью разговора; известные папки — в PROJECTS_FILE.
ROOM_ID = "room"
ROLE_CATALOG = [("orchestrator", "оркестратор", False), ("assistant", "ассистент", False), ("architect", "архитектор", False),
                ("executor", "воркер", True), ("reviewer", "ревьюер", True), ("tester", "тестер", False), ("researcher", "ресёрчер", False)]
PROJECTS_FILE = Path(os.path.expanduser("~/.harness-projects.json"))
PROJECTS_ROOT_DEFAULT = os.path.expanduser(os.environ.get("HARNESS_PROJECTS_ROOT") or "~/Harnessy-Projects")   # проекты, созданные оркестратором из разговора без проекта (настройка projectsRoot)
PINS_FILE = Path(os.path.expanduser(os.environ.get("HARNESS_PINS_FILE") or "~/.harness-pins.json"))   # закреплённые папки и чаты владельца — общие для всех папок
SETTINGS_FILE = Path(os.path.expanduser(os.environ.get("HARNESS_SETTINGS_FILE") or "~/.harness-settings.json"))   # настройки владельца («везде»); проектные — <папка>/.harness/state/settings.json
SETTINGS_APPLIES = {"defaultMode": "режим прав новой роли, если владелец не выбрал", "projectsRoot": "куда создаётся проект из разговора без проекта"}   # что из настроек движок ИСПОЛНЯЕТ; остальное окно показывает недоступным
# окно контекста по модели (таблица движка; неизвестная модель — нет данных, не ноль)
CONTEXT_WINDOWS = (("gpt-5.3-codex-spark", 128_000), ("claude-", 200_000), ("gpt-", 400_000), ("deepseek", 128_000), ("qwen", 128_000), ("glm", 128_000), ("kimi", 256_000))
HANDOFF_MARKS = ("Прочитай контекст чата от", "Контекст разговора владельца", "Контекст прежнего чата", "Прежний разговор")


def context_window(model: str):
    m = (model or "").lower()
    for key, n in CONTEXT_WINDOWS:
        if m.startswith(key) or key in m:
            return n
    return None


def est_tokens(text: str) -> int:
    """Оценка размера текста в токенах (русский ≈ 3,2 символа на токен). Оценка, не измерение — так и подписывается."""
    return int(len(text) / 3.2) + 1 if text else 0


ALLOWED_HOSTS = {f"localhost:{PORT}", f"127.0.0.1:{PORT}", f"[::1]:{PORT}"}
ORIGIN_ERRORS = {"host_denied": "запрос не с локального адреса окна", "origin_denied": "запрос с чужой страницы отклонён",
                 "content_type": "тело запроса должно быть application/json"}


def check_browser_origin(method: str, path: str, headers) -> tuple[int, str] | None:
    """Для изменяющих запросов (POST и GET /api/sessions/<id>): Host — только локальный адрес окна (X-Forwarded-Host не читается);
    Origin, если прислан браузером, — только http://<тот же адрес>, чужой или null → 403; POST /api/* — только application/json
    (чужая страница без preflight такой запрос прислать не может). Отсутствие Origin допустимо: локальные клиенты (мост, curl)."""
    if not path.startswith("/api/"):
        return None
    if (headers.get("Host") or "") not in ALLOWED_HOSTS:   # Host — для ВСЕХ /api/*, включая чтение и поток событий (DNS rebinding читает данные; вердикт №60)
        return 403, "host_denied"
    mutating = method == "POST" or (method in ("GET", "HEAD") and path.startswith("/api/sessions/"))   # HEAD aiohttp ведёт в GET-обработчик (вердикт №60)
    if not mutating:
        return None
    origin = headers.get("Origin")
    if origin is not None and origin not in {f"http://{h}" for h in ALLOWED_HOSTS}:
        return 403, "origin_denied"
    if origin is None and (headers.get("Sec-Fetch-Site") or "").lower() in ("cross-site", "same-site"):   # браузерный GET без Origin (<img>, no-cors) — уточнение ревьюера №57
        return 403, "origin_denied"
    if method == "POST" and path.startswith("/api/") and (headers.get("Content-Type") or "").split(";")[0].strip().lower() != "application/json":
        return 415, "content_type"
    return None


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
        self.chats = {"chats": {}, "active": {}}      # чаты мест: <папка>/.harness/state/chats.json (слово владельца 08.10.2026)
        self.models = {"claude": CLAUDE_MODELS, "codex": [{"id": "gpt-5.6-sol", "label": "gpt-5.6-sol"}]}
        self.registry = Registry(DEFAULT_DIR, self.models, [])
        self.bridge = Bridge(self.registry)
        self.bridge.app = self
        self.claude = ClaudeProvider(self.registry, self.bridge)
        self.codex = CodexProvider(self.registry, APP_URL, [NODE, str(ROOT / "bin" / "pane-mcp.mjs")])
        self.codex.role_note = self.role_note
        self.registry.providers = {"claude": self.claude, "codex": self.codex}
        self.owner = Pane(id=OWNER, vendor="human", label="владелец", model="")
        self.journal: Journal | None = None
        self.team: Team | None = None
        self.policy: Policy | None = None
        self.line_errors: list[str] = []
        self.project_dir: str | None = None
        self.pumps: dict[str, asyncio.Task] = {}
        self.waiting: dict[int, asyncio.Future] = {}
        self.threads: dict[str, dict] = {}
        self.repo_root: str | None = None
        self.codex.writable_roots = self._writable_roots
        self.halted = False                      # выключатель владельца: ходы не идут, записи ждут в очереди

    def _writable_roots(self, pane: Pane) -> list[str]:
        """Что Codex может писать сверх своей папки: .git проекта (коммиты из worktree) и папку свидетельств."""
        if not self.repo_root:
            return []
        roots = [os.path.join(self.repo_root, ".harness", "evidence")]
        if pane.worktree:
            roots.insert(0, os.path.join(self.repo_root, ".git"))
        return roots

    def provider(self, pane: Pane):
        return self.registry.providers[pane.vendor]

    def label_of(self, seat: str) -> str:
        p = self.registry.get(seat)
        return p.label if p else FROM_LABEL.get(seat, seat)

    def role_of(self, seat: str) -> str:
        return self.registry.role_of(seat)

    # ---------- линия проекта ----------
    async def open_project(self, path: str) -> None:
        for t in self.pumps.values():
            t.cancel()
        self.pumps.clear()
        await self.codex.close()
        harness_dir = ensure_line(path)
        self.line_errors = []
        try:
            self.team = load_team(harness_dir)
            seats = list(self.team.seats.values())
            self.line_errors.extend(self.team.warnings)
        except TeamError as e:
            self.team, seats = None, []
            self.line_errors.append(str(e))
        try:
            self.policy = Policy(harness_dir / "comms-policy.yaml")
        except PolicyError as e:
            self.policy = None
            self.line_errors.append(str(e))
        self.project_dir = path
        self.journal = Journal(path)
        self.registry = Registry(path, self.models, seats)
        self.registry.policy = self.policy
        self.registry.providers = {"claude": self.claude, "codex": self.codex}
        self.bridge.registry = self.registry
        self.claude.registry = self.registry
        self.codex.registry = self.registry
        # git и worktree мест
        self.repo_root = gitops.repo_root(path) if gitops.own_repo(path) else None   # только свой репозиторий: папка внутри чужого git — «без git»
        if self.repo_root is None and gitops.is_repo(path):
            self.line_errors.append(f"папка лежит внутри чужого git-репозитория ({gitops.repo_root(path)}): свой git не создан — создайте проект заново или выполните git init в папке")
        wanted = [s for s in seats if s.worktree]
        if wanted and not self.repo_root:
            self.line_errors.append("папка проекта не git-репозиторий: worktree не созданы, все места работают в корне")
        elif self.repo_root:
            os.makedirs(os.path.join(self.repo_root, ".harness", "evidence"), exist_ok=True)
            for pat in (".harness/state/", ".harness/evidence/", ".harness/digests/", ".harness/logs/"):
                gitops.ensure_exclude(self.repo_root, pat)   # состояние линии вне git; манифест, политика и роли — в git
            for sd in wanted:
                wt, note = gitops.ensure_worktree(self.repo_root, sd.id, sd.worktree, self.team.integration_branch)
                pane = self.registry.get(sd.id)
                if wt:
                    pane.cwd = wt
                    pane.worktree = wt
                    pane.branch = f"seat/{sd.id}"
                else:
                    self.line_errors.append(f"{sd.id}: {note}")
        saved = self.journal.load_panes()
        if isinstance(saved.get(ROOM_ID), dict) and saved[ROOM_ID].get("model"):
            self._make_room(saved[ROOM_ID].get("model"), saved[ROOM_ID].get("mode") or "read", vendor=saved[ROOM_ID].get("vendor"), quiet=True)
        if not os.environ.get("HARNESS_NO_LAST"):   # тесты (временные папки) список папок владельца не засоряют
            self._remember_project(path)
        for p in self.registry.panes.values():
            st = saved.get(p.id) or {}
            if st.get("vendor") in self.registry.providers and st.get("vendor") != p.vendor:
                p.vendor = st["vendor"]      # место сменило вендора через выбор модели — восстановить до применения модели
            if st:
                self.registry.update(p, {"model": st.get("model"), "mode": st.get("mode"), "sessionId": st.get("sessionId"), "digest": st.get("digest")}, valid_dir)
                p.touched = True
        self._load_chats()
        self._load_halt()
        self.threads = {}
        for r in self.journal.read(limit=0):
            if r.get("kind") == "verdict" and r.get("thread"):
                self._note_verdict(r, announce=False)
            elif r.get("kind") == "status" and r.get("origin") == "merge" and r.get("thread"):
                st = self.threads.setdefault(r["thread"], {"rounds": 0, "accepted": True, "lastScore": None, "sha": r.get("sha"), "merged": None})
                merged = r.get("merged")
                if not merged and self.repo_root and st.get("sha") and self.team:      # записи до появления поля: истина в git
                    merged = gitops.merge_commit_for(self.repo_root, st["sha"], self.team.integration_branch)
                st["merged"] = merged or st.get("merged")
        if not os.environ.get("HARNESS_NO_LAST"):
            try:
                LAST_PROJECT_FILE.write_text(path, encoding="utf-8")
            except OSError:
                pass
        print(f"[harness] линия: {path} · мест {len(seats)} · политика v{self.policy.version if self.policy else '—'} · записей {self.journal.last_seq}"
              + (f" · ошибки: {'; '.join(self.line_errors)}" if self.line_errors else ""), flush=True)

    def save_panes(self) -> None:
        if self.journal:
            self.journal.save_panes({pid: p.persist() for pid, p in self.registry.panes.items()})
            self._sync_chats()

    def role_note(self, pane: Pane) -> str:
        """Инструкции роли и её маршруты — в системный промпт места."""
        parts = []
        if self.team and pane.id in self.team.seats:
            text = self.team.instructions_for(self.team.seats[pane.id]).strip()
            if text:
                parts.append(text)
        if self.policy:
            parts.append(self.policy.summary_for(pane.role, {p.id: p.role for p in self.registry.panes.values()},
                                                 {p.id: p.label for p in self.registry.panes.values()}))
        if pane.write_paths:
            parts.append("Правки файлов тебе разрешены только в: " + ", ".join(pane.write_paths) + ". Остальное — только чтение.")
        where = [f"Корень проекта: {self.project_dir}."]
        if self.team:
            where.append(f"Интеграционная ветка: {self.team.integration_branch}.")
        if pane.worktree:
            where.append(f"Твоя рабочая папка: {pane.worktree} — worktree на ветке {pane.branch}; корень проекта и чужие worktree не трогай.")
        else:
            where.append("Ты работаешь в корне проекта.")
        if self.repo_root:
            where.append(f"Отчёты ревью и тестов: {self.project_dir}/.harness/evidence/<тред>/r<раунд>/report.md с разделами Ran, Skipped, Planned, Manual.")
            if self.team and pane.role in self.team.merge_roles:
                where.append("Слияние принятых вех — только инструментом merge с SHA принятого вердикта.")
        else:
            where.append("Папка не под git: worktree, sha и слияние недоступны.")
        parts.append(" ".join(where))
        return "\n\n".join(parts)

    def _reload_policy_if_changed(self) -> None:
        if self.policy is None:
            return
        try:
            if self.policy.maybe_reload():
                rec = self.journal.append(sender=HARNESS, to=["*"], kind="policy", text=f"политика связи перечитана: версия {self.policy.version}", policy=self.policy.version)
                self.owner.publish({"type": "owner", "record": rec})
        except PolicyError as e:
            self.line_errors = [str(e)]
            print(f"[harness] политика не перечитана: {e}", file=sys.stderr, flush=True)

    # ---------- журнал, политика, доставка ----------
    def post(self, sender: str, to, kind: str, text: str, thread=None, reply_to=None, evidence=None,
             score=None, round_=None, origin=None, sha=None, merged=None) -> dict:
        """Единственная точка записи для агентов и владельца: проверка политики, журнал, доставка."""
        if isinstance(to, str):
            to = [to]
        to = list(to or [])
        if "*" in to:
            to = [p for p in self.registry.ids if p != sender] + ([OWNER] if sender != OWNER else [])
        for t in to:
            if t != OWNER and not self.registry.get(t):
                raise JournalError("to_unknown", f"нет такого окна: {t}; есть {', '.join(self.registry.ids)} и owner")
            if t == sender:
                raise JournalError("self_addressed", "запись самому себе не нужна")
        if kind == "verdict":
            if score is None or isinstance(score, bool) or not isinstance(score, int) or not (0 <= score <= 10):
                raise JournalError("score_invalid", "verdict требует score — целое от 0 до 10")
            if round_ is None or isinstance(round_, bool) or not isinstance(round_, int) or round_ < 1:
                raise JournalError("round_invalid", "verdict требует round — целое от 1")
            if reply_to is None:
                raise JournalError("reply_to_required", "verdict — только ответ на review-request (reply_to)")
        target_rec = None
        if reply_to is not None:
            target_rec = self.journal.get(reply_to)
            if target_rec is None or target_rec.get("kind") in ("protocol", "policy", "ack", "rejected"):
                raise JournalError("reply_to_missing", f"нет записи #{reply_to}, на которую можно ответить")
        evidence = list(evidence or [])
        if sender not in (OWNER, HARNESS):
            if kind == "review-request":
                if self.repo_root:
                    if not sha:
                        raise JournalError("sha_required", "review-request обязан нести sha коммита вехи (git rev-parse HEAD в своей ветке)")
                    full = gitops.resolve_sha(self.repo_root, str(sha))
                    if not full:
                        raise JournalError("sha_unknown", f"коммита {sha} нет в репозитории проекта; закоммить и пришли настоящий SHA")
                    sha = full
            if kind == "verdict":
                if not evidence:
                    raise JournalError("evidence_required", "verdict без отчёта не принимается: положи report.md в .harness/evidence/<тред>/r<раунд>/ и укажи путь в evidence")
                ok_report = None
                for e in evidence:
                    path = resolve_evidence(self.project_dir, e)
                    if path is None:
                        raise JournalError("evidence_outside", f"путь свидетельства вне проекта: {e}")
                    err = check_report(path)
                    if err is None:
                        ok_report = path
                    elif not path.exists():
                        raise JournalError("evidence_missing", err)
                if ok_report is None:
                    raise JournalError("evidence_contract", check_report(resolve_evidence(self.project_dir, evidence[0])))
                if target_rec is not None and target_rec.get("sha"):
                    sha = target_rec["sha"]
            if kind == "report":
                for e in evidence:
                    path = resolve_evidence(self.project_dir, e)
                    if path is None or not path.exists():
                        raise JournalError("evidence_missing", f"файла свидетельства нет: {e}")
        # --- политика связи ---
        self._reload_policy_if_changed()
        pending_ack = False
        bounds: dict = {}
        if sender not in (OWNER, HARNESS):
            if self.policy is None:
                self._reject(sender, to, kind, "политика связи не читается — записи агентов не проходят")
                raise JournalError("policy_denied", "политика связи не читается; исправь comms-policy.yaml")
            for t in to:
                dec = self.policy.check_send(self.role_of(sender), self.role_of(t), kind)
                if not dec.allow:
                    self._reject(sender, to, kind, dec.reason)
                    raise JournalError("policy_denied", dec.reason)
                trig = dec.trigger or ""
                if trig.startswith("reply-to:"):
                    need = trig.split(":", 1)[1]
                    if target_rec is None or target_rec.get("kind") != need or target_rec.get("from") != t:
                        reason = f"политика v{self.policy.version}: {kind} от {self.role_of(sender)} — только ответ на {need} от {self.role_of(t)} (reply_to)"
                        self._reject(sender, to, kind, reason)
                        raise JournalError("policy_denied", reason)
                if dec.pending:
                    pending_ack = True
                bounds = dec.bounds or bounds
        if kind == "verdict" and bounds.get("max_rounds") and round_ > int(bounds["max_rounds"]):
            reason = f"раунд {round_} больше max_rounds={bounds['max_rounds']} треда {thread or target_rec.get('thread')}; эскалируй владельцу"
            self._reject(sender, to, kind, reason)
            raise JournalError("policy_denied", reason)
        extra = {}
        if kind == "verdict":
            extra["accepted"] = bool(bounds.get("accept_score") is not None and score >= int(bounds["accept_score"]))
            extra["bounds"] = bounds or None
        if pending_ack:
            extra["ack"] = "pending"
        rec = self.journal.append(sender=sender, to=to, kind=kind, text=text, thread=thread, reply_to=reply_to, evidence=evidence,
                                  policy=self.policy.version if self.policy else 0, score=score, round=round_, origin=origin, sha=sha, merged=merged, **extra)
        src = self.registry.get(sender)
        if src:
            src.publish({"type": "sent", "record": rec})
            if reply_to is not None:
                src.replied.add(reply_to)
        if pending_ack:
            self.owner.publish({"type": "owner", "record": rec})
            asyncio.get_running_loop().create_task(self._await_ack(rec, src))
            return rec
        self._deliver(rec)
        if kind == "verdict":
            self._note_verdict(rec, announce=True)
        return rec

    def _deliver(self, rec: dict) -> None:
        for t in rec["to"]:
            if t == OWNER:
                self.owner.publish({"type": "owner", "record": rec})
            else:
                p = self.registry.get(t)
                if p:
                    p.publish({"type": "queued", "record": rec, "pending": len(self.journal.pending_for(t))})
                    self.kick(p)
        fut = self.waiting.get(rec.get("reply_to")) if rec.get("reply_to") is not None else None
        if fut and not fut.done():
            fut.set_result(rec)

    def _reject(self, sender: str, to: list, kind: str, reason: str) -> None:
        try:
            rec = self.journal.append(sender=HARNESS, to=[OWNER], kind="rejected", text=f"{sender} → {', '.join(to)} {kind}: {reason}",
                                      policy=self.policy.version if self.policy else 0)
            self.owner.publish({"type": "owner", "record": rec})
            src = self.registry.get(sender)
            if src:
                src.publish({"type": "toolError", "text": f"политика: {reason}"})
        except JournalError:
            pass

    async def _await_ack(self, rec: dict, src: Pane | None) -> None:
        """Триггер owner-ack: запись лежит в журнале, но не доставляется, пока владелец не подтвердит."""
        pane = src or self.owner
        allow = await pane.ask_approval(f"Подтвердить отправку #{rec['seq']} {rec['kind']} → {', '.join(self.label_of(t) for t in rec['to'])}?",
                                        rec["text"][:600], timeout=ACK_TIMEOUT_SEC)
        if allow:
            self.journal.append(sender=OWNER, to=[rec["from"]], kind="ack", text=f"подтверждено #{rec['seq']}", reply_to=rec["seq"],
                                policy=self.policy.version if self.policy else 0)
            self.journal.mark_acked(rec["seq"])
            self._deliver(rec)
        else:
            self.journal.append(sender=HARNESS, to=[OWNER], kind="rejected", text=f"#{rec['seq']} {rec['kind']} от {rec['from']} отклонено владельцем", reply_to=rec["seq"])
            if src:
                self.post(HARNESS, [src.id], "note", f"Запись #{rec['seq']} ({rec['kind']}) владелец не подтвердил, она не доставлена.", thread=rec.get("thread"), origin="ack")

    def _note_verdict(self, rec: dict, announce: bool) -> None:
        th = rec.get("thread")
        if not th:
            return
        st = self.threads.setdefault(th, {"rounds": 0, "accepted": False, "lastScore": None, "sha": None, "merged": None})
        st["rounds"] = max(st["rounds"], int(rec.get("round") or 0))
        st["lastScore"] = rec.get("score")
        if rec.get("accepted"):
            st["accepted"] = True
            st["sha"] = rec.get("sha") or st.get("sha")
        if not announce:
            return
        b = rec.get("bounds") or {}
        mx = b.get("max_rounds")
        line = (f"Тред {th}: вердикт #{rec['seq']} от {self.label_of(rec['from'])}, балл {rec.get('score')}, раунд {rec.get('round')}"
                + (f" из {mx}" if mx else "") + (" — принято." if rec.get("accepted") else " — не принято."))
        orchestrators = [p.id for p in self.registry.panes.values() if p.role == "orchestrator" and p.id != rec["from"]]
        try:
            if orchestrators:
                self.post(HARNESS, orchestrators, "status", line, thread=th, origin="verdict")
            if not rec.get("accepted") and mx and int(rec.get("round") or 0) >= int(mx):
                self.post(HARNESS, [OWNER] + orchestrators, "escalation", f"Тред {th}: раунды ревью исчерпаны ({mx}), веха не принята. Нужно решение владельца.", thread=th, origin="verdict")
        except JournalError as e:
            print(f"[harness] статус вердикта не записан: {e}", file=sys.stderr, flush=True)

    async def merge(self, sender: str, sha: str, message: str = "") -> dict:
        """Слить в интеграционную ветку только то, что принято вердиктом: аттестация = равенство SHA."""
        role = self.role_of(sender)
        allowed = set((self.team.merge_roles if self.team else ["orchestrator"]) + ["owner"])
        if role not in allowed:
            raise JournalError("policy_denied", f"слияние разрешено ролям {', '.join(sorted(allowed))}, а не {role}")
        if not self.repo_root:
            raise JournalError("no_repo", "папка проекта не под git")
        full = gitops.resolve_sha(self.repo_root, sha or "")
        if not full:
            raise JournalError("sha_unknown", f"коммита {sha} нет в репозитории")
        accepted = [r for r in self.journal.read(limit=0) if r.get("kind") == "verdict" and r.get("accepted") and r.get("sha") == full]
        if not accepted:
            raise JournalError("not_accepted", f"у коммита {full[:12]} нет принятого вердикта; сливать можно только принятое")
        v = accepted[-1]
        th = v.get("thread") or "без треда"
        res = await asyncio.to_thread(gitops.merge_into, self.repo_root, full, self.team.integration_branch, message or f"merge {th}: {full[:12]} (вердикт #{v['seq']}, балл {v.get('score')})")
        if not res.get("ok"):
            raise JournalError("merge_failed", res.get("error", "слияние не прошло"))
        st = self.threads.setdefault(th, {"rounds": 0, "accepted": True, "lastScore": v.get("score"), "sha": full, "merged": None})
        st["merged"] = res["mergeSha"]
        orchestrators = [p.id for p in self.registry.panes.values() if p.role == "orchestrator" and p.id != sender]
        self.post(HARNESS, [OWNER] + orchestrators, "status",
                  f"Тред {th}: коммит {full[:12]} слит в {self.team.integration_branch} как {res['mergeSha'][:12]} ({self.label_of(sender)}).",
                  thread=th, origin="merge", sha=full, merged=res["mergeSha"])
        return {"ok": True, "sha": full, "mergeSha": res["mergeSha"], "branch": self.team.integration_branch, "thread": th}

    def kick(self, pane: Pane) -> None:
        t = self.pumps.get(pane.id)
        if t and not t.done():
            return
        self.pumps[pane.id] = asyncio.get_running_loop().create_task(self.pump(pane))

    async def pump(self, pane: Pane) -> None:
        while not pane.busy:
            if self.halted:
                return                                  # выключатель: ничего не теряется — записи остаются в очереди
            recs = self.journal.pending_for(pane.id)
            if not recs:
                return
            pane.publish({"type": "delivered", "records": recs})
            work = [r for r in recs if r["kind"] not in ("stop",)]
            if not work:
                self.journal.advance(pane.id, recs[-1]["seq"])
                continue
            n = len(pane.transcript)
            for r in recs:
                pane.record("me" if r["from"] == OWNER else "peer", r["text"] if r["from"] == OWNER else f"[от {self.label_of(r['from'])}] {r['text']}")
            try:
                await self.run_turn(pane, self.render_inbox(work, pane), origin="inbox", records=work)
            except Exception as e:  # noqa: BLE001
                # Ход не состоялся (модель отказала, папки нет, прервано): записи НЕ считаются прочитанными — уйдут со следующим ходом
                # (после смены модели или нового сообщения); реплики из ленты места убираем, чтобы при повторе не задвоились. Урок 07.10.2026.
                del pane.transcript[n:]
                print(f"[harness] {pane.id}: {e}", file=sys.stderr, flush=True)
                pane.publish({"type": "error", "text": (str(e) or "ход не состоялся")[:400]})   # окно должно выйти из «думает…» и показать причину (урок 08.10: вопрос «завис»)
                pane.publish({"type": "note", "text": f"{len(work)} запис{'ь' if len(work) == 1 else 'и'} остались в очереди и уйдут со следующим ходом"})
                return
            self.journal.advance(pane.id, recs[-1]["seq"])
            self.save_panes()

    def render_inbox(self, recs: list[dict], pane: Pane) -> str:
        if len(recs) == 1 and recs[0]["from"] == OWNER and recs[0]["kind"] in ("task", "note", "question"):
            r = recs[0]
            return r["text"] + (f"\n\n(тред {r['thread']})" if r.get("thread") and r["kind"] == "task" else "")
        lines = [f"Входящие записи: {len(recs)}."]
        for r in recs:
            head = f"[#{r['seq']} · {r['kind']} · от {self.label_of(r['from'])}"
            if r.get("thread"):
                head += f" · тред {r['thread']}"
            if r.get("reply_to") is not None:
                head += f" · ответ на #{r['reply_to']}"
            if r.get("score") is not None:
                head += f" · балл {r['score']}, раунд {r.get('round')}"
            lines.append(head + "]\n" + r["text"])
        lines.append("Как отвечать: владельцу — обычным текстом ответа (он в чате); на question роли — send kind=answer с reply_to=<seq>; на task — send kind=status; на review-request — "
                     "send kind=verdict с score и round. Если не ответишь сам, твой итоговый текст уйдёт автоматически как ответ "
                     "на question и task; на review-request автоответа нет.")
        return "\n\n".join(lines)

    def after_turn(self, pane: Pane, records: list[dict], text: str) -> None:
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
            if pane.carry:
                message = f"Прежний разговор (был без папки, продолжается здесь):\n{pane.carry}\n\n---\nНовое сообщение:\n{message}"
                pane.carry = ""
                pane.publish({"type": "note", "text": "в сообщение добавлен прежний разговор"})
            full = f"{digest}\n\n---\nСообщение тебе:\n{message}" if digest else message
            if digest:
                pane.publish({"type": "note", "text": f"в сообщение добавлена сводка соседей ({len(digest)} символов)"})
            pane.last_usage = None                                   # расход именно этого хода, не прежнего
            text = await self.provider(pane).run_turn(pane, full, depth)
            pane.record("ai", text, pane.last_usage)                  # цена хода — в реплике чата (Kimi UX-3 №106 п.1)
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
        self.models["codex"] = info["models"]
        self.registry.models = self.models
        for p in self.registry.panes.values():
            if p.vendor == "codex" and not any(m["id"] == p.model for m in info["models"]) and info["models"]:
                p.model = info["models"][0]["id"]
        return web.json_response({
            "project": self.project_dir, "defaultDir": DEFAULT_DIR, "models": self.models, "modes": MODES, "kinds": KINDS,
            "ownerKinds": list(OWNER_KINDS), "lineErrors": self.line_errors,
            "policy": {"version": self.policy.version if self.policy else None, "path": str(self.policy.path) if self.policy else None},
            "team": {"path": str(self.team.harness_dir / "team.yaml") if self.team else None, "integrationBranch": self.team.integration_branch if self.team else None,
                     "mergeRoles": self.team.merge_roles if self.team else []},
            "repo": self.repo_root,
            "panes": [{**p.settings(), "pending": len(self.journal.pending_for(p.id))} for p in self.registry.panes.values()],
            "roleCatalog": self._role_catalog(), "noProject": self._room_without_project(), "projectsRoot": self._projects_root(),
            "activeChats": self.chats.get("active", {}), "hasOrchestrator": any(p.role == "orchestrator" for p in self.registry.panes.values()),
            "halted": self.halted,
            "threads": self.threads,
            "auth": {"claude": claude_auth(), "codex": info["account"]},
            "journal": {"lastSeq": self.journal.last_seq, "path": str(self.journal.channel)},
        })

    async def dir_check(self, request):
        cwd = request.query.get("cwd", "")
        if not valid_dir(cwd):
            return web.json_response({"ok": False, "error": f"папки нет или это не папка: {cwd}"}, status=400)
        return web.json_response({"ok": True, "cwd": cwd, "hasHarness": os.path.isdir(os.path.join(cwd, ".harness"))})

    async def project_set(self, request):
        body = await request.json()
        path = str(body.get("path") or "")
        if not valid_dir(path):
            return web.json_response({"ok": False, "error": f"папки нет или это не папка: {path}"}, status=400)
        if path == self.project_dir and not body.get("reload"):
            return web.json_response({"ok": True, "project": path, "changed": False})
        if any(p.busy for p in self.registry.panes.values()):
            return web.json_response({"ok": False, "error": "идёт ход: смени папку, когда все окна свободны"}, status=409)
        await self.open_project(path)
        for p in self.registry.panes.values():
            self.kick(p)
        return web.json_response({"ok": True, "project": path, "changed": True, "lineErrors": self.line_errors,
                                  "panes": [p.settings() for p in self.registry.panes.values()]})

    async def pane_set(self, request):
        p = self.registry.get(request.match_info["id"])
        if not p:
            return web.json_response({"error": "нет окна"}, status=404)
        body = await request.json()
        body.pop("cwd", None)
        if self.registry.update(p, body, valid_dir):
            self.save_panes()
            if self.journal.pending_for(p.id):
                self.kick(p)          # в очереди есть записи (например, после отказа прежней модели) — отдать их новой
        return web.json_response({"ok": True, "pane": p.settings()})

    # ---------- чаты мест ----------
    def _chats_path(self) -> Path:
        return Path(self.project_dir) / ".harness" / "state" / "chats.json"

    def _load_chats(self) -> None:
        try:
            self.chats = json.loads(self._chats_path().read_text("utf-8"))
        except (OSError, json.JSONDecodeError):
            self.chats = {}
        self.chats = {"chats": dict(self.chats.get("chats") or {}), "active": dict(self.chats.get("active") or {})}
        for pid, cid in list(self.chats["active"].items()):
            p, c = self.registry.get(pid), self.chats["chats"].get(cid)
            if not p or not c:
                self.chats["active"].pop(pid, None)
                continue
            p.session_id = c.get("sessionId")
            p.transcript = list(c.get("transcript") or [])
            p.carry = c.get("carry") or ""
            if c.get("vendor") in self.registry.providers:
                p.vendor = c["vendor"]
            if c.get("model"):
                p.model = c["model"]

    def _new_chat(self, pane: Pane, carry: str = "", adopt: bool = False) -> dict:
        """Новый чат места. adopt — взять в чат то, что у места уже есть (лента, сессия); иначе место начинает с чистого листа."""
        cid = f"c{int(time.time() * 1000):x}{secrets.token_hex(2)}"
        c = {"id": cid, "pane": pane.id, "title": "", "created": int(time.time()), "closed": None, "model": pane.model, "vendor": pane.vendor,
             "sessionId": pane.session_id if adopt else None, "transcript": pane.transcript if adopt else [], "carry": (pane.carry if adopt else "") or carry}
        self.chats["chats"][cid] = c
        self.chats["active"][pane.id] = cid
        if not adopt:
            pane.session_id, pane.transcript, pane.carry, pane.seen = None, c["transcript"], carry, {}
        return c

    def _active_chat(self, pane: Pane, create: bool = True) -> dict | None:
        c = self.chats["chats"].get(self.chats["active"].get(pane.id, ""))
        if c is None and create:
            c = self._new_chat(pane, adopt=True)
        return c

    def _chat_meta(self, c: dict) -> dict:
        p = self.registry.get(c["pane"])
        tr = c.get("transcript") or []
        return {"id": c["id"], "pane": c["pane"], "label": p.label if p else c["pane"], "role": p.role if p else None, "title": c.get("title") or "",
                "created": c["created"], "closed": c.get("closed"), "model": c.get("model"), "vendor": c.get("vendor"), "messages": len(tr),
                "last": int(tr[-1]["ts"]) if tr and tr[-1].get("ts") else c["created"], "active": self.chats["active"].get(c["pane"]) == c["id"]}

    def _sync_chats(self) -> None:
        for p in self.registry.panes.values():
            c = self._active_chat(p, create=bool(p.transcript or p.session_id))
            if not c:
                continue
            c["transcript"], c["sessionId"], c["model"], c["vendor"], c["carry"] = p.transcript, p.session_id, p.model, p.vendor, p.carry
            if not c.get("title"):
                first = next((m["text"] for m in p.transcript if m["role"] == "me"), "")
                c["title"] = first.strip().split("\n")[0][:60] or ("вводная роли" if any(m["role"] == "peer" and m["text"].startswith("[от харнесс]") for m in p.transcript) else "")
        try:
            self.journal._save_json(self._chats_path(), self.chats)
        except Exception as e:  # noqa: BLE001
            print(f"[harness] chats.json не записан: {e}", file=sys.stderr, flush=True)

    def _close_chat(self, pane: Pane, carry: str) -> str:
        """Закрыть активный чат места. Возвращает текст контекста для следующего чата (carry=text) или пусто."""
        c = self._active_chat(pane, create=False)
        if not c:
            return ""
        self._sync_chats()
        text = ""
        if carry == "text" and c["transcript"]:
            text = f"Контекст прежнего чата «{pane.label}»" + (f" ({c['title']})" if c.get("title") else "") + ", для сведения:\n\n" + self._transcript_text(pane)
        c["closed"] = int(time.time())
        return text

    async def chats_list(self, request):
        self._sync_chats()
        out = sorted((self._chat_meta(c) for c in self.chats["chats"].values()), key=lambda x: -x["last"])
        return web.json_response({"active": self.chats["active"], "chats": out})

    async def chat_get(self, request):
        c = self.chats["chats"].get(request.match_info["id"])
        if not c:
            return web.json_response({"error": "нет такого чата"}, status=404)
        self._sync_chats()
        return web.json_response({"chat": self._chat_meta(c), "messages": c.get("transcript") or []})

    async def chats_new(self, request):
        """Новый чат места. У роли один активный чат: прежний закрывается, его контекст уходит в новый текстом или выжимкой (ход модели) — или никак.
        У «без роли» чаты параллельные: прежний остаётся."""
        body = await request.json()
        p = self.registry.get(str(body.get("pane") or ""))
        carry = str(body.get("carry") or "text")
        if not p:
            return web.json_response({"ok": False, "error": "нет такого места"}, status=404)
        if p.busy:
            return web.json_response({"ok": False, "error": "место сейчас отвечает — дождитесь ответа"}, status=409)
        if carry not in ("text", "summary", "none"):
            return web.json_response({"ok": False, "error": "carry: text, summary или none"}, status=400)
        carry_text = ""
        if p.id == ROOM_ID:
            self._sync_chats()
        else:
            old = self._active_chat(p, create=False)
            if old and carry == "summary" and old.get("transcript"):
                try:
                    summary = await self.run_turn(p, "Напиши краткую выжимку этого разговора для передачи в новый чат той же роли: что решено, что сделано, открытые вопросы, чего ждёт владелец. Коротко, списком, без вступления.", origin="summary")
                except Exception as e:  # noqa: BLE001
                    return web.json_response({"ok": False, "error": f"выжимка не получилась: {str(e)[:200]}"}, status=400)
                self._sync_chats()
                old["closed"] = int(time.time())
                carry_text = f"Выжимка прежнего чата «{p.label}»" + (f" ({old.get('title')})" if old.get("title") else "") + ":\n\n" + (summary or "").strip()
            else:
                carry_text = self._close_chat(p, carry)
        c = self._new_chat(p, carry_text)
        self.save_panes()
        return web.json_response({"ok": True, "chat": self._chat_meta(c), "pane": p.settings(), "carried": bool(carry_text)})

    async def chats_open(self, request):
        """Открыть чат: он становится активным у своего места; у роли текущий активный закрывается (контекст — текстом, если carry=text)."""
        body = await request.json()
        c = self.chats["chats"].get(str(body.get("chat") or ""))
        carry = str(body.get("carry") or "text")
        if not c:
            return web.json_response({"ok": False, "error": "нет такого чата"}, status=404)
        p = self.registry.get(c["pane"])
        if not p:
            return web.json_response({"ok": False, "error": "место этого чата больше не существует"}, status=404)
        if p.busy:
            return web.json_response({"ok": False, "error": "место сейчас отвечает — дождитесь ответа"}, status=409)
        cur = self._active_chat(p, create=False)
        if cur and cur["id"] == c["id"]:
            return web.json_response({"ok": True, "chat": self._chat_meta(c), "pane": p.settings(), "already": True})
        carry_text = "" if p.id == ROOM_ID else self._close_chat(p, carry)
        c["closed"] = None
        self.chats["active"][p.id] = c["id"]
        p.session_id = c.get("sessionId")
        p.transcript = c["transcript"] if isinstance(c.get("transcript"), list) else []
        c["transcript"] = p.transcript
        p.carry = ((c.get("carry") or "") + ("\n\n" + carry_text if carry_text else "")).strip()
        p.seen = {}
        if c.get("vendor") in self.registry.providers:
            p.vendor = c["vendor"]
        if c.get("model"):
            p.model = c["model"]
        self.save_panes()
        return web.json_response({"ok": True, "chat": self._chat_meta(c), "pane": p.settings(), "carried": bool(carry_text)})

    # ---------- папки, комната, роли по ходу ----------
    def _remember_project(self, path: str) -> None:
        if os.environ.get("HARNESS_NO_LAST"):                      # тесты: не писать временные папки в реестр проектов владельца (09.10: 104 tmp-записи)
            return
        try:
            known = json.loads(PROJECTS_FILE.read_text("utf-8")) if PROJECTS_FILE.exists() else []
        except (OSError, json.JSONDecodeError):
            known = []
        if path not in known:
            known.append(path)
            try:
                PROJECTS_FILE.write_text(json.dumps(known, ensure_ascii=False, indent=1), encoding="utf-8")
            except OSError:
                pass

    def _vendor_of(self, model: str) -> str | None:
        return next((v for v, ms in self.models.items() if v in self.registry.providers and any(m["id"] == model for m in ms)), None)

    def _make_room(self, model: str, mode: str, vendor: str | None = None, quiet: bool = False) -> Pane | None:
        vendor = vendor or self._vendor_of(model)
        if not vendor or mode not in MODE_IDS:
            return None
        old = self.registry.panes.get(ROOM_ID)
        keep = old is not None and old.vendor == vendor and old.model == model
        room = Pane(id=ROOM_ID, vendor=vendor, label="без роли", model=model, mode=mode, cwd=self.project_dir, role="room")
        if keep:
            room.session_id, room.transcript, room.carry = old.session_id, old.transcript, old.carry
        elif old is not None:
            room.transcript, room.carry = old.transcript, old.carry
        if ROOM_ID in self.pumps:
            self.pumps.pop(ROOM_ID).cancel()
        self.registry.panes[ROOM_ID] = room
        if not quiet:
            self.kick(room)
            self.save_panes()
        return room

    def _transcript_text(self, pane: Pane, limit: int = 12000) -> str:
        parts = []
        for m in pane.transcript:
            who = "Владелец" if m["role"] == "me" else ("Ответ" if m["role"] == "ai" else "Сосед")
            parts.append(f"{who}: {m['text'].strip()}")
        text = "\n\n".join(parts)
        return text if len(text) <= limit else "…" + text[-limit:]

    # ---------- закреплённые ----------
    def _load_pins(self) -> list[dict]:
        try:
            data = json.loads(PINS_FILE.read_text("utf-8")) if PINS_FILE.exists() else []
        except (OSError, json.JSONDecodeError):
            data = []
        return [p for p in data if isinstance(p, dict) and p.get("kind") in ("folder", "chat") and p.get("path")]

    @staticmethod
    def _pin_key(p: dict) -> tuple:
        return (p["kind"], p["path"], p.get("chat") or "")

    async def api_pins(self, request):
        """Закреплённые папки и чаты (боковая панель, блок «закреплённые»). GET — список; POST {kind, path, chat?, on?} — закрепить/снять.
        Правила движка: kind — folder или chat; папка должна существовать; закрепить можно только чат ОТКРЫТОЙ папки
        (название и роль берутся из записи чата, не со слов окна); без on — переключение, с on — явно."""
        if request.method == "GET":
            cur = os.path.realpath(self.project_dir)
            return web.json_response({"pins": [dict(p, current=(os.path.realpath(p["path"]) == cur)) for p in self._load_pins()]})
        body = await request.json()
        kind = str(body.get("kind") or "")
        path = os.path.realpath(os.path.expanduser(str(body.get("path") or "").strip())) if body.get("path") else ""   # пути — только через realpath (/var → /private/var на macOS)
        chat = str(body.get("chat") or "").strip()
        if kind not in ("folder", "chat") or not body.get("path"):
            return web.json_response({"ok": False, "error": "kind: folder или chat; path обязателен"}, status=400)
        if not valid_dir(path):
            return web.json_response({"ok": False, "error": "нет такой папки"}, status=404)
        entry = {"kind": kind, "path": path, "name": os.path.basename(path) or path}
        if kind == "chat":
            if not chat:
                return web.json_response({"ok": False, "error": "для чата нужен chat (id)"}, status=400)
            if path != os.path.realpath(self.project_dir):
                return web.json_response({"ok": False, "error": "закрепить можно только чат открытой папки"}, status=400)
            c = self.chats["chats"].get(chat)
            if not c:
                return web.json_response({"ok": False, "error": "нет такого чата"}, status=404)
            m = self._chat_meta(c)
            entry.update({"chat": chat, "title": (m["title"] or "")[:80], "label": m["label"], "pane": m["pane"]})
        pins = self._load_pins()
        key = self._pin_key(entry)
        idx = next((i for i, p in enumerate(pins) if self._pin_key(p) == key), None)
        on = body.get("on")
        on = (idx is None) if on is None else bool(on)
        if on and idx is None:
            pins.append(entry)
        elif not on and idx is not None:
            pins.pop(idx)
        try:
            PINS_FILE.write_text(json.dumps(pins, ensure_ascii=False, indent=1), encoding="utf-8")
        except OSError as e:
            return web.json_response({"ok": False, "error": f"файл закреплённых не записан: {e}"}, status=500)
        return web.json_response({"ok": True, "on": on, "pins": pins})

    # ---------- контекст по месту (образец владельца: «Context window» disarto; решение с ревьюером №3517) ----------
    async def api_context(self, request):
        """Что занимает окно модели у места. Измерение — расход последнего хода от провайдера (вход + кэш + выход);
        части — оценки по текстам: вводная и инструкции · история · переданное; остаток измерения — «система и инструменты модели».
        Нет хода — нет измерения (так и отдаём), неизвестная модель — окно «нет данных»."""
        p = self.registry.get(request.match_info["id"])
        if not p:
            return web.json_response({"ok": False, "error": "нет такого места"}, status=404)
        t = p.tokens or {}
        inp, out, cr = int(t.get("input") or 0), int(t.get("output") or 0), int(t.get("cacheRead") or 0)
        measured = (inp + cr + out) if t else None
        seat = self.team.seats.get(p.id) if self.team else None
        instr = (self.team.instructions_for(seat) if seat else "") + ("\n" + self.role_note(p) if p.id != ROOM_ID else "")
        history, handoff, onboarding = [], [], 0
        for i, m in enumerate(p.transcript):
            text, n = m.get("text") or "", est_tokens(m.get("text") or "")
            if m.get("role") == "me" and text.startswith(HANDOFF_MARKS):
                handoff.append({"i": i, "title": text.split("\n")[0][:80], "tokens": n, "ts": int(m.get("ts") or 0)})
            elif m.get("role") == "peer" and text.startswith("[от харнесс]"):
                onboarding += n
            else:
                history.append({"i": i, "role": m.get("role"), "title": text.split("\n")[0][:80], "tokens": n, "ts": int(m.get("ts") or 0)})
        e_instr, e_hist, e_hand = est_tokens(instr) + onboarding, sum(x["tokens"] for x in history), sum(x["tokens"] for x in handoff)
        parts = [{"key": "instructions", "label": "вводная и инструкции", "tokens": e_instr, "est": True},
                 {"key": "history", "label": "история", "tokens": e_hist, "est": True, "count": len(history)},
                 {"key": "handoff", "label": "переданное", "tokens": e_hand, "est": True, "count": len(handoff)}]
        if measured is not None:
            rest = measured - (e_instr + e_hist + e_hand)
            parts.append({"key": "system", "label": "система и инструменты модели", "tokens": max(rest, 0), "est": True, "residual": True})
        used = measured if measured is not None else (e_instr + e_hist + e_hand)
        window = context_window(p.model)
        free = (window - used) if window else None
        if free is not None:
            parts.append({"key": "free", "label": "свободно", "tokens": max(free, 0), "est": False})
        c = self._active_chat(p, create=False)
        return web.json_response({
            "ok": True, "pane": p.id, "label": p.label, "model": p.model, "window": window, "measured": measured is not None,
            "used": used, "pct": (round(used * 100 / window, 1) if window else None),
            "cache": ({"hitPct": round(cr * 100 / (inp + cr)) if (inp + cr) else None, "cached": cr, "new": inp} if t else None),
            "last": ({"input": inp, "output": out, "cacheRead": cr} if t else None),
            "parts": parts, "history": history[-60:], "handoff": handoff, "turns": sum(1 for m in p.transcript if m.get("role") == "me"),
            "chat": (self._chat_meta(c) if c else None), "busy": p.busy,
        })

    # ---------- выключатель ----------
    def _halt_path(self) -> Path:
        return Path(self.project_dir) / ".harness" / "state" / "halt.json"

    def _load_halt(self) -> None:
        try:
            self.halted = bool(json.loads(self._halt_path().read_text("utf-8")).get("on"))
        except (OSError, json.JSONDecodeError, AttributeError):
            self.halted = False

    async def api_halt(self, request):
        """«Стоп всем» (настройки → выключатель): идущие ходы прерываются, новые не начинаются, записи ждут в очереди;
        включить обратно может только владелец (этот же вызов с on=false) — тогда очереди уходят в ход."""
        body = await request.json()
        on = bool(body.get("on", True))
        self.halted = on
        try:
            self._halt_path().write_text(json.dumps({"on": on, "ts": int(time.time()), "by": "владелец"}, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass
        stopped = []
        for p in self.registry.panes.values():
            if on and p.busy and p.interrupt:
                try:
                    await p.interrupt()
                    stopped.append(p.id)
                except Exception:  # noqa: BLE001
                    pass
            p.publish({"type": "note", "text": "остановлено владельцем: ходы не идут, сообщения ждут в очереди" if on else "работа возобновлена владельцем"})
        if not on:
            for p in self.registry.panes.values():
                if self.journal.pending_for(p.id):
                    self.kick(p)
        pending = {p.id: len(self.journal.pending_for(p.id)) for p in self.registry.panes.values() if self.journal.pending_for(p.id)}
        return web.json_response({"ok": True, "halted": on, "interrupted": stopped, "pending": pending})

    # ---------- настройки ----------
    def _settings_project_path(self) -> Path:
        return Path(self.project_dir) / ".harness" / "state" / "settings.json"

    @staticmethod
    def _read_json(path: Path) -> dict:
        try:
            d = json.loads(path.read_text("utf-8")) if path.exists() else {}
        except (OSError, json.JSONDecodeError):
            d = {}
        return d if isinstance(d, dict) else {}

    def _settings_effective(self) -> dict:
        owner = self._read_json(SETTINGS_FILE)
        project = self._read_json(self._settings_project_path()) if self.project_dir else {}
        return {**owner, **project}

    async def api_settings(self, request):
        """Настройки: «везде» — файл владельца, «папка» — .harness/state/settings.json; действующее = папка поверх владельца.
        Движок исполняет только ключи из SETTINGS_APPLIES; прочие хранятся, но окно показывает их недоступными (решение с ревьюером №3517)."""
        if request.method == "GET":
            return web.json_response({"ok": True, "owner": self._read_json(SETTINGS_FILE), "project": self._read_json(self._settings_project_path()) if self.project_dir else {},
                                      "effective": self._settings_effective(), "applies": SETTINGS_APPLIES})
        body = await request.json()
        scope = str(body.get("scope") or "owner")
        patch = body.get("patch")
        if scope not in ("owner", "project") or not isinstance(patch, dict) or not patch:
            return web.json_response({"ok": False, "error": "scope: owner или project; patch — объект ключ → значение"}, status=400)
        for k, v in patch.items():
            if not isinstance(k, str) or not k.replace("_", "").isalnum() or len(k) > 40:
                return web.json_response({"ok": False, "error": f"ключ {k!r} не годится"}, status=400)
            if v is not None and not isinstance(v, (str, int, float, bool, list)):
                return web.json_response({"ok": False, "error": f"значение {k}: только строка, число, флаг или список"}, status=400)
            if k == "defaultMode" and v is not None and v not in MODE_IDS:
                return web.json_response({"ok": False, "error": f"defaultMode: {', '.join(sorted(MODE_IDS))}"}, status=400)
        path = SETTINGS_FILE if scope == "owner" else self._settings_project_path()
        if scope == "project" and not self.project_dir:
            return web.json_response({"ok": False, "error": "папка не открыта"}, status=400)
        cur = self._read_json(path)
        for k, v in patch.items():
            if v is None:
                cur.pop(k, None)
            else:
                cur[k] = v
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(cur, ensure_ascii=False, indent=1), encoding="utf-8")
        except OSError as e:
            return web.json_response({"ok": False, "error": f"не записано: {e}"}, status=500)
        return web.json_response({"ok": True, "scope": scope, "saved": cur, "effective": self._settings_effective(), "applies": SETTINGS_APPLIES, "ts": int(time.time())})

    # ---------- подключения и маршруты ----------
    async def api_connections(self, request):
        """Провайдеры, которые ведёт движок: вход, число моделей, места, маршрут сети и последняя проверка выхода."""
        info = await self.codex.info()
        try:
            cl = await asyncio.wait_for(asyncio.to_thread(claude_auth), 9)
        except Exception as e:  # noqa: BLE001
            cl = {"loggedIn": False, "error": str(e)[:120]}
        seats = lambda v: [p.id for p in self.registry.panes.values() if p.vendor == v and p.id != ROOM_ID]   # noqa: E731
        codex_models = info.get("models") or []
        gpt = [m for m in codex_models if str(m.get("id", "")).startswith("gpt")]
        other = [m for m in codex_models if not str(m.get("id", "")).startswith("gpt")]
        providers = [
            {"id": "claude", "name": "Claude", "kind": "подписка · вход через claude", "auth": cl, "models": len(self.models.get("claude") or []), "seats": seats("claude"), "routable": True, "route": conn.get("claude")},
            {"id": "codex", "name": "Codex", "kind": "подписка ChatGPT · codex app-server", "auth": info.get("account") or {}, "models": len(gpt), "seats": seats("codex"), "routable": True, "route": conn.get("codex")},
        ]
        if other:
            providers.append({"id": "router", "name": "Роутер провайдеров", "kind": "локальный роутер 127.0.0.1:11435 · Ollama Cloud, Qwen, DeepSeek, GLM, Kimi", "auth": {"loggedIn": True},
                              "models": len(other), "seats": [], "routable": False, "route": None,
                              "note": "выход в сеть у роутера свой — движок его маршрут не задаёт"})
        return web.json_response({"ok": True, "providers": providers, "routes": list(conn.ROUTES)})

    async def api_connections_route(self, request):
        body = await request.json()
        vendor = str(body.get("provider") or "")
        if vendor not in ("claude", "codex"):
            return web.json_response({"ok": False, "error": "маршрут задаётся только провайдерам, чьи процессы запускает движок: claude, codex"}, status=400)
        try:
            cfg = conn.set_route(vendor, str(body.get("route") or "direct"), str(body.get("proxy") or ""), str(body.get("iface") or ""),
                                 str(body.get("label") or ""), str(body.get("expect") or ""))
        except ValueError as e:
            return web.json_response({"ok": False, "error": str(e)}, status=400)
        if vendor == "codex" and callable(getattr(self.codex, "reset", None)):
            await self.codex.reset()          # новый процесс Codex получит новое окружение; Claude берёт окружение на каждом ходе
        return web.json_response({"ok": True, "provider": vendor, "route": cfg, "applies": "со следующего хода" if cfg["route"] != "iface" else "только проверка выхода: трафик идёт системным маршрутом"})

    async def api_connections_check(self, request):
        body = await request.json()
        vendor = str(body.get("provider") or "")
        if vendor not in ("claude", "codex"):
            return web.json_response({"ok": False, "error": "проверка выхода: claude или codex"}, status=400)
        res = await asyncio.to_thread(conn.check, vendor)
        return web.json_response({"ok": True, "provider": vendor, "check": res, "route": conn.get(vendor)})

    async def api_projects(self, request):
        try:
            known = json.loads(PROJECTS_FILE.read_text("utf-8")) if PROJECTS_FILE.exists() else []
        except (OSError, json.JSONDecodeError):
            known = []
        out = []
        for path in dict.fromkeys([self.project_dir, *known]):
            if not valid_dir(path):
                continue
            n = None
            tf = os.path.join(path, ".harness", "team.yaml")
            if path == self.project_dir:
                n = sum(1 for p in self.registry.panes.values() if p.id != ROOM_ID)
            elif os.path.exists(tf):
                try:
                    import yaml
                    d = yaml.safe_load(open(tf, encoding="utf-8")) or {}
                    n = len(d.get("seats") or {})
                except Exception:  # noqa: BLE001
                    n = None
            out.append({"path": path, "name": os.path.basename(path.rstrip("/")) or path, "hasTeam": os.path.exists(tf), "seats": n, "git": gitops.own_repo(path), "current": path == self.project_dir})
        return web.json_response({"current": self.project_dir, "projects": out})

    async def project_create(self, request):
        body = await request.json()
        path = os.path.expanduser(str(body.get("path") or "").strip())
        if not path or not os.path.isabs(path) or len(path) > 400:
            return web.json_response({"ok": False, "error": "нужен абсолютный путь папки"}, status=400)
        if any(p.busy for p in self.registry.panes.values()):
            return web.json_response({"ok": False, "error": "идёт ход: создай папку, когда все окна свободны"}, status=409)
        try:
            info = self._init_project(path, git=bool(body.get("git", True)), model=str(body.get("model") or ""))
        except (ValueError, OSError) as e:
            return web.json_response({"ok": False, "error": f"проект не создан: {e}"}, status=400)
        await self.open_project(path)
        return web.json_response({"ok": True, "project": path, "created": info["created"], "git": info["git"], "orchestrator": info["orchestrator"], "memory": info["memory"],
                                  "seats": sum(1 for p in self.registry.panes.values() if p.id != ROOM_ID)})

    async def room_set(self, request):
        body = await request.json()
        model = str(body.get("model") or "").strip()
        if not model or not self._vendor_of(model):
            return web.json_response({"ok": False, "error": "модель не из каталога"}, status=400)
        old = self.registry.panes.get(ROOM_ID)
        if old and old.busy:
            return web.json_response({"ok": False, "error": "разговор без роли сейчас отвечает"}, status=409)
        mode = "read" if body.get("folder", True) else "chat"
        room = self._make_room(model, mode)
        if not room:
            return web.json_response({"ok": False, "error": "не удалось создать разговор без роли"}, status=400)
        return web.json_response({"ok": True, "pane": room.settings()})

    async def assign_role(self, request):
        body = await request.json()
        role = str(body.get("role") or "")
        room = self.registry.panes.get(ROOM_ID)
        cat = next((c for c in ROLE_CATALOG if c[0] == role), None)
        if not cat:
            return web.json_response({"ok": False, "error": f"неизвестная роль {role}"}, status=400)
        if not room or not room.model:
            return web.json_response({"ok": False, "error": "нет разговора без роли — назначать нечему"}, status=400)
        if room.busy:
            return web.json_response({"ok": False, "error": "разговор сейчас отвечает — назначьте роль после ответа"}, status=409)
        created, how = None, "владельцем из разговора без роли (разговор продолжается в этой роли)"
        if self._room_without_project():
            # без проекта доступен только оркестратор: по вызову он создаёт проект, названный по разговору, разворачивает git, .harness и память,
            # и разговор продолжается в его роли (слово владельца 08.10.2026)
            if role != "orchestrator":
                return web.json_response({"ok": False, "error": "без проекта доступен только оркестратор — он создаст проект по разговору"}, status=400)
            if any(p.busy for p in self.registry.panes.values()):
                return web.json_response({"ok": False, "error": "идёт ход: создать проект можно, когда все окна свободны"}, status=409)
            root = self._projects_root(create=True)
            name = self._project_name_from(room.transcript)
            path, k = os.path.join(root, name), 2
            while os.path.exists(path):
                path, k = os.path.join(root, f"{name}-{k}"), k + 1
            vendor, model, transcript, carry = room.vendor, room.model, list(room.transcript), room.carry
            try:
                self._init_project(path, git=True, model=model, orchestrator=False)   # разговор сам станет оркестратором — место пишется ниже
            except (ValueError, OSError) as e:
                return web.json_response({"ok": False, "error": f"проект не создан: {e}"}, status=400)
            await self.open_project(path)
            room = self._make_room(model, self._settings_effective().get("defaultMode") or "read", vendor=vendor, quiet=True)
            if not room:
                return web.json_response({"ok": False, "error": "разговор не перенесён в новый проект"}, status=400)
            room.transcript, room.carry, room.session_id = transcript, carry, None   # сессия модели привязана к папке — контекст поедет текстом
            created = path
            how = f"из разговора без проекта — проект «{os.path.basename(path)}» создан по этому разговору: git, .harness (команда, политика, журнал), память MEMORY.md"
        elif role != "orchestrator" and not self._has_orchestrator():
            return web.json_response({"ok": False, "error": "сначала оркестратор — он разворачивает проект и вводит остальные роли"}, status=400)
        if self.team is None:
            return web.json_response({"ok": False, "error": "команда папки не читается: " + "; ".join(self.line_errors)}, status=400)
        same = [p for p in self.registry.panes.values() if p.role == role and p.id != ROOM_ID]
        if same and not cat[2]:
            target = same[0]
            if target.busy:
                return web.json_response({"ok": False, "error": f"«{target.label}» сейчас отвечает — назначьте после ответа"}, status=409)
            carry_text = self._close_chat(target, "text")              # прежний чат роли закрыт, его контекст — в новый (правило 4)
            c = self._new_chat(target, carry_text)
            target.transcript = list(room.transcript); c["transcript"] = target.transcript
            target.session_id = room.session_id if room.vendor == target.vendor else None
            target.vendor, target.model = room.vendor, room.model          # чат несёт свою модель
            self._sync_chats()
            room.session_id, room.transcript, room.carry = None, [], ""
            self._new_chat(room)
            self._send_onboarding(target, "из разговора без роли (разговор продолжается в этой роли)")
            self.save_panes()
            return web.json_response({"ok": True, "pane": target.settings(), "chat": self._chat_meta(c), "replaced": True})
        n = len(same) + 1
        sid = role if n == 1 else f"{role}{n}"
        label = cat[1] if n == 1 else f"{cat[1]} {n}"
        tf = self.team.harness_dir / "team.yaml"
        try:
            import yaml
            d = yaml.safe_load(tf.read_text("utf-8")) or {}
            seats = d.get("seats") or {}
            if sid in seats:
                return web.json_response({"ok": False, "error": f"место {sid} уже есть в team.yaml"}, status=409)
            instr = f"roles/{role}.md" if (self.team.harness_dir / "roles" / f"{role}.md").exists() else None
            seats[sid] = {"role": role, "label": label, "vendor": room.vendor, "model": room.model, "mode": room.mode, "digest": False, **({"instructions": instr} if instr else {})}
            d["seats"] = seats
            tf.write_text("# Манифест команды линии. Места добавляются и из чата («Назначить роль»); комментарии при этом не сохраняются.\n"
                          + yaml.safe_dump(d, allow_unicode=True, sort_keys=False), encoding="utf-8")
        except Exception as e:  # noqa: BLE001
            return web.json_response({"ok": False, "error": f"team.yaml не записан: {e}"}, status=400)
        seat = Seat(id=sid, role=role, label=label, vendor=room.vendor, model=room.model, mode=room.mode, write_paths=[], worktree=None, digest=False, instructions=instr)
        self.team.seats[sid] = seat
        pane = Pane(id=sid, vendor=room.vendor, label=label, model=room.model, mode=room.mode, cwd=self.project_dir, role=role)
        pane.session_id, pane.transcript, pane.carry = room.session_id, list(room.transcript), room.carry
        room.session_id, room.transcript, room.carry = None, [], ""
        self.registry.panes[sid] = pane
        try:
            self.post(HARNESS, [OWNER], "status", f"Назначена роль «{label}» ({sid}, {room.model}, {room.mode}) разговору без роли — инициатор: владелец (интерфейс).", origin="assign")
        except JournalError as e:
            print(f"[harness] запись о назначении {sid} не легла в журнал: {e}", file=sys.stderr, flush=True)
        self._send_onboarding(pane, how)
        self.kick(pane)
        self.save_panes()
        return web.json_response({"ok": True, "pane": pane.settings(), "team": str(tf), "project": self.project_dir, "created": bool(created)})

    # ---------- проект: «без проекта», каталог ролей, корень проектов, имя по разговору, создание ----------
    def _no_project(self) -> bool:
        """Папка по умолчанию движка — не проект."""
        return self.project_dir == DEFAULT_DIR

    def _room_without_project(self) -> bool:
        """Разговор без роли «без проекта»: папка по умолчанию или режим «только чат» (окно: пункт «Без проекта»)."""
        room = self.registry.panes.get(ROOM_ID)
        return self._no_project() or bool(room and room.mode == "chat")

    def _has_orchestrator(self) -> bool:
        return any(p.role == "orchestrator" for p in self.registry.panes.values())

    def _role_catalog(self) -> list[dict]:
        """Каталог ролей с доступностью (правило движка, слово владельца 08.10.2026): без проекта — только оркестратор (по вызову создаст проект
        по разговору); в проекте остальные роли доступны, когда оркестратор уже есть — он разворачивает проект и вводит роли."""
        nop, orch = self._room_without_project(), self._has_orchestrator()
        out = []
        for r, l, m in ROLE_CATALOG:
            ok = r == "orchestrator" or (orch and not nop)
            reason = None if ok else ("без проекта: оркестратор создаст проект по разговору" if nop else "сначала оркестратор — он разворачивает проект и вводит роли")
            out.append({"role": r, "label": l, "multi": m, "available": ok, "reason": reason})
        return out

    def _projects_root(self, create: bool = False) -> str:
        root = os.path.expanduser(str(self._settings_effective().get("projectsRoot") or PROJECTS_ROOT_DEFAULT))
        if create:
            os.makedirs(root, exist_ok=True)
        return root

    def _default_model(self) -> str:
        room = self.registry.panes.get(ROOM_ID)
        if room and room.model:
            return room.model
        for v in ("claude", "codex"):
            if v in self.registry.providers:
                for m in self.models.get(v, []):
                    if m.get("id"):
                        return m["id"]
        return ""

    @staticmethod
    def project_slug(text: str) -> str:
        """Имя проекта по первому слову владельца: до четырёх значимых слов, транслит, строчные, дефисы; пусто → proekt-ДДММ-ЧЧММ."""
        tr = {"а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
              "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
              "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya"}
        stop = {"давай", "давайте", "нужно", "надо", "сделай", "сделаем", "хочу", "хотим", "мне", "нам", "и", "в", "на", "с", "по", "для", "это", "что", "как",
                "у", "о", "а", "но", "я", "ты", "вы", "мы", "не", "бы", "же", "ли", "про", "из", "к", "от", "до", "за", "пожалуйста", "привет", "здравствуй",
                "здравствуйте", "есть", "будет", "будем", "новый", "новая", "новое", "проект", "the", "a", "an", "of", "for", "and", "in", "on", "with", "to",
                "let's", "lets", "make", "create", "build", "please", "hi", "hello", "new", "project", "i", "we", "want", "need"}
        words = []
        for w in re.findall(r"[\w'-]+", (text or "").lower()):
            if w in stop or w.isdigit():
                continue
            words.append("".join(tr.get(ch, ch) for ch in w))
            if len(words) == 4:
                break
        slug = re.sub(r"[^a-z0-9]+", "-", "-".join(words)).strip("-")[:40].strip("-")
        return slug or time.strftime("proekt-%d%m-%H%M")

    def _project_name_from(self, transcript: list[dict]) -> str:
        first = next((m.get("text", "") for m in transcript if m.get("role") == "me"), "")
        return self.project_slug(first)

    def _init_project(self, path: str, git: bool = True, model: str = "", orchestrator: bool = True) -> dict:
        """Единственный алгоритм создания проекта — для всех путей (меню, переезд разговора, оркестратор из чата без проекта):
        папка → git init → .harness (команда, роли, политика обмена, память проекта MEMORY.md) → место оркестратора в team.yaml, если команда пуста.
        Модель не вызывается: вводную оркестратор получит при первом открытии его чата или при назначении разговора (слово владельца 08.10.2026)."""
        created = not os.path.isdir(path)
        os.makedirs(path, exist_ok=True)
        git_ok = gitops.own_repo(path)   # внутри чужого репозитория — свой git init (вложенный репозиторий), иначе проект унаследует чужой корень
        if git and not git_ok:
            code, _, err = gitops.run(["init", "-q"], path)
            if code != 0:
                raise ValueError(f"git init: {err.strip()[:200]}")
            git_ok = True
        h = ensure_line(path)
        seeded = False
        if orchestrator:
            model = model or self._default_model()
            vendor = self._vendor_of(model)
            if vendor:
                seeded = seed_orchestrator(h, vendor, model, self._settings_effective().get("defaultMode") or "read")
        return {"created": created, "git": git_ok, "orchestrator": seeded, "memory": str(h / "MEMORY.md")}

    def _memory_sections(self) -> dict[str, str]:
        """Разделы .harness/MEMORY.md по заголовкам «## …» (ключи строчными) → текст без заглушек в скобках и прочерков."""
        try:
            text = (Path(self.project_dir) / ".harness" / "MEMORY.md").read_text("utf-8")
        except OSError:
            return {}
        out, cur = {}, None
        for line in text.splitlines():
            if line.startswith("## "):
                cur = line[3:].strip().lower()
                out[cur] = ""
            elif cur is not None:
                st = line.strip()
                if st and not st.startswith("(") and st not in ("—", "-", "–"):
                    out[cur] += line.rstrip() + "\n"
        return {k: v.strip() for k, v in out.items()}

    def _onboarding(self, pane: Pane, how: str) -> str:
        """Вводная назначенной роли (слово владельца 08.10.2026): где, что, когда и кем, зачем, что ожидаем, критерии успеха и провала, риски —
        из памяти проекта .harness/MEMORY.md, инструкций роли, команды, политики обмена и последних записей журнала.
        Оркестратор в ответ представляется, сообщает, что развёрнуто, и спрашивает владельца, чем будем заниматься."""
        proj = os.path.basename(self.project_dir.rstrip("/")) or self.project_dir
        when = time.strftime("%d.%m.%Y %H:%M")
        mem = self._memory_sections()
        none = "в памяти проекта пока не записано — уточни у владельца" + ("" if pane.role == "orchestrator" else " или оркестратора")
        lines = [f"Ты назначен(а) ролью «{pane.label}» в проекте «{proj}». Когда и кем: владелец, {when}, {how}."]
        lines.append(f"Где: папка {self.project_dir}" + (f", git, интеграционная ветка {self.team.integration_branch}" if self.repo_root and self.team else ", без git")
                     + f". Память проекта: {self.project_dir}/.harness/MEMORY.md (цель, решения, уроки, риски — читай; дополняется через оркестратора)."
                     + f" Файл обмена ролей: {self.project_dir}/.harness/state/channel.ndjson — записи «кто → кому · вид · текст».")
        instr = ""
        if self.team and pane.id in self.team.seats:
            instr = self.team.instructions_for(self.team.seats[pane.id]).strip()
        if instr:
            lines.append("Что делаешь (инструкции роли):\n" + (instr if len(instr) <= 1500 else instr[:1500] + "\n…(полный текст — в .harness/roles)"))
        else:
            lines.append("Инструкций роли в папке пока нет — действуй по общим правилам роли и по командам владельца или оркестратора.")
        lines.append("Зачем (цель проекта): " + (mem.get("цель") or none) + ".")
        lines.append("Что ожидаем: " + (mem.get("что ожидаем") or none) + ".")
        lines.append("Критерии успеха: " + (mem.get("критерии успеха") or none) + ". Критерии провала: " + (mem.get("критерии провала") or none) + ".")
        lines.append("Риски: " + (mem.get("риски") or none) + ".")
        rest = [f"{k.capitalize()}:\n{v}" for k, v in mem.items() if v and k not in ("цель", "что ожидаем", "критерии успеха", "критерии провала", "риски")]
        if rest:
            txt = "\n\n".join(rest)
            lines.append("Остальное из памяти проекта:\n" + (txt if len(txt) <= 2500 else txt[:2500] + "\n…(полный текст — в .harness/MEMORY.md)"))
        lines.append(f"Твоя модель: {pane.model}; права: {next((m['label'] for m in MODES if m['id'] == pane.mode), pane.mode)}.")
        team = [f"{p.label} · {p.model} · {next((m['label'] for m in MODES if m['id'] == p.mode), p.mode)}" + (" — ведёт обмен и говорит с владельцем" if p.role == "orchestrator" else "")
                for p in self.registry.panes.values() if p.id not in (pane.id, ROOM_ID)]
        lines.append("Кто уже в команде проекта: " + ("; ".join(team) if team else "пока никого — ты первая роль") + ".")
        if self.policy:
            summary = self.policy.summary_for(pane.role, {p.id: p.role for p in self.registry.panes.values()}, {p.id: p.label for p in self.registry.panes.values()}).strip()
            if summary:
                lines.append("С кем и как взаимодействуешь (политика обмена):\n" + summary)
        recent = [r for r in self.journal.read(limit=0) if r.get("origin") != "onboarding"][-8:]
        if recent:
            lines.append("Что сейчас в журнале (последние записи):\n" + "\n".join(
                f"№{r.get('seq')} {r.get('from')} → {', '.join(r.get('to') or [])} · {r.get('kind')}: {(r.get('text') or '').strip()[:160]}" for r in recent))
        else:
            lines.append("Журнал обмена пока пуст.")
        if pane.role == "orchestrator":
            lines.append(f"Ответь владельцу коротко: ты оркестратор и ведёшь команду проекта «{proj}»; что развёрнуто (команда — кто есть, память проекта, "
                         + ("git, " if self.repo_root else "") + "журнал обмена); что готов(а) начать — и спроси: чем будем заниматься?")
        else:
            lines.append("Прочитай и ответь одной-двумя фразами: кто ты и что готов(а) делать. Задач пока нет — жди команду.")
        return "\n\n".join(lines)

    def _send_onboarding(self, pane: Pane, how: str) -> None:
        try:
            self.post(HARNESS, [pane.id], "note", self._onboarding(pane, how), origin="onboarding")
        except JournalError as e:
            print(f"[harness] вводная {pane.id} не записана: {e}", file=sys.stderr, flush=True)

    def _onboarded(self, pane_id: str) -> bool:
        return any(r.get("from") == HARNESS and pane_id in (r.get("to") or []) and r.get("origin") == "onboarding" for r in self.journal.read(limit=0))

    async def onboard(self, request):
        """Вводная роли, которая её ещё не получала (место из team.yaml или созданное до появления вводных). Повторно не шлётся."""
        body = await request.json()
        p = self.registry.get(str(body.get("pane") or ""))
        if not p or p.id == ROOM_ID:
            return web.json_response({"ok": False, "error": "нет такого места или это разговор без роли"}, status=404)
        if self._onboarded(p.id):
            return web.json_response({"ok": True, "already": True})
        if p.busy:
            return web.json_response({"ok": False, "error": "место сейчас отвечает"}, status=409)
        self._send_onboarding(p, "при первом открытии чата роли")
        return web.json_response({"ok": True, "sent": True})

    def create_seat(self, role: str, model: str = "", mode: str = "read", by: str = "владелец", how: str = "из меню собеседника") -> tuple:
        """Алгоритм назначения роли (единственный путь для всех вызовов): проверка каталога и занятости → место в team.yaml →
        чат → запись инициатора в журнал (origin=assign) → вводная роли (origin=onboarding). Кто вправе вызвать — решает вызывающий слой:
        HTTP-интерфейс = владелец; инструмент assign_role = оркестратор в ходе по поручению владельца (проверяет мост). Остальным пути нет."""
        cat = next((c for c in ROLE_CATALOG if c[0] == role), None)
        if not cat:
            raise ValueError(f"неизвестная роль {role}")
        if self.team is None:
            raise ValueError("команда папки не читается: " + "; ".join(self.line_errors))
        if self._no_project():
            raise ValueError("папка по умолчанию — не проект: создай проект или назначь оркестратора разговору без проекта")
        if role != "orchestrator" and not self._has_orchestrator():
            raise ValueError("сначала оркестратор — он разворачивает проект и вводит остальные роли")
        same = [p for p in self.registry.panes.values() if p.role == role and p.id != ROOM_ID]
        if same and not cat[2]:
            raise ValueError(f"роль «{cat[1]}» в этой папке уже есть ({same[0].label})")
        model = (model or "").strip()
        room = self.registry.panes.get(ROOM_ID)
        if not model:
            model = (room.model if room and room.model else "") or next((m["id"] for m in self.models.get("claude", []) if m.get("id")), "")
        vendor = self._vendor_of(model)
        if not vendor:
            raise ValueError("модель не из каталога")
        if mode not in MODE_IDS:
            mode = "read"
        n = len(same) + 1
        sid = role if n == 1 else f"{role}{n}"
        label = cat[1] if n == 1 else f"{cat[1]} {n}"
        tf = self.team.harness_dir / "team.yaml"
        instr = f"roles/{role}.md" if (self.team.harness_dir / "roles" / f"{role}.md").exists() else None
        try:
            import yaml
            d = yaml.safe_load(tf.read_text("utf-8")) or {}
            seats = d.get("seats") or {}
            if sid in seats:
                raise ValueError(f"место {sid} уже есть в team.yaml")
            seats[sid] = {"role": role, "label": label, "vendor": vendor, "model": model, "mode": mode, "digest": False, **({"instructions": instr} if instr else {})}
            d["seats"] = seats
            tf.write_text("# Манифест команды линии. Места добавляются и из чата («Назначить роль»); комментарии при этом не сохраняются.\n"
                          + yaml.safe_dump(d, allow_unicode=True, sort_keys=False), encoding="utf-8")
        except ValueError:
            raise
        except Exception as e:  # noqa: BLE001
            raise ValueError(f"team.yaml не записан: {e}") from e
        self.team.seats[sid] = Seat(id=sid, role=role, label=label, vendor=vendor, model=model, mode=mode, write_paths=[], worktree=None, digest=False, instructions=instr)
        pane = Pane(id=sid, vendor=vendor, label=label, model=model, mode=mode, cwd=self.project_dir, role=role)
        self.registry.panes[sid] = pane
        c = self._new_chat(pane)
        try:
            self.post(HARNESS, [OWNER], "status", f"Назначена роль «{label}» ({sid}, {model}, {mode}) — инициатор: {by}.", origin="assign")
        except JournalError as e:
            print(f"[harness] запись о назначении {sid} не легла в журнал: {e}", file=sys.stderr, flush=True)
        self._send_onboarding(pane, how)
        self.kick(pane)
        self.save_panes()
        return pane, c

    async def seat_create(self, request):
        """Назначить роль, которой в папке ещё нет — вызов владельца из интерфейса."""
        body = await request.json()
        try:
            pane, c = self.create_seat(str(body.get("role") or ""), str(body.get("model") or ""), str(body.get("mode") or self._settings_effective().get("defaultMode") or "read"),
                                       by="владелец (интерфейс)", how="владельцем из меню собеседника")
        except ValueError as e:
            msg = str(e)
            return web.json_response({"ok": False, "error": msg}, status=409 if "уже есть" in msg else 400)
        return web.json_response({"ok": True, "pane": pane.settings(), "chat": self._chat_meta(c)})

    async def api_assign_role(self, request):
        """Инструмент assign_role для мест Codex (через bin/pane-mcp.mjs) — проверки те же, что у встроенного инструмента Claude."""
        body = await request.json()
        r = await self.bridge.do_assign_role(str(body.get("from") or ""), body)
        return web.json_response(r, status=200 if r.get("ok") else 403)

    def _handoff_prompt(self, src: Pane) -> str:
        who = "разговора без роли" if src.id == ROOM_ID else src.label
        return f"Прочитай контекст чата от {who} и жди команду."

    async def handoff(self, request):
        """Передать контекст чата другому месту или нескольким — текстом; владелец остаётся в своём чате.
        Правила движка (слово владельца 08.10.2026):
          · источник пуст → отказ;
          · в источнике не больше одного ответа модели и text не задан → уходит весь разговор с типовым промптом, без выбора;
          · два и более ответов и text не задан → 409 needSelection: окно даёт выбор реплик и правку промпта;
          · одна запись всем адресатам (origin=handoff); в чате-источнике — запись харнесса «контекст передан…».
        Между моделями и вендорами переносится только текст — память модели остаётся у прежнего места."""
        body = await request.json()
        raw = body.get("to") or []
        ids = list(dict.fromkeys(str(x).strip() for x in (raw if isinstance(raw, list) else [raw]) if str(x or "").strip()))
        src_id = str(body.get("from") or ROOM_ID)
        kind = str(body.get("kind") or "note")
        text = str(body.get("text") or "").strip()
        src = self.registry.get(src_id)
        targets = [self.registry.get(i) for i in ids]
        if not ids or any(t is None for t in targets):
            return web.json_response({"ok": False, "error": "нет такого места"}, status=404)
        if src_id in ids:
            return web.json_response({"ok": False, "error": "чат не может передать контекст сам себе"}, status=400)
        if kind not in ("task", "note", "question"):
            return web.json_response({"ok": False, "error": f"вид {kind} не годится: task, note или question"}, status=400)
        if not src or not src.transcript:
            return web.json_response({"ok": False, "error": "передавать нечего: чат-источник пуст"}, status=400)   # правило движка (08.10): из пустого чата контекст не предлагается и не передаётся
        answers = sum(1 for m in src.transcript if m.get("role") == "ai")
        if not text:
            if answers >= 2:
                return web.json_response({"ok": False, "needSelection": True, "answers": answers,
                                          "error": f"в чате {answers} ответа(ов) модели — выберите, что передать"}, status=409)
            text = self._handoff_prompt(src) + "\n\n--- контекст чата ---\n" + self._transcript_text(src)
        if len(text) > 60000:
            text = text[:60000] + "\n…(обрезано)"
        names = ", ".join(t.label for t in targets)
        try:
            rec = self.post(OWNER, ids, kind, text, thread=(f"T{self.journal.last_seq + 1}" if kind == "task" else None), origin="handoff")
        except JournalError as e:
            return web.json_response({"ok": False, "code": e.code, "error": str(e)}, status=400)
        src.record("peer", f"[от харнесс] контекст передан: {names} · запись №{rec['seq']}")
        src.publish({"type": "note", "text": f"контекст передан: {names} · запись №{rec['seq']}"})
        self.save_panes()
        return web.json_response({"ok": True, "seq": rec["seq"], "to": [t.settings() for t in targets], "names": names,
                                  "chars": len(text), "answers": answers})

    async def room_move(self, request):
        body = await request.json()
        path = os.path.expanduser(str(body.get("path") or "").strip())
        room = self.registry.panes.get(ROOM_ID)
        if not room or not room.model:
            return web.json_response({"ok": False, "error": "нет разговора без роли"}, status=400)
        if any(p.busy for p in self.registry.panes.values()):
            return web.json_response({"ok": False, "error": "идёт ход: переезд, когда все окна свободны"}, status=409)
        if body.get("create"):
            if not path or not os.path.isabs(path):
                return web.json_response({"ok": False, "error": "нужен абсолютный путь папки"}, status=400)
            try:
                self._init_project(path, git=bool(body.get("git", True)), model=room.model)
            except (ValueError, OSError) as e:
                return web.json_response({"ok": False, "error": f"проект не создан: {e}"}, status=400)
        if not valid_dir(path):
            return web.json_response({"ok": False, "error": f"папки нет: {path}"}, status=400)
        vendor, model, carry = room.vendor, room.model, (room.carry + "\n\n" if room.carry else "") + self._transcript_text(room)
        transcript = list(room.transcript)
        await self.open_project(path)
        new = self._make_room(model, "read", vendor=vendor)
        if not new:
            return web.json_response({"ok": False, "error": "разговор без роли не создан в новой папке"}, status=400)
        new.transcript, new.carry, new.session_id = transcript, carry if transcript else "", None   # сессия модели привязана к папке — контекст поедет текстом в следующем сообщении
        self.save_panes()
        return web.json_response({"ok": True, "project": path, "pane": new.settings(), "carried": bool(transcript)})

    async def events(self, request):
        """Поток событий: `all` — одно соединение на страницу со всеми окнами и владельцем (событие несёт `pane`),
        иначе поток одного окна. Браузер держит не больше шести соединений на адрес, потому страница берёт `all`."""
        pid = request.match_info["id"]
        if pid == "all":
            sources = {OWNER: self.owner, **{p.id: p for p in self.registry.panes.values()}}
        else:
            p = self.owner if pid == OWNER else self.registry.get(pid)
            if not p:
                return web.json_response({"error": "нет окна"}, status=404)
            sources = {pid: p}
        resp = web.StreamResponse(headers={"Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
        await resp.prepare(request)
        q: asyncio.Queue = asyncio.Queue(maxsize=4000)
        subs = {sid: (TaggedSubscriber(q, sid) if pid == "all" else q) for sid in sources}
        for sid, src in sources.items():
            src.subscribers.add(subs[sid])
        try:
            await resp.write(b": ok\n\n")
            for sid, src in sources.items():
                for a in list(src.approvals.values()):
                    ev = {"type": "approval", "id": a.id, "title": a.title, "detail": a.detail}
                    if pid == "all":
                        ev["pane"] = sid
                    await resp.write(f"data: {json.dumps(ev, ensure_ascii=False)}\n\n".encode())
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), 15)
                    await resp.write(f"data: {json.dumps(ev, ensure_ascii=False)}\n\n".encode())
                except asyncio.TimeoutError:
                    await resp.write(b": ka\n\n")
        except (ConnectionResetError, asyncio.CancelledError, RuntimeError):
            pass
        finally:
            for sid, src in sources.items():
                src.subscribers.discard(subs[sid])
        return resp

    async def chat(self, request):
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
        if kind not in OWNER_KINDS:
            return web.json_response({"error": f"владелец пишет виды {', '.join(OWNER_KINDS)}; получено {kind}"}, status=400)
        thread = body.get("thread") or (f"T{self.journal.last_seq + 1}" if kind == "task" else None)
        direct = bool(body.get("direct"))
        has_orch = any(x.role == "orchestrator" for x in self.registry.panes.values())
        if has_orch and p.role not in ("orchestrator", "room") and not direct:
            # чаты ролей владелец читает свободно; писать роли мимо оркестратора — только явным действием, которое ложится в журнал
            return web.json_response({"ok": False, "needDirect": True, "error": f"«{p.label}» — не оркестратор: обращение напрямую требует явного подтверждения"}, status=409)
        try:
            rec = self.post(OWNER, [p.id], kind, message, thread=thread, origin=("direct" if direct else None))
        except JournalError as e:
            return web.json_response({"ok": False, "code": e.code, "error": str(e)}, status=400)
        if kind == "stop" and p.busy and p.interrupt:
            try:
                await p.interrupt()
            except Exception as e:  # noqa: BLE001
                print(f"[harness] stop {p.id}: {e}", file=sys.stderr, flush=True)
        return web.json_response({"ok": True, "seq": rec["seq"], "queued": p.busy, "thread": rec.get("thread")})

    async def steer(self, request):
        body = await request.json()
        p = self.registry.get(str(body.get("pane") or ""))
        text = str(body.get("text") or "").strip()
        if not p:
            return web.json_response({"error": "нет окна"}, status=404)
        if not text:
            return web.json_response({"error": "пустое сообщение"}, status=400)
        if p.busy and p.steer:
            rec = self.journal.append(sender=OWNER, to=[p.id], kind="note", text=text, origin="steer", policy=self.policy.version if self.policy else 0)
            self.journal.advance(p.id, rec["seq"])
            p.record("me", text)
            try:
                await p.steer(text)
            except Exception as e:  # noqa: BLE001
                return web.json_response({"ok": False, "error": f"вмешаться не удалось: {str(e)[:200]}"})
            p.publish({"type": "steered", "record": rec})
            return web.json_response({"ok": True, "seq": rec["seq"], "steered": True})
        rec = self.post(OWNER, [p.id], "task", text, thread=f"T{self.journal.last_seq + 1}")
        return web.json_response({"ok": True, "seq": rec["seq"], "steered": False})

    async def approve(self, request):
        body = await request.json()
        pid = str(body.get("pane") or "")
        p = self.owner if pid == OWNER else self.registry.get(pid)
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
        p = self.registry.get(request.query.get("pane", ""))
        if not p:
            return web.json_response({"error": "нет окна"}, status=400)
        try:
            return web.json_response({"sessions": await self.provider(p).list_sessions(p.cwd)})
        except Exception as e:  # noqa: BLE001
            return web.json_response({"sessions": [], "error": str(e)[:300]})

    async def session_one(self, request):
        p = self.registry.get(request.query.get("pane", ""))
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

    async def api_merge(self, request):
        body = await request.json()
        sender = str(body.get("from") or "")
        if sender != OWNER and not self.registry.get(sender):
            return web.json_response({"ok": False, "error": f"неизвестный отправитель {sender}"}, status=400)
        r = await self.bridge.do_merge(sender, body)
        return web.json_response(r, status=200 if r.get("ok") else 409)

    async def pane_transcript(self, request):
        r = self.bridge.do_read(request.query.get("from", ""), {"pane": request.query.get("pane", ""), "last_n": request.query.get("last", "20")})
        return web.json_response(r, status=200 if r.get("ok") else 403)

    async def journal_read(self, request):
        try:
            since = int(request.query.get("since", "0"))
            limit = int(request.query.get("limit", "100"))
        except ValueError:
            since, limit = 0, 100
        recs = self.journal.read(since=since, limit=limit, thread=request.query.get("thread") or None)
        return web.json_response({"records": recs, "lastSeq": self.journal.last_seq, "cursors": self.journal.cursors, "threads": self.threads})

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
        app.router.add_post("/api/merge", self.api_merge)
        app.router.add_get("/api/pane_transcript", self.pane_transcript)
        app.router.add_get("/api/journal", self.journal_read)
        app.router.add_get("/api/projects", self.api_projects)
        app.router.add_post("/api/project/create", self.project_create)
        app.router.add_post("/api/room", self.room_set)
        app.router.add_post("/api/room/move", self.room_move)
        app.router.add_post("/api/assign", self.assign_role)
        app.router.add_post("/api/seats", self.seat_create)
        app.router.add_post("/api/onboard", self.onboard)
        app.router.add_post("/api/assign_role", self.api_assign_role)
        app.router.add_post("/api/handoff", self.handoff)
        app.router.add_get("/api/pins", self.api_pins)
        app.router.add_get("/api/context/{id}", self.api_context)
        app.router.add_post("/api/halt", self.api_halt)
        app.router.add_get("/api/settings", self.api_settings)
        app.router.add_post("/api/settings", self.api_settings)
        app.router.add_get("/api/connections", self.api_connections)
        app.router.add_post("/api/connections/route", self.api_connections_route)
        app.router.add_post("/api/connections/check", self.api_connections_check)
        app.router.add_post("/api/pins", self.api_pins)
        app.router.add_get("/api/chats", self.chats_list)
        app.router.add_get("/api/chats/{id}", self.chat_get)
        app.router.add_post("/api/chats/new", self.chats_new)
        app.router.add_post("/api/chats/open", self.chats_open)
        if SITE_DIR.is_dir():
            app.router.add_static("/sketches", SITE_DIR, show_index=False)


def main():
    os.makedirs(DEFAULT_DIR, exist_ok=True)
    os.makedirs(PROJECTS_ROOT_DEFAULT, exist_ok=True)   # корень новых проектов: диалог Finder и меню открываются в нём
    core = App()
    start_dir = DEFAULT_DIR
    if LAST_PROJECT_FILE.exists():
        last = LAST_PROJECT_FILE.read_text("utf-8").strip()
        if valid_dir(last):
            start_dir = last
    @web.middleware
    async def browser_origin(request, handler):
        """Подлинность окна (находка ревьюера TS-05 №55, 09.10.2026): чужая страница в браузере владельца могла слать запросы на localhost:3777."""
        err = check_browser_origin(request.method, request.path, request.headers)
        if err:
            status, code = err
            return web.json_response({"ok": False, "code": code, "error": ORIGIN_ERRORS[code]}, status=status)
        return await handler(request)

    @web.middleware
    async def no_cache_static(request, handler):
        """Окно (статика /sketches) — всегда свежее: без заголовков браузер держал старые live.js/HTML часами (08.10.2026)."""
        resp = await handler(request)
        if request.path.startswith("/sketches"):
            resp.headers["Cache-Control"] = "no-cache"
        return resp

    app = web.Application(client_max_size=2_000_000, middlewares=[browser_origin, no_cache_static])
    core.routes(app)

    async def on_startup(_):
        await core.open_project(start_dir)
        asyncio.create_task(core.codex.info())
        for p in core.registry.panes.values():
            core.kick(p)

    async def on_shutdown(_):
        await core.codex.close()
    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)
    print(f"[harness] {APP_URL}\n[harness] claude: {CLAUDE_BIN or 'НЕ НАЙДЕН'}; node для моста Codex: {NODE}", flush=True)
    print(f"[harness] прототип Harnessy: {APP_URL + '/sketches/proto/01-chat.html' if SITE_DIR.is_dir() else 'папки нет — ' + str(SITE_DIR)}", flush=True)
    a = claude_auth()
    print(f"[harness] вход Claude по подписке: {'да (' + str(a.get('authMethod')) + ')' if a.get('loggedIn') else 'НЕТ — выполни в Терминале: claude login'}", flush=True)
    logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(message)s")
    web.run_app(app, host="127.0.0.1", port=PORT, print=None, access_log=None)


if __name__ == "__main__":
    main()
