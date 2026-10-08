"""Закреплённые папки и чаты — правила движка: папка должна существовать; чат — только из открытой папки и существующий;
повтор без on — переключение; название и роль чата берутся из записи чата."""
import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path

os.environ["HARNESS_NO_LAST"] = "1"

from app import server
from tests.test_delivery import make_app


class Req:
    def __init__(self, body=None, method="POST"):
        self._body = body or {}
        self.method = method
        self.match_info = {}

    async def json(self):
        return self._body


async def pins(app, body=None, method="POST"):
    resp = await app.api_pins(Req(body, method))
    return resp.status, json.loads(resp.text)


class PinTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._old = server.PINS_FILE
        server.PINS_FILE = Path(self.tmp.name) / "pins.json"   # не трогаем файл владельца

    def tearDown(self):
        server.PINS_FILE = self._old
        self.tmp.cleanup()

    def test_folder_and_chat_pins(self):
        async def go():
            with tempfile.TemporaryDirectory() as d:
                app = await make_app(d)
                root = os.path.realpath(d)
                st, r = await pins(app, method="GET")
                self.assertEqual((st, r["pins"]), (200, []))
                st, r = await pins(app, {"kind": "folder", "path": root})
                self.assertEqual((st, r["on"], r["pins"][0]["kind"], r["pins"][0]["name"]), (200, True, "folder", os.path.basename(root)))
                st, r = await pins(app, {"kind": "folder", "path": root})          # повтор без on — снять
                self.assertEqual((st, r["on"], r["pins"]), (200, False, []))
                st, r = await pins(app, {"kind": "folder", "path": root, "on": True})
                st, r = await pins(app, {"kind": "folder", "path": root, "on": True})   # явное on дважды — одна запись
                self.assertEqual(len(r["pins"]), 1)
                # чат: только существующий и только открытой папки; название — из записи чата
                src = app.registry.get("assistant")
                src.record("me", "первое сообщение владельца")
                app._sync_chats()
                cid = app.chats["active"]["assistant"]
                st, r = await pins(app, {"kind": "chat", "path": root, "chat": cid, "title": "подделка"})
                self.assertEqual((st, r["on"]), (200, True))
                pin = [p for p in r["pins"] if p["kind"] == "chat"][0]
                self.assertEqual((pin["chat"], pin["pane"], pin["label"]), (cid, "assistant", src.label))
                self.assertEqual(pin["title"], "первое сообщение владельца")
                self.assertEqual((await pins(app, {"kind": "chat", "path": root, "chat": "nope"}))[0], 404)
                self.assertEqual((await pins(app, {"kind": "chat", "path": root}))[0], 400)
                with tempfile.TemporaryDirectory() as other:
                    self.assertEqual((await pins(app, {"kind": "chat", "path": other, "chat": cid}))[0], 400)
                self.assertEqual((await pins(app, {"kind": "folder", "path": "/nonexistent/x/y"}))[0], 404)
                self.assertEqual((await pins(app, {"kind": "x", "path": root}))[0], 400)
                st, r = await pins(app, method="GET")
                self.assertEqual([p["kind"] for p in r["pins"]], ["folder", "chat"])
                self.assertTrue(all(p["current"] for p in r["pins"]))
        asyncio.run(go())


if __name__ == "__main__":
    unittest.main()
