"""Маршруты сети по провайдерам (слово владельца 08.10.2026; решение с ревьюером №3517).
Честные границы: «прокси» — окружение процессов Claude и Codex (движок запускает их сам); «интерфейс» — только
диагностика выхода через системный интерфейс (трафик движок не переключает); приложения и браузер вне харнесса не ведём.
Состояния проверки: not_checked · checked · changed (выход изменился с прошлой проверки) · failed ·
matches / mismatch (только при заданном ожидаемом выходе)."""
import json
import os
import re
import subprocess
import time
from pathlib import Path

FILE = Path(os.path.expanduser(os.environ.get("HARNESS_CONNECTIONS_FILE") or "~/.harness-connections.json"))
ROUTES = ("direct", "proxy", "iface")
PROXY_RE = re.compile(r"^(https?|socks5h?|socks4a?)://[A-Za-z0-9_.@%:-]+(:\d{1,5})?/?$")
IFACE_RE = re.compile(r"^[a-z][a-z0-9]{1,14}$")
IP_RE = re.compile(r"^[0-9a-fA-F.:]{3,45}$")
ECHO_URL = "https://api.ipify.org?format=json"
GEO_URL = "https://ipapi.co/{ip}/json/"


def load() -> dict:
    try:
        d = json.loads(FILE.read_text("utf-8")) if FILE.exists() else {}
    except (OSError, json.JSONDecodeError):
        d = {}
    return d if isinstance(d, dict) else {}


def save(d: dict) -> None:
    FILE.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")


def get(vendor: str) -> dict:
    c = load().get(vendor) or {}
    return {"route": c.get("route") if c.get("route") in ROUTES else "direct", "proxy": c.get("proxy") or "", "iface": c.get("iface") or "",
            "label": c.get("label") or "", "expect": c.get("expect") or "", "lastCheck": c.get("lastCheck") or None,
            "state": (c.get("lastCheck") or {}).get("state") or "not_checked"}


def set_route(vendor: str, route: str, proxy: str = "", iface: str = "", label: str = "", expect: str = "") -> dict:
    vendor, route = (vendor or "").strip(), (route or "direct").strip()
    proxy, iface, label, expect = (proxy or "").strip(), (iface or "").strip(), (label or "").strip()[:40], (expect or "").strip()
    if not re.fullmatch(r"[a-z][a-z0-9_-]{1,30}", vendor):
        raise ValueError("провайдер: латиница и цифры")
    if route not in ROUTES:
        raise ValueError("маршрут: direct, proxy или iface")
    if route == "proxy" and not PROXY_RE.match(proxy):
        raise ValueError("прокси: адрес вида http://host:port или socks5h://host:port")
    if route == "iface" and not IFACE_RE.match(iface):
        raise ValueError("интерфейс: имя вида utun4 или en0")
    if expect and not IP_RE.match(expect):
        raise ValueError("ожидаемый выход: IP-адрес")
    d = load()
    prev = d.get(vendor) or {}
    cur = {"route": route, "proxy": proxy if route == "proxy" else "", "iface": iface if route == "iface" else "", "label": label, "expect": expect, "ts": int(time.time())}
    same = (prev.get("route") or "direct", prev.get("proxy") or "", prev.get("iface") or "") == (cur["route"], cur["proxy"], cur["iface"])
    cur["lastCheck"] = prev.get("lastCheck") if same else None    # маршрут изменился — прошлая проверка к нему не относится
    d[vendor] = cur
    save(d)
    return get(vendor)


def proxy_env(vendor: str) -> dict:
    """Окружение для процесса провайдера: только при маршруте «прокси». Интерфейс окружением не задаётся — честно пусто."""
    c = get(vendor)
    if c["route"] != "proxy" or not c["proxy"]:
        return {}
    return {k: c["proxy"] for k in ("HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "https_proxy", "http_proxy", "all_proxy")}


def _curl(args: list, timeout: int) -> tuple:
    try:
        r = subprocess.run(["curl", "-sS", "-m", str(timeout), *args], capture_output=True, text=True, timeout=timeout + 3)
    except (OSError, subprocess.TimeoutExpired) as e:
        return 1, "", str(e)
    return r.returncode, r.stdout, r.stderr


def check(vendor: str, curl=_curl) -> dict:
    """Проверка выхода: IP, страна, задержка — тем же маршрутом, что и провайдер. Пишет lastCheck в файл."""
    c = get(vendor)
    prev = c.get("lastCheck") or {}
    via = ["--proxy", c["proxy"]] if c["route"] == "proxy" else ["--interface", c["iface"]] if c["route"] == "iface" else []
    code, out, err = curl([*via, "-w", "\n%{time_total}", ECHO_URL], 10)
    res = {"ts": int(time.time()), "route": c["route"], "ok": False, "ip": "", "country": "", "ms": None, "error": "", "state": "failed"}
    if code != 0 or not out.strip():
        res["error"] = (err or "нет ответа").strip()[:200]
    else:
        body, _, t = out.rstrip("\n").rpartition("\n")
        try:
            res["ip"] = str(json.loads(body).get("ip") or "")
        except (ValueError, AttributeError):
            res["error"] = "ответ не разобран"
        try:
            res["ms"] = int(float(t) * 1000)
        except ValueError:
            pass
        if res["ip"]:
            res["ok"] = True
            gc, gout, _ = curl([*via, GEO_URL.format(ip=res["ip"])], 6)
            if gc == 0:
                try:
                    g = json.loads(gout)
                    res["country"] = str(g.get("country_name") or g.get("country") or "")[:40]
                    res["city"] = str(g.get("city") or "")[:40]
                except ValueError:
                    pass
            if c["expect"]:
                res["state"] = "matches" if res["ip"] == c["expect"] else "mismatch"
            elif prev.get("ip") and prev.get("ip") != res["ip"]:
                res["state"], res["prevIp"] = "changed", prev["ip"]
            else:
                res["state"] = "checked"
    d = load()
    e = d.get(vendor) or {"route": c["route"]}
    e["lastCheck"] = res
    d[vendor] = e
    save(d)
    return res
