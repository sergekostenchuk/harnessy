"""Инструменты связи между окнами для агентов: send (запись в журнал, без ожидания),
ask (вопрос с ожиданием ответа), read_pane (чтение чужого разговора).
Для окон Claude — встроенный MCP-сервер внутри процесса (Agent SDK); для Codex те же
инструменты даёт bin/pane-mcp.mjs через HTTP-ручки сервера. Логика доставки живёт в сервере."""
from __future__ import annotations

from claude_agent_sdk import create_sdk_mcp_server, tool

from .journal import KINDS, JournalError
from .panes import Pane, Registry


def tool_error(text: str) -> dict:
    return {"content": [{"type": "text", "text": text}], "is_error": True}


def tool_text(text: str) -> dict:
    return {"content": [{"type": "text", "text": text}]}


class Bridge:
    def __init__(self, registry: Registry):
        self.registry = registry
        self.app = None            # сервер: post(), ask()
        self._depth: dict[str, int] = {}

    def set_depth(self, pane: Pane, depth: int) -> None:
        self._depth[pane.id] = depth

    # ---- общие операции, их же зовёт HTTP для моста Codex ----
    async def do_send(self, sender: str, args: dict) -> dict:
        to = args.get("to")
        if isinstance(to, str):
            to = [t.strip() for t in to.split(",") if t.strip()]
        try:
            rec = self.app.post(
                sender=sender, to=to, kind=str(args.get("kind") or ""), text=str(args.get("text") or ""),
                thread=args.get("thread") or None, reply_to=(int(args["reply_to"]) or None) if args.get("reply_to") not in (None, "") else None,
                evidence=args.get("evidence") or [], score=args.get("score"), round_=args.get("round"),
            )
        except JournalError as e:
            return {"ok": False, "code": e.code, "error": str(e)}
        except (TypeError, ValueError) as e:
            return {"ok": False, "code": "invalid", "error": str(e)}
        return {"ok": True, "seq": rec["seq"], "thread": rec.get("thread"), "to": rec["to"]}

    async def do_ask(self, sender: str, args: dict) -> dict:
        src = self.registry.get(sender)
        to = str(args.get("to") or "")
        if src is None:
            return {"ok": False, "code": "sender_unknown", "error": f"нет окна {sender}"}
        try:
            reply = await self.app.ask(src, to, str(args.get("text") or ""), args.get("thread") or None,
                                       depth=self._depth.get(sender, 0))
        except JournalError as e:
            return {"ok": False, "code": e.code, "error": str(e)}
        except RuntimeError as e:
            return {"ok": False, "code": "ask_failed", "error": str(e)}
        return {"ok": True, "reply": reply.get("text", ""), "seq": reply.get("seq")}

    def do_read(self, sender: str, args: dict) -> dict:
        to = str(args.get("pane") or "")
        if to == sender or not self.registry.get(to):
            return {"ok": False, "code": "pane_unknown", "error": f"нет такого окна: {to}"}
        n = args.get("last_n") or 20
        try:
            n = max(1, min(100, int(n)))
        except (TypeError, ValueError):
            n = 20
        return {"ok": True, "text": self.registry.transcript_of(to, n)}

    # ---- встроенный MCP-сервер для окна Claude ----
    def sdk_server(self, pane: Pane):
        others = [o.id for o in self.registry.others(pane.id)]
        names = "; ".join(f"{o.id} — {o.label} ({o.vendor})" for o in self.registry.others(pane.id))
        bridge = self

        @tool("send",
              f"Отправить запись другому окну и продолжить работу, не дожидаясь ответа. Окна: {names}; owner — владелец. "
              f"Виды записей: {', '.join(KINDS)}. Ответ на чужую question — kind=answer с reply_to, на task — status, "
              "на review-request — verdict с score (0..10) и round. Адресат получит запись следующим ходом. "
              "Пиши полный самодостаточный текст: адресат не видит твоей переписки.",
              {"to": str, "kind": str, "text": str, "thread": str, "reply_to": int, "evidence": list, "score": int, "round": int})
        async def send(args: dict) -> dict:
            r = await bridge.do_send(pane.id, args)
            if not r.get("ok"):
                return tool_error(f"Отказ: {r.get('error')}")
            return tool_text(f"Запись #{r['seq']} отправлена {', '.join(r['to'])}; тред {r.get('thread') or 'без треда'}.")

        @tool("ask",
              f"Задать вопрос другому окну ({', '.join(others)}) и дождаться ответа. Адресат ответит, когда дойдёт до "
              "вопроса в своей очереди; ожидание может занять минуты. Для поручений и статусов пользуйся send.",
              {"to": str, "text": str, "thread": str})
        async def ask(args: dict) -> dict:
            r = await bridge.do_ask(pane.id, args)
            if not r.get("ok"):
                return tool_error(f"Ответа нет: {r.get('error')}")
            return tool_text(r.get("reply") or "(пустой ответ)")

        @tool("read_pane", f"Прочитать последние реплики разговора в другом окне ({', '.join(others)}).",
              {"pane": str, "last_n": int})
        async def read_pane(args: dict) -> dict:
            r = bridge.do_read(pane.id, args)
            if not r.get("ok"):
                return tool_error(r.get("error"))
            return tool_text(r["text"])

        return create_sdk_mcp_server(name="panes", version="0.3.0", tools=[send, ask, read_pane])
