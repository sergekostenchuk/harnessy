"""Адаптер Claude через Claude Agent SDK (Python). Один ход = один ClaudeSDKClient,
разговор продолжается через resume. Ходит по подписке: SDK использует вход `claude login`."""
from __future__ import annotations

import os
import time
from pathlib import Path

from claude_agent_sdk import (
    AssistantMessage, ClaudeAgentOptions, ClaudeSDKClient, PermissionResultAllow, PermissionResultDeny,
    ResultMessage, StreamEvent, TextBlock, ToolResultBlock, ToolUseBlock, UserMessage,
    get_session_messages, list_sessions,
)

from .panes import Pane, Registry

HOME = os.path.expanduser("~")
CLAUDE_BIN = next((p for p in [os.environ.get("CLAUDE_BIN", ""), f"{HOME}/.local/bin/claude", f"{HOME}/.claude/local/claude",
                               "/opt/homebrew/bin/claude", "/usr/local/bin/claude"] if p and os.path.exists(p)), None)

PEER_TOOLS = ["mcp__panes__send_to", "mcp__panes__read_pane"]
# Инструменты для работы в папке. Без Agent/SendMessage/ListAgents/ToolSearch: связь с окнами только через send_to.
WORK_TOOLS = ["Read", "Edit", "Write", "MultiEdit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch", "NotebookEdit"]
SAFE_BASH = ["Bash(git:*)", "Bash(ls:*)", "Bash(cat:*)", "Bash(pwd)", "Bash(find:*)", "Bash(grep:*)", "Bash(rg:*)",
             "Bash(head:*)", "Bash(tail:*)", "Bash(wc:*)", "Bash(npm test:*)", "Bash(npm run:*)", "Bash(node:*)", "Bash(python3:*)"]

SYSTEM_CHAT = ("Ты ассистент в простом чате. Отвечай на языке собеседника, по существу. "
               "Доступа к файлам и к интернету у тебя в этом чате нет.")


def peer_note(pane: Pane, registry: Registry) -> str:
    others = ", ".join(f"{o.id} — {o.label} ({o.vendor})" for o in registry.others(pane.id))
    return (f" Рядом работают другие окна чата: {others}. Им можно написать ТОЛЬКО инструментом send_to и получить ответ, "
            "а инструментом read_pane прочитать их разговор; пользуйся этим, когда владелец просит передать, спросить "
            "или поручить что-то соседу. Соседи не видят твоей переписки: пиши им полный текст.")


def team_note(pane: Pane, registry: Registry) -> str:
    return (f"Ты работаешь в папке проекта: {pane.cwd}. В этой же папке параллельно могут работать агенты из других окон. "
            "Перед правкой смотри актуальное состояние файла, чужие изменения не переписывай, коммиты делай только если "
            "попросили. В конце ответа кратко перечисли, что сделал и какие файлы изменил." + peer_note(pane, registry))


DIGEST_MARK = "\n---\nСообщение тебе:\n"


def strip_digest(text: str) -> str:
    """В истории показываем само сообщение, без вклеенной сводки соседей."""
    i = text.find(DIGEST_MARK)
    return text[i + len(DIGEST_MARK):] if i >= 0 else text


def child_env() -> dict:
    env = dict(os.environ)
    for k in ("CLAUDECODE", "CLAUDE_CODE_SIMPLE", "ANTHROPIC_API_KEY"):
        env.pop(k, None)
    return env


def tool_detail(name: str, inp: dict) -> str:
    if not isinstance(inp, dict):
        return ""
    for k in ("file_path", "path", "command", "pattern", "query", "url", "text", "description"):
        v = inp.get(k)
        if v:
            return str(v).replace("\n", " ")[:200]
    return ""


