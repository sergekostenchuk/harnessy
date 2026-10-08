"""Настройки: «везде» — файл владельца, «папка» — поверх; движок исполняет defaultMode при назначении роли без режима; проверки ключей и значений."""
import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path

os.environ["HARNESS_NO_LAST"] = "1"

from app import server
from tests.test_roles import make_app as make_empty_app


class Req:
    def __init__(self, body=None, method="POST"):
        self._body = body or {}
        self.method = method
        self.match_info = {}

    async def json(self):
        return self._body


async def call(h, body=None, method="POST"):
    resp = await h(Req(body, method))
    return resp.status, json.loads(resp.text)


class SettingsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._old = server.SETTINGS_FILE
        server.SETTINGS_FILE = Path(self.tmp.name) / "settings.json"

    def tearDown(self):
        server.SETTINGS_FILE = self._old
        self.tmp.cleanup()

    def test_scopes_validation_and_default_mode(self):
        async def go():
            with tempfile.TemporaryDirectory() as d:
                app = await make_empty_app(d)
                st, r = await call(app.api_settings, method="GET")
                self.assertEqual((st, r["effective"], list(r["applies"])), (200, {}, ["defaultMode", "projectsRoot"]))
                st, r = await call(app.api_settings, {"scope": "owner", "patch": {"defaultMode": "edit", "quietHours": [23, 8]}})
                self.assertEqual((st, r["effective"]["defaultMode"], r["effective"]["quietHours"]), (200, "edit", [23, 8]))
                st, r = await call(app.api_settings, {"scope": "project", "patch": {"defaultMode": "check"}})
                self.assertEqual((st, r["effective"]["defaultMode"]), (200, "check"), "папка поверх владельца")
                self.assertTrue((Path(d) / ".harness" / "state" / "settings.json").exists())
                self.assertEqual((await call(app.api_settings, {"scope": "owner", "patch": {"defaultMode": "yolo"}}))[0], 400)
                self.assertEqual((await call(app.api_settings, {"scope": "x", "patch": {"a": 1}}))[0], 400)
                self.assertEqual((await call(app.api_settings, {"scope": "owner", "patch": {"bad key!": 1}}))[0], 400)
                self.assertEqual((await call(app.api_settings, {"scope": "owner", "patch": {"a": {"nested": 1}}}))[0], 400)
                self.assertEqual((await call(app.seat_create, {"role": "orchestrator", "mode": "read"}))[0], 200)   # первым — оркестратор (правило 08.10.2026)
                st, r = await call(app.seat_create, {"role": "tester"})
                self.assertEqual((st, r["pane"]["mode"]), (200, "check"), "роль без режима получает defaultMode из настроек")
                st, r = await call(app.seat_create, {"role": "architect", "mode": "read"})
                self.assertEqual(r["pane"]["mode"], "read", "явный режим важнее настройки")
                st, r = await call(app.api_settings, {"scope": "project", "patch": {"defaultMode": None}})
                self.assertEqual(r["effective"]["defaultMode"], "edit", "снятие проектного значения возвращает значение владельца")
        asyncio.run(go())


if __name__ == "__main__":
    unittest.main()
