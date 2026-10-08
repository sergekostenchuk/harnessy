"""Карточка «Контекст» по месту: окно модели из таблицы (неизвестная — нет данных), измерение — расход последнего хода,
части — оценки по текстам (вводная · история · переданное), остаток измерения — «система и инструменты модели»."""
import asyncio
import json
import os
import tempfile
import unittest

os.environ["HARNESS_NO_LAST"] = "1"

from app.server import context_window, est_tokens
from tests.test_delivery import make_app


class Req:
    def __init__(self, pane):
        self.match_info = {"id": pane}


async def ctx(app, pane):
    resp = await app.api_context(Req(pane))
    return resp.status, json.loads(resp.text)


class ContextTests(unittest.TestCase):
    def test_window_table(self):
        self.assertEqual(context_window("claude-haiku-4-5-20251001"), 200_000)
        self.assertEqual(context_window("gpt-5.3-codex-spark"), 128_000)
        self.assertEqual(context_window("gpt-6-astra"), 400_000)
        self.assertEqual(context_window("qwen3-coder:cloud"), 128_000)
        self.assertIsNone(context_window("mystery-model"))
        self.assertEqual(est_tokens(""), 0)
        self.assertEqual(est_tokens("а" * 32), 11)

    def test_parts_and_measurement(self):
        async def go():
            with tempfile.TemporaryDirectory() as d:
                app = await make_app(d)
                self.assertEqual((await ctx(app, "nobody"))[0], 404)
                p = app.registry.get("assistant")
                st, r = await ctx(app, "assistant")
                self.assertEqual((st, r["measured"], r["window"]), (200, False, 200_000))
                keys = [x["key"] for x in r["parts"]]
                self.assertEqual(keys, ["instructions", "history", "handoff", "free"])   # без хода остатка «система» нет
                self.assertGreater(r["parts"][0]["tokens"], 0, "вводная роли есть всегда")
                p.record("me", "вопрос владельца")
                p.record("ai", "ответ модели " * 20)
                p.record("me", "Прочитай контекст чата от разговора без роли и жди команду.\n\n--- контекст чата ---\nВладелец: x")
                p.record("peer", "[от харнесс] вводная роли: ...")
                st, r = await ctx(app, "assistant")
                by = {x["key"]: x for x in r["parts"]}
                self.assertEqual((by["history"]["count"], by["handoff"]["count"], r["turns"]), (2, 1, 2))
                self.assertEqual(len(r["history"]), 2)
                self.assertEqual(r["handoff"][0]["title"], "Прочитай контекст чата от разговора без роли и жди команду.")
                p.tokens = {"input": 1000, "output": 200, "cacheRead": 50_000}
                st, r = await ctx(app, "assistant")
                by = {x["key"]: x for x in r["parts"]}
                self.assertEqual((r["measured"], r["used"], r["pct"]), (True, 51_200, 25.6))
                self.assertEqual(r["cache"]["hitPct"], 98)
                self.assertTrue(by["system"]["residual"])
                self.assertEqual(by["system"]["tokens"], 51_200 - by["instructions"]["tokens"] - by["history"]["tokens"] - by["handoff"]["tokens"])
                self.assertEqual(by["free"]["tokens"], 200_000 - 51_200)
                p.model = "mystery-model"
                st, r = await ctx(app, "assistant")
                self.assertIsNone(r["window"]); self.assertIsNone(r["pct"]); self.assertNotIn("free", [x["key"] for x in r["parts"]])
        asyncio.run(go())


if __name__ == "__main__":
    unittest.main()
