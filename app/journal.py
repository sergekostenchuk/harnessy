"""Журнал линии: `.harness/state/channel.ndjson` внутри папки проекта.

Одна запись = одна строка JSON, только дописывание. Писатель один — сервер, поэтому
seq выдаётся без гонок. Первая строка — протокол: правила канала в самом канале.
Рядом `cursors.json` (что кому доставлено) и `panes.json` (настройки окон и их сессии),
из них линия восстанавливается после перезапуска.
"""
from __future__ import annotations

import json
import os
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

PROTOCOL_VERSION = 1

# Закрытый список видов записей: из целевой схемы плюс proposal, decision, report.
KINDS = [
    "task", "status", "question", "answer", "review-request", "verdict", "blocker", "escalation",
    "note", "stop", "resume", "digest", "proposal", "decision", "report",
]
SYSTEM_KINDS = ["protocol", "rejected", "policy", "ack"]
REPLY_KIND = {"question": "answer", "task": "status", "review-request": "verdict"}

PROTOCOL_TEXT = (
    "Протокол линии харнесса, версия 1. Одна запись — одна строка JSON, только дописывание. "
    "Поля: seq (сквозной номер, выдаёт сервер), id, ts, from (место-отправитель, ставит сервер), "
    "to (список мест или *), kind (закрытый список), thread (предмет обсуждения), reply_to (seq записи, "
    "на которую отвечают), text, evidence (пути к свидетельствам), policy (версия правил связи). "
    "Записи доставляются адресатам по курсорам: место получает всё адресованное ему, чего ещё не видело, "
    "одним входящим сообщением, когда свободно. Ответ на question — answer, на task — status, "
    "на review-request — verdict с полями score и round. Владелец — место owner с полным правом."
)


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="milliseconds")


def new_id() -> str:
    return f"{int(time.time() * 1000):x}-{uuid.uuid4().hex[:6]}"


class JournalError(ValueError):
    """Типизированный отказ журнала: code и message."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class Journal:
    def __init__(self, project_dir: str):
        self.project = Path(project_dir)
        self.root = self.project / ".harness"
        self.state = self.root / "state"
        self.state.mkdir(parents=True, exist_ok=True)
        self.channel = self.state / "channel.ndjson"
        self.cursors_path = self.state / "cursors.json"
        self.panes_path = self.state / "panes.json"
        self._lock = threading.Lock()
        self._records: list[dict] = []
        self.cursors: dict[str, int] = {}
        self.acked: set[int] = set()
        self._load()

    # ---------- загрузка и запись ----------
    def _load(self) -> None:
        if self.channel.exists():
            with self.channel.open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    self._records.append(rec)
                    if rec.get("kind") == "ack" and rec.get("reply_to") is not None:
                        self.acked.add(int(rec["reply_to"]))
        if not self._records:
            self._write({
                "seq": 0, "id": new_id(), "ts": now_iso(), "from": "harness", "to": ["*"], "kind": "protocol",
                "thread": None, "reply_to": None, "text": PROTOCOL_TEXT, "evidence": [], "policy": 0,
                "version": PROTOCOL_VERSION, "kinds": KINDS,
            })
        if self.cursors_path.exists():
            try:
                self.cursors = {k: int(v) for k, v in json.loads(self.cursors_path.read_text("utf-8")).items()}
            except (json.JSONDecodeError, ValueError, AttributeError):
                self.cursors = {}

    def _write(self, rec: dict) -> None:
        line = json.dumps(rec, ensure_ascii=False) + "\n"
        with self.channel.open("a", encoding="utf-8") as f:
            f.write(line)
            f.flush()
            os.fsync(f.fileno())
        self._records.append(rec)

    def _save_json(self, path: Path, data: dict) -> None:
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, path)

    # ---------- записи ----------
    @property
    def last_seq(self) -> int:
        return self._records[-1]["seq"] if self._records else 0

    def append(self, *, sender: str, to, kind: str, text: str, thread: str | None = None,
               reply_to: int | None = None, evidence=None, policy: int = 0, **extra) -> dict:
        if kind not in KINDS and kind not in SYSTEM_KINDS:
            raise JournalError("kind_unknown", f"неизвестный вид записи: {kind}; есть {', '.join(KINDS)}")
        if isinstance(to, str):
            to = [to]
        if not isinstance(to, list) or not to or not all(isinstance(t, str) and t for t in to):
            raise JournalError("to_invalid", "адресат — имя места или список мест")
        if not isinstance(text, str) or not text.strip():
            raise JournalError("text_empty", "пустой текст записи")
        if len(text) > 100_000:
            raise JournalError("text_too_long", "текст записи длиннее 100000 символов")
        if reply_to is not None:
            target = self.get(reply_to)
            if target is None:
                raise JournalError("reply_to_missing", f"нет записи #{reply_to}")
            if thread is None:
                thread = target.get("thread")
        if evidence is None:
            evidence = []
        if not isinstance(evidence, list) or not all(isinstance(e, str) for e in evidence):
            raise JournalError("evidence_invalid", "evidence — список строк")
        with self._lock:
            rec = {
                "seq": self.last_seq + 1, "id": new_id(), "ts": now_iso(), "from": sender, "to": to, "kind": kind,
                "thread": thread, "reply_to": reply_to, "text": text, "evidence": evidence, "policy": policy,
            }
            for k in ("score", "round", "origin", "accepted", "bounds", "ack"):
                if extra.get(k) is not None:
                    rec[k] = extra[k]
            self._write(rec)
            return rec

    def get(self, seq: int) -> dict | None:
        for r in reversed(self._records):
            if r.get("seq") == seq:
                return r
        return None

    def read(self, since: int = 0, limit: int = 200, thread: str | None = None, kinds=None) -> list[dict]:
        out = []
        for r in self._records:
            if r["seq"] <= since:
                continue
            if thread is not None and r.get("thread") != thread:
                continue
            if kinds and r.get("kind") not in kinds:
                continue
            out.append(r)
        return out[-limit:] if limit else out

    def replies_to(self, seq: int) -> list[dict]:
        return [r for r in self._records if r.get("reply_to") == seq]

    # ---------- доставка ----------
    def mark_acked(self, seq: int) -> None:
        self.acked.add(int(seq))

    def pending_for(self, seat: str) -> list[dict]:
        cur = self.cursors.get(seat, 0)
        out = []
        for r in self._records:
            if r["seq"] <= cur or r.get("kind") in SYSTEM_KINDS or r.get("from") == seat:
                continue
            if r.get("ack") == "pending" and r["seq"] not in self.acked:
                continue
            if seat in r.get("to", []) or "*" in r.get("to", []):
                out.append(r)
        return out

    def advance(self, seat: str, seq: int) -> None:
        if seq > self.cursors.get(seat, 0):
            self.cursors[seat] = seq
            self._save_json(self.cursors_path, self.cursors)

    # ---------- состояние окон ----------
    def save_panes(self, data: dict) -> None:
        self._save_json(self.panes_path, data)

    def load_panes(self) -> dict:
        if not self.panes_path.exists():
            return {}
        try:
            return json.loads(self.panes_path.read_text("utf-8"))
        except json.JSONDecodeError:
            return {}
