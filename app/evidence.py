"""Свидетельства ревью: отчёты в `<проект>/.harness/evidence/<тред>/r<раунд>/report.md`
по контракту Ran / Skipped / Planned / Manual. Проверка — существование и четыре раздела."""
from __future__ import annotations

import re
from pathlib import Path

SECTIONS = ("Ran", "Skipped", "Planned", "Manual")
_HEAD = re.compile(r"^\s*(?:#{1,6}\s*|\*\*|__)?\s*(Ran|Skipped|Planned|Manual)\b", re.IGNORECASE | re.MULTILINE)


def resolve_evidence(project_root: str, rel: str) -> Path | None:
    """Путь свидетельства: относительно корня проекта, без выхода наружу."""
    if not isinstance(rel, str) or not rel.strip():
        return None
    root = Path(project_root).resolve()
    p = (Path(rel) if Path(rel).is_absolute() else root / rel).resolve()
    try:
        p.relative_to(root)
    except ValueError:
        return None
    return p


def check_report(path: Path) -> str | None:
    """-> None, если отчёт годится; иначе причина отказа."""
    if not path.exists() or not path.is_file():
        return f"файла отчёта нет: {path}"
    try:
        text = path.read_text("utf-8")
    except (OSError, UnicodeDecodeError):
        return f"отчёт не читается: {path}"
    if not text.strip():
        return f"отчёт пуст: {path}"
    found = {m.group(1).capitalize() for m in _HEAD.finditer(text)}
    missing = [s for s in SECTIONS if s not in found]
    if missing:
        return f"в отчёте {path.name} нет разделов: {', '.join(missing)} (контракт Ran / Skipped / Planned / Manual)"
    return None


def evidence_dir(project_root: str, thread: str, round_: int) -> Path:
    return Path(project_root) / ".harness" / "evidence" / thread / f"r{round_}"
