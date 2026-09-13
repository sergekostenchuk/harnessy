#!/usr/bin/env node
// Мост между окнами для Codex: MCP-сервер (stdio), который харнесс подключает к треду Codex.
// Инструменты: send — запись другому окну без ожидания; ask — вопрос с ожиданием ответа;
// read_pane — прочитать чужой разговор. Все идут в сервер харнесса по HTTP.
// Окружение: PANE_ID, APP_URL, RELAY_DEPTH. (Окна Claude получают те же инструменты внутри процесса сервера.)
import fs from 'node:fs';

const PANE_ID = process.env.PANE_ID || 'codex';
const APP_URL = process.env.APP_URL || 'http://127.0.0.1:3777';
const LOG = process.env.PANE_MCP_LOG || '/tmp/pane-mcp.log';
const PANES = Object.fromEntries((process.env.SEATS || 'left:левое окно;right:правое окно;codex:окно Codex').split(';').filter(Boolean).map((s) => { const i = s.indexOf(':'); return i > 0 ? [s.slice(0, i), s.slice(i + 1)] : [s, s]; }));
const others = Object.keys(PANES).filter((k) => k !== PANE_ID);
const KINDS = ['task', 'status', 'question', 'answer', 'review-request', 'verdict', 'blocker', 'escalation', 'note', 'stop', 'resume', 'digest', 'proposal', 'decision', 'report'];

function log(s) { try { fs.appendFileSync(LOG, new Date().toISOString() + ' [' + PANE_ID + '] ' + s + '\n'); } catch {} }
log('старт, APP_URL=' + APP_URL + ' node=' + process.version);

const TOOLS = [
  {
    name: 'send',
    description:
      `Отправить запись другому окну и продолжить работу, не дожидаясь ответа. Окна: ${others.map((k) => `${k} — ${PANES[k]}`).join('; ')}; owner — владелец. ` +
      `Виды записей: ${KINDS.join(', ')}. Ответ на чужую question — kind=answer с reply_to, на task — status, на review-request — verdict с score (0..10) и round. ` +
      'Адресат получит запись следующим ходом. Пиши полный самодостаточный текст: адресат не видит твоей переписки.',
    inputSchema: { type: 'object', properties: {
      to: { type: 'string', description: 'Окно-адресат (left, right, codex, owner), можно несколько через запятую' },
      kind: { type: 'string', enum: KINDS }, text: { type: 'string' }, thread: { type: 'string', description: 'Тред (задача, веха)' },
      reply_to: { type: 'integer', description: 'seq записи, на которую отвечаешь' }, evidence: { type: 'array', items: { type: 'string' } },
      score: { type: 'integer', minimum: 0, maximum: 10 }, round: { type: 'integer', minimum: 1 } },
      required: ['to', 'kind', 'text'], additionalProperties: false },
  },
  {
    name: 'ask',
    description: `Задать вопрос другому окну (${others.join(', ')}) и дождаться ответа. Адресат ответит, когда дойдёт до вопроса в своей очереди; ожидание может занять минуты. Для поручений и статусов пользуйся send.`,
    inputSchema: { type: 'object', properties: { to: { type: 'string', enum: others }, text: { type: 'string' }, thread: { type: 'string' } }, required: ['to', 'text'], additionalProperties: false },
  },
  {
    name: 'read_pane',
    description: `Прочитать последние реплики разговора в другом окне (${others.join(', ')}).`,
    inputSchema: { type: 'object', properties: { pane: { type: 'string', enum: others }, last_n: { type: 'integer', minimum: 1, maximum: 100 } }, required: ['pane'], additionalProperties: false },
  },
];

function write(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
function reply(id, result) { write({ jsonrpc: '2.0', id, result }); }
function error(id, code, message) { write({ jsonrpc: '2.0', id, error: { code, message } }); }
const err = (text) => ({ content: [{ type: 'text', text }], isError: true });
const ok = (text) => ({ content: [{ type: 'text', text }] });

async function post(path, body) {
  const r = await fetch(APP_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  return { status: r.status, d };
}

async function callTool(name, args) {
  log('вызов ' + name + ' ' + JSON.stringify(args).slice(0, 200));
  try {
    if (name === 'send') {
      const { d } = await post('/api/send', { from: PANE_ID, ...args });
      if (!d.ok) return err('Отказ: ' + (d.error || 'неизвестная ошибка'));
      return ok(`Запись #${d.seq} отправлена ${(d.to || []).join(', ')}; тред ${d.thread || 'без треда'}.`);
    }
    if (name === 'ask') {
      const { d } = await post('/api/ask', { from: PANE_ID, ...args });
      if (!d.ok) return err('Ответа нет: ' + (d.error || 'неизвестная ошибка'));
      return ok(d.reply || '(пустой ответ)');
    }
    if (name === 'read_pane') {
      const r = await fetch(APP_URL + '/api/pane_transcript?from=' + PANE_ID + '&pane=' + encodeURIComponent(args.pane || '') + '&last=' + Number(args.last_n || 20));
      const d = await r.json().catch(() => ({}));
      if (!d.ok) return err(d.error || ('HTTP ' + r.status));
      return ok(d.text || '');
    }
    return err('нет такого инструмента: ' + name);
  } catch (e) {
    log('ошибка ' + name + ': ' + (e && e.cause ? e.cause.message + ' / ' : '') + e.message);
    return err('Не удалось связаться с сервером харнесса: ' + e.message);
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
        capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'panes', version: '0.3.0' } });
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
