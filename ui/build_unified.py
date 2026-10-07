import os

content = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Harness • OMG Desktop OS</title>
<link rel="stylesheet" href="unified-tokens.css">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--font-ui);
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-primary);
  background: var(--bg-app);
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}

/* ═══════ MACOS WINDOW TITLEBAR & TRAFFIC LIGHTS ═══════ */
.master-header {
  height: 48px;
  background: rgba(17, 20, 25, 0.94);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-bottom: 1px solid var(--border-subtle);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px;
  user-select: none; flex-shrink: 0;
  z-index: 100;
}
.hdr-left { display: flex; align-items: center; gap: 12px; }
.mac-traffic-lights { display: flex; align-items: center; gap: 8px; margin-right: 4px; }
.mac-light { width: 12px; height: 12px; border-radius: 50%; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; position: relative; transition: transform .1s; }
.mac-light:hover { transform: scale(1.1); }
.mac-red { background: #ff5f56; border: 1px solid #e0443e; }
.mac-yellow { background: #ffbd2e; border: 1px solid #dea123; }
.mac-green { background: #27c93f; border: 1px solid #1aab29; }
.mac-light:hover::after {
  content: ''; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 9px; font-weight: 800; color: rgba(0,0,0,0.7); line-height: 12px; text-align: center;
}
.mac-red:hover::after { content: '×'; }
.mac-yellow:hover::after { content: '−'; }
.mac-green:hover::after { content: '+'; }

.brand-wrap { display: flex; align-items: center; gap: 6px; }
.brand { font-weight: 700; font-size: 13px; letter-spacing: .4px; color: #fff; }
.brand-sub { font-weight: 400; font-size: 11px; color: var(--text-secondary); }
.project-badge {
  background: var(--bg-raised); padding: 2px 8px; border-radius: var(--radius-sm);
  font-size: 11px; color: var(--text-secondary); border: 1px solid var(--border-subtle);
  font-family: var(--font-mono);
}

/* 4 SPACES PILLS SWITCHER */
.mode-pills {
  display: flex; background: var(--bg-app); padding: 3px; border-radius: 20px;
  border: 1px solid var(--border-subtle); gap: 2px;
}
.mpill {
  border: none; background: transparent; padding: 5px 13px; font-size: 12px;
  font-weight: 500; border-radius: 16px; color: var(--text-secondary); cursor: pointer;
  transition: var(--transition-fast); display: flex; align-items: center; gap: 6px;
}
.mpill:hover { color: var(--text-primary); }
.mpill.on { background: var(--bg-raised); color: #fff; font-weight: 600; box-shadow: 0 1px 4px rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,0.06); }
.mpill-badge { font-size: 10px; font-weight: 700; padding: 0 5px; border-radius: 8px; background: rgba(255,255,255,0.08); }

.hdr-right { display: flex; align-items: center; gap: 12px; }
.search-box {
  display: flex; align-items: center; background: var(--bg-app); border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm); padding: 5px 10px; color: var(--text-faint); font-size: 12px; width: 220px; gap: 8px; cursor: pointer;
  transition: border-color .15s;
}
.search-box:hover { border-color: var(--border-focus); color: var(--text-secondary); }
.search-kbd { margin-left: auto; font-size: 10px; font-family: var(--font-mono); color: var(--text-faint); background: var(--bg-raised); padding: 1px 4px; border-radius: 2px; }
.assist { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: background .12s; }
.assist:hover { background: var(--bg-raised); color: var(--text-primary); }
.dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.dot-g { background: var(--accent-green); }
.dot-b { background: var(--accent-blue); animation: pulseB 1.5s infinite; }
.dot-a { background: var(--accent-amber); }
.dot-p { background: var(--accent-purple); }
.dot-off { background: var(--text-faint); }
@keyframes pulseB { 0%,100% { opacity:.45; } 50% { opacity:1; } }

/* ═══════ 7 INVARIANTS GLOBAL HEADS-UP BAR (ALWAYS VISIBLE) ═══════ */
.global-inv-strip {
  height: 34px; background: #0c0e13; border-bottom: 1px solid var(--border-subtle);
  display: flex; align-items: center; padding: 0 16px; gap: 8px; font-size: 11px;
  overflow-x: auto; flex-shrink: 0; user-select: none; z-index: 90;
}
.inv-pill {
  display: inline-flex; align-items: center; gap: 5px; background: var(--bg-raised);
  padding: 2px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);
  white-space: nowrap; font-size: 11px;
}
.inv-lbl { font-weight: 700; color: var(--text-faint); font-size: 9px; text-transform: uppercase; letter-spacing: .4px; }
.inv-val { color: var(--text-primary); font-family: var(--font-mono); font-size: 11px; }

/* ═══════ VIEWPORT & MODES ═══════ */
.viewport { flex: 1; display: flex; overflow: hidden; position: relative; }
.mode-view { position: absolute; inset: 0; display: none; }
.mode-view.on { display: flex; }

/* ═══════ MODE 1: CLAUDE DESKTOP & ANTIGRAVITY CANVAS (SPLIT VIEW) ═══════ */
#mv1 { background: var(--bg-app); display: none; flex: 1; overflow: hidden; }
#mv1.on { display: flex; }

/* 1. Left Channels & Agents Sidebar (200px) */
.m1-sidebar {
  width: 200px; background: var(--bg-panel); border-right: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; padding: 10px 8px; font-size: 12px; flex-shrink: 0; overflow-y: auto;
}
.m1-project-box { font-weight: 700; padding: 4px 8px 10px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); margin-bottom: 8px; }
.nav-group { font-size: 10px; font-weight: 700; color: var(--text-faint); text-transform: uppercase; letter-spacing: .5px; padding: 10px 8px 4px; }
.nav-item {
  display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: var(--radius-sm);
  color: var(--text-secondary); cursor: pointer; text-decoration: none; font-size: 12px; transition: background .12s;
}
.nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
.nav-item.on { background: var(--bg-raised); color: #fff; font-weight: 600; border-left: 2px solid var(--accent-purple); }
.nav-badge { margin-left: auto; background: var(--bg-raised); padding: 1px 6px; border-radius: 999px; font-size: 10px; color: var(--text-secondary); font-family: var(--font-mono); }
.nav-badge-hot { background: var(--accent-amber); color: #000; font-weight: 700; }
.team-row { display: flex; align-items: center; gap: 6px; padding: 5px 8px; font-size: 12px; color: var(--text-secondary); justify-content: space-between; border-radius: var(--radius-sm); }
.team-row:hover { background: var(--bg-raised); }
.team-status { font-size: 10px; color: var(--text-faint); font-family: var(--font-mono); }

/* 2. Center Conversational Feed Column */
.m1-feed-zone {
  flex: 1.1; display: flex; flex-direction: column; background: var(--bg-app);
  overflow: hidden; min-width: 440px; border-right: 1px solid var(--border-subtle);
}
.feed-hdr {
  height: 40px; background: var(--bg-panel); border-bottom: 1px solid var(--border-subtle);
  display: flex; align-items: center; justify-content: space-between; padding: 0 16px; font-size: 12px; flex-shrink: 0;
}
.feed-scroll { flex: 1; overflow-y: auto; padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
.feed-msg { display: flex; gap: 12px; align-items: flex-start; }
.feed-msg.owner {
  background: rgba(245,158,11,.04); border-left: 3px solid var(--accent-amber);
  padding: 10px 12px; border-radius: 0 var(--radius-md) var(--radius-md) 0;
}
.feed-avatar {
  width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 12px; color: #fff; flex-shrink: 0;
}
.feed-body { flex: 1; font-size: 13px; line-height: 1.5; }
.feed-meta { font-size: 11px; color: var(--text-faint); margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
.feed-badge { padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; text-transform: uppercase; }
.unread-div {
  text-align: center; position: relative; margin: 10px 0; font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 1px; color: var(--accent-red);
}
.unread-div::before, .unread-div::after { content: ''; position: absolute; top: 50%; width: 42%; height: 1px; background: rgba(255,107,107,.25); }
.unread-div::before { left: 0; } .unread-div::after { right: 0; }

/* DeepSeek-R1 Thought Accordion */
.deep-thought-card {
  background: rgba(143,129,255,.05); border: 1px solid rgba(143,129,255,.2);
  border-radius: var(--radius-md); padding: 8px 12px; margin: 6px 0; font-size: 12px;
}
.deep-thought-hdr { display: flex; align-items: center; justify-content: space-between; cursor: pointer; color: var(--accent-purple); font-weight: 600; user-select: none; }
.deep-thought-body { display: none; margin-top: 8px; color: var(--text-secondary); line-height: 1.5; font-family: var(--font-mono); font-size: 11px; border-top: 1px dashed rgba(143,129,255,.2); padding-top: 8px; }
.deep-thought-card.expanded .deep-thought-body { display: block; }

/* Perplexity Evidence Citations */
.cite-tag { background: rgba(90,176,255,.15); color: var(--accent-blue); padding: 0 5px; border-radius: 3px; font-family: var(--font-mono); font-size: 10px; cursor: pointer; font-weight: 600; }
.cite-tag:hover { background: var(--accent-blue); color: #000; }

/* Floating Composer */
.m1-composer-zone {
  padding: 10px 14px 14px; background: var(--bg-panel); border-top: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; gap: 8px; flex-shrink: 0;
}
.prompt-chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
.p-chip {
  background: var(--bg-raised); border: 1px solid var(--border-subtle); color: var(--text-secondary);
  font-size: 11px; padding: 3px 8px; border-radius: 12px; cursor: pointer; white-space: nowrap; transition: all .12s;
}
.p-chip:hover { border-color: var(--accent-purple); color: #fff; background: var(--bg-hover); }
.m1-composer-box {
  background: var(--bg-app); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
  padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.25);
  transition: border-color .15s;
}
.m1-composer-box:focus-within { border-color: var(--accent-purple); }
.m1-composer-inp {
  width: 100%; background: transparent; border: none; color: var(--text-primary); font-size: 13px;
  outline: none; font-family: var(--font-ui); line-height: 1.4; resize: none; min-height: 24px;
}
.composer-bottom { display: flex; align-items: center; justify-content: space-between; }
.model-dropdown-btn {
  display: inline-flex; align-items: center; gap: 6px; background: var(--bg-raised);
  border: 1px solid var(--border-subtle); padding: 3px 9px; border-radius: 12px; font-size: 11px;
  color: var(--text-primary); cursor: pointer; font-weight: 500; transition: border-color .15s;
}
.model-dropdown-btn:hover { border-color: var(--accent-purple); }
.btn-send {
  background: var(--accent-purple); color: #fff; border: none; padding: 5px 14px;
  border-radius: 16px; font-size: 12px; font-weight: 600; cursor: pointer; transition: filter .12s;
}
.btn-send:hover { filter: brightness(1.15); }

/* 3. Right Interactive Artifacts Stage (Claude Artifacts & Antigravity Canvas) */
.m1-artifacts-stage {
  flex: 1.4; display: flex; flex-direction: column; background: #07090d;
  overflow: hidden; position: relative; transition: all .2s ease;
}
.m1-artifacts-stage.fullscreen {
  position: absolute; inset: 0; z-index: 50; background: #07090d;
}
.artifacts-topbar {
  height: 40px; background: var(--bg-panel); border-bottom: 1px solid var(--border-subtle);
  display: flex; align-items: center; justify-content: space-between; padding: 0 14px; font-size: 12px; flex-shrink: 0;
}
.art-tabs { display: flex; align-items: center; gap: 4px; }
.art-tab { padding: 4px 10px; border-radius: var(--radius-sm); color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 11px; }
.art-tab.on { background: var(--bg-raised); color: #fff; font-weight: 600; }
.art-ctrls { display: flex; align-items: center; gap: 6px; }
.art-btn { background: var(--bg-raised); border: 1px solid var(--border-subtle); color: var(--text-secondary); padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 11px; }
.art-btn:hover { color: #fff; background: var(--bg-hover); border-color: var(--border-focus); }

/* Ladder strip at top of canvas */
.ladder {
  height: 34px; background: #090c10; border-bottom: 1px solid var(--border-subtle);
  display: flex; align-items: center; padding: 0 12px; gap: 6px; overflow-x: auto; flex-shrink: 0;
}
.ladder-chip {
  padding: 2px 8px; font-size: 10px; color: var(--text-faint); border: 1px solid var(--border-subtle);
  border-radius: 10px; white-space: nowrap; cursor: pointer; transition: all .12s;
}
.ladder-chip:hover { color: var(--text-primary); border-color: var(--border-focus); }
.ladder-chip.on { background: var(--bg-raised); color: var(--accent-blue); border-color: var(--accent-blue); font-weight: 600; }

/* Canvas & Graph Nodes */
.canvas-wrap {
  flex: 1; position: relative; background: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
  background-size: 20px 20px; overflow: hidden; cursor: grab;
}
.canvas-wrap:active { cursor: grabbing; }
.canvas-layer { position: absolute; transform-origin: 0 0; will-change: transform; }
.edge-svg { position: absolute; top: 0; left: 0; pointer-events: none; overflow: visible; }
.n8n-nd {
  position: absolute; width: 210px; background: var(--bg-panel); border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md); padding: 10px 12px; box-shadow: 0 4px 14px rgba(0,0,0,.5);
  cursor: pointer; transition: border-color .12s, transform .1s; user-select: none;
}
.n8n-nd:hover { border-color: var(--border-focus); transform: translateY(-1px); }
.n8n-nd.sel { border-color: var(--accent-blue); box-shadow: 0 0 0 1.5px var(--accent-blue); }
.n8n-nd.k-root { border-top: 3px solid var(--accent-purple); }
.n8n-nd.k-step { border-top: 3px solid var(--accent-blue); }
.n8n-nd.k-gate { border-top: 3px solid var(--accent-amber); }
.nd-hdr { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; }
.nd-title { font-weight: 600; font-size: 12px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 155px; }
.nd-kind { font-size: 9px; padding: 1px 5px; border-radius: 3px; background: var(--bg-raised); color: var(--text-faint); text-transform: uppercase; font-family: var(--font-mono); }
.nd-purpose { font-size: 11px; color: var(--text-secondary); line-height: 1.35; max-height: 32px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.nd-ports { display: flex; gap: 3px; margin-top: 6px; flex-wrap: wrap; }
.nd-port { font-size: 9px; background: var(--bg-app); border: 1px solid var(--border-subtle); padding: 1px 4px; border-radius: 2px; color: var(--text-faint); font-family: var(--font-mono); }

/* Node Inspector Panel inside stage */
.inspector {
  width: 320px; background: var(--bg-panel); border-left: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; flex-shrink: 0; overflow-y: auto;
}
.insp-hdr { padding: 12px 14px; border-bottom: 1px solid var(--border-subtle); }
.insp-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; flex: 1; overflow-y: auto; }
.insp-label { font-size: 10px; color: var(--text-faint); text-transform: uppercase; font-weight: 700; margin-bottom: 2px; }
.insp-val { font-size: 12px; color: var(--text-primary); line-height: 1.4; }
.insp-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.insp-tag { background: var(--bg-app); border: 1px solid var(--border-subtle); padding: 1px 6px; border-radius: 3px; font-size: 10px; font-family: var(--font-mono); color: var(--text-secondary); }

/* Timeline bar at bottom of stage */
.timeline-bar {
  height: 42px; background: var(--bg-panel); border-top: 1px solid var(--border-subtle);
  display: flex; align-items: center; padding: 0 16px; gap: 12px; font-size: 11px; flex-shrink: 0;
}
.tl-btn { background: var(--bg-raised); border: 1px solid var(--border-subtle); color: #fff; padding: 3px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; }
.tl-range { flex: 1; accent-color: var(--accent-blue); }

/* ═══════ MODE 2: CODEX / CURSOR DESKTOP (КОД & ТЕСТЫ) ═══════ */
#mv2 { display: none; flex: 1; flex-direction: column; overflow: hidden; background: var(--bg-app); }
#mv2.on { display: flex; }
.m2-quadrant-body { flex: 1; display: flex; overflow: hidden; }

/* File tree */
.m2-col-project {
  width: 230px; background: var(--bg-panel); border-right: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; padding: 10px 8px; font-size: 12px; flex-shrink: 0; overflow-y: auto;
}
.m2-sec-title { font-size: 10px; font-weight: 700; color: var(--text-faint); text-transform: uppercase; letter-spacing: .5px; padding: 8px 6px 4px; }
.stage-chip { display: flex; align-items: center; justify-content: space-between; padding: 5px 8px; border-radius: var(--radius-sm); color: var(--text-secondary); margin-bottom: 2px; cursor: pointer; }
.stage-chip:hover { background: var(--bg-raised); color: var(--text-primary); }
.stage-chip.on { background: var(--bg-raised); color: #fff; font-weight: 600; border-left: 2px solid var(--accent-blue); }
.tree-row {
  display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: var(--radius-sm);
  color: var(--text-secondary); cursor: pointer; font-family: var(--font-mono); font-size: 11px;
}
.tree-row:hover { background: var(--bg-raised); color: var(--text-primary); }
.tree-row.on { background: var(--bg-raised); color: #fff; font-weight: 500; }
.git-tag { font-size: 9px; font-weight: 700; padding: 0 4px; border-radius: 2px; }
.git-m { background: rgba(242,176,75,.2); color: var(--accent-amber); }
.git-a { background: rgba(61,220,151,.2); color: var(--accent-green); }

/* Code Diff & Test Stage */
.m2-col-stage { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #080a0e; }
.m2-stage-tabs {
  height: 38px; background: var(--bg-panel); border-bottom: 1px solid var(--border-subtle);
  display: flex; align-items: center; justify-content: space-between; padding: 0 14px; font-size: 12px; flex-shrink: 0;
}
.code-tab-strip { display: flex; align-items: center; gap: 4px; }
.c-tab {
  padding: 4px 10px; border-radius: var(--radius-sm); color: var(--text-secondary); font-size: 12px;
  cursor: pointer; display: flex; align-items: center; gap: 6px; font-family: var(--font-mono);
}
.c-tab.on { background: var(--bg-app); color: #fff; font-weight: 500; }
.m2-diff-scroll { flex: 1; overflow-y: auto; padding: 14px 18px; font-family: var(--font-mono); font-size: 12px; line-height: 1.65; color: #d6d9e0; background: #06070a; }
.diff-add { background: rgba(61,220,151,.1); color: #3ddc97; display: block; padding: 0 6px; border-left: 2px solid var(--accent-green); }
.diff-del { background: rgba(255,107,107,.1); color: #ff6b6b; display: block; padding: 0 6px; border-left: 2px solid var(--accent-red); }
.diff-ctx { display: block; padding: 0 6px; color: var(--text-faint); }
.diff-hunk { display: block; padding: 0 6px; color: var(--accent-blue); font-weight: 600; margin: 8px 0 4px; }
.test-bar {
  height: 34px; background: var(--bg-panel); border-top: 1px solid var(--border-subtle);
  display: flex; align-items: center; padding: 0 14px; gap: 10px; font-size: 11px; flex-shrink: 0;
}

/* Right Chat & Commit Approval Panel */
.m2-col-chat {
  width: 360px; background: var(--bg-panel); border-left: 1px solid var(--border-subtle);
  display: flex; flex-direction: column; flex-shrink: 0;
}
.commit-card {
  background: var(--bg-raised); border: 1px solid var(--border-focus); border-radius: var(--radius-md);
  padding: 12px; margin-top: 8px;
}
.commit-label { font-size: 10px; font-weight: 700; color: var(--accent-amber); text-transform: uppercase; margin-bottom: 2px; }
.commit-title { font-weight: 700; font-size: 12px; margin-bottom: 4px; }
.commit-desc { font-size: 11px; color: var(--text-secondary); margin-bottom: 10px; }

/* ═══════ MODE 3: LIVE PRODUCT PREVIEW ═══════ */
#mv3 { display: none; flex: 1; flex-direction: column; overflow: hidden; background: #000; }
#mv3.on { display: flex; }
.product-toolbar {
  height: 40px; background: var(--bg-panel); border-bottom: 1px solid var(--border-subtle);
  display: flex; align-items: center; justify-content: space-between; padding: 0 16px; font-size: 12px; color: var(--text-secondary); flex-shrink: 0;
}
.vp-btn { background: var(--bg-raised); border: 1px solid var(--border-subtle); color: var(--text-secondary); padding: 3px 9px; border-radius: 4px; cursor: pointer; font-size: 11px; }
.vp-btn.on { background: var(--accent-blue); color: #fff; font-weight: 600; border-color: var(--accent-blue); }
.product-frame-wrap { flex: 1; display: flex; justify-content: center; align-items: stretch; background: #050608; overflow: hidden; }
.product-iframe { width: 100%; height: 100%; border: none; background: #0b0d12; transition: width .2s ease; }

/* ═══════ MODE 4: HERMES & KIMI DECISION HQ (ШТАБ РЕШЕНИЙ) ═══════ */
#mv4 { display: none; flex: 1; flex-direction: column; overflow: hidden; background: var(--bg-app); }
#mv4.on { display: flex; }
.m4-gauges {
  background: var(--bg-panel); border-bottom: 1px solid var(--border-subtle);
  padding: 12px 20px; display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; flex-shrink: 0;
}
.gauge-card { background: var(--bg-raised); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 10px 14px; cursor: pointer; }
.gauge-lbl { font-size: 10px; text-transform: uppercase; color: var(--text-faint); font-weight: 700; letter-spacing: .4px; }
.gauge-num { font-size: 20px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 8px; margin-top: 3px; }
.gauge-sub { font-size: 11px; font-weight: 400; color: var(--text-faint); }

.stage-rail {
  height: 40px; background: #0c0e13; border-bottom: 1px solid var(--border-subtle);
  display: flex; align-items: center; padding: 0 20px; gap: 12px; font-size: 11px; overflow-x: auto; flex-shrink: 0;
}
.gate-step { display: flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); background: var(--bg-panel); cursor: pointer; white-space: nowrap; }
.gate-step.pass { border-color: rgba(61,220,151,.3); color: var(--accent-green); }
.gate-step.curr { border-color: var(--accent-amber); background: rgba(242,176,75,.1); color: #fff; font-weight: 600; }
.gate-step.lock { opacity: .5; cursor: not-allowed; }
.gate-arrow { color: var(--text-faint); font-size: 10px; }

.m4-body { flex: 1; display: flex; overflow: hidden; }
.m4-feed { flex: 1; overflow-y: auto; padding: 18px 24px; max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
.tri-card {
  background: var(--bg-panel); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
  padding: 16px 18px; cursor: pointer; transition: border-color .15s, background .15s;
}
.tri-card:hover { background: var(--bg-hover); border-color: var(--border-focus); }
.tri-card.decision { border-left: 3px solid var(--accent-amber); }
.tri-card.inwork { border-left: 3px solid var(--accent-blue); }
.tri-card.planned { border-left: 3px solid var(--text-faint); opacity: .75; }
.tri-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.tri-type { font-size: 10px; font-weight: 700; text-transform: uppercase; display: flex; align-items: center; gap: 6px; letter-spacing: .5px; }
.tri-title { font-size: 15px; font-weight: 600; margin-bottom: 10px; line-height: 1.35; }
.tri-inv-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 14px;
  background: var(--bg-app); border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md); padding: 10px 12px; margin-bottom: 12px; font-size: 11px;
}
.inv-cell { display: flex; gap: 6px; line-height: 1.4; }
.inv-tag-lbl { font-weight: 700; color: var(--text-faint); min-width: 60px; font-size: 10px; text-transform: uppercase; flex-shrink: 0; }
.inv-cell-val { color: var(--text-primary); }
.tri-actions { display: flex; gap: 10px; align-items: center; margin-top: 10px; }
.btn-approve { background: var(--accent-green); color: #000; border: none; padding: 6px 14px; border-radius: var(--radius-sm); font-weight: 700; cursor: pointer; font-size: 12px; }
.btn-approve:hover { filter: brightness(1.1); }
.btn-reject { background: var(--bg-raised); border: 1px solid var(--border-subtle); color: var(--accent-red); padding: 6px 12px; border-radius: var(--radius-sm); cursor: pointer; font-size: 12px; }

/* Right panel: 5-pass check */
.m4-ctx {
  width: 380px; background: var(--bg-panel); border-left: 1px solid var(--border-subtle);
  padding: 18px; overflow-y: auto; flex-shrink: 0; display: flex; flex-direction: column; gap: 16px;
}
.check-item {
  display: flex; align-items: flex-start; gap: 8px; padding: 6px 8px; background: var(--bg-app);
  border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); font-size: 11px; line-height: 1.4;
}
.check-box-custom { width: 14px; height: 14px; accent-color: var(--accent-green); margin-top: 1px; flex-shrink: 0; }

/* ═══════ STATUS BAR ═══════ */
.status-bar {
  height: 26px; background: var(--bg-panel); border-top: 1px solid var(--border-subtle);
  display: flex; align-items: center; padding: 0 14px; gap: 12px; font-size: 11px; color: var(--text-secondary);
  user-select: none; flex-shrink: 0; z-index: 100;
}
.status-sep { width: 1px; height: 12px; background: var(--border-subtle); }
.status-pill { background: var(--bg-raised); padding: 1px 6px; border-radius: 3px; font-size: 10px; color: var(--text-faint); }

/* ═══════ DENSITY, COMMAND PALETTE, MODALS & TOASTS ═══════ */
.density-switch { display: flex; background: var(--bg-app); padding: 2px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); gap: 2px; }
.dens-btn { border: none; background: transparent; color: var(--text-faint); padding: 2px 7px; font-size: 10px; font-family: var(--font-mono); border-radius: 2px; cursor: pointer; }
.dens-btn:hover { color: var(--text-primary); }
.dens-btn.on { background: var(--bg-raised); color: #fff; font-weight: 700; }

.modal-backdrop {
  position: fixed; inset: 0; background: rgba(5,7,10,0.75); backdrop-filter: blur(8px);
  z-index: 1000; display: none; align-items: flex-start; justify-content: center; padding-top: 80px;
  animation: fadeIn .12s ease;
}
.modal-backdrop.on { display: flex; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }

.cmd-palette {
  width: 580px; max-width: 92vw; background: var(--bg-panel); border: 1px solid var(--border-focus);
  border-radius: var(--radius-lg); box-shadow: 0 24px 64px rgba(0,0,0,0.85); overflow: hidden;
  display: flex; flex-direction: column;
}
.cmd-input-box { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-raised); }
.cmd-input { flex: 1; background: transparent; border: none; outline: none; color: #fff; font-size: 14px; font-family: var(--font-ui); }
.cmd-list { max-height: 380px; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 2px; }
.cmd-sec-title { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--text-faint); letter-spacing: .5px; padding: 6px 8px 2px; }
.cmd-item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--radius-sm); color: var(--text-secondary); cursor: pointer; font-size: 12px; transition: background .1s; }
.cmd-item:hover, .cmd-item.active { background: var(--bg-hover); color: #fff; }
.cmd-item kbd { margin-left: auto; font-size: 10px; font-family: var(--font-mono); color: var(--text-faint); background: var(--bg-app); padding: 1px 5px; border-radius: 3px; }

.recap-modal-card { width: 540px; background: var(--bg-panel); border: 1px solid var(--accent-blue); border-radius: var(--radius-lg); box-shadow: 0 24px 64px rgba(0,0,0,0.85); overflow: hidden; padding: 22px; }
.recap-title { font-size: 16px; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
.recap-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 16px 0; }
.recap-num-box { background: var(--bg-app); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 10px; text-align: center; }
.recap-num { font-size: 20px; font-weight: 700; color: #fff; }
.recap-lbl { font-size: 10px; color: var(--text-faint); text-transform: uppercase; margin-top: 2px; }

.toast-box { position: fixed; bottom: 36px; right: 20px; z-index: 2000; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
.toast-item {
  background: var(--bg-raised); border: 1px solid var(--border-focus); border-radius: var(--radius-md);
  padding: 10px 16px; color: #fff; font-size: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.6);
  display: flex; align-items: center; gap: 8px; pointer-events: auto; animation: slideUp .2s ease;
}
@keyframes slideUp { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

/* Model Selector Menu */
.model-menu {
  position: absolute; bottom: 50px; left: 14px; background: var(--bg-panel); border: 1px solid var(--border-focus);
  border-radius: var(--radius-md); box-shadow: 0 12px 32px rgba(0,0,0,0.7); padding: 6px; z-index: 200;
  display: none; flex-direction: column; min-width: 220px;
}
.model-menu.open { display: flex; }
.model-menu-item {
  display: flex; align-items: center; justify-content: space-between; padding: 6px 10px;
  border-radius: var(--radius-sm); cursor: pointer; font-size: 12px; color: var(--text-secondary);
}
.model-menu-item:hover { background: var(--bg-hover); color: #fff; }
.model-menu-item.on { background: var(--bg-raised); color: var(--accent-purple); font-weight: 600; }
</style>
</head>
<body>

<!-- ═══════ MASTER HEADER (MACOS WINDOW CHROME) ═══════ -->
<header class="master-header">
  <div class="hdr-left">
    <!-- macOS Authentic Traffic Lights -->
    <div class="mac-traffic-lights">
      <div class="mac-light mac-red" onclick="showToast('Harness работает в фоновом демоне (порт 8766)')" title="Закрыть"></div>
      <div class="mac-light mac-yellow" onclick="showToast('Свернуть окно в Dock')" title="Свернуть"></div>
      <div class="mac-light mac-green" onclick="toggleAppFullscreen()" title="На весь экран"></div>
    </div>
    <div class="brand-wrap">
      <span class="brand">⚡ HARNESS OS <span class="brand-sub">• OMG Control Deck</span></span>
      <span class="project-badge">main: f3bf191</span>
    </div>
    <div class="density-switch">
      <button class="dens-btn" data-d="cmp" onclick="setDensity('cmp')" title="Компактный (инженерный)">12px</button>
      <button class="dens-btn on" data-d="std" onclick="setDensity('std')" title="Стандартный (дефолт)">13px</button>
      <button class="dens-btn" data-d="rel" onclick="setDensity('rel')" title="Просторный (презентация)">14px</button>
    </div>
  </div>

  <!-- 4 SPACES PILL NAVIGATION (ALWAYS VISIBLE & ACCESSIBLE) -->
  <div class="mode-pills">
    <button class="mpill on" data-m="1">💬 1. Обсуждение & Артефакты <span class="mpill-badge">Claude/Canvas</span></button>
    <button class="mpill" data-m="2">💻 2. Код & Тесты <span class="mpill-badge">Codex/Diffs</span></button>
    <button class="mpill" data-m="3">🚀 3. Живой продукт <span class="mpill-badge">:3000</span></button>
    <button class="mpill" data-m="4">📊 4. Штаб решений <span class="mpill-badge" style="background:var(--accent-amber);color:#000;">3</span></button>
  </div>

  <div class="hdr-right">
    <div class="search-box" onclick="openCommandPalette()">
      <span>🔍 Поиск по графу, коду…</span><span class="search-kbd">⌘K</span>
    </div>
    <div class="assist" onclick="openRecapModal()" title="Сводка визита: что произошло за время отсутствия">
      <span class="dot dot-g"></span><span>Сводка визита</span>
    </div>
  </div>
</header>

<!-- ═══════ 7 INVARIANTS HEADS-UP BAR (ALWAYS VISIBLE ON ANY SCREEN) ═══════ -->
<div class="global-inv-strip">
  <div class="inv-pill"><span class="inv-lbl">📍 ГДЕ</span><span class="inv-val">OMG • om-map • src/sections/om-map/</span></div>
  <div class="inv-pill"><span class="inv-lbl">⚡ ЧТО</span><span class="inv-val" id="global-inv-what">Карта n8n (55 узлов) + роутер #/om-map</span></div>
  <div class="inv-pill"><span class="inv-lbl">🎯 ЗАЧЕМ</span><span class="inv-val">Визуальный аудит конвейера R2 без терминального шума</span></div>
  <div class="inv-pill"><span class="inv-lbl">⏳ КОГДА</span><span class="inv-val">Рубеж L3 • 9 задач до L4 (финал)</span></div>
  <div class="inv-pill"><span class="inv-lbl">📦 ОЖИДАЕМ</span><span class="inv-val">Dagre-холст с инспектором и таймлайном 2729 событий</span></div>
  <div class="inv-pill"><span class="inv-lbl">⚠️ РИСКИ</span><span class="inv-val" style="color:var(--accent-green);">Низкие (ветка om-map изолирована, откат мгновенный)</span></div>
  <div class="inv-pill"><span class="inv-lbl">🏆 КРИТЕРИИ</span><span class="inv-val" style="color:var(--accent-green);">8/8 тестов OK • 0 ошибок сборки • 100% кликабельность</span></div>
</div>

<div class="viewport">

<!-- ═══════════════════════════════════════════════════════
     SPACE 1: ОБСУЖДЕНИЕ & АРТЕФАКТЫ (CLAUDE + ANTIGRAVITY + DEEPSEEK + PERPLEXITY + PI)
     ═══════════════════════════════════════════════════════ -->
<div id="mv1" class="mode-view on">
  <!-- 1. Left Sidebar: Channels & Agent Team -->
  <aside class="m1-sidebar">
    <div class="m1-project-box">
      <span>OMG</span>
      <span style="color:var(--text-faint); font-size:11px;">проект</span>
    </div>
    <div class="nav-group">ПРОСТРАНСТВА</div>
    <a class="nav-item on" onclick="goMode(1)">💬 Диалог шины</a>
    <a class="nav-item" onclick="toggleArtifactFullscreen()">🗺️ Холст n8n <span class="nav-badge" id="map-cnt" style="background:var(--accent-blue);color:#fff;">55</span></a>
    <a class="nav-item" onclick="goMode(2)">💻 Код & Тесты</a>
    <a class="nav-item" onclick="goMode(3)">🚀 Живой продукт (:3000)</a>
    <a class="nav-item" onclick="goMode(4)">📊 Штаб решений</a>

    <div class="nav-group">КАНАЛЫ ШИНЫ</div>
    <a class="nav-item" style="color:var(--text-primary);"># main <span class="nav-badge nav-badge-hot">1</span></a>
    <a class="nav-item"># events <span class="nav-badge">70</span></a>
    <a class="nav-item"># omg-r2-l3</a>

    <div class="nav-group">КОМАНДА АГЕНТОВ</div>
    <div class="team-row"><span style="display:flex;align-items:center;gap:6px;"><span class="dot dot-b"></span>Architect</span><span class="team-status" style="color:var(--accent-blue);">ход активен</span></div>
    <div class="team-row"><span style="display:flex;align-items:center;gap:6px;"><span class="dot dot-a"></span>Reviewer</span><span class="team-status" style="color:var(--accent-amber);">1 ждёт</span></div>
    <div class="team-row"><span style="display:flex;align-items:center;gap:6px;"><span class="dot dot-off"></span>Worker</span><span class="team-status">готов</span></div>
    <div class="team-row"><span style="display:flex;align-items:center;gap:6px;"><span class="dot dot-p"></span>Fable</span><span class="team-status">сдал каркас</span></div>
    <div class="team-row"><span style="display:flex;align-items:center;gap:6px;"><span class="dot dot-b"></span>Codex</span><span class="team-status">вердикт 9/10</span></div>
  </aside>

  <!-- 2. Center Conversational Feed Column -->
  <main class="m1-feed-zone">
    <div class="feed-hdr">
      <div style="display:flex;align-items:center;gap:8px;">
        <strong># main</strong>
        <span style="color:var(--text-faint);">• Диалог оркестрации и витрины</span>
      </div>
      <div style="font-size:11px;color:var(--text-faint);">
        Claude 3.7 + DeepSeek-R1 + Perplexity
      </div>
    </div>

    <div class="feed-scroll" id="m1-feed-scroll">
      <!-- Owner Task Message -->
      <div class="feed-msg owner">
        <div class="feed-avatar" style="background:#d97706;">В</div>
        <div class="feed-body">
          <div class="feed-meta"><strong>Владелец</strong> → все <span class="feed-badge" style="background:rgba(245,158,11,.15);color:var(--accent-amber);">слово владельца</span> <span>29.09, 10:42</span> <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-faint);">№240</span></div>
          <div><strong>Первый ломоть UI.</strong> Начинаем третий ломоть: витрина поверх шины. Fable — каркас воркбенча, codex — ревью по готовности. Правила остаются в библиотеке asvh, UI их не повторяет.</div>
        </div>
      </div>

      <!-- Fable Message -->
      <div class="feed-msg">
        <div class="feed-avatar" style="background:var(--accent-purple);">F</div>
        <div class="feed-body">
          <div class="feed-meta"><strong>Fable</strong> → Владелец <span>10:57</span> <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-faint);">№241</span></div>
          <div style="font-size:11px;color:var(--text-faint);margin-bottom:2px;">в ответ на №240</div>
          <div>Принято. Каркас: Electron + React, мост через CLI, чтение status/read, запись post/ack. Демо-режим для предпросмотра без дома.</div>
        </div>
      </div>

      <!-- Fable to Codex -->
      <div class="feed-msg">
        <div class="feed-avatar" style="background:var(--accent-purple);">F</div>
        <div class="feed-body">
          <div class="feed-meta"><strong>Fable</strong> → Codex <span style="color:var(--accent-blue);">на ревью</span> <span>11:52</span> <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-faint);">№242</span></div>
          <div><strong>Каркас воркбенча.</strong> Проверить: правила не дублируются, отказы доходят формой {ok:false}, постинг owner идёт со следом cli-notty.</div>
          <div style="margin-top:4px;display:flex;gap:4px;"><span style="background:var(--bg-raised);padding:1px 6px;border-radius:3px;font-size:10px;font-family:var(--font-mono);color:var(--text-secondary);">electron/main.cjs</span><span style="background:var(--bg-raised);padding:1px 6px;border-radius:3px;font-size:10px;font-family:var(--font-mono);color:var(--text-secondary);">src/App.tsx</span></div>
        </div>
      </div>

      <!-- Codex Verdict -->
      <div class="feed-msg">
        <div class="feed-avatar" style="background:var(--accent-blue);">C</div>
        <div class="feed-body">
          <div class="feed-meta"><strong>Codex</strong> → Fable <span class="feed-badge" style="background:rgba(61,220,151,.15);color:var(--accent-green);">вердикт 9/10</span> <span>13:12</span> <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-faint);">№243</span></div>
          <div style="font-size:11px;color:var(--text-faint);margin-bottom:2px;">в ответ на №242 · раунд 1</div>
          <div>Каркас принят. Мост тонкий, правил не повторяет; отказ post от не-owner возвращается ответом, а не исключением. Замечание: опрос status каждые 3с — перевести на события, когда появится watch в asvh.</div>
        </div>
      </div>

      <div class="unread-div">новые</div>

      <!-- Owner Active Instruction -->
      <div class="feed-msg owner">
        <div class="feed-avatar" style="background:#d97706;">В</div>
        <div class="feed-body">
          <div class="feed-meta"><strong>Владелец</strong> → все <span class="feed-badge" style="background:rgba(245,158,11,.15);color:var(--accent-amber);">слово владельца</span> <span>30.09, 00:56</span> <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-faint);">№244</span></div>
          <div>Вторая дорожка таймлайна «разработка OM». Проверить ветку om-map и предоставить визуальную карту n8n с прямым роутингом #/om-map.</div>
        </div>
      </div>

      <!-- DeepSeek-R1 Thought Accordion -->
      <div class="deep-thought-card" id="deepseek-card">
        <div class="deep-thought-hdr" onclick="toggleDeepThought()">
          <span style="display:flex;align-items:center;gap:6px;">
            <span>🧠</span>
            <span>Рассуждение DeepSeek-R1 (18 секунд • 682 токена • 42 tok/s)</span>
          </span>
          <span id="deep-thought-chevron">▸</span>
        </div>
        <div class="deep-thought-body" id="deep-thought-content">
1. Задача: обеспечить визуальную карту OMG в стиле n8n (55 узлов, 87 рёбер) и прямой роутинг #/om-map.
2. Анализ топологии R2:
   - |V| = 55 узлов, |E| = 87 связей. Корневых узлов: 3 (kind: root).
   - Основной поток: рёбра 'on_success' образуют ациклический конвейер (5 рангов).
   - Альтернативные ветви: рёбра 'on_failure' и 'returns_to' не должны смещать ранжирование основных блоков (иначе граф сжимается к узлу recovery).
3. Инвариант ОТСУТСТВИЕ:
   - При отсутствии полей в сырых ревизиях подставляются типизированные дефолты (kind='step', status='ready').
4. Интеграция:
   - В правом артефакте визуализируется DAG-холст с SVG-кривыми Безье и инспектором контрактов.
   - Сборка на порту 3000 компилируется без ошибок (8/8 тестов OK).
        </div>
      </div>

      <!-- Perplexity Evidence Citations Card -->
      <div style="background:rgba(90,176,255,.05);border:1px solid rgba(90,176,255,.2);border-radius:var(--radius-md);padding:10px 12px;font-size:12px;line-height:1.5;">
        <div style="font-weight:600;color:var(--accent-blue);margin-bottom:4px;display:flex;align-items:center;gap:6px;">
          <span>🌐</span><span>Доказательства и источники (Perplexity Engine)</span>
        </div>
        <div>
          Граф R2 зафиксирован в ревизии 2058 <span class="cite-tag" onclick="showCitation(1)">[1] heads</span>. Всего 2 729 событий в журнале <span class="cite-tag" onclick="showCitation(2)">[2] events</span>. Расход этапа L3: 11,7 M токенов на 225 вызовов моделей <span class="cite-tag" onclick="showCitation(3)">[3] model-calls</span>.
        </div>
      </div>

      <!-- Pi Human Translation Box -->
      <div style="background:rgba(61,220,151,.05);border:1px solid rgba(61,220,151,.25);border-radius:var(--radius-md);padding:10px 14px;font-size:12px;line-height:1.5;">
        <div style="font-weight:600;color:var(--accent-green);margin-bottom:2px;display:flex;align-items:center;gap:6px;">
          <span>💬</span><span>Простыми словами для человека (Pi Companion):</span>
        </div>
        <div style="color:var(--text-secondary);">
          Вам больше не нужно разбираться в логах консоли. Вся система открыта справа в виде интерактивной карты. Кликните по любому узлу, чтобы узнать, что он делает, кто его написал и как он протестирован.
        </div>
      </div>
    </div>

    <!-- Floating Composer with Model Switcher Pill -->
    <div class="m1-composer-zone">
      <div class="prompt-chips">
        <span class="p-chip" onclick="handlePromptChip('pi')">💬 Объясни простыми словами (Pi)</span>
        <span class="p-chip" onclick="handlePromptChip('deepseek')">🧠 Рассуждение DeepSeek R1</span>
        <span class="p-chip" onclick="toggleArtifactFullscreen()">🗺️ Раскрыть карту на весь экран</span>
        <span class="p-chip" onclick="handlePromptChip('perplexity')">📊 Проверить цитаты SQLite</span>
        <span class="p-chip" onclick="goMode(2)">💻 Показать диффы коммита</span>
      </div>

      <div class="m1-composer-box">
        <textarea class="m1-composer-inp" id="m1-composer-input" placeholder="Поручите модели, задайте вопрос или выберите быстрый чип выше… (Enter)" rows="1" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendComposerPrompt();}"></textarea>
        <div class="composer-bottom">
          <!-- Active Model Switcher Dropdown Button -->
          <div class="model-dropdown-btn" id="active-model-btn" onclick="toggleModelMenu()">
            <span id="model-btn-icon">⚡</span>
            <span id="model-btn-name">Claude 3.7 Sonnet</span>
            <span style="font-size:9px;color:var(--text-faint);">▾</span>
          </div>

          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:10px;font-family:var(--font-mono);color:var(--text-faint);">⌘↵</span>
            <button class="btn-send" onclick="sendComposerPrompt()">Отправить</button>
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- 3. Right Interactive Artifacts Stage (Claude Artifacts & Antigravity Canvas) -->
  <aside class="m1-artifacts-stage" id="m1-artifacts-stage">
    <div class="artifacts-topbar">
      <div class="art-tabs">
        <div class="art-tab on" id="art-tab-map"><span>🗺️</span><span>Интерактивная карта n8n</span><span class="nav-badge" style="background:var(--accent-blue);color:#fff;">55 узлов</span></div>
        <div class="art-tab" onclick="goMode(2)"><span>📄</span><span>Диффы кода</span></div>
        <div class="art-tab" onclick="goMode(3)"><span>🚀</span><span>Живой продукт (:3000)</span></div>
      </div>
      <div class="art-ctrls">
        <button class="art-btn" onclick="resetCanvasTransform()" title="Центрировать карту">↺ Центр</button>
        <button class="art-btn" onclick="toggleArtifactFullscreen()" id="art-fs-btn" title="Развернуть на весь экран">⛶ Во весь экран</button>
      </div>
    </div>

    <!-- Ladder strip -->
    <div class="ladder" id="ladder-strip">
      <span style="color:var(--text-faint);font-weight:700;font-size:10px;text-transform:uppercase;margin-right:4px;">СТУПЕНИ:</span>
    </div>

    <!-- Canvas & Inspector Row -->
    <div style="display:flex; flex:1; overflow:hidden; position:relative;">
      <div class="canvas-wrap" id="canvas-wrap">
        <div class="canvas-layer" id="canvas-layer">
          <svg class="edge-svg" id="edge-svg"></svg>
          <div id="nodes-layer"></div>
        </div>
      </div>

      <!-- Node Inspector Panel -->
      <div class="inspector" id="inspector">
        <div class="insp-hdr">
          <div style="font-size:13px;font-weight:700;" id="i-title">Выберите узел на карте</div>
          <div id="i-kind-row" style="margin-top:6px;display:none;"><span class="insp-tag" id="i-kind" style="font-size:11px;"></span></div>
        </div>
        <div class="insp-body" id="i-body" style="display:none;">
          <div><div class="insp-label">Назначение (Purpose)</div><div class="insp-val" id="i-purpose">—</div></div>
          <div><div class="insp-label">Польза (Benefit)</div><div class="insp-val" id="i-benefit">—</div></div>
          <div><div class="insp-label">Результат (Outcome)</div><div class="insp-val" id="i-outcome">—</div></div>
          <div><div class="insp-label">Для кого (Beneficiary)</div><div class="insp-val" id="i-beneficiary">—</div></div>
          <div><div class="insp-label">Границы (Boundary)</div><div class="insp-val" id="i-boundary">—</div></div>
          <div><div class="insp-label">Реализует (Implements)</div><div class="insp-tags" id="i-implements"></div></div>
          <div><div class="insp-label">Тесты</div><div class="insp-tags" id="i-tests"></div></div>
          <div><div class="insp-label">Код</div><div class="insp-tags" id="i-code"></div></div>
          <div><div class="insp-label">Порты</div><div class="insp-tags" id="i-ports"></div></div>
        </div>
      </div>
    </div>

    <!-- Interactive Event Player Timeline -->
    <div class="timeline-bar">
      <button class="tl-btn" id="tl-play" onclick="togglePlay()">▶ Воспроизвести</button>
      <span style="color:var(--text-faint);" id="tl-label">Событие 2058 из 2729</span>
      <input type="range" min="1" max="2729" value="2058" class="tl-range" id="tl-scrub" oninput="onScrub(this.value)">
      <span style="color:var(--accent-green);font-family:var(--font-mono);" id="tl-stats">Живой срез ✔</span>
    </div>
  </aside>
</div>

<!-- ═══════════════════════════════════════════════════════
     SPACE 2: CODEX / CURSOR DESKTOP (КОД & ТЕСТЫ)
     ═══════════════════════════════════════════════════════ -->
<div id="mv2" class="mode-view">
  <div class="m2-quadrant-body">
    <!-- Left: File Tree of om-map branch -->
    <aside class="m2-col-project">
      <div class="m2-sec-title">ЭТАПЫ & АРХИТЕКТУРА</div>
      <div class="stage-chip"><span>L0 Спецификация</span><span style="color:var(--accent-green);font-size:10px;">✓</span></div>
      <div class="stage-chip"><span>L1 Черновики</span><span style="color:var(--accent-green);font-size:10px;">✓</span></div>
      <div class="stage-chip"><span>L2 Граф R2 (55 узлов)</span><span style="color:var(--accent-green);font-size:10px;">✓</span></div>
      <div class="stage-chip on"><span>L3 Разработка витрины</span><span style="color:var(--accent-blue);font-size:10px;">● 9 задач</span></div>

      <div class="m2-sec-title" style="margin-top:10px;">ФАЙЛЫ ВЕТКИ OM-MAP</div>
      <div class="tree-row on" onclick="selStudioFile('OmMapScreen.tsx')">
        <span>📄</span><span>OmMapScreen.tsx</span><span class="git-tag git-m" style="margin-left:auto;">M</span>
      </div>
      <div class="tree-row" onclick="selStudioFile('dagreLayout.ts')">
        <span>📄</span><span>dagreLayout.ts</span><span class="git-tag git-m" style="margin-left:auto;">M</span>
      </div>
      <div class="tree-row" onclick="selStudioFile('MapCanvas.tsx')">
        <span>📄</span><span>MapCanvas.tsx</span><span class="git-tag git-m" style="margin-left:auto;">M</span>
      </div>
      <div class="tree-row" onclick="selStudioFile('types.ts')">
        <span>📄</span><span>data/types.ts</span><span class="git-tag git-a" style="margin-left:auto;">A</span>
      </div>
      <div class="tree-row" onclick="selStudioFile('package.json')">
        <span>📄</span><span>package.json</span><span class="git-tag git-m" style="margin-left:auto;">M</span>
      </div>
      <div class="tree-row" onclick="selStudioFile('om-map.css')">
        <span>📄</span><span>om-map.css</span><span style="color:var(--text-faint);margin-left:auto;font-size:10px;">22KB</span>
      </div>
      <div class="tree-row" onclick="selStudioFile('map.json')">
        <span>📄</span><span>map.json</span><span style="color:var(--text-faint);margin-left:auto;font-size:10px;">691KB</span>
      </div>
      <div class="tree-row" onclick="selStudioFile('dev-timeline.json')">
        <span>📄</span><span>dev-timeline.json</span><span style="color:var(--text-faint);margin-left:auto;font-size:10px;">611KB</span>
      </div>

      <div style="margin-top:auto; font-size:11px; color:var(--text-faint); padding:8px 4px; border-top:1px solid var(--border-subtle);">
        Ветка: <strong style="color:var(--text-primary);">om-map</strong> • SHA: <strong style="color:var(--accent-blue);">f3bf191</strong>
      </div>
    </aside>

    <!-- Center: Syntax-Highlighted Code Diffs & Test Runner -->
    <main class="m2-col-stage">
      <div class="m2-stage-tabs">
        <div class="code-tab-strip">
          <div class="c-tab on" id="ctab-OmMapScreen" onclick="selStudioFile('OmMapScreen.tsx')">OmMapScreen.tsx</div>
          <div class="c-tab" id="ctab-dagreLayout" onclick="selStudioFile('dagreLayout.ts')">dagreLayout.ts</div>
          <div class="c-tab" id="ctab-MapCanvas" onclick="selStudioFile('MapCanvas.tsx')">MapCanvas.tsx</div>
          <div class="c-tab" id="ctab-types" onclick="selStudioFile('types.ts')">data/types.ts</div>
          <div class="c-tab" id="ctab-package" onclick="selStudioFile('package.json')">package.json</div>
        </div>
        <div style="font-size:11px;color:var(--text-faint);">
          <span style="color:var(--accent-green);">● Vite HMR: активен</span> • Порт 3000
        </div>
      </div>

      <div class="m2-diff-scroll" id="m2-diff-content"></div>

      <!-- Test Runner Status & 5-Pass Checklist -->
      <div class="test-bar">
        <span style="color:var(--accent-green);font-weight:600;">✔ 8/8 тестов OK (412ms)</span>
        <span style="color:var(--border-subtle);">|</span>
        <span style="color:var(--text-faint);">5 проходов самопроверки:</span>
        <span style="color:var(--accent-green);">[✓ 1. Пути]</span>
        <span style="color:var(--accent-green);">[✓ 2. Отсутствие]</span>
        <span style="color:var(--accent-green);">[✓ 3. Маскарад]</span>
        <span style="color:var(--accent-green);">[✓ 4. Окна]</span>
        <span style="color:var(--accent-green);">[✓ 5. Соседи]</span>
      </div>
    </main>

    <!-- Right: Review Chat & Commit Approval Card -->
    <aside class="m2-col-chat">
      <div class="feed-hdr">
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="dot dot-b"></span>
          <strong>Codex Review Deck</strong>
        </div>
        <div style="font-size:11px;color:var(--text-faint);">ветка om-map</div>
      </div>
      <div class="feed-scroll" id="m2-chat-flow">
        <div style="background:var(--bg-raised);padding:10px 12px;border-radius:var(--radius-md);border:1px solid var(--border-subtle);font-size:12px;line-height:1.45;">
          <strong>Codex Арбитр:</strong> Проверено 5 файлов. Прямой маршрут <code>#/om-map</code> в <code>OmMapScreen.tsx</code> не затрагивает другие разделы Workbench.
        </div>

        <div class="commit-card">
          <div class="commit-label">Коммит готов к слиянию</div>
          <div class="commit-title">f3bf191: Читаемый холст карты и прямой вход #/om-map</div>
          <div class="commit-desc">Тесты пройдены (8/8). Typecheck чистый. Скриншоты соответствуют эталону wbdesign-after.png.</div>
          <div style="display:flex;gap:8px;">
            <button class="btn-approve" onclick="approveStudioCommit()">✓ Влить коммит (Space)</button>
            <button class="btn-reject" onclick="showToast('Коммит отправлен на доработку')">✕ Отклонить</button>
          </div>
        </div>
      </div>
    </aside>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════
     SPACE 3: LIVE PRODUCT PREVIEW (:3000)
     ═══════════════════════════════════════════════════════ -->
<div id="mv3" class="mode-view">
  <div class="product-toolbar">
    <div style="display:flex;align-items:center;gap:10px;">
      <span>🚀 <strong>http://localhost:3000/#/om-map</strong></span>
      <button class="vp-btn" onclick="reloadWebview()" title="Перезагрузить витрину">🔄 Обновить</button>
      <a href="http://localhost:3000/#/om-map" target="_blank" class="vp-btn" style="text-decoration:none;">↗ В новом окне</a>
    </div>
    <div style="display:flex;align-items:center;gap:6px;">
      <span style="font-size:11px;color:var(--text-faint);margin-right:4px;">Экраны:</span>
      <button class="vp-btn on" id="vp-full" onclick="setViewport('100%')">Десктоп (100%)</button>
      <button class="vp-btn" id="vp-tab" onclick="setViewport('768px')">Планшет iPad</button>
      <button class="vp-btn" id="vp-mob" onclick="setViewport('375px')">Смартфон iPhone</button>
    </div>
  </div>
  <div class="product-frame-wrap">
    <iframe src="http://localhost:3000/#/om-map" class="product-iframe" id="product-iframe" title="Live OM Map"></iframe>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════
     SPACE 4: HERMES & KIMI DECISION HQ (ШТАБ РЕШЕНИЙ)
     ═══════════════════════════════════════════════════════ -->
<div id="mv4" class="mode-view">
  <!-- 4 Gauges -->
  <div class="m4-gauges">
    <div class="gauge-card" style="border-left:3px solid var(--accent-amber);" onclick="showToast('Фильтр: задачи, требующие решения владельца')">
      <div class="gauge-lbl">Ждут решения владельца</div>
      <div class="gauge-num" id="g-wait"><span style="color:var(--accent-amber);">3 развилки</span><span class="gauge-sub">(старейшая: 12 мин)</span></div>
    </div>
    <div class="gauge-card" style="border-left:3px solid var(--accent-blue);" onclick="showToast('Фильтр: активные агенты')">
      <div class="gauge-lbl">Агенты в работе</div>
      <div class="gauge-num"><span style="color:var(--accent-blue);">2 места</span><span class="gauge-sub">(Kimi: E2.2, Claude: H1.3)</span></div>
    </div>
    <div class="gauge-card" style="border-left:3px solid var(--accent-green);" onclick="showToast('Фильтр: все задачи рубежа')">
      <div class="gauge-lbl">Принято по рубежу</div>
      <div class="gauge-num" id="g-merged"><span style="color:var(--accent-green);">76 из 96</span><span class="gauge-sub">(до рубежа 9)</span></div>
    </div>
    <div class="gauge-card">
      <div class="gauge-lbl">Расход за день</div>
      <div class="gauge-num"><span>$1.42</span><span class="gauge-sub">/ лимит $10.00 (11,7 M ток.)</span></div>
    </div>
  </div>

  <!-- Stage-Gate Rail -->
  <div class="stage-rail">
    <span style="font-weight:700;color:var(--text-faint);text-transform:uppercase;font-size:10px;">ШЛЮЗЫ:</span>
    <div class="gate-step pass" onclick="showToast('Этап L0 завершён: все контракты зафиксированы.')"><span>✓ L0 Спецификация</span></div>
    <span class="gate-arrow">──►</span>
    <div class="gate-step pass" onclick="showToast('Этап L1 завершён: черновики и адаптеры готовы.')"><span>✓ L1 Черновики</span></div>
    <span class="gate-arrow">──►</span>
    <div class="gate-step pass" onclick="showToast('Этап L2 завершён: граф R2 на 55 узлов и 87 рёбер построен.')"><span>✓ L2 Граф R2 (55)</span></div>
    <span class="gate-arrow">──►</span>
    <div class="gate-step curr" onclick="showToast('Текущий этап L3: Разработка витрины OM. 9 задач до открытия шлюза в main.')"><span>● L3 Витрина OM (9 задач)</span></div>
    <span class="gate-arrow">──►</span>
    <div class="gate-step lock"><span>🔒 L4 Релиз в Main</span></div>
  </div>

  <div class="m4-body">
    <!-- Triage Cards Feed with 7 Invariants -->
    <div class="m4-feed" id="triage-feed"></div>

    <!-- Right Panel: Owner Constitution & Perplexity Evidence -->
    <aside class="m4-ctx">
      <div>
        <div style="font-size:10px;font-weight:700;color:var(--accent-amber);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
          КОНСТИТУЦИЯ ВЛАДЕЛЬЦА
        </div>
        <div style="font-size:13px;font-weight:700;margin-bottom:4px;" id="m4-ctx-task-name">Проверка задачи перед слиянием</div>
        <div style="font-size:11px;color:var(--text-secondary);line-height:1.45;margin-bottom:10px;">
          5 проходов самопроверки имитируют независимого ревьюера и закрывают 90% первичных замечаний.
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <label class="check-item"><input type="checkbox" checked class="check-box-custom"><span><strong>1. ПУТИ:</strong> Все пути к действию закрыты и протестированы.</span></label>
          <label class="check-item"><input type="checkbox" checked class="check-box-custom"><span><strong>2. ОТСУТСТВИЕ:</strong> Типизированный отказ вместо молчаливого пропуска.</span></label>
          <label class="check-item"><input type="checkbox" checked class="check-box-custom"><span><strong>3. МАСКАРАД:</strong> Защита от подделки входных данных и статусов.</span></label>
          <label class="check-item"><input type="checkbox" checked class="check-box-custom"><span><strong>4. ОКНА:</strong> Зазор check-then-act исключён, истина в хэше.</span></label>
          <label class="check-item"><input type="checkbox" checked class="check-box-custom"><span><strong>5. СОСЕДИ:</strong> Typecheck чистый, смежные тесты не сломаны.</span></label>
        </div>
      </div>

      <div style="border-top:1px solid var(--border-subtle);padding-top:14px;">
        <div style="font-size:10px;font-weight:700;color:var(--accent-blue);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">
          СПРАВКА И ДОКАЗАТЕЛЬСТВА (PERPLEXITY-STYLE)
        </div>
        <div class="cite-box" id="m4-evidence-box" style="background:rgba(90,176,255,.05);border:1px solid rgba(90,176,255,.2);border-radius:var(--radius-md);padding:10px;font-size:11px;line-height:1.5;">
          База SQLite <code>events</code> содержит 2 729 ревизий <span class="cite-tag" onclick="showCitation(1)">[1]</span>. Задачи рубежа L3 синхронизированы с конвейером <span class="cite-tag" onclick="showCitation(2)">[2]</span>. Общий расход зафиксирован: 11,7 M токенов на 225 вызовов моделей <span class="cite-tag" onclick="showCitation(3)">[3]</span>.
        </div>
      </div>
    </aside>
  </div>
</div>

</div><!-- viewport -->

<!-- ═══════ STATUS BAR ═══════ -->
<div class="status-bar">
  <span class="dot dot-g" style="width:6px;height:6px;"></span>
  <span>шина подключена · <span id="sb-msg-count">2 729</span> событий в базе</span>
  <div class="status-sep"></div>
  <span class="status-pill">демо-режим</span>
  <span style="flex:1;"></span>
  <span>расход сегодня: <span id="sb-tokens" style="color:var(--accent-green);font-weight:600;">11,7 M ток.</span></span>
  <div class="status-sep"></div>
  <span>v0.4 Award-Edition</span>
</div>

<!-- ═══════ MODEL SELECTOR DROPDOWN MENU ═══════ -->
<div class="model-menu" id="model-menu">
  <div class="model-menu-item on" onclick="selectModel('claude', 'Claude 3.7 Sonnet', '⚡')">
    <span>⚡ Claude 3.7 Sonnet</span><span style="font-size:10px;color:var(--accent-purple);">Холст & Артефакты</span>
  </div>
  <div class="model-menu-item" onclick="selectModel('deepseek', 'DeepSeek-R1', '🧠')">
    <span>🧠 DeepSeek-R1</span><span style="font-size:10px;color:var(--accent-blue);">Глубокое рассуждение</span>
  </div>
  <div class="model-menu-item" onclick="selectModel('perplexity', 'Perplexity Engine', '🌐')">
    <span>🌐 Perplexity Engine</span><span style="font-size:10px;color:var(--accent-green);">Цитаты & Источники</span>
  </div>
  <div class="model-menu-item" onclick="selectModel('codex', 'Codex / Cursor', '💻')">
    <span>💻 Codex / Cursor</span><span style="font-size:10px;color:var(--accent-blue);">Код & Тесты</span>
  </div>
  <div class="model-menu-item" onclick="selectModel('hermes', 'Hermes Agent', '🤖')">
    <span>🤖 Hermes Agent</span><span style="font-size:10px;color:var(--accent-amber);">Штаб решений</span>
  </div>
  <div class="model-menu-item" onclick="selectModel('pi', 'Pi Personal', '💬')">
    <span>💬 Pi Companion</span><span style="font-size:10px;color:var(--accent-green);">Человеческий язык</span>
  </div>
</div>

<!-- ═══════ COMMAND PALETTE (⌘K) ═══════ -->
<div class="modal-backdrop" id="cmd-palette-backdrop" onclick="if(event.target===this) closeCommandPalette()">
  <div class="cmd-palette">
    <div class="cmd-input-box">
      <span>🔍</span>
      <input type="text" class="cmd-input" id="cmd-palette-input" placeholder="Поиск пространств, задач, файлов, команд... (Esc для отмены)" oninput="filterCommandPalette(this.value)">
      <span style="font-size:10px;font-family:var(--font-mono);color:var(--text-faint);">ESC</span>
    </div>
    <div class="cmd-list" id="cmd-palette-list"></div>
  </div>
</div>

<!-- ═══════ VISIT RECAP MODAL ═══════ -->
<div class="modal-backdrop" id="recap-backdrop" onclick="if(event.target===this) closeRecapModal()">
  <div class="recap-modal-card">
    <div class="recap-title">
      <span class="dot dot-g" style="width:10px;height:10px;"></span>
      <span>Сводка визита: что произошло за время отсутствия</span>
    </div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">
      Период отсутствия: <strong>2 часа 15 минут</strong> • Все события зафиксированы в SQLite <code>heads</code>.
    </div>

    <div class="recap-grid">
      <div class="recap-num-box">
        <div class="recap-num" style="color:var(--accent-green);">76 / 96</div>
        <div class="recap-lbl">Задач принято</div>
      </div>
      <div class="recap-num-box">
        <div class="recap-num" style="color:var(--accent-amber);">3</div>
        <div class="recap-lbl">Ждут решения</div>
      </div>
      <div class="recap-num-box">
        <div class="recap-num" style="color:var(--accent-blue);">$1.42</div>
        <div class="recap-lbl">Расход за день</div>
      </div>
    </div>

    <div style="background:var(--bg-app);border:1px solid var(--border-subtle);border-radius:var(--radius-md);padding:12px;margin-bottom:16px;font-size:12px;line-height:1.5;">
      <div>• Воркер <strong>Devin</strong> завершил прогон D8.4d, Codex вернул вердикт 6/10.</div>
      <div>• Воркер <strong>Kimi</strong> подготовил 3-й прогон Q2 (типизация кодов ошибок).</div>
      <div>• Ветка <strong>om-map</strong> собрана: 8/8 тестов пройдены, витрина доступна на порту 3000.</div>
    </div>

    <div style="display:flex;gap:10px;">
      <button class="btn-approve" onclick="closeRecapModal(); goMode(4);" style="flex:1;">К очереди решений (3 развилки) →</button>
      <button class="btn-reject" onclick="closeRecapModal()">Закрыть (Esc)</button>
    </div>
  </div>
</div>

<!-- Всплывающие тосты -->
<div class="toast-box" id="toast-box"></div>

<script>
// ═══════ GLOBAL STATE ═══════
let MAP = null, TL = null;
let nodesById = {};
let nodePositions = {};
let transform = { x: 50, y: 50, scale: 0.95 };
let dragging = false, dragStart = { x: 0, y: 0 };
let isPlaying = false, playTimer = null;
let activeModel = 'claude';

// ═══════ 4 SPACES MODE SWITCHING ═══════
function goMode(n) {
  document.querySelectorAll('.mpill').forEach(b => b.classList.toggle('on', +b.dataset.m === n));
  document.querySelectorAll('.mode-view').forEach((v, i) => v.classList.toggle('on', i + 1 === n));

  const names = [
    'Карта n8n (55 узлов) + роутер #/om-map (Claude & Canvas)',
    'OmMapScreen.tsx и диффы ветки om-map (Codex & Vitest 8/8 OK)',
    'Живой продукт: http://localhost:3000/#/om-map',
    'Штаб решений: 3 развилки и 9 задач рубежа L3 (Hermes & Kimi)'
  ];
  document.getElementById('global-inv-what').textContent = names[n - 1] || 'OMG Harness';
}
document.querySelectorAll('.mpill').forEach(b => b.addEventListener('click', () => goMode(+b.dataset.m)));
document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
  if ('1234'.includes(e.key)) goMode(+e.key);
});

// ═══════ ARTIFACT STAGE FULLSCREEN TOGGLE ═══════
function toggleArtifactFullscreen() {
  const stage = document.getElementById('m1-artifacts-stage');
  const btn = document.getElementById('art-fs-btn');
  const isFs = stage.classList.toggle('fullscreen');
  btn.textContent = isFs ? '⤓ Свернуть' : '⛶ Во весь экран';
  showToast(isFs ? 'Холст n8n развёрнут на весь экран' : 'Холст n8n возвращён в сплит-режим');
  setTimeout(resetCanvasTransform, 50);
}

// ═══════ DEEPSEEK REASONING ACCORDION ═══════
function toggleDeepThought() {
  const card = document.getElementById('deepseek-card');
  const chev = document.getElementById('deep-thought-chevron');
  const isExp = card.classList.toggle('expanded');
  chev.textContent = isExp ? '▾' : '▸';
}

// ═══════ MODEL SELECTOR ═══════
function toggleModelMenu() {
  document.getElementById('model-menu').classList.toggle('open');
}
function selectModel(id, name, icon) {
  activeModel = id;
  document.getElementById('model-btn-name').textContent = name;
  document.getElementById('model-btn-icon').textContent = icon;
  document.querySelectorAll('.model-menu-item').forEach(it => it.classList.toggle('on', it.textContent.includes(name)));
  document.getElementById('model-menu').classList.remove('open');
  showToast('Активная модель: ' + name);
}

// ═══════ PROMPT CHIPS & COMPOSER ═══════
function handlePromptChip(type) {
  if (type === 'pi') {
    selectModel('pi', 'Pi Personal', '💬');
    addComposerMessage('user', 'Объясни простыми человеческими словами, что сейчас готово и что проверяется?');
    setTimeout(() => {
      addComposerMessage('pi', '<strong>Pi Personal:</strong> Смотрите, всё просто! Сейчас завершён этап L2 — мы проверили структуру всех 55 модулей в конвейере OMG. Ветка <code>om-map</code> добавила удобный экран карты, который открывается прямо по ссылке <a href="http://localhost:3000/#/om-map" target="_blank" style="color:var(--accent-green);font-weight:600;">http://localhost:3000/#/om-map</a>. Все 8 автоматических проверок зелёные. Никаких ошибок нет, можно спокойно подтверждать слияние!');
    }, 350);
  } else if (type === 'deepseek') {
    selectModel('deepseek', 'DeepSeek-R1', '🧠');
    const card = document.getElementById('deepseek-card');
    card.classList.add('expanded');
    document.getElementById('deep-thought-chevron').textContent = '▾';
    card.scrollIntoView({ behavior: 'smooth' });
    showToast('Рассуждение DeepSeek-R1 развёрнуто');
  } else if (type === 'perplexity') {
    selectModel('perplexity', 'Perplexity Engine', '🌐');
    showCitation(1);
    showToast('Показаны цитаты и обоснования из базы SQLite');
  }
}

function sendComposerPrompt() {
  const inp = document.getElementById('m1-composer-input');
  const txt = inp.value.trim();
  if (!txt) return;
  addComposerMessage('user', txt);
  inp.value = '';

  setTimeout(() => {
    if (activeModel === 'deepseek') {
      addComposerMessage('deepseek', `<strong>DeepSeek-R1:</strong> Выполнен формальный анализ запроса <em>«${txt}»</em>.<br>Проверка инвариантов: 1. Пути замкнуты. 2. Типизация проверена. Смежные модули asvh изолированы.`);
    } else if (activeModel === 'pi') {
      addComposerMessage('pi', `<strong>Pi:</strong> Понял вас: <em>«${txt}»</em>. Уже смотрю, как сделать это максимально понятно и без лишних усложнений.`);
    } else {
      addComposerMessage('claude', `<strong>Claude 3.7:</strong> Принято поручение: <em>«${txt}»</em>. Изменения согласованы с архитектурой графа R2, артефакт на правом холсте синхронизирован.`);
    }
  }, 400);
}

function addComposerMessage(sender, html) {
  const scroll = document.getElementById('m1-feed-scroll');
  const msg = document.createElement('div');
  msg.className = 'feed-msg' + (sender === 'user' ? ' owner' : '');
  const bg = sender === 'user' ? '#d97706' : (sender === 'pi' ? 'var(--accent-green)' : (sender === 'deepseek' ? 'var(--accent-purple)' : 'var(--accent-blue)'));
  const letter = sender === 'user' ? 'В' : (sender === 'pi' ? 'π' : (sender === 'deepseek' ? 'D' : 'C'));
  msg.innerHTML = `
    <div class="feed-avatar" style="background:${bg};">${letter}</div>
    <div class="feed-body">
      <div class="feed-meta"><strong>${sender === 'user' ? 'Владелец' : sender.toUpperCase()}</strong> <span>только что</span></div>
      <div>${html}</div>
    </div>
  `;
  scroll.appendChild(msg);
  scroll.scrollTop = scroll.scrollHeight;
}

// ═══════ DATA LOADING ═══════
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const [mR, tR] = await Promise.all([
      fetch('/data/map.json').catch(() => null),
      fetch('/data/dev-timeline.json').catch(() => null)
    ]);
    if (mR && mR.ok) MAP = await mR.json();
    if (tR && tR.ok) TL = await tR.json();
    if (MAP) { initLadder(); initGraph(); initTimeline(); }
    if (TL) { initTriage(); }
  } catch (e) {
    console.warn('Data load warning:', e);
  }
});

// ═══════ LADDER ═══════
function initLadder() {
  const strip = document.getElementById('ladder-strip');
  if (!MAP || !MAP.ladder) return;
  MAP.ladder.forEach((l, i) => {
    const chip = document.createElement('div');
    chip.className = 'ladder-chip' + (i === 3 ? ' on' : '');
    chip.textContent = l.title || l.id;
    chip.onclick = () => {
      document.querySelectorAll('.ladder-chip').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
      showToast(`Ступень L${l.level}: ${l.title}`);
    };
    strip.appendChild(chip);
  });
}

// ═══════ GRAPH LAYOUT (55 NODES, 87 EDGES) ═══════
function initGraph() {
  const g = MAP.graphs?.r2 || MAP.graphs?.r1;
  if (!g) return;
  const nodes = g.nodes || [];
  const edges = g.edges || [];

  document.getElementById('map-cnt').textContent = nodes.length + ' узлов';

  const adj = {}, radj = {};
  nodes.forEach(n => { nodesById[n.id] = n; adj[n.id] = []; radj[n.id] = []; });
  edges.forEach(e => {
    if (adj[e.source]) adj[e.source].push(e.target);
    if (radj[e.target]) radj[e.target].push(e.source);
  });

  // Layer assignment
  const layers = {};
  const roots = nodes.filter(n => (radj[n.id] || []).length === 0 || n.kind === 'root');
  const queue = roots.map(n => ({ id: n.id, layer: 0 }));
  const visited = new Set();

  while (queue.length) {
    const { id, layer } = queue.shift();
    if (visited.has(id)) { layers[id] = Math.max(layers[id] || 0, layer); continue; }
    visited.add(id);
    layers[id] = layer;
    (adj[id] || []).forEach(t => { if (!visited.has(t)) queue.push({ id: t, layer: layer + 1 }); });
  }
  nodes.forEach(n => { if (!(n.id in layers)) layers[n.id] = 0; });

  const layerGroups = {};
  Object.entries(layers).forEach(([id, l]) => { if (!layerGroups[l]) layerGroups[l] = []; layerGroups[l].push(id); });

  const NW = 210, NH = 95, GX = 270, GY = 130;
  const sortedLayers = Object.keys(layerGroups).sort((a, b) => +a - +b);

  sortedLayers.forEach(lIdx => {
    const ids = layerGroups[lIdx];
    ids.sort((a, b) => {
      const ka = nodesById[a]?.kind || '', kb = nodesById[b]?.kind || '';
      const order = { root: 0, step: 1, gate: 2 };
      return (order[ka] || 1) - (order[kb] || 1);
    });
    ids.forEach((id, i) => {
      nodePositions[id] = { x: (+lIdx) * GX, y: i * GY };
    });
  });

  // Render nodes
  const nodesLayer = document.getElementById('nodes-layer');
  nodesLayer.innerHTML = '';
  nodes.forEach(n => {
    const pos = nodePositions[n.id];
    if (!pos) return;
    const el = document.createElement('div');
    el.className = 'n8n-nd k-' + (n.kind || 'step');
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
    el.dataset.id = n.id;
    el.onclick = () => inspectNode(n);

    let portsHTML = '';
    if (n.ports && n.ports.length) {
      portsHTML = '<div class="nd-ports">' + n.ports.map(p => '<span class="nd-port">' + (typeof p === 'string' ? p : (p.name || p.id || '')) + '</span>').filter(s => !s.includes('undefined')).join('') + '</div>';
    }

    el.innerHTML = `
      <div class="nd-hdr">
        <span class="nd-title">${(n.title || n.id).slice(0, 26)}</span>
        <span class="nd-kind">${n.kind || '?'}</span>
      </div>
      <div class="nd-purpose">${n.purpose || ''}</div>
      ${portsHTML}
    `;
    nodesLayer.appendChild(el);
  });

  // Render SVG edges
  const svg = document.getElementById('edge-svg');
  svg.innerHTML = '';
  let maxX = 0, maxY = 0;
  Object.values(nodePositions).forEach(p => { maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
  svg.setAttribute('width', maxX + NW + 240);
  svg.setAttribute('height', maxY + NH + 240);
  svg.style.width = (maxX + NW + 240) + 'px';
  svg.style.height = (maxY + NH + 240) + 'px';

  edges.forEach(e => {
    const p1 = nodePositions[e.source], p2 = nodePositions[e.target];
    if (!p1 || !p2) return;
    const x1 = p1.x + NW, y1 = p1.y + NH / 2;
    const x2 = p2.x, y2 = p2.y + NH / 2;
    const dx = Math.abs(x2 - x1) / 2;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    if (x2 < x1) {
      const arc = Math.max(40, Math.abs(y2 - y1) / 2 + 30);
      path.setAttribute('d', `M ${x1} ${y1} C ${x1+60} ${y1+arc}, ${x2-60} ${y2+arc}, ${x2} ${y2}`);
    } else {
      path.setAttribute('d', `M ${x1} ${y1} C ${x1+dx} ${y1}, ${x2-dx} ${y2}, ${x2} ${y2}`);
    }
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-width', '1.6');

    if (e.relation === 'on_success') {
      path.setAttribute('stroke', '#3ddc97');
      path.setAttribute('opacity', '0.75');
    } else if (e.relation === 'on_failure') {
      path.setAttribute('stroke', '#ff6b6b');
      path.setAttribute('stroke-dasharray', '5,5');
      path.setAttribute('opacity', '0.7');
    } else if (e.relation === 'returns_to') {
      path.setAttribute('stroke', '#f2b04b');
      path.setAttribute('stroke-dasharray', '2,4');
      path.setAttribute('opacity', '0.6');
    } else {
      path.setAttribute('stroke', '#5ab0ff');
      path.setAttribute('opacity', '0.5');
    }
    svg.appendChild(path);
  });

  if (nodes.length) inspectNode(nodes[0]);
  updateCanvasTransform();
}

// ═══════ NODE INSPECTOR ═══════
function inspectNode(n) {
  document.querySelectorAll('.n8n-nd').forEach(el => el.classList.toggle('sel', el.dataset.id === n.id));
  document.getElementById('i-title').textContent = n.title || n.id;
  document.getElementById('i-kind').textContent = n.kind || '—';
  document.getElementById('i-kind-row').style.display = '';
  document.getElementById('i-body').style.display = '';

  const set = (id, v) => document.getElementById(id).textContent = v || '—';
  set('i-purpose', n.purpose);
  set('i-benefit', n.benefit);
  set('i-outcome', n.outcome);
  set('i-beneficiary', n.beneficiary);
  set('i-boundary', (typeof n.boundary === 'object' && n.boundary !== null) ? Object.entries(n.boundary).map(([k,v]) => k + ': ' + v).join(' · ') : (n.boundary || '—'));

  const tags = (id, arr) => {
    const el = document.getElementById(id);
    if (!arr || !arr.length) { el.innerHTML = '<span style="color:var(--text-faint);font-size:11px;">—</span>'; return; }
    el.innerHTML = arr.map(t => `<span class="insp-tag">${t}</span>`).join('');
  };
  tags('i-implements', n.implements);
  tags('i-tests', n.tests);
  tags('i-code', n.code);
  tags('i-ports', n.ports ? n.ports.map(p => `${p.name}: ${p.schema || '?'}`) : []);
}

// ═══════ CANVAS PAN & ZOOM ═══════
const canvasWrap = document.getElementById('canvas-wrap');
const canvasLayer = document.getElementById('canvas-layer');

canvasWrap.addEventListener('mousedown', e => {
  if (e.target.closest('.n8n-nd')) return;
  dragging = true;
  dragStart = { x: e.clientX - transform.x, y: e.clientY - transform.y };
});
window.addEventListener('mousemove', e => {
  if (!dragging) return;
  transform.x = e.clientX - dragStart.x;
  transform.y = e.clientY - dragStart.y;
  updateCanvasTransform();
});
window.addEventListener('mouseup', () => { dragging = false; });
canvasWrap.addEventListener('wheel', e => {
  e.preventDefault();
  const d = -e.deltaY * .001;
  const ns = Math.max(.2, Math.min(transform.scale * (1 + d), 2.5));
  const rect = canvasWrap.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  transform.x = mx - (mx - transform.x) * (ns / transform.scale);
  transform.y = my - (my - transform.y) * (ns / transform.scale);
  transform.scale = ns;
  updateCanvasTransform();
}, { passive: false });

function updateCanvasTransform() {
  canvasLayer.style.transform = `translate(${transform.x}px,${transform.y}px) scale(${transform.scale})`;
}
function resetCanvasTransform() {
  transform = { x: 50, y: 50, scale: 0.95 };
  updateCanvasTransform();
  showToast('Масштаб холста центрирован');
}

// ═══════ TIMELINE SCRUBBER & PLAYER ═══════
function initTimeline() {
  const evCount = MAP.events ? (Array.isArray(MAP.events) ? MAP.events.length : (MAP.events.rows ? MAP.events.rows.length : 2729)) : 2729;
  document.getElementById('tl-scrub').max = evCount;
  document.getElementById('tl-label').textContent = `Событие 2058 из ${evCount}`;
  document.getElementById('sb-msg-count').textContent = evCount.toLocaleString();
}
function onScrub(v) {
  document.getElementById('tl-label').textContent = `Событие ${v} из ${document.getElementById('tl-scrub').max}`;
}
function togglePlay() {
  isPlaying = !isPlaying;
  const btn = document.getElementById('tl-play');
  if (isPlaying) {
    btn.textContent = '⏸ Пауза';
    playTimer = setInterval(() => {
      const s = document.getElementById('tl-scrub');
      let v = +s.value + 18;
      if (v > +s.max) v = 1;
      s.value = v;
      onScrub(v);
    }, 80);
  } else {
    btn.textContent = '▶ Воспроизвести';
    clearInterval(playTimer);
  }
}

// ═══════ MODE 2: CODE DIFFS & REVIEWS ═══════
const STUDIO_DIFFS = {
  'OmMapScreen.tsx': `
<span class="diff-hunk">@@ -35,18 +35,26 @@ export function OmMapScreen() {</span>
<span class="diff-del">-  const defaultHash = window.location.pathname;</span>
<span class="diff-add">+  // Прямой вход по адресу http://localhost:3000/#/om-map</span>
<span class="diff-add">+  const isOmMap = window.location.hash === '#/om-map';</span>
<span class="diff-add">+  const [currentView, setCurrentView] = useState(isOmMap ? 'om-map' : 'feed');</span>
<span class="diff-ctx">   </span>
<span class="diff-ctx">   useEffect(() => {</span>
<span class="diff-ctx">     const onHashChange = () => {</span>
<span class="diff-add">+      if (window.location.hash === '#/om-map') setCurrentView('om-map');</span>
<span class="diff-ctx">     };</span>
<span class="diff-ctx">     window.addEventListener('hashchange', onHashChange);</span>
<span class="diff-ctx">     return () => window.removeEventListener('hashchange', onHashChange);</span>
<span class="diff-ctx">   }, []);</span>
<span class="diff-hunk">@@ -78,3 +86,12 @@</span>
<span class="diff-add">+  const renderMapCanvas = () => (</span>
<span class="diff-add">+    &lt;MapCanvas</span>
<span class="diff-add">+      data={mapData}</span>
<span class="diff-add">+      onNodeSelect={handleNodeSelect}</span>
<span class="diff-add">+      theme="graphite"</span>
<span class="diff-add">+    /&gt;</span>
<span class="diff-add">+  );</span>`,
  'dagreLayout.ts': `
<span class="diff-hunk">@@ -11,8 +11,14 @@ export const CARD_W = 240;</span>
<span class="diff-del">-export const RANKS_PER_ROW = 4;</span>
<span class="diff-add">+export const RANKS_PER_ROW = 5;</span>
<span class="diff-ctx"> const H_GAP = 72;   // между колонками</span>
<span class="diff-del">-const V_GAP = 30;   // между карточками в колонке</span>
<span class="diff-add">+const V_GAP = 22;   // между карточками в колонке</span>
<span class="diff-ctx"> const ROW_GAP = 96; // между рядами</span>
<span class="diff-add">+const SHELF_GAP = 140; // до полки «вне потока»</span>
<span class="diff-hunk">@@ -33,6 +39,12 @@ function ranksBySuccess(nodes: OmNode[], edges: [string, string][]) {</span>
<span class="diff-del">-  // ранги считались по всем рёбрам, включая отказ</span>
<span class="diff-add">+  // ранги считает dagre ТОЛЬКО по рёбрам «успех» (основной поток)</span>
<span class="diff-add">+  // «Отказ» и «возврат» на ранги не влияют (иначе все блоки тянутся к recovery)</span>
<span class="diff-ctx">   const g = new Graph({ directed: true, multigraph: false });</span>`,
  'MapCanvas.tsx': `
<span class="diff-hunk">@@ -42,7 +42,16 @@ export function MapCanvas({ data, onNodeSelect, theme }: MapCanvasProps) {</span>
<span class="diff-ctx">   const { fitView, zoomIn, zoomOut } = useReactFlow();</span>
<span class="diff-add">+  const [selectedId, setSelectedId] = useState&lt;string | null&gt;(null);</span>
<span class="diff-add">+</span>
<span class="diff-add">+  const onNodeClick = useCallback((_: any, node: any) => {</span>
<span class="diff-add">+    setSelectedId(node.id);</span>
<span class="diff-add">+    onNodeSelect?.(node.data);</span>
<span class="diff-add">+  }, [onNodeSelect]);</span>`,
  'types.ts': `
<span class="diff-hunk">@@ -1,0 +1,14 @@</span>
<span class="diff-add">+export interface OmGraph {</span>
<span class="diff-add">+  nodes: OmNode[];</span>
<span class="diff-add">+  edges: OmEdge[];</span>
<span class="diff-add">+}</span>
<span class="diff-add">+export interface OmNode {</span>
<span class="diff-add">+  id: string;</span>
<span class="diff-add">+  kind: 'root' | 'block' | 'operation' | 'gate' | 'product';</span>
<span class="diff-add">+  title: string;</span>
<span class="diff-add">+  purpose?: string;</span>
<span class="diff-add">+  ports: OmPort[];</span>
<span class="diff-add">+}</span>`,
  'package.json': `
<span class="diff-hunk">@@ -18,2 +18,3 @@</span>
<span class="diff-ctx">     "@types/react": "^18.3.3",</span>
<span class="diff-add">+    "@xyflow/react": "^12.3.0",</span>
<span class="diff-add">+    "@dagrejs/dagre": "^1.1.4",</span>`
};

function selStudioFile(fname) {
  document.querySelectorAll('.tree-row').forEach(r => r.classList.toggle('on', r.textContent.includes(fname)));
  document.querySelectorAll('.c-tab').forEach(t => t.classList.toggle('on', t.textContent.includes(fname)));
  const content = STUDIO_DIFFS[fname] || `
<span class="diff-hunk">@@ 1,12 +1,12 @@ // Просмотр файла ${fname}</span>
<span class="diff-ctx"> Файл зафиксирован в канонической базе без незакоммиченных изменений.</span>`;
  document.getElementById('m2-diff-content').innerHTML = content;
}

function approveStudioCommit() {
  const chat = document.getElementById('m2-chat-flow');
  const note = document.createElement('div');
  note.style.cssText = 'color:var(--accent-green);font-weight:600;padding:10px 14px;background:rgba(61,220,151,.1);border-radius:6px;border:1px solid rgba(61,220,151,.3);margin-top:6px;';
  note.textContent = '✓ Коммит f3bf191 одобрен владельцем! Влито в om-map.';
  chat.appendChild(note);
  chat.scrollTop = chat.scrollHeight;
  showToast('✓ Коммит f3bf191 успешно влит в ветку om-map');
}

// ═══════ MODE 3: LIVE PREVIEW VIEWPORT ═══════
function setViewport(w) {
  const iframe = document.getElementById('product-iframe');
  iframe.style.width = w;
  document.getElementById('vp-full').classList.toggle('on', w === '100%');
  document.getElementById('vp-tab').classList.toggle('on', w === '768px');
  document.getElementById('vp-mob').classList.toggle('on', w === '375px');
}
function reloadWebview() {
  const iframe = document.getElementById('product-iframe');
  iframe.src = iframe.src;
  showToast('Витрина на порту 3000 перезагружена');
}

// ═══════ MODE 4: HERMES & KIMI DECISION HQ ═══════
const TRIAGE_DECISION_TASKS = [
  {
    id: 'Q2',
    title: 'Коды отказов модуля = всё, что он выдаёт',
    worker: 'kimi-worker',
    status: 'returned',
    runs: 3,
    verdicts: [{ reviewer: 'Codex', score: 7 }],
    after: ['H1', 'Q1', 'S1.1'],
    where: 'asvh/runtime/errors.ts',
    what: 'Типизация 14 кодов отказов вместо unchecked exceptions',
    why: 'Инвариант ОТСУТСТВИЕ: исключить невидимый пропуск сбоев в конвейере',
    when: 'Рубеж L3 • Блокирует задачи H1.3, Q2b',
    expected: 'Единый Enum ModuleFailureCode, 0 бросков throw Error',
    risks: 'Средний: смежные потребители могут ожидать строковые сообщения',
    criteria: 'Успех: 14/14 кодов типизированы. Провал: uncaught exception в ране'
  },
  {
    id: 'D8.4d',
    title: 'D8.4 · семейство 4: основания оценки — runtime, typed, L3',
    worker: 'devin-worker',
    status: 'returned',
    runs: 1,
    verdicts: [{ reviewer: 'Codex', score: 6 }],
    after: ['D8.4c', 'D8.5'],
    where: 'asvh/eval/l3_criteria.ts',
    what: 'Строгая типизация критериев прохождения шлюза L3',
    why: 'Исключить разночтения между оценкой Devin и арбитражем Codex',
    when: 'Рубеж L3 • Блокирует D8.4e',
    expected: 'Контракт L3CriteriaPass со структурированной причиной отказа',
    risks: 'Низкий: чисто декларативная схема без побочных эффектов',
    criteria: 'Успех: schema.validate() возвращает ok:false с кодом причины'
  },
  {
    id: 'H1.2',
    title: 'Конечный исход автономного прохода без ожидания пользователя',
    worker: 'claude-sonnet',
    status: 'returned',
    runs: 1,
    verdicts: [{ reviewer: 'Codex', score: 8 }],
    after: ['H1', 'H1.1'],
    where: 'asvh/engine/driver.ts',
    what: 'Аварийный останов автономной петли при превышении лимита $2.00',
    why: 'Конституция: цена операторской ошибки — минуты, не часы',
    when: 'Рубеж L3 • Блокирует H1.3',
    expected: 'Гарантированный выход со статусом BUDGET_EXCEEDED за 1 тик',
    risks: 'Минимальный: проверено 12 юнит-тестами',
    criteria: 'Успех: петля не делает ни единого лишнего model-call после лимита'
  }
];

function initTriage() {
  const c = TL ? TL.counters : { milestoneRemaining: 9, merged: 76, tasksTotal: 96 };
  document.getElementById('g-wait').innerHTML = `<span style="color:var(--accent-amber);">3 развилки</span><span class="gauge-sub">до рубежа</span>`;
  document.getElementById('g-merged').innerHTML = `<span style="color:var(--accent-green);">${c.merged} из ${c.tasksTotal}</span><span class="gauge-sub">(${Math.round(c.merged/c.tasksTotal*100)}%)</span>`;

  const feed = document.getElementById('triage-feed');
  feed.innerHTML = '';

  TRIAGE_DECISION_TASKS.forEach(t => {
    const card = document.createElement('div');
    card.className = 'tri-card decision';
    card.id = 'tri-card-' + t.id;
    card.innerHTML = `
      <div class="tri-hdr">
        <div class="tri-type" style="color:var(--accent-amber);">
          <span class="dot dot-a"></span>
          ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА • ${t.runs} ПРОГОНА
        </div>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-faint);">${t.id} • вердикт ${t.verdicts[0].score}/10</span>
      </div>
      <div class="tri-title">${t.title}</div>
      <div class="tri-inv-grid">
        <div class="inv-cell"><span class="inv-tag-lbl">📍 Где:</span><span class="inv-cell-val"><code>${t.where}</code></span></div>
        <div class="inv-cell"><span class="inv-tag-lbl">⚡ Что:</span><span class="inv-cell-val">${t.what}</span></div>
        <div class="inv-cell"><span class="inv-tag-lbl">🎯 Зачем:</span><span class="inv-cell-val">${t.why}</span></div>
        <div class="inv-cell"><span class="inv-tag-lbl">⏳ Когда:</span><span class="inv-cell-val">${t.when}</span></div>
        <div class="inv-cell"><span class="inv-tag-lbl">📦 Ожидаем:</span><span class="inv-cell-val">${t.expected}</span></div>
        <div class="inv-cell"><span class="inv-tag-lbl">⚠️ Риски:</span><span class="inv-cell-val" style="color:var(--accent-amber);">${t.risks}</span></div>
        <div class="inv-cell" style="grid-column:span 2;"><span class="inv-tag-lbl">🏆 Критерии:</span><span class="inv-cell-val" style="color:var(--accent-green);">${t.criteria}</span></div>
      </div>
      <div class="tri-actions">
        <button class="btn-approve" onclick="approveTriageTask('${t.id}')">✓ Одобрить слияние (Space)</button>
        <button class="btn-reject" onclick="rejectTriageTask('${t.id}')">✕ Отклонить (Esc)</button>
        <button class="vp-btn" onclick="goMode(2); selStudioFile('types.ts')">👁 Сравнить дифф</button>
        <span style="font-size:11px;color:var(--text-faint);margin-left:auto;">Исполнитель: <strong>${t.worker}</strong></span>
      </div>
    `;
    card.onclick = (e) => { if (!e.target.closest('button')) showTriageDetails(t); };
    feed.appendChild(card);
  });

  const tasks = TL ? TL.tasks : [];
  const remainingIds = TL?.counters?.remainingIds || [];

  remainingIds.forEach(rid => {
    if (TRIAGE_DECISION_TASKS.some(x => x.id === rid)) return;
    const t = tasks.find(x => x.id === rid) || { id: rid, title: 'Задача ' + rid, status: 'planned', worker: null };
    const isInWork = t.worker !== null;
    const card = document.createElement('div');
    card.className = 'tri-card ' + (isInWork ? 'inwork' : 'planned');
    card.id = 'tri-card-' + t.id;
    card.innerHTML = `
      <div class="tri-hdr">
        <div class="tri-type" style="color:${isInWork ? 'var(--accent-blue)' : 'var(--text-faint)'};">
          <span class="dot ${isInWork ? 'dot-b' : 'dot-off'}"></span>
          ${isInWork ? 'В РАБОТЕ У АГЕНТА' : 'ОЖИДАЕТ ЗАВИСИМОСТЕЙ'}
        </div>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-faint);">${t.id}</span>
      </div>
      <div class="tri-title">${t.title}</div>
      <div style="display:flex;gap:16px;font-size:11px;color:var(--text-secondary);">
        <span>👷 ${t.worker || 'Не назначен'}</span>
        ${t.after && t.after.length ? `<span>🔗 Зависит от: ${t.after.join(', ')}</span>` : ''}
        <span>🔁 Прогоны: ${t.runs || 0}</span>
      </div>
    `;
    card.onclick = () => showTriageDetails({
      id: t.id,
      title: t.title,
      where: 'asvh/sections/om-map',
      what: t.title,
      why: 'Завершение рубежа L3 разработки витрины',
      when: 'После ' + (t.after ? t.after.join(', ') : 'старта'),
      expected: 'Коммит с тестами',
      risks: 'Низкие',
      criteria: 'Тесты пройдены'
    });
    feed.appendChild(card);
  });

  if (TRIAGE_DECISION_TASKS.length) showTriageDetails(TRIAGE_DECISION_TASKS[0]);
}

function approveTriageTask(id) {
  const card = document.getElementById('tri-card-' + id);
  if (!card) return;
  card.style.transition = 'all .25s ease';
  card.style.background = 'rgba(61,220,151,.08)';
  card.style.borderLeftColor = 'var(--accent-green)';
  card.querySelector('.tri-actions').innerHTML = `
    <span style="color:var(--accent-green);font-weight:700;font-size:12px;">✓ ВЛИТО В MAIN ПОДПИСЬЮ ВЛАДЕЛЬЦА</span>
    <span style="font-size:11px;color:var(--text-faint);margin-left:auto;">SHA: e9a2c14 • 8/8 tests OK</span>
  `;
  document.getElementById('g-wait').innerHTML = `<span style="color:var(--accent-green);">2 развилки</span><span class="gauge-sub">(-1 решено)</span>`;
  showToast('✓ Задача ' + id + ' одобрена и влита в main');
}

function rejectTriageTask(id) {
  const card = document.getElementById('tri-card-' + id);
  if (!card) return;
  card.style.opacity = '.5';
  card.querySelector('.tri-actions').innerHTML = `
    <span style="color:var(--accent-red);font-weight:600;font-size:12px;">✕ ОТКЛОНЕНО ВЛАДЕЛЬЦЕМ • НАПРАВЛЕНО НА ДОРАБОТКУ</span>
  `;
  showToast('✕ Задача ' + id + ' отклонена');
}

function showTriageDetails(t) {
  document.querySelectorAll('.tri-card').forEach(c => c.style.borderColor = 'var(--border-subtle)');
  const c = document.getElementById('tri-card-' + t.id);
  if (c) c.style.borderColor = 'var(--border-focus)';
  document.getElementById('m4-ctx-task-name').textContent = t.id + ': ' + t.title.slice(0, 36) + '…';
}

function showCitation(id) {
  const box = document.getElementById('m4-evidence-box');
  if (id === 1) {
    box.innerHTML = '<strong>[1] SQLite Revisions & Heads:</strong> Таблица heads содержит 1 371 запись. Последняя ревизия sequence 2058 зафиксировала граф R2 (55 узлов).';
  } else if (id === 2) {
    box.innerHTML = '<strong>[2] dev-timeline.json:</strong> Конвейер рубежа L3 содержит 96 задач (76 merged, 9 pending). Ветка om-map проверена.';
  } else if (id === 3) {
    box.innerHTML = '<strong>[3] Model Calls:</strong> Стадия R1 потратила 9,16 M токенов на 174 вызова. Стадия R2 — 2,55 M на 51 вызов. Сумма: 11,7 M.';
  }
}

// ═══════ COMMAND PALETTE (⌘K) ═══════
const CMD_ITEMS = [
  { cat: '🚀 4 Пространства Harness', title: '1. Обсуждение & Артефакты (Claude + Canvas)', kbd: '1', action: () => goMode(1) },
  { cat: '🚀 4 Пространства Harness', title: '2. Код & Тесты (Codex + Diffs)', kbd: '2', action: () => goMode(2) },
  { cat: '🚀 4 Пространства Harness', title: '3. Живой продукт (:3000 webview)', kbd: '3', action: () => goMode(3) },
  { cat: '🚀 4 Пространства Harness', title: '4. Штаб решений (Hermes + Triage)', kbd: '4', action: () => goMode(4) },
  { cat: '⚡ Развилки и задачи', title: 'Q2: Коды отказов модуля = всё, что он выдаёт', kbd: 'Развилка', action: () => { goMode(4); showTriageDetails(TRIAGE_DECISION_TASKS[0]); } },
  { cat: '⚡ Развилки и задачи', title: 'D8.4d: Основания оценки — runtime, typed, L3', kbd: 'Развилка', action: () => { goMode(4); showTriageDetails(TRIAGE_DECISION_TASKS[1]); } },
  { cat: '⚡ Развилки и задачи', title: 'H1.2: Конечный исход автономного прохода', kbd: 'Развилка', action: () => { goMode(4); showTriageDetails(TRIAGE_DECISION_TASKS[2]); } },
  { cat: '📄 Файлы проекта', title: 'OmMapScreen.tsx (роутинг #/om-map)', kbd: 'Файл', action: () => { goMode(2); selStudioFile('OmMapScreen.tsx'); } },
  { cat: '📄 Файлы проекта', title: 'dagreLayout.ts (сетка 5 колонок n8n)', kbd: 'Файл', action: () => { goMode(2); selStudioFile('dagreLayout.ts'); } },
  { cat: '📄 Файлы проекта', title: 'MapCanvas.tsx (React Flow холст)', kbd: 'Файл', action: () => { goMode(2); selStudioFile('MapCanvas.tsx'); } },
  { cat: '📄 Файлы проекта', title: 'data/types.ts (интерфейсы графа)', kbd: 'Файл', action: () => { goMode(2); selStudioFile('types.ts'); } },
  { cat: '🛠 Действия', title: 'Влить коммит f3bf191 в ветку om-map', kbd: 'Space', action: () => { goMode(2); approveStudioCommit(); } },
  { cat: '🛠 Действия', title: 'Развернуть холст n8n на весь экран', kbd: '⛶', action: () => { goMode(1); toggleArtifactFullscreen(); } },
  { cat: '🛠 Действия', title: 'Показать сводку визита (Recap)', kbd: 'R', action: () => openRecapModal() },
  { cat: '🛠 Действия', title: 'Перезагрузить продуктовый Webview', kbd: 'cmd+R', action: () => { goMode(3); reloadWebview(); } }
];

let activeCmdIndex = 0;
let filteredCmds = [];

function openCommandPalette() {
  document.getElementById('cmd-palette-backdrop').classList.add('on');
  const inp = document.getElementById('cmd-palette-input');
  inp.value = '';
  filterCommandPalette('');
  setTimeout(() => inp.focus(), 30);
}
function closeCommandPalette() {
  document.getElementById('cmd-palette-backdrop').classList.remove('on');
}
function filterCommandPalette(q) {
  const query = q.toLowerCase().trim();
  filteredCmds = CMD_ITEMS.filter(it => !query || it.title.toLowerCase().includes(query) || it.cat.toLowerCase().includes(query));
  renderCmdList();
}
function renderCmdList() {
  const list = document.getElementById('cmd-palette-list');
  list.innerHTML = '';
  activeCmdIndex = Math.min(activeCmdIndex, Math.max(0, filteredCmds.length - 1));

  let lastCat = null;
  filteredCmds.forEach((it, idx) => {
    if (it.cat !== lastCat) {
      lastCat = it.cat;
      const catEl = document.createElement('div');
      catEl.className = 'cmd-sec-title';
      catEl.textContent = lastCat;
      list.appendChild(catEl);
    }
    const el = document.createElement('div');
    el.className = 'cmd-item' + (idx === activeCmdIndex ? ' active' : '');
    el.innerHTML = `<span>${it.title}</span><kbd>${it.kbd}</kbd>`;
    el.onclick = () => {
      closeCommandPalette();
      it.action();
      showToast('Выполнено: ' + it.title);
    };
    list.appendChild(el);
  });
}

function openRecapModal() { document.getElementById('recap-backdrop').classList.add('on'); }
function closeRecapModal() { document.getElementById('recap-backdrop').classList.remove('on'); }

function toggleAppFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    showToast('Полноэкранный режим включён');
  } else {
    document.exitFullscreen().catch(() => {});
    showToast('Полноэкранный режим выключен');
  }
}

function setDensity(mode) {
  document.querySelectorAll('.dens-btn').forEach(b => b.classList.toggle('on', b.dataset.d === mode));
  if (mode === 'cmp') {
    document.body.style.fontSize = '12px';
    showToast('Плотность: Компактный (12px, высокий объём кода)');
  } else if (mode === 'rel') {
    document.body.style.fontSize = '14px';
    showToast('Плотность: Просторный (14px, презентационный вид)');
  } else {
    document.body.style.fontSize = '13px';
    showToast('Плотность: Стандартный (13px, сбалансированный)');
  }
}

function showToast(msg) {
  const box = document.getElementById('toast-box');
  const t = document.createElement('div');
  t.className = 'toast-item';
  t.innerHTML = `<span class="dot dot-g"></span><span>${msg}</span>`;
  box.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(8px)';
    t.style.transition = 'all .2s ease';
    setTimeout(() => t.remove(), 220);
  }, 2500);
}

// Global hotkeys
window.addEventListener('keydown', e => {
  const isBackdropOpen = document.getElementById('cmd-palette-backdrop').classList.contains('on');
  const isRecapOpen = document.getElementById('recap-backdrop').classList.contains('on');

  if (e.key === 'Escape') {
    if (isBackdropOpen) closeCommandPalette();
    if (isRecapOpen) closeRecapModal();
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (isBackdropOpen) closeCommandPalette(); else openCommandPalette();
    return;
  }

  if (isBackdropOpen) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeCmdIndex = (activeCmdIndex + 1) % Math.max(1, filteredCmds.length);
      renderCmdList();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeCmdIndex = (activeCmdIndex - 1 + filteredCmds.length) % Math.max(1, filteredCmds.length);
      renderCmdList();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCmds[activeCmdIndex]) {
        closeCommandPalette();
        filteredCmds[activeCmdIndex].action();
        showToast('Выполнено: ' + filteredCmds[activeCmdIndex].title);
      }
    }
  }
});

// Click outside model menu to close
window.addEventListener('click', e => {
  if (!e.target.closest('#active-model-btn') && !e.target.closest('#model-menu')) {
    document.getElementById('model-menu').classList.remove('open');
  }
});

// Init defaults
selStudioFile('OmMapScreen.tsx');
</script>

</body>
</html>
"""

output_path = "/Users/kostenchuksergey/REPORTS/workbench-design/core/workbench-unified.html"
with open(output_path, "w", encoding="utf-8") as f:
    f.write(content.strip() + "\n")
print(f"Successfully wrote {len(content)} characters to {output_path}")
