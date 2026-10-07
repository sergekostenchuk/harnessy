"""Общий поток событий страницы: одно соединение на все окна, событие помечено именем окна."""
import asyncio
import unittest

from app.panes import Pane, TaggedSubscriber


class TaggedStreamTests(unittest.TestCase):
    def test_events_are_tagged_and_full_queue_unsubscribes(self):
        async def go():
            q: asyncio.Queue = asyncio.Queue(maxsize=2)
            a = Pane(id="a", vendor="claude", label="А", model="m", mode="chat", cwd="/tmp")
            b = Pane(id="b", vendor="codex", label="Б", model="m", mode="chat", cwd="/tmp")
            sa, sb = TaggedSubscriber(q, "a"), TaggedSubscriber(q, "b")
            a.subscribers.add(sa); b.subscribers.add(sb)
            a.publish({"type": "delta", "text": "x"})
            b.publish({"type": "state", "busy": True})
            self.assertEqual(q.get_nowait(), {"type": "delta", "text": "x", "pane": "a"})
            self.assertEqual(q.get_nowait(), {"type": "state", "busy": True, "pane": "b"})
            # переполнение общей очереди: издатель отписывает переходник и не падает
            a.publish({"type": "delta", "text": "1"}); a.publish({"type": "delta", "text": "2"}); a.publish({"type": "delta", "text": "3"})
            self.assertNotIn(sa, a.subscribers)
            self.assertIn(sb, b.subscribers)
        asyncio.run(go())


if __name__ == "__main__":
    unittest.main()
