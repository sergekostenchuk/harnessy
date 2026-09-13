"""Мост между окнами: инструменты send_to и read_pane. Для окон Claude — встроенный
MCP-сервер внутри процесса (Agent SDK), для Codex — тот же смысл через bin/pane-mcp.mjs
и HTTP-ручки сервера. Передача сообщения = ход адресата в его сессии и режиме."""
from __future__ import annotations

from typing import Awaitable, Callable

from claude_agent_sdk import create_sdk_mcp_server, tool

from .panes import MAX_RELAY_DEPTH, Pane, Registry

TurnRunner = Callable[[Pane, str, str, int, str | None], Awaitable[str]]


class Bridge:
    def __init__(self, registry: Registry):
        self.registry = registry
        self.run_turn: TurnRunner | None = None   # задаёт сервер: (pane, message, origin, depth, from_label) -> текст
        self._depth: dict[str, int] = {}

    def set_depth(self, pane: Pane, depth: int) -> None:
        self._depth[pane.id] = depth

    async def relay(self, from_id: str, to_id: str, text: str, depth: int) -> dict:
        src = self.registry.get(from_id)
        dst = self.registry.get(to_id)
        if not src or not dst or src is dst:
            return {"ok": False, "error": f"нет такого окна: {to_id}"}
        text = (text or "").strip()
        if not text:
            return {"ok": False, "error": "пустое сообщение"}
        if depth >= MAX_RELAY_DEPTH:
            return {"ok": False, "error": f"цепочка сообщений между окнами длиннее {MAX_RELAY_DEPTH}"}
        if dst.busy:
            return {"ok": False, "error": f"{dst.label} занято своим ходом"}
        assert self.run_turn is not None
        try:
            reply = await self.run_turn(dst, text, "peer", depth + 1, src.label)
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": f"ход адресата не удался: {e}"}
        src.publish({"type": "peerReply", "from": dst.id, "text": reply[:4000]})
        return {"ok": True, "reply": reply, "sessionId": dst.session_id}

    def sdk_server(self, pane: Pane):
        """Встроенный MCP-сервер с инструментами для окна Claude."""
        others = [o.id for o in self.registry.others(pane.id)]
        names = "; ".join(f"{o.id} — {o.label} ({o.vendor})" for o in self.registry.others(pane.id))
        bridge = self

        @tool("send_to",
              f"Отправить сообщение агенту в другом окне чата и дождаться его ответа. Окна: {names}. Адресат — отдельная "
              "сессия и, возможно, другая модель, та же папка проекта. Он получит текст как обычное сообщение и ответит; ответ "
              "вернётся результатом инструмента. Пиши полный самодостаточный текст: адресат не видит твоей переписки. "
              "Если адресат занят, вернётся ошибка — сделай сам или попробуй позже.",
              {"pane": str, "text": str})
        async def send_to(args: dict) -> dict:
            to = str(args.get("pane") or "")
            if to not in others:
                return {"content": [{"type": "text", "text": f"нет такого окна: {to}; есть {', '.join(others)}"}], "is_error": True}
            r = await bridge.relay(pane.id, to, str(args.get("text") or ""), bridge._depth.get(pane.id, 0))
            if not r.get("ok"):
                return {"content": [{"type": "text", "text": "Сосед не ответил: " + str(r.get("error"))}], "is_error": True}
            return {"content": [{"type": "text", "text": r.get("reply") or "(сосед ответил пустым текстом)"}]}

        @tool("read_pane", f"Прочитать последние реплики разговора в другом окне ({', '.join(others)}).",
              {"pane": str, "last_n": int})
        async def read_pane(args: dict) -> dict:
            to = str(args.get("pane") or "")
            if to not in others:
                return {"content": [{"type": "text", "text": f"нет такого окна: {to}"}], "is_error": True}
            n = args.get("last_n") or 20
            try:
                n = max(1, min(100, int(n)))
            except Exception:
                n = 20
            return {"content": [{"type": "text", "text": bridge.registry.transcript_of(to, n)}]}

        return create_sdk_mcp_server(name="panes", version="0.2.0", tools=[send_to, read_pane])
