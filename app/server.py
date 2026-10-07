"""Сервер харнесса: места из манифеста команды над одной папкой проекта, журнал линии,
очередь входящих и автоход, политика связи, инструменты связи между окнами.
Запуск: .venv/bin/python -m app.server  →  http://localhost:3777"""
from __future__ import annotations

import asyncio
import json
import logging
import os
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
from .team import Seat, Team, TeamError, ensure_line, load_team

ROOT = Path(__file__).resolve().parent.parent
PORT = int(os.environ.get("PORT", "3777"))
APP_URL = f"http://127.0.0.1:{PORT}"
DEFAULT_DIR = os.environ.get("CHAT_WORK_DIR", "/Users/Shared/simple-claude-chat")
LAST_PROJECT_FILE = Path(os.path.expanduser("~/.harness-last-project"))
# Прототип Harnessy (экраны-скетчи из ~/REPORTS/workbench-design, сборка deploy/build.py) отдаётся с того же адреса, что и API:
# страницы под /sketches/ ходят в /api/* без CORS. Переопределить папку — HARNESSY_SITE; нет папки — маршрута нет.
SITE_DIR = Path(os.path.expanduser(os.environ.get("HARNESSY_SITE", "~/REPORTS/workbench-design/deploy/out/site/sketches")))
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
        self.repo_root = gitops.repo_root(path) if gitops.is_repo(path) else None
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
        self._remember_project(path)
        for p in self.registry.panes.values():
            st = saved.get(p.id) or {}
            if st.get("vendor") in self.registry.providers and st.get("vendor") != p.vendor:
                p.vendor = st["vendor"]      # место сменило вендора через выбор модели — восстановить до применения модели
            if st:
                self.registry.update(p, {"model": st.get("model"), "mode": st.get("mode"), "sessionId": st.get("sessionId"), "digest": st.get("digest")}, valid_dir)
                p.touched = True
        self._load_chats()
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
        lines.append("Как отвечать: на question — send kind=answer с reply_to=<seq>; на task — send kind=status; на review-request — "
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
            "roleCatalog": [{"role": r, "label": l, "multi": m} for r, l, m in ROLE_CATALOG],
            "activeChats": self.chats.get("active", {}), "hasOrchestrator": any(p.role == "orchestrator" for p in self.registry.panes.values()),
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
                c["title"] = first.strip().split("\n")[0][:60]
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
            out.append({"path": path, "name": os.path.basename(path.rstrip("/")) or path, "hasTeam": os.path.exists(tf), "seats": n, "git": gitops.is_repo(path), "current": path == self.project_dir})
        return web.json_response({"current": self.project_dir, "projects": out})

    async def project_create(self, request):
        body = await request.json()
        path = os.path.expanduser(str(body.get("path") or "").strip())
        if not path or not os.path.isabs(path) or len(path) > 400:
            return web.json_response({"ok": False, "error": "нужен абсолютный путь папки"}, status=400)
        if any(p.busy for p in self.registry.panes.values()):
            return web.json_response({"ok": False, "error": "идёт ход: создай папку, когда все окна свободны"}, status=409)
        created = not os.path.isdir(path)
        try:
            os.makedirs(path, exist_ok=True)
        except OSError as e:
            return web.json_response({"ok": False, "error": f"не удалось создать папку: {e}"}, status=400)
        git_done = False
        if body.get("git", True) and not gitops.is_repo(path):
            code, _, err = gitops.run(["init", "-q"], path)
            git_done = code == 0
            if code != 0:
                return web.json_response({"ok": False, "error": f"git init: {err.strip()[:200]}"}, status=400)
        ensure_line(path)
        await self.open_project(path)
        return web.json_response({"ok": True, "project": path, "created": created, "git": git_done or gitops.is_repo(path), "seats": sum(1 for p in self.registry.panes.values() if p.id != ROOM_ID)})

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
            seats[sid] = {"role": role, "label": label, "vendor": room.vendor, "model": room.model, "mode": room.mode, "digest": False}
            d["seats"] = seats
            tf.write_text("# Манифест команды линии. Места добавляются и из чата («Назначить роль»); комментарии при этом не сохраняются.\n"
                          + yaml.safe_dump(d, allow_unicode=True, sort_keys=False), encoding="utf-8")
        except Exception as e:  # noqa: BLE001
            return web.json_response({"ok": False, "error": f"team.yaml не записан: {e}"}, status=400)
        seat = Seat(id=sid, role=role, label=label, vendor=room.vendor, model=room.model, mode=room.mode, write_paths=[], worktree=None, digest=False)
        self.team.seats[sid] = seat
        pane = Pane(id=sid, vendor=room.vendor, label=label, model=room.model, mode=room.mode, cwd=self.project_dir, role=role)
        pane.session_id, pane.transcript, pane.carry = room.session_id, list(room.transcript), room.carry
        room.session_id, room.transcript, room.carry = None, [], ""
        self.registry.panes[sid] = pane
        self.kick(pane)
        self.save_panes()
        return web.json_response({"ok": True, "pane": pane.settings(), "team": str(tf)})

    async def seat_create(self, request):
        """Назначить роль, которой в папке ещё нет (слово владельца 08.10): новое место в team.yaml без разговора — чат начнётся с него.
        Модель — из запроса, иначе модель разговора без роли, иначе первая Claude; сменить можно сразу в строке ввода."""
        body = await request.json()
        role = str(body.get("role") or "")
        cat = next((c for c in ROLE_CATALOG if c[0] == role), None)
        if not cat:
            return web.json_response({"ok": False, "error": f"неизвестная роль {role}"}, status=400)
        if self.team is None:
            return web.json_response({"ok": False, "error": "команда папки не читается: " + "; ".join(self.line_errors)}, status=400)
        same = [p for p in self.registry.panes.values() if p.role == role and p.id != ROOM_ID]
        if same and not cat[2]:
            return web.json_response({"ok": False, "error": f"роль «{cat[1]}» в этой папке уже есть ({same[0].label})"}, status=409)
        model = str(body.get("model") or "").strip()
        room = self.registry.panes.get(ROOM_ID)
        if not model:
            model = (room.model if room and room.model else "") or next((m["id"] for m in self.models.get("claude", []) if m.get("id")), "")
        vendor = self._vendor_of(model)
        if not vendor:
            return web.json_response({"ok": False, "error": "модель не из каталога"}, status=400)
        mode = str(body.get("mode") or "read")
        if mode not in MODE_IDS:
            mode = "read"
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
            seats[sid] = {"role": role, "label": label, "vendor": vendor, "model": model, "mode": mode, "digest": False}
            d["seats"] = seats
            tf.write_text("# Манифест команды линии. Места добавляются и из чата («Назначить роль»); комментарии при этом не сохраняются.\n"
                          + yaml.safe_dump(d, allow_unicode=True, sort_keys=False), encoding="utf-8")
        except Exception as e:  # noqa: BLE001
            return web.json_response({"ok": False, "error": f"team.yaml не записан: {e}"}, status=400)
        self.team.seats[sid] = Seat(id=sid, role=role, label=label, vendor=vendor, model=model, mode=mode, write_paths=[], worktree=None, digest=False)
        pane = Pane(id=sid, vendor=vendor, label=label, model=model, mode=mode, cwd=self.project_dir, role=role)
        self.registry.panes[sid] = pane
        c = self._new_chat(pane)
        self.kick(pane)
        self.save_panes()
        return web.json_response({"ok": True, "pane": pane.settings(), "chat": self._chat_meta(c)})

    async def handoff(self, request):
        """Передать контекст месту текстом: явный text (выбранные владельцем реплики с промптом) или весь разговор места from (по умолчанию «без роли»).
        Между моделями и вендорами переносится только текст — память модели остаётся у прежнего места."""
        body = await request.json()
        to = str(body.get("to") or "")
        src_id = str(body.get("from") or ROOM_ID)
        kind = str(body.get("kind") or "task")
        text = str(body.get("text") or "").strip()
        src, target = self.registry.get(src_id), self.registry.get(to)
        if not target or to == src_id:
            return web.json_response({"ok": False, "error": "нет такого места"}, status=404)
        if kind not in ("task", "note", "question"):
            return web.json_response({"ok": False, "error": f"вид {kind} не годится: task, note или question"}, status=400)
        if not text:
            if not src or not src.transcript:
                return web.json_response({"ok": False, "error": "передавать нечего: разговор пуст"}, status=400)
            text = "Контекст разговора владельца — продолжи работу по нему:\n\n" + self._transcript_text(src)
        if len(text) > 60000:
            text = text[:60000] + "\n…(обрезано)"
        try:
            rec = self.post(OWNER, [to], kind, text, thread=(f"T{self.journal.last_seq + 1}" if kind == "task" else None))
        except JournalError as e:
            return web.json_response({"ok": False, "code": e.code, "error": str(e)}, status=400)
        return web.json_response({"ok": True, "seq": rec["seq"], "to": target.settings(), "chars": len(text)})

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
            os.makedirs(path, exist_ok=True)
            if body.get("git", True) and not gitops.is_repo(path):
                code, _, err = gitops.run(["init", "-q"], path)
                if code != 0:
                    return web.json_response({"ok": False, "error": f"git init: {err.strip()[:200]}"}, status=400)
            ensure_line(path)
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
        app.router.add_post("/api/handoff", self.handoff)
        app.router.add_get("/api/chats", self.chats_list)
        app.router.add_get("/api/chats/{id}", self.chat_get)
        app.router.add_post("/api/chats/new", self.chats_new)
        app.router.add_post("/api/chats/open", self.chats_open)
        if SITE_DIR.is_dir():
            app.router.add_static("/sketches", SITE_DIR, show_index=False)


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
