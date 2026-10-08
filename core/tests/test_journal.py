import json
import tempfile
import unittest
from pathlib import Path

from app.journal import KINDS, Journal, JournalError


class JournalTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.j = Journal(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_protocol_is_first_line_and_seq_grows(self):
        lines = Path(self.j.channel).read_text("utf-8").splitlines()
        self.assertEqual(json.loads(lines[0])["kind"], "protocol")
        self.assertEqual(self.j.last_seq, 0)
        a = self.j.append(sender="owner", to=["left"], kind="task", text="раз")
        b = self.j.append(sender="left", to=["right"], kind="question", text="два")
        self.assertEqual((a["seq"], b["seq"]), (1, 2))
        self.assertEqual(a["to"], ["left"])
        self.assertTrue(a["id"] and a["ts"])

    def test_reply_inherits_thread_and_checks_target(self):
        q = self.j.append(sender="left", to=["right"], kind="question", text="?", thread="M-1")
        a = self.j.append(sender="right", to=["left"], kind="answer", text="!", reply_to=q["seq"])
        self.assertEqual(a["thread"], "M-1")
        with self.assertRaises(JournalError) as cm:
            self.j.append(sender="right", to=["left"], kind="answer", text="!", reply_to=999)
        self.assertEqual(cm.exception.code, "reply_to_missing")

    def test_typed_refusals(self):
        with self.assertRaises(JournalError) as cm:
            self.j.append(sender="left", to=["right"], kind="gossip", text="x")
        self.assertEqual(cm.exception.code, "kind_unknown")
        with self.assertRaises(JournalError) as cm:
            self.j.append(sender="left", to=[], kind="note", text="x")
        self.assertEqual(cm.exception.code, "to_invalid")
        with self.assertRaises(JournalError) as cm:
            self.j.append(sender="left", to=["right"], kind="note", text="   ")
        self.assertEqual(cm.exception.code, "text_empty")
        with self.assertRaises(JournalError) as cm:
            self.j.append(sender="left", to=["right"], kind="note", text="x", evidence=[1])
        self.assertEqual(cm.exception.code, "evidence_invalid")

    def test_pending_and_cursors(self):
        self.j.append(sender="owner", to=["left"], kind="task", text="a")
        self.j.append(sender="left", to=["right"], kind="status", text="b")      # своё — не входящее
        self.j.append(sender="right", to=["*"], kind="note", text="c")
        pend = self.j.pending_for("left")
        self.assertEqual([r["text"] for r in pend], ["a", "c"])
        self.j.advance("left", pend[-1]["seq"])
        self.assertEqual(self.j.pending_for("left"), [])
        self.assertEqual([r["text"] for r in self.j.pending_for("right")], ["b"])
        self.j.advance("left", 1)   # назад не двигается
        self.assertEqual(self.j.cursors["left"], 3)

    def test_reload_continues_seq_and_cursors(self):
        self.j.append(sender="owner", to=["left"], kind="task", text="a")
        self.j.advance("left", 1)
        self.j.save_panes({"left": {"model": "m", "sessionId": "s"}})
        j2 = Journal(self.tmp.name)
        self.assertEqual(j2.last_seq, 1)
        self.assertEqual(j2.cursors, {"left": 1})
        self.assertEqual(j2.load_panes()["left"]["sessionId"], "s")
        r = j2.append(sender="owner", to=["left"], kind="task", text="b")
        self.assertEqual(r["seq"], 2)

    def test_truncated_tail_does_not_swallow_next_record(self):
        """Класс дефекта: после оборванной последней строки (без LF) новая запись склеивалась с хвостом и исчезала при перечтении."""
        with tempfile.TemporaryDirectory() as d:
            j = Journal(d)
            j.append(sender="owner", to=["a"], kind="note", text="первая")
            with open(j.channel, "a", encoding="utf-8") as f:
                f.write('{"seq": 2, "id": "x", "ts": "t", "from": "owner", "to": ["a"], "kind": "no')   # обрыв без перевода строки
            j2 = Journal(d)
            rec = j2.append(sender="owner", to=["a"], kind="note", text="после обрыва")
            j3 = Journal(d)
            self.assertEqual(j3.get(rec["seq"])["text"], "после обрыва")
            self.assertEqual([r["seq"] for r in j3.read(limit=0)], [0, 1, rec["seq"]])

    def test_read_filters(self):
        self.j.append(sender="owner", to=["left"], kind="task", text="a", thread="T1")
        self.j.append(sender="owner", to=["left"], kind="note", text="b", thread="T2")
        self.assertEqual([r["text"] for r in self.j.read(thread="T1")], ["a"])
        self.assertEqual([r["text"] for r in self.j.read(since=1)], ["b"])
        self.assertEqual([r["text"] for r in self.j.read(kinds=["note"])], ["b"])
        self.assertIn("task", KINDS)


if __name__ == "__main__":
    unittest.main()
