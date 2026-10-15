const { randomUUID } = require('node:crypto');

const EVENTS = new Set(['render-process-gone', 'did-fail-load', 'unresponsive', 'uncaught-exception']);

// Only a fixed event name crosses into the engine. Native error objects and URLs may contain credentials.
async function reportDesktopTrace(origin, action, request = fetch, log = console.error) {
  if (!EVENTS.has(action)) return false;
  log('[harnessy] electron: ' + action);
  try {
    const status = await request(origin + '/api/status', { signal: AbortSignal.timeout(1500) }).then(r => r.json());
    if (typeof status.project !== 'string' || typeof status.trace?.instanceId !== 'string') return false;
    const response = await request(origin + '/api/trace', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(1500),
      body: JSON.stringify({ action, page: 'desktop', kind: 'electron.outcome', outcome: 'failed', reason: 'internal',
        traceId: randomUUID(), spanId: randomUUID(), binding: { project: status.project, instanceId: status.trace.instanceId } }),
    });
    return response.ok;
  } catch { return false; }
}

module.exports = { reportDesktopTrace };
