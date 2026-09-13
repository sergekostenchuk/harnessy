#!/usr/bin/env node
// Мост между окнами для Codex: MCP-сервер (stdio), который приложение подключает к
// треду Codex. Инструменты: send_to(pane, text) — написать окну и дождаться ответа;
// read_pane(pane, last_n) — прочитать чужой разговор. Окружение: PANE_ID, APP_URL, RELAY_DEPTH.
// (Окна Claude получают те же инструменты внутри процесса сервера, без этого моста.)

const PANE_ID = process.env.PANE_ID || 'codex';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:3777';
const DEPTH = Number(process.env.RELAY_DEPTH || 0);
const PANES = { left: 'левое окно (Claude)', right: 'правое окно (Claude)', codex: 'окно Codex' };
const others = Object.keys(PANES).filter((k) => k !== PANE_ID);

const TOOLS = [
  {
    name: 'send_to',
    description:
      `Отправить сообщение агенту в другом окне чата и дождаться его ответа. Окна: ${others.map((k) => `${k} — ${PANES[k]}`).join('; ')}. ` +
      'Адресат — отдельная сессия и, возможно, другая модель, та же папка проекта. Он получит текст как обычное сообщение и ответит; ' +
      'ответ вернётся результатом инструмента. Пиши полный самодостаточный текст: адресат не видит твоей переписки. ' +
      'Если адресат занят, вернётся ошибка — сделай сам или попробуй позже.',
    inputSchema: { type: 'object', properties: { pane: { type: 'string', enum: others, description: 'Какому окну' }, text: { type: 'string', description: 'Текст сообщения' } }, required: ['pane', 'text'], additionalProperties: false },
  },
  {
    name: 'read_pane',
    description: `Прочитать последние реплики разговора в другом окне (${others.join(', ')}), чтобы понять, что там происходит.`,
    inputSchema: { type: 'object', properties: { pane: { type: 'string', enum: others }, last_n: { type: 'integer', minimum: 1, maximum: 100, description: 'Сколько последних реплик, по умолчанию 20' } }, required: ['pane'], additionalProperties: false },
  },
];

import fs from 'node:fs';
const LOG = process.env.PANE_MCP_LOG || '/tmp/pane-mcp.log';
function log(s) { try { fs.appendFileSync(LOG, new Date().toISOString() + ' [' + PANE_ID + '] ' + s + '\n'); } catch {} }
log('старт, APP_URL=' + APP_URL + ' node=' + process.version);
function write(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
function reply(id, result) { write({ jsonrpc: '2.0', id, result }); }
function error(id, code, message) { write({ jsonrpc: '2.0', id, error: { code, message } }); }
const err = (text) => ({ content: [{ type: 'text', text }], isError: true });

async function callTool(name, args) {
  log('вызов ' + name + ' ' + JSON.stringify(args).slice(0, 200));
  try {
    if (name === 'send_to') {
      const text = String(args?.text || '').trim();
      const pane = String(args?.pane || '');
      if (!text) return err('пустое сообщение');
      const r = await fetch(APP_URL + '/api/relay', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: PANE_ID, to: pane, text, depth: DEPTH }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) return err('Сосед не ответил: ' + (d.error || ('HTTP ' + r.status)));
      return { content: [{ type: 'text', text: d.reply || '(сосед ответил пустым текстом)' }] };
    }
    if (name === 'read_pane') {
      const pane = String(args?.pane || '');
      const n = Number(args?.last_n || 20);
      const r = await fetch(APP_URL + '/api/pane_transcript?pane=' + encodeURIComponent(pane) + '&last=' + n);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return err('не удалось прочитать окно: ' + (d.error || ('HTTP ' + r.status)));
      return { content: [{ type: 'text', text: d.text || '' }] };
    }
    return err('нет такого инструмента: ' + name);
  } catch (e) {
    log('ошибка ' + name + ': ' + (e && e.cause ? e.cause.message + ' / ' : '') + e.message);
    return err('Не удалось связаться с сервером чата: ' + e.message);
  }
}

let buf = '';
let pending = 0;
let ended = false;
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
      reply(id, { protocolVersion: ['2025-06-18', '2025-03-26', '2024-11-05'].includes(v) ? v : '2025-03-26',
        capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'panes', version: '0.2.0' } });
    } else if (method && method.startsWith('notifications/')) {
      // без ответа
    } else if (method === 'ping') {
      reply(id, {});
    } else if (method === 'tools/list') {
      reply(id, { tools: TOOLS });
    } else if (method === 'tools/call') {
      pending++;
      try { reply(id, await callTool(params?.name, params?.arguments || {})); } finally { pending--; if (ended && pending === 0) process.exit(0); }
    } else if (id !== undefined) {
      error(id, -32601, 'неизвестный метод: ' + method);
    }
  }
});
process.stdin.on('end', () => { ended = true; if (pending === 0) process.exit(0); });
