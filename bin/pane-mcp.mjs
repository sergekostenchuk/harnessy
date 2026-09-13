#!/usr/bin/env node
// Мост «написать соседнему окну»: MCP-сервер (stdio), который приложение подключает
// к каждому запуску claude. Один инструмент: send_to_other(text) → HTTP-запрос в
// сервер чата → ход соседа в его сессии → ответ соседа как результат инструмента.
// Окружение (наследуется от запуска claude): PANE_ID (left|right), APP_URL, RELAY_DEPTH.

const PANE_ID = process.env.PANE_ID || 'left';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:3777';
const DEPTH = Number(process.env.RELAY_DEPTH || 0);
const OTHER = PANE_ID === 'left' ? 'правое' : 'левое';

const TOOLS = [{
  name: 'send_to_other',
  description:
    `Отправить сообщение агенту в соседнем (${OTHER}) окне чата и дождаться его ответа. ` +
    'Сосед — другая сессия, возможно другая модель, та же папка проекта. Он получит текст как обычное ' +
    'сообщение в своей сессии и ответит; ответ вернётся тебе результатом этого инструмента. ' +
    'Пиши соседу полный самодостаточный текст: он не видит твоей переписки. ' +
    'Если сосед занят, вернётся ошибка — сделай сам или попробуй позже.',
  inputSchema: {
    type: 'object',
    properties: { text: { type: 'string', description: 'Текст сообщения соседу' } },
    required: ['text'],
    additionalProperties: false,
  },
}];

function write(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
function reply(id, result) { write({ jsonrpc: '2.0', id, result }); }
function error(id, code, message) { write({ jsonrpc: '2.0', id, error: { code, message } }); }

async function callTool(name, args) {
  if (name !== 'send_to_other') return { content: [{ type: 'text', text: 'нет такого инструмента: ' + name }], isError: true };
  const text = String(args?.text || '').trim();
  if (!text) return { content: [{ type: 'text', text: 'пустое сообщение' }], isError: true };
  try {
    const r = await fetch(APP_URL + '/api/relay', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: PANE_ID, text, depth: DEPTH }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) return { content: [{ type: 'text', text: 'Сосед не ответил: ' + (d.error || ('HTTP ' + r.status)) }], isError: true };
    return { content: [{ type: 'text', text: d.reply || '(сосед ответил пустым текстом)' }] };
  } catch (e) {
    return { content: [{ type: 'text', text: 'Не удалось связаться с сервером чата: ' + e.message }], isError: true };
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { error(null, -32700, 'битая строка'); continue; }
    const { id, method, params } = msg;
    if (method === 'initialize') {
      const v = params?.protocolVersion;
      reply(id, {
        protocolVersion: ['2025-06-18', '2025-03-26', '2024-11-05'].includes(v) ? v : '2025-03-26',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'panes', version: '0.1.0' },
      });
    } else if (method === 'notifications/initialized' || (method && method.startsWith('notifications/'))) {
      // уведомления без ответа
    } else if (method === 'ping') {
      reply(id, {});
    } else if (method === 'tools/list') {
      reply(id, { tools: TOOLS });
    } else if (method === 'tools/call') {
      const result = await callTool(params?.name, params?.arguments || {});
      reply(id, result);
    } else if (id !== undefined) {
      error(id, -32601, 'неизвестный метод: ' + method);
    }
  }
});
process.stdin.on('end', () => process.exit(0));
