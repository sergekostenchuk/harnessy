"""Манифест команды линии: `<проект>/.harness/team.yaml` и инструкции ролей `roles/*.md`.
При первом открытии папки шаблоны из `templates/` копируются в `.harness/` (никогда не перезаписываются).

Тот же файл команды пишет и воркбенч (asvh-workbench): у него вендоров больше, а «модель по умолчанию» — это пустое поле.
Поэтому место с вендором, которого 3777 не ведёт, пропускается с предупреждением (Team.warnings), а не валит всю команду;
пустая модель — модель вендора по умолчанию (её подставляет реестр окон)."""
from __future__ import annotations

import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "templates"
VENDORS = ("claude", "codex")
MODE_IDS = ("chat", "read", "check", "web", "ask", "edit", "all")
SEAT_ID_RE = re.compile(r"^[a-z][a-z0-9_-]{0,30}$")
RESERVED_IDS = ("owner", "harness", "all", "*")


class TeamError(ValueError):
    pass


@dataclass
class Seat:
    id: str
    role: str
    label: str
    vendor: str
    model: str
    mode: str = "chat"
    digest: bool = False
    write_paths: list = field(default_factory=list)
    instructions: str | None = None    # путь к файлу инструкций роли
    worktree: str | None = None        # относительный путь worktree места (ветка seat/<id>)


@dataclass
class Team:
    version: int
    project: str
    integration_branch: str
    seats: dict[str, Seat]
    harness_dir: Path
    merge_roles: list = field(default_factory=lambda: ["orchestrator"])
    warnings: list = field(default_factory=list)      # что из манифеста 3777 не ведёт (места пропущены)

    def role_of(self, seat_id: str) -> str | None:
        s = self.seats.get(seat_id)
        return s.role if s else None

    def instructions_for(self, seat: Seat) -> str:
        if seat.instructions:
            p = Path(seat.instructions)
            if not p.is_absolute():
                p = self.harness_dir / p
            try:
                return p.read_text("utf-8")
            except OSError:
                return ""
        return ""


def ensure_line(project_dir: str) -> Path:
    """Создать `.harness/` с шаблонами, если чего-то нет. Существующие файлы не трогаем."""
    h = Path(project_dir) / ".harness"
    (h / "roles").mkdir(parents=True, exist_ok=True)
    (h / "state").mkdir(exist_ok=True)
    if not (h / "team.yaml").exists():
        shutil.copyfile(TEMPLATES / "team-empty.yaml", h / "team.yaml")   # новая папка — без ролей (слово владельца 07.10.2026); полная команда — templates/team.yaml
    if not (h / "comms-policy.yaml").exists():
        shutil.copyfile(TEMPLATES / "comms-policy.yaml", h / "comms-policy.yaml")
    for src in (TEMPLATES / "roles").glob("*.md"):
        dst = h / "roles" / src.name
        if not dst.exists():
            shutil.copyfile(src, dst)
    return h


def load_team(harness_dir: Path) -> Team:
    path = harness_dir / "team.yaml"
    try:
        data = yaml.safe_load(path.read_text("utf-8")) or {}
    except (OSError, yaml.YAMLError) as e:
        raise TeamError(f"team.yaml не читается: {e}") from e
    if not isinstance(data, dict) or not isinstance(data.get("seats"), dict):
        raise TeamError("team.yaml: нужен раздел seats (таблица мест; может быть пустой)")
    seats: dict[str, Seat] = {}
    warnings: list[str] = []
    for sid, raw in data["seats"].items():
        sid = str(sid)
        if not SEAT_ID_RE.match(sid) or sid in RESERVED_IDS:
            raise TeamError(f"team.yaml: недопустимое имя места «{sid}» (латиница, цифры, - и _; не owner/harness/all)")
        if not isinstance(raw, dict):
            raise TeamError(f"team.yaml: место {sid} должно быть таблицей")
        role = str(raw.get("role") or sid)
        vendor = str(raw.get("vendor") or "")
        if vendor not in VENDORS:
            warnings.append(f"место {sid}: вендор «{vendor or 'не задан'}» здесь не ведётся (допустимы {', '.join(VENDORS)}) — место пропущено")
            continue
        mode = str(raw.get("mode") or "chat")
        if mode not in MODE_IDS:
            raise TeamError(f"team.yaml: у места {sid} режим «{mode}», допустимы {', '.join(MODE_IDS)}")
        model = str(raw.get("model") or "")   # пусто — модель вендора по умолчанию (подставит реестр окон)
        wp = raw.get("write_paths") or []
        if not isinstance(wp, list) or not all(isinstance(x, str) and x and not x.startswith("/") and ".." not in x for x in wp):
            raise TeamError(f"team.yaml: write_paths у места {sid} — список относительных путей без ..")
        wt = raw.get("worktree")
        if wt is not None and (not isinstance(wt, str) or not wt or wt.startswith("/") or ".." in wt):
            raise TeamError(f"team.yaml: worktree у места {sid} — относительный путь внутри проекта")
        instr = raw.get("instructions")
        if instr is None:
            cand = harness_dir / "roles" / f"{role}.md"
            instr = str(cand) if cand.exists() else None
        seats[sid] = Seat(id=sid, role=role, label=str(raw.get("label") or sid), vendor=vendor, model=model, mode=mode,
                          digest=bool(raw.get("digest", False)), write_paths=[x.rstrip("/") for x in wp], instructions=instr,
                          worktree=(wt.rstrip("/") if wt else None))
    if not seats and data["seats"]:
        raise TeamError("team.yaml: нет ни одного места, которое здесь можно вести" + (f" ({'; '.join(warnings)})" if warnings else ""))
    mr = data.get("merge_roles", ["orchestrator"])
    if not isinstance(mr, list) or not all(isinstance(x, str) for x in mr):
        raise TeamError("team.yaml: merge_roles — список ролей")
    return Team(version=int(data.get("version") or 1), project=str(data.get("project") or ""),
                integration_branch=str(data.get("integration_branch") or "main"), seats=seats, harness_dir=harness_dir, merge_roles=mr,
                warnings=warnings)
