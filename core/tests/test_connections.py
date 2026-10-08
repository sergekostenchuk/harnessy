"""Маршруты провайдеров: проверка адресов, окружение прокси только при маршруте «прокси», сброс прошлой проверки при смене
маршрута, состояния проверки выхода (checked · changed · matches · mismatch · failed) с подставным curl."""
import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path

os.environ["HARNESS_NO_LAST"] = "1"

from app import connections as conn
from tests.test_delivery import make_app


class Req:
    def __init__(self, body):
        self._body = body
        self.match_info = {}

    async def json(self):
        return self._body


class ConnectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._old = conn.FILE
        conn.FILE = Path(self.tmp.name) / "connections.json"

    def tearDown(self):
        conn.FILE = self._old
        self.tmp.cleanup()

    def test_routes_and_env(self):
        self.assertEqual(conn.get("claude")["route"], "direct")
        self.assertEqual(conn.proxy_env("claude"), {})
        c = conn.set_route("claude", "proxy", "socks5h://127.0.0.1:1080", label="NL99")
        self.assertEqual((c["route"], c["proxy"], c["label"], c["state"]), ("proxy", "socks5h://127.0.0.1:1080", "NL99", "not_checked"))
        self.assertEqual(conn.proxy_env("claude")["HTTPS_PROXY"], "socks5h://127.0.0.1:1080")
        self.assertEqual(conn.proxy_env("codex"), {}, "маршрут одного провайдера не трогает другого")
        for bad in (("proxy", "127.0.0.1:1080", ""), ("proxy", "ftp://x", ""), ("iface", "", "UTUN 4"), ("tunnel", "", ""), ("direct", "", "")):
            with self.assertRaises(ValueError) if bad[0] != "direct" else self.assertRaises(AssertionError):
                conn.set_route("claude", bad[0], bad[1], bad[2])
                raise AssertionError("direct принимается")   # для последнего — без ошибки
        with self.assertRaises(ValueError):
            conn.set_route("claude", "direct", expect="не-ip")
        c = conn.set_route("claude", "iface", iface="utun4")
        self.assertEqual((c["route"], c["iface"]), ("iface", "utun4"))
        self.assertEqual(conn.proxy_env("claude"), {}, "интерфейс окружением не задаётся — честно пусто")

    def test_check_states_with_fake_curl(self):
        calls = []

        def fake(reply):
            def curl(args, timeout):
                calls.append(args)
                if "ipapi.co" in args[-1]:
                    return 0, json.dumps({"country_name": "Netherlands", "city": "Amsterdam"}), ""
                return reply
            return curl

        conn.set_route("codex", "proxy", "http://127.0.0.1:3128")
        r = conn.check("codex", curl=fake((0, '{"ip":"185.1.2.3"}\n0.123', "")))
        self.assertEqual((r["ok"], r["ip"], r["ms"], r["country"], r["state"]), (True, "185.1.2.3", 123, "Netherlands", "checked"))
        self.assertIn("--proxy", calls[0]); self.assertIn("http://127.0.0.1:3128", calls[0])
        r = conn.check("codex", curl=fake((0, '{"ip":"185.9.9.9"}\n0.2', "")))
        self.assertEqual((r["state"], r["prevIp"]), ("changed", "185.1.2.3"))
        conn.set_route("codex", "proxy", "http://127.0.0.1:3128", expect="185.9.9.9")
        self.assertEqual(conn.get("codex")["lastCheck"]["ip"], "185.9.9.9", "тот же маршрут — проверка сохраняется")
        r = conn.check("codex", curl=fake((0, '{"ip":"185.9.9.9"}\n0.2', "")))
        self.assertEqual(r["state"], "matches")
        r = conn.check("codex", curl=fake((0, '{"ip":"10.0.0.1"}\n0.2', "")))
        self.assertEqual(r["state"], "mismatch")
        r = conn.check("codex", curl=fake((7, "", "curl: (7) Failed to connect")))
        self.assertEqual((r["ok"], r["state"]), (False, "failed")); self.assertIn("Failed", r["error"])
        conn.set_route("codex", "direct")
        self.assertIsNone(conn.get("codex")["lastCheck"], "смена маршрута сбрасывает прошлую проверку")

    def test_route_endpoint_rules(self):
        async def go():
            with tempfile.TemporaryDirectory() as d:
                app = await make_app(d)
                resp = await app.api_connections_route(Req({"provider": "router", "route": "proxy", "proxy": "http://x:1"}))
                self.assertEqual(resp.status, 400)
                resp = await app.api_connections_route(Req({"provider": "codex", "route": "proxy", "proxy": "http://127.0.0.1:3128"}))
                r = json.loads(resp.text)
                self.assertEqual((resp.status, r["route"]["route"], r["applies"]), (200, "proxy", "со следующего хода"))
                resp = await app.api_connections_route(Req({"provider": "claude", "route": "iface", "iface": "utun4"}))
                self.assertIn("системным маршрутом", json.loads(resp.text)["applies"])
                resp = await app.api_connections_check(Req({"provider": "router"}))
                self.assertEqual(resp.status, 400)
        asyncio.run(go())


if __name__ == "__main__":
    unittest.main()
