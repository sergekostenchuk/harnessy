"""Политика связи `<проект>/.harness/comms-policy.yaml`: маршруты по ролям и видам записей,
триггеры (owner-ack, reply-to:<kind>), границы раундов, наблюдение чужих разговоров.
Проверяется в одной точке сервера; отказ возвращается агенту с причиной."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .journal import KINDS


class PolicyError(ValueError):
    pass


@dataclass
class Decision:
    allow: bool
    pending: bool = False          # true: маршрут есть, но запись ждёт подтверждения владельца (owner-ack)
    reason: str = ""
    route: dict | None = None

    @property
    def bounds(self) -> dict:
        return (self.route or {}).get("bounds") or {}

    @property
    def trigger(self) -> str | None:
        return (self.route or {}).get("trigger")


def _as_list(v) -> list[str]:
    if v is None:
        return []
    if isinstance(v, str):
        return [v]
    return [str(x) for x in v]


class Policy:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.version = 0
        self.default = "deny"
        self.kinds: list[str] = list(KINDS)
        self.routes: list[dict] = []
        self.observe: dict[str, list[str] | str] = {}
        self.mtime = 0.0
        self.load()

    def load(self) -> None:
        try:
            data = yaml.safe_load(self.path.read_text("utf-8")) or {}
            self.mtime = self.path.stat().st_mtime
        except (OSError, yaml.YAMLError) as e:
            raise PolicyError(f"comms-policy.yaml не читается: {e}") from e
        if not isinstance(data, dict) or not isinstance(data.get("routes"), list):
            raise PolicyError("comms-policy.yaml: нужен список routes")
        routes = []
        for i, r in enumerate(data["routes"]):
            if not isinstance(r, dict):
                raise PolicyError(f"comms-policy.yaml: маршрут №{i + 1} должен быть таблицей")
            kinds = r.get("kinds", "*")
            kinds = "*" if kinds == "*" else _as_list(kinds)
            for k in (kinds if kinds != "*" else []):
                if k not in KINDS:
                    raise PolicyError(f"comms-policy.yaml: маршрут №{i + 1}: неизвестный вид {k}")
            trigger = r.get("trigger")
            if trigger is not None and not (trigger == "owner-ack" or str(trigger).startswith("reply-to:")):
                raise PolicyError(f"comms-policy.yaml: маршрут №{i + 1}: триггер «{trigger}» не поддерживается")
            bounds = r.get("bounds") or None
            if bounds is not None and not isinstance(bounds, dict):
                raise PolicyError(f"comms-policy.yaml: маршрут №{i + 1}: bounds должен быть таблицей")
            routes.append({"from": _as_list(r.get("from") or "*"), "to": _as_list(r.get("to") or "*"),
                           "kinds": kinds, "trigger": trigger, "bounds": bounds, "n": i + 1})
        self.routes = routes
        self.version = int(data.get("version") or 1)
        self.default = str(data.get("default") or "deny")
        obs = data.get("observe") or {}
        self.observe = {str(k): ("*" if v == "*" else _as_list(v)) for k, v in obs.items()} if isinstance(obs, dict) else {}

    def maybe_reload(self) -> bool:
        try:
            m = self.path.stat().st_mtime
        except OSError:
            return False
        if m != self.mtime:
            self.load()
            return True
        return False

    # ---- маршруты ----
    def route_for(self, from_role: str, to_role: str, kind: str) -> dict | None:
        for r in self.routes:
            if ("*" in r["from"] or from_role in r["from"]) and ("*" in r["to"] or to_role in r["to"]) \
                    and (r["kinds"] == "*" or kind in r["kinds"]):
                return r
        return None

    def allowed_kinds(self, from_role: str, to_role: str) -> list[str]:
        out: list[str] = []
        for r in self.routes:
            if ("*" in r["from"] or from_role in r["from"]) and ("*" in r["to"] or to_role in r["to"]):
                for k in (KINDS if r["kinds"] == "*" else r["kinds"]):
                    if k not in out:
                        out.append(k)
        return out

    def check_send(self, from_role: str, to_role: str, kind: str) -> Decision:
        route = self.route_for(from_role, to_role, kind)
        if route is None:
            allowed = self.allowed_kinds(from_role, to_role)
            hint = f"{from_role} может писать {to_role} только: {', '.join(allowed)}" if allowed else f"у роли {from_role} нет маршрута к {to_role}"
            return Decision(False, reason=f"политика v{self.version}: {hint}")
        if route.get("trigger") == "owner-ack":
            return Decision(True, pending=True, reason="ждёт подтверждения владельца", route=route)
        return Decision(True, route=route)

    # ---- наблюдение ----
    def can_observe(self, role: str, target_role: str) -> bool:
        if role == "owner":
            return True
        v = self.observe.get(role)
        if v == "*":
            return True
        return bool(v) and target_role in v

    # ---- текст для инструкций места ----
    def summary_for(self, role: str, seat_roles: dict[str, str], labels: dict[str, str]) -> str:
        lines = []
        for sid, r in seat_roles.items():
            if r == role and sum(1 for x in seat_roles.values() if x == role) == 1:
                continue
            kinds = self.allowed_kinds(role, r)
            if kinds:
                extra = ""
                rt = [x for x in self.routes if (("*" in x["from"] or role in x["from"]) and ("*" in x["to"] or r in x["to"]) and x.get("trigger"))]
                if rt:
                    extra = " (" + "; ".join(f"{', '.join(KINDS if x['kinds'] == '*' else x['kinds'])}: {x['trigger']}" for x in rt) + ")"
                lines.append(f"- {sid} ({labels.get(sid, sid)}): {', '.join(kinds)}{extra}")
        ok = self.allowed_kinds(role, "owner")
        if ok:
            lines.append(f"- owner (владелец): {', '.join(ok)}")
        obs = self.observe.get(role)
        if obs == "*":
            watch = "все окна"
        elif obs:
            watch = ", ".join(sid for sid, r in seat_roles.items() if r in obs) or "никого"
        else:
            watch = "никого"
        return ("Твои маршруты по политике связи (кому какие виды записей ты можешь отправлять):\n" + "\n".join(lines) +
                f"\nЧитать чужие разговоры (read_pane, сводка) ты можешь у: {watch}. Запись вне маршрута сервер отклонит с причиной.")