class ClaudeProvider:
    vendor = "claude"

    def __init__(self, registry: Registry, bridge):
        self.registry = registry
        self.bridge = bridge

    # ---- параметры хода по режиму ----
    def options(self, pane: Pane) -> ClaudeAgentOptions:
        kw: dict = dict(
            cwd=pane.cwd, model=pane.model, setting_sources=[], strict_mcp_config=True,
            include_partial_messages=True, env=child_env(), cli_path=CLAUDE_BIN,
            mcp_servers={"panes": self.bridge.sdk_server(pane)}, resume=pane.session_id,
        )
        allowed = list(PEER_TOOLS)
        mode = pane.mode
        if mode == "chat":
            kw.update(tools=[], permission_mode="default", system_prompt=SYSTEM_CHAT + peer_note(pane, self.registry))
        elif mode == "read":
            kw.update(tools=["Read", "Glob", "Grep"], permission_mode="default",
                      system_prompt={"type": "preset", "preset": "claude_code",
                                     "append": team_note(pane, self.registry) + " Только читай и анализируй, правок не делай."})
        elif mode == "ask":
            kw.update(tools=WORK_TOOLS, permission_mode="default", can_use_tool=self._asker(pane),
                      system_prompt={"type": "preset", "preset": "claude_code", "append": team_note(pane, self.registry)})
        elif mode == "edit":
            allowed += SAFE_BASH
            kw.update(tools=WORK_TOOLS, permission_mode="acceptEdits", can_use_tool=self._asker(pane),
                      system_prompt={"type": "preset", "preset": "claude_code", "append": team_note(pane, self.registry)})
        else:  # all
            kw.update(tools=WORK_TOOLS, permission_mode="bypassPermissions", extra_args={"dangerously-skip-permissions": None},
                      system_prompt={"type": "preset", "preset": "claude_code", "append": team_note(pane, self.registry)})
        kw["allowed_tools"] = allowed
        return ClaudeAgentOptions(**kw)

    def _asker(self, pane: Pane):
        async def can_use_tool(tool_name: str, tool_input: dict, context):
            allow = await pane.ask_approval(f"Claude просит: {tool_name}", tool_detail(tool_name, tool_input) or str(tool_input)[:300])
            if allow:
                return PermissionResultAllow()
            return PermissionResultDeny(message="владелец отказал")
        return can_use_tool

    # ---- один ход ----
    async def run_turn(self, pane: Pane, message: str, relay_depth: int = 0) -> str:
        if not CLAUDE_BIN:
            raise RuntimeError("claude не найден; задай CLAUDE_BIN")
        opts = self.options(pane)
        self.bridge.set_depth(pane, relay_depth)
        started = time.time()
        text = ""
        assistant_text = ""
        streamed = False
        async with ClaudeSDKClient(options=opts) as client:
            pane.interrupt = client.interrupt
            await client.query(message)
            async for m in client.receive_response():
                if isinstance(m, StreamEvent):
                    ev = m.event or {}
                    if ev.get("type") == "content_block_delta" and (ev.get("delta") or {}).get("type") == "text_delta":
                        d = ev["delta"].get("text") or ""
                        if d:
                            streamed = True
                            text += d
                            pane.publish({"type": "delta", "text": d})
                elif isinstance(m, AssistantMessage):
                    for b in m.content:
                        if isinstance(b, ToolUseBlock):
                            pane.publish({"type": "tool", "name": b.name, "detail": tool_detail(b.name, b.input)})
                        elif isinstance(b, TextBlock):
                            assistant_text += b.text
                elif isinstance(m, UserMessage):
                    content = m.content if isinstance(m.content, list) else []
                    for b in content:
                        if isinstance(b, ToolResultBlock) and b.is_error:
                            t = b.content if isinstance(b.content, str) else " ".join(
                                x.get("text", "") for x in (b.content or []) if isinstance(x, dict))
                            pane.publish({"type": "toolError", "text": (t or "ошибка инструмента")[:300]})
                elif isinstance(m, ResultMessage):
                    pane.session_id = m.session_id or pane.session_id
                    if m.is_error:
                        raise RuntimeError(m.result or "ошибка модели")
                    if not streamed:
                        final = assistant_text or (m.result or "")
                        if final:
                            text = final
                            pane.publish({"type": "delta", "text": final})
                    u = m.usage or {}
                    pane.tokens = {"input": u.get("input_tokens"), "output": u.get("output_tokens"), "cacheRead": u.get("cache_read_input_tokens")}
                    pane.publish({"type": "done", "sessionId": pane.session_id, "model": pane.model,
                                  "durationMs": m.duration_ms or int((time.time() - started) * 1000), "usage": pane.tokens})
        return text

    # ---- разговоры ----
    async def list_sessions(self, cwd: str) -> list[dict]:
        out = []
        for s in list_sessions(cwd, limit=40):
            g = (lambda k: getattr(s, k, None)) if not isinstance(s, dict) else s.get
            title = (g("first_prompt") or g("custom_title") or g("summary") or "").strip().replace("\n", " ")[:60]
            lm = g("last_modified") or 0
            out.append({"id": g("session_id"), "title": title or "(без названия)", "updated": lm / 1000 if lm > 1e11 else lm})
        out.sort(key=lambda x: -(x["updated"] or 0))
        return out

    async def session_messages(self, cwd: str, session_id: str) -> list[dict]:
        msgs = []
        for m in get_session_messages(session_id, cwd):
            g = (lambda k: getattr(m, k, None)) if not isinstance(m, dict) else m.get
            msg = g("message") or {}
            if hasattr(msg, "model_dump"):
                msg = msg.model_dump()
            elif not isinstance(msg, dict):
                msg = getattr(msg, "__dict__", {}) or {}
            content = msg.get("content")
            if isinstance(content, str):
                t = content
            elif isinstance(content, list):
                if any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content):
                    continue
                t = "".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
            else:
                t = ""
            if not t.strip():
                continue
            t = strip_digest(t)
            role = "me" if g("type") == "user" else "ai"
            if msgs and msgs[-1]["role"] == "ai" and role == "ai":
                msgs[-1]["text"] += "\n" + t
            else:
                msgs.append({"role": role, "text": t})
        return msgs
