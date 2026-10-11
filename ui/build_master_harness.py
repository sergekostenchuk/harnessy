import json
import os

MAP_PATH = "/Users/kostenchuksergey/REPORTS/workbench-design/data/map.json"
DEV_PATH = "/Users/kostenchuksergey/REPORTS/workbench-design/data/dev-timeline.json"
TARGET_HTML = "/Users/kostenchuksergey/REPORTS/workbench-design/concept/workbench-unified.html"

with open(MAP_PATH, "r", encoding="utf-8") as f:
    map_data = json.load(f)

with open(DEV_PATH, "r", encoding="utf-8") as f:
    dev_data = json.load(f)

r2_nodes = map_data["graphs"]["r2"]["nodes"]
r2_edges = map_data["graphs"]["r2"]["edges"]
ladder_steps = map_data.get("ladder", [])
events_count = len(map_data["events"]["rows"]) if isinstance(map_data.get("events"), dict) and "rows" in map_data["events"] else len(map_data.get("events", []))

remaining_ids = dev_data["counters"]["remainingIds"]
tasks_map = {t["id"]: t for t in dev_data["tasks"]}

# Serialize data for JavaScript injection
nodes_json = json.dumps(r2_nodes, ensure_ascii=False)
edges_json = json.dumps(r2_edges, ensure_ascii=False)
ladder_json = json.dumps(ladder_steps, ensure_ascii=False)
remaining_tasks = [tasks_map[tid] for tid in remaining_ids if tid in tasks_map]
triage_json = json.dumps(remaining_tasks, ensure_ascii=False)

html_code = f"""<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Harness OS • Next-Gen AI Desktop (Award Edition 2026-2027)</title>
<style>
/* ==========================================================================
   DESIGN TOKENS — AWARDS EDITION 2026-2027 (Linear + Raycast + Claude Desktop)
   ========================================================================== */
:root {{
  --bg-app: #0b0d12;
  --bg-panel: #111419;
  --bg-raised: #181c24;
  --bg-hover: #1f2430;
  --bg-active: #282d3a;

  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-focus: rgba(143, 129, 255, 0.4);
  --border-accent: #8f81ff;

  --text-primary: #f0f2f5;
  --text-secondary: #8b929e;
  --text-muted: #6b7385;
  --text-faint: #484f60;

  --accent-ai: #8f81ff;
  --accent-ok: #3ddc97;
  --accent-warn: #f2b04b;
  --accent-bad: #ff6b6b;
  --accent-info: #5ab0ff;

  --font-ui: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace;

  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;

  --transition-fast: 120ms cubic-bezier(0.16, 1, 0.3, 1);
  --transition-smooth: 220ms cubic-bezier(0.16, 1, 0.3, 1);
}}

*, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

body {{
  font-family: var(--font-ui);
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-primary);
  background-color: var(--bg-app);
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}}

/* ═══════ MASTER HEADER (MACOS WINDOW CHROME) ═══════ */
.master-header {{
  height: 48px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  z-index: 100;
  gap: 16px;
  user-select: none;
}}

.chrome-left {{
  display: flex;
  align-items: center;
  gap: 14px;
}}
.traffic-lights {{
  display: flex;
  align-items: center;
  gap: 8px;
}}
.dot {{
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid rgba(0,0,0,0.3);
  cursor: pointer;
}}
.dot-red {{ background: #ff5f56; }}
.dot-yellow {{ background: #ffbd2e; }}
.dot-green {{ background: #27c93f; }}

.brand-wrap {{
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 13px;
}}
.award-badge {{
  background: rgba(143, 129, 255, 0.15);
  color: var(--accent-ai);
  border: 1px solid rgba(143, 129, 255, 0.3);
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: var(--radius-xs);
  letter-spacing: 0.5px;
}}

/* 4 Mode Pills Switcher */
.mode-switcher {{
  display: flex;
  align-items: center;
  background: var(--bg-app);
  padding: 3px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  gap: 2px;
}}
.mode-btn {{
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}}
.mode-btn:hover {{
  color: var(--text-primary);
  background: var(--bg-hover);
}}
.mode-btn.active {{
  background: var(--bg-raised);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  border: 1px solid rgba(255, 255, 255, 0.09);
}}
.mode-btn .key-hint {{
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 1px 5px;
  background: rgba(255,255,255,0.06);
  border-radius: 3px;
  color: var(--text-muted);
}}
.mode-btn.active .key-hint {{
  background: rgba(143,129,255,0.2);
  color: var(--accent-ai);
}}

.chrome-right {{
  display: flex;
  align-items: center;
  gap: 12px;
}}
.search-pill {{
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-app);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 5px 12px;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
}}
.search-pill:hover {{
  border-color: var(--border-focus);
  color: var(--text-secondary);
}}
.model-pill {{
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(143, 129, 255, 0.08);
  border: 1px solid rgba(143, 129, 255, 0.25);
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}}
.model-pill .status-dot {{
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-ok);
  box-shadow: 0 0 6px var(--accent-ok);
}}

/* ═══════ UNIVERSAL 7 INVARIANTS HEADS-UP BAR ═══════ */
.invariants-hud {{
  display: flex;
  align-items: center;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-subtle);
  padding: 6px 16px;
  font-size: 11px;
  overflow-x: auto;
  white-space: nowrap;
  gap: 16px;
  scrollbar-width: none;
}}
.invariants-hud::-webkit-scrollbar {{ display: none; }}
.inv-pill {{
  display: flex;
  align-items: center;
  gap: 5px;
}}
.inv-tag {{
  font-weight: 700;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(255,255,255,0.04);
}}
.inv-pill:nth-child(1) .inv-tag {{ color: var(--accent-info); }}
.inv-pill:nth-child(2) .inv-tag {{ color: var(--accent-ai); }}
.inv-pill:nth-child(3) .inv-tag {{ color: var(--accent-ok); }}
.inv-pill:nth-child(4) .inv-tag {{ color: var(--text-secondary); }}
.inv-pill:nth-child(5) .inv-tag {{ color: #d8b4fe; }}
.inv-pill:nth-child(6) .inv-tag {{ color: var(--accent-warn); }}
.inv-pill:nth-child(7) .inv-tag {{ color: var(--accent-ok); }}

.inv-val {{ color: var(--text-secondary); }}
.inv-val strong {{ color: var(--text-primary); font-weight: 500; }}

/* 4 Spaces Quick Switcher */
.spaces-rail {{
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding-left: 12px;
  border-left: 1px solid var(--border-subtle);
}}
.space-tab {{
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  padding: 2px 7px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
}}
.space-tab:hover {{ color: var(--text-primary); background: var(--bg-hover); }}
.space-tab.active-space {{ color: #fff; background: rgba(255,255,255,0.08); }}

/* ═══════ MAIN VIEWPORT ═══════ */
.main-viewport {{
  flex: 1;
  position: relative;
  overflow: hidden;
}}
.view-screen {{
  display: none;
  height: 100%;
  width: 100%;
  overflow: hidden;
}}
.view-screen.active {{
  display: flex;
}}

/* ═══════ MODE 1: ЛЕНТА & КОМАНДА (wbdesign-after.png) ═══════ */
.bus-layout {{
  display: flex;
  height: 100%;
  width: 100%;
  background: var(--bg-app);
}}

/* Left Nav Sidebar */
.bus-sidebar {{
  width: 220px;
  background: var(--bg-panel);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  padding: 12px 8px;
  gap: 16px;
  user-select: none;
}}
.sidebar-project {{
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--bg-raised);
  border-radius: var(--radius-sm);
  font-weight: 600;
  font-size: 12.5px;
}}
.nav-group-title {{
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--text-muted);
  padding: 0 10px 4px;
}}
.nav-list {{
  display: flex;
  flex-direction: column;
  gap: 2px;
}}
.nav-item {{
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-radius: var(--radius-xs);
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}}
.nav-item:hover {{ background: var(--bg-hover); color: var(--text-primary); }}
.nav-item.active {{ background: var(--bg-raised); color: #fff; font-weight: 500; }}
.badge-count {{
  background: rgba(242, 176, 75, 0.2);
  color: var(--accent-warn);
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 999px;
}}

/* Center Feed */
.bus-center {{
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-app);
  border-right: 1px solid var(--border-subtle);
  min-width: 0;
}}
.channel-tabs {{
  height: 38px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 6px;
}}
.ch-tab {{
  padding: 5px 12px;
  border-radius: var(--radius-xs);
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}}
.ch-tab.active {{
  background: var(--bg-raised);
  color: #fff;
  font-weight: 600;
}}
.feed-stream {{
  flex: 1;
  padding: 20px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}}
.feed-msg {{
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 16px;
  background: var(--bg-panel);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
}}
.feed-msg.msg-owner {{
  background: rgba(242, 176, 75, 0.04);
  border-color: rgba(242, 176, 75, 0.2);
}}
.msg-top {{
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
}}
.msg-sender {{
  display: flex;
  align-items: center;
  gap: 8px;
}}
.avatar {{
  width: 20px;
  height: 20px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 10px;
}}
.av-owner {{ background: #f2b04b; color: #1a1100; }}
.av-fable {{ background: #8f81ff; color: #fff; }}
.av-codex {{ background: #3b82f6; color: #fff; }}
.verdict-pill {{
  background: rgba(61, 220, 151, 0.15);
  color: var(--accent-ok);
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: var(--radius-xs);
}}

.composer-wrap {{
  padding: 12px 16px;
  background: var(--bg-panel);
  border-top: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 8px;
}}
.composer-input {{
  width: 100%;
  background: var(--bg-app);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  color: #fff;
  font-family: var(--font-ui);
  font-size: 13px;
  resize: none;
  height: 52px;
  outline: none;
}}
.composer-input:focus {{ border-color: var(--border-accent); }}
.composer-bottom {{
  display: flex;
  align-items: center;
  justify-content: space-between;
}}

/* Right Agent Pane (420px) */
.bus-agent {{
  width: 420px;
  background: var(--bg-panel);
  display: flex;
  flex-direction: column;
}}
.agent-header {{
  height: 38px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
}}
.agent-body {{
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}}
.thought-box {{
  background: rgba(143, 129, 255, 0.05);
  border: 1px solid rgba(143, 129, 255, 0.2);
  border-radius: var(--radius-sm);
  overflow: hidden;
}}
.thought-hdr {{
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-ai);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
}}
.thought-content {{
  padding: 8px 10px;
  font-size: 11.5px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  line-height: 1.5;
  border-top: 1px solid rgba(143, 129, 255, 0.1);
}}
.tool-card {{
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--bg-subtle);
  border-radius: var(--radius-sm);
  font-size: 11.5px;
  font-family: var(--font-mono);
  border: 1px solid var(--border-subtle);
}}

/* ═══════ MODE 2: КАРТА ОМ (n8n Topological DAG Canvas) ═══════ */
.om-map-layout {{
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--bg-app);
}}
.ladder-bar {{
  height: 40px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}}
.ladder-bar::-webkit-scrollbar {{ display: none; }}
.ladder-chip {{
  font-size: 11px;
  padding: 3px 8px;
  border-radius: var(--radius-xs);
  background: var(--bg-app);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  white-space: nowrap;
  cursor: pointer;
}}
.ladder-chip.active {{
  border-color: var(--accent-ai);
  color: #fff;
  background: rgba(143, 129, 255, 0.1);
}}
.dag-area {{
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
}}
.dag-canvas-wrap {{
  flex: 1;
  position: relative;
  overflow: hidden;
  background: radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px) 0 0/18px 18px;
  cursor: grab;
}}
.dag-canvas-wrap:active {{ cursor: grabbing; }}
.dag-svg {{
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}}
.dag-node {{
  position: absolute;
  width: 220px;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  transition: transform var(--transition-fast), border-color var(--transition-fast);
}}
.dag-node:hover {{
  transform: translateY(-2px);
  border-color: var(--border-focus);
}}
.dag-node.selected {{
  border-color: var(--accent-ai);
  box-shadow: 0 0 16px rgba(143, 129, 255, 0.25);
}}
.node-top {{
  display: flex;
  align-items: center;
  justify-content: space-between;
}}
.node-kind {{
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 3px;
}}
.kind-root {{ background: rgba(143, 129, 255, 0.15); color: var(--accent-ai); }}
.kind-step {{ background: rgba(59, 130, 246, 0.15); color: var(--accent-info); }}
.kind-gate {{ background: rgba(242, 176, 75, 0.15); color: var(--accent-warn); }}

.node-title {{
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}}
.node-purpose {{
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}}

/* DAG Inspector Panel */
.dag-inspector {{
  width: 360px;
  background: var(--bg-panel);
  border-left: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 18px;
  gap: 16px;
}}
.inspector-title {{
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}}
.contract-field {{
  display: flex;
  flex-direction: column;
  gap: 3px;
}}
.field-label {{
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}}
.field-value {{
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}}

/* Bottom Timeline Player */
.dag-player {{
  height: 44px;
  background: var(--bg-panel);
  border-top: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 14px;
}}
.player-btn {{
  background: var(--bg-raised);
  border: 1px solid var(--border-subtle);
  color: #fff;
  padding: 4px 10px;
  border-radius: var(--radius-xs);
  font-size: 12px;
  cursor: pointer;
}}
.player-scrubber {{
  flex: 1;
  -webkit-appearance: none;
  height: 4px;
  background: var(--bg-raised);
  border-radius: 2px;
  outline: none;
}}
.player-scrubber::-webkit-slider-thumb {{
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent-ai);
  cursor: pointer;
}}

/* ═══════ MODE 3: ШТАБ РЕШЕНИЙ (Triage & 7 Invariants) ═══════ */
.triage-layout {{
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  padding: 20px 24px;
  background: var(--bg-app);
  overflow-y: auto;
  gap: 20px;
}}
.gauges-grid {{
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}}
.gauge-box {{
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}}
.gauge-num {{
  font-size: 26px;
  font-weight: 700;
  display: flex;
  align-items: baseline;
  gap: 8px;
}}
.triage-split {{
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 20px;
  flex: 1;
  min-height: 0;
}}
.triage-feed {{
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding-right: 4px;
}}
.triage-card {{
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  transition: all var(--transition-fast);
}}
.triage-card.focused {{
  border-color: var(--accent-ai);
  box-shadow: 0 0 20px rgba(143, 129, 255, 0.15);
}}
.inv-grid {{
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  background: var(--bg-app);
  padding: 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
}}

/* ═══════ MODE 4: СТУДИЯ КОДА & LIVE WEBVIEW (:3000) ═══════ */
.studio-layout {{
  display: grid;
  grid-template-columns: 220px 1fr 480px;
  height: 100%;
  width: 100%;
  background: var(--bg-app);
}}
.studio-tree {{
  background: var(--bg-panel);
  border-right: 1px solid var(--border-subtle);
  padding: 12px 8px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}}
.studio-code {{
  display: flex;
  flex-direction: column;
  background: #090a0d;
  border-right: 1px solid var(--border-subtle);
  overflow: hidden;
}}
.diff-stream {{
  flex: 1;
  overflow-y: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  padding: 12px 0;
}}
.diff-row {{
  display: flex;
  padding: 1px 16px;
  white-space: pre-wrap;
}}
.d-add {{ background: rgba(61, 220, 151, 0.08); color: #56f2aa; }}
.d-del {{ background: rgba(255, 107, 107, 0.08); color: #ff8585; }}
.d-hunk {{ background: rgba(143, 129, 255, 0.1); color: var(--accent-ai); padding: 4px 16px; font-weight: 600; }}
.d-num {{ width: 40px; color: var(--text-faint); text-align: right; padding-right: 12px; user-select: none; }}

.studio-preview {{
  background: var(--bg-panel);
  display: flex;
  flex-direction: column;
}}
.preview-header {{
  height: 38px;
  padding: 0 14px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 600;
}}
.preview-iframe-wrap {{
  flex: 1;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px) 0 0/16px 16px;
}}
.preview-iframe {{
  width: 100%;
  height: 100%;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: #0b0d12;
}}

/* ═══════ COMMON BUTTONS & HELPERS ═══════ */
.btn {{
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all var(--transition-fast);
}}
.btn-primary {{
  background: var(--accent-ok);
  color: #052114;
}}
.btn-primary:hover {{
  filter: brightness(1.1);
  transform: translateY(-1px);
}}
.btn-secondary {{
  background: var(--bg-subtle);
  border-color: var(--border-subtle);
  color: var(--text-primary);
}}
.btn-secondary:hover {{
  background: var(--bg-hover);
}}
.kbd {{
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(0,0,0,0.25);
}}
</style>
</head>
<body>

<div style="display:flex; flex-direction:column; height:100vh;">

  <!-- ═══════ MASTER HEADER ═══════ -->
  <header class="master-header">
    <div class="chrome-left">
      <div class="traffic-lights">
        <div class="dot dot-red" title="Закрыть"></div>
        <div class="dot dot-yellow" title="Свернуть"></div>
        <div class="dot dot-green" title="Развернуть"></div>
      </div>
      <div class="brand-wrap">
        <span>⚡ HARNESS OS</span>
        <span class="award-badge">AWARD EDITION 2026-2027</span>
      </div>
    </div>

    <!-- 4 Switchable Modes -->
    <nav class="mode-switcher">
      <button class="mode-btn active" id="btn-m1" onclick="goMode(1)">
        <span>💬 1. Лента & Команда</span>
        <span class="key-hint">1</span>
      </button>
      <button class="mode-btn" id="btn-m2" onclick="goMode(2)">
        <span>🗺️ 2. Карта ОМ (n8n)</span>
        <span class="key-hint">2</span>
      </button>
      <button class="mode-btn" id="btn-m3" onclick="goMode(3)">
        <span>🛰️ 3. Штаб решений</span>
        <span class="key-hint">3</span>
      </button>
      <button class="mode-btn" id="btn-m4" onclick="goMode(4)">
        <span>💻 4. Студия кода (:3000)</span>
        <span class="key-hint">4</span>
      </button>
    </nav>

    <div class="chrome-right">
      <div class="search-pill" onclick="alert('⌘K: Поиск по 55 узлам, 2729 событиям и коду')">
        <span>Поиск, команды...</span>
        <span style="font-family:var(--font-mono); font-size:10px;">⌘K</span>
      </div>
      <div class="model-pill">
        <span class="status-dot"></span>
        <span id="active-model-title">Claude 3.7 + Codex</span>
      </div>
    </div>
  </header>

  <!-- ═══════ 7 INVARIANTS HUD & 4 SPACES BAR ═══════ -->
  <div class="invariants-hud">
    <div class="inv-pill">
      <span class="inv-tag">📍 ГДЕ</span>
      <span class="inv-val" id="hud-where"><strong>OMG-Dev</strong> / main</span>
    </div>
    <div class="inv-pill">
      <span class="inv-tag">⚡ ЧТО</span>
      <span class="inv-val" id="hud-what">Карта ОМ и витрина поверх шины событий</span>
    </div>
    <div class="inv-pill">
      <span class="inv-tag">🎯 ЗАЧЕМ</span>
      <span class="inv-val" id="hud-why">Сквозной управляемый проход от идеи к изменению</span>
    </div>
    <div class="inv-pill">
      <span class="inv-tag">⏱️ КОГДА</span>
      <span class="inv-val" id="hud-when">Рубеж L3 · <strong>9 задач до L4</strong></span>
    </div>
    <div class="inv-pill">
      <span class="inv-tag">📦 ОЖИДАЕМ</span>
      <span class="inv-val" id="hud-expect">Рабочий верстак + 8/8 тестов</span>
    </div>
    <div class="inv-pill">
      <span class="inv-tag">⚠️ РИСКИ</span>
      <span class="inv-val" id="hud-risks">Отказы доходят формой <code>{{ok:false}}</code></span>
    </div>
    <div class="inv-pill">
      <span class="inv-tag">✅ КРИТЕРИИ</span>
      <span class="inv-val" id="hud-criteria">Typecheck чистый, вердикт ревьюера 9/10</span>
    </div>

    <!-- 4 SPACES UNIVERSAL RAIL -->
    <div class="spaces-rail">
      <div class="space-tab" onclick="goMode(4)">📁 ПРОЕКТ</div>
      <div class="space-tab" onclick="goMode(1)">💬 ДИАЛОГ</div>
      <div class="space-tab" onclick="goMode(4)">💻 КОД</div>
      <div class="space-tab" onclick="goMode(2)">🚀 ПРОДУКТ</div>
    </div>
  </div>

  <!-- ═══════ MAIN VIEWPORT SCREENS ═══════ -->
  <main class="main-viewport">

    <!-- ─────────────────────────────────────────────────────────────
         MODE 1: ЛЕНТА ШИНЫ & АССИСТЕНТ (wbdesign-after.png)
         ───────────────────────────────────────────────────────────── -->
    <section class="view-screen active" id="view-m1">
      <div class="bus-layout">
        <!-- Sidebar -->
        <aside class="bus-sidebar">
          <div class="sidebar-project">
            <span>OMG · проект</span>
            <span style="font-size:10px; color:var(--accent-ai);">main</span>
          </div>

          <div>
            <div class="nav-group-title">РАЗДЕЛЫ</div>
            <div class="nav-list">
              <div class="nav-item active"><span>💬 Лента</span></div>
              <div class="nav-item" onclick="goMode(2)"><span>🗺️ Карта ОМ</span></div>
              <div class="nav-item" onclick="goMode(3)"><span>🛰️ Штаб решений</span> <span class="badge-count">9</span></div>
              <div class="nav-item" onclick="goMode(4)"><span>💻 Студия кода</span></div>
            </div>
          </div>

          <div>
            <div class="nav-group-title">КАНАЛЫ ШИНЫ</div>
            <div class="nav-list">
              <div class="nav-item active"><span># main</span> <span class="badge-count">1</span></div>
              <div class="nav-item"><span># events</span> <span style="font-size:10px; color:var(--text-muted);">2729</span></div>
              <div class="nav-item"><span># omg-r2-l3</span></div>
              <div class="nav-item"><span># post-audit-omg</span></div>
            </div>
          </div>

          <div>
            <div class="nav-group-title">КОМАНДА</div>
            <div class="nav-list">
              <div class="nav-item">
                <span style="display:flex; align-items:center; gap:6px;">
                  <span style="width:6px; height:6px; border-radius:50%; background:var(--accent-ok);"></span>
                  Architect
                </span>
                <span style="font-size:10px; color:var(--accent-ok);">идёт ход</span>
              </div>
              <div class="nav-item">
                <span style="display:flex; align-items:center; gap:6px;">
                  <span style="width:6px; height:6px; border-radius:50%; background:var(--accent-warn);"></span>
                  Reviewer
                </span>
                <span style="font-size:10px; color:var(--accent-warn);">2 ждут</span>
              </div>
              <div class="nav-item"><span>○ Worker</span></div>
              <div class="nav-item"><span>○ Fable</span></div>
              <div class="nav-item"><span>○ Codex</span></div>
            </div>
          </div>
        </aside>

        <!-- Center Feed -->
        <div class="bus-center">
          <div class="channel-tabs">
            <div class="ch-tab active"># main</div>
            <div class="ch-tab">● Architect ×</div>
            <div class="ch-tab" style="color:var(--text-muted);">+</div>
          </div>

          <div class="feed-stream">
            <div class="feed-msg msg-owner">
              <div class="msg-top">
                <div class="msg-sender">
                  <span class="avatar av-owner">В</span>
                  <strong style="color:#fff;">Владелец</strong>
                  <span style="color:var(--text-muted);">→ все</span>
                  <span class="inv-tag" style="color:var(--accent-warn); background:rgba(242,176,75,0.15);">слово владельца</span>
                </div>
                <span style="color:var(--text-muted);">29.09, 10:42</span>
              </div>
              <div style="color:#f0f2f5; font-size:13px; line-height:1.5;">
                Первый ломоть UI. Начинаем третий ломоть: витрина поверх шины. Fable — каркас воркбенча, codex — ревью по готовности. Правила остаются в библиотеке asvh, UI их не повторяет.
              </div>
            </div>

            <div class="feed-msg">
              <div class="msg-top">
                <div class="msg-sender">
                  <span class="avatar av-fable">F</span>
                  <strong style="color:#fff;">Fable</strong>
                  <span style="color:var(--text-muted);">→ Владелец</span>
                </div>
                <span style="color:var(--text-muted);">10:57</span>
              </div>
              <div style="color:var(--text-secondary); font-size:12px;">в ответ на №240</div>
              <div style="color:#f0f2f5; font-size:13px; line-height:1.5;">
                Принято. Каркас: Electron + React, мост через CLI, чтение status/read, запись post/ack. Демо-режим для предпросмотра без дома.
              </div>
              <div style="font-family:var(--font-mono); font-size:11px; color:var(--accent-info);">UI/asvh-workbench</div>
            </div>

            <div class="feed-msg">
              <div class="msg-top">
                <div class="msg-sender">
                  <span class="avatar av-fable">F</span>
                  <strong style="color:#fff;">Fable</strong>
                  <span style="color:var(--text-muted);">→ Codex</span>
                  <span class="inv-tag" style="color:var(--accent-info); background:rgba(59,130,246,0.15);">на ревью</span>
                </div>
                <span style="color:var(--text-muted);">11:52</span>
              </div>
              <div style="color:#f0f2f5; font-size:13px; line-height:1.5;">
                Каркас воркбенча. Проверить: правила не дублируются, отказы доходят формой {{ok:false}}, постинг owner идёт со следом cli-notty.
              </div>
              <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted);">electron/main.cjs · src/App.tsx</div>
            </div>

            <div class="feed-msg">
              <div class="msg-top">
                <div class="msg-sender">
                  <span class="avatar av-codex">C</span>
                  <strong style="color:#fff;">Codex</strong>
                  <span style="color:var(--text-muted);">→ Fable</span>
                  <span class="verdict-pill">вердикт 9/10</span>
                </div>
                <span style="color:var(--text-muted);">13:12</span>
              </div>
              <div style="color:var(--text-secondary); font-size:12px;">в ответ на №242 • раунд 1</div>
              <div style="color:#f0f2f5; font-size:13px; line-height:1.5;">
                Каркас принят. Мост тонкий, правил не повторяет; отказ post от не-owner возвращается ответом, а не исключением. Замечание: опрос status каждые 3 с — перевести на события, когда появится watch в asvh.
              </div>
            </div>
          </div>

          <div class="composer-wrap">
            <textarea class="composer-input" placeholder="Поручите что угодно..."></textarea>
            <div class="composer-bottom">
              <div style="display:flex; gap:8px;">
                <span class="inv-tag" style="cursor:pointer;">→ всем ▾</span>
                <span class="inv-tag" style="cursor:pointer; color:var(--accent-warn);">слово владельца ▾</span>
              </div>
              <button class="btn btn-primary" onclick="alert('Сообщение отправлено в шину')">
                <span>Отправить</span>
                <span class="kbd">⌘↵</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Right Agent Pane -->
        <aside class="bus-agent">
          <div class="agent-header">
            <span style="display:flex; align-items:center; gap:6px;">
              <span style="width:7px; height:7px; border-radius:50%; background:var(--accent-ok);"></span>
              Architect
              <span style="color:var(--text-muted); font-size:11px; font-weight:normal;">~/Shared/asvh-workspace</span>
            </span>
            <span style="cursor:pointer; color:var(--text-muted);">×</span>
          </div>

          <div class="agent-body">
            <div style="color:var(--text-muted); font-size:11.5px;">вы · 03:40</div>
            <div style="color:#fff; font-size:13.5px; font-weight:500;">а что здесь?</div>

            <!-- DeepSeek Reasoning Accordion -->
            <div class="thought-box">
              <div class="thought-hdr" onclick="toggleElem('agent-cot')">
                <span>▸ размышление модели (DeepThink: 52 симв.)</span>
                <span>▾</span>
              </div>
              <div class="thought-content" id="agent-cot">
                Сначала посмотрю на проект: проверяю структуру package.json и скрипты запуска.
              </div>
            </div>

            <div class="tool-card">
              <span style="color:var(--accent-ok);">✓</span>
              <span>Read package.json</span>
              <span style="margin-left:auto; color:var(--text-muted);">exit 0</span>
            </div>

            <div style="color:var(--text-secondary); font-size:13px; line-height:1.5;">
              Вижу скрипт test. Чтобы проверить изменения, нужно запустить тесты. Команда отклонена — тесты не запускал. Могу описать, что именно стоит проверить руками.
            </div>

            <div style="font-size:11.5px; color:var(--accent-warn); background:rgba(242,176,75,0.08); padding:8px 10px; border-radius:var(--radius-sm); border:1px solid rgba(242,176,75,0.2);">
              режим «Чтение»: команда отклонена без карточки
            </div>
          </div>
        </aside>
      </div>
    </section>

    <!-- ─────────────────────────────────────────────────────────────
         MODE 2: КАРТА ОМ (Operation Map & n8n Topological DAG)
         ───────────────────────────────────────────────────────────── -->
    <section class="view-screen" id="view-m2">
      <div class="om-map-layout">
        <!-- Ladder Strip -->
        <div class="ladder-bar" id="ladder-strip-container"></div>

        <!-- DAG Canvas & Inspector -->
        <div class="dag-area">
          <div class="dag-canvas-wrap" id="dag-canvas-wrap">
            <svg class="dag-svg" id="dag-svg-edges"></svg>
            <div id="dag-nodes-container"></div>
          </div>

          <!-- Node Inspector -->
          <div class="dag-inspector" id="dag-inspector-panel">
            <div class="inspector-title" id="insp-title">Выберите узел на карте</div>
            
            <div class="contract-field">
              <span class="field-label">НАЗНАЧЕНИЕ (PURPOSE)</span>
              <span class="field-value" id="insp-purpose">—</span>
            </div>

            <div class="contract-field">
              <span class="field-label">ПОЛЬЗА (BENEFIT)</span>
              <span class="field-value" id="insp-benefit">—</span>
            </div>

            <div class="contract-field">
              <span class="field-label">РЕЗУЛЬТАТ (OUTCOME)</span>
              <span class="field-value" id="insp-outcome">—</span>
            </div>

            <div class="contract-field">
              <span class="field-label">ДЛЯ КОГО (BENEFICIARY)</span>
              <span class="field-value" id="insp-beneficiary">—</span>
            </div>

            <div class="contract-field">
              <span class="field-label">ГРАНИЦЫ (BOUNDARY)</span>
              <span class="field-value" id="insp-boundary">—</span>
            </div>

            <!-- 5-pass check -->
            <div style="background:var(--bg-app); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:10px; margin-top:8px;">
              <div style="font-size:11px; font-weight:700; color:var(--accent-ok); margin-bottom:4px;">✓ 5 ПРОХОДОВ САМОПРОВЕРКИ ЗАКРЫТЫ</div>
              <div style="font-size:11px; color:var(--text-muted); line-height:1.4;">
                Пути: 100% · Отсутствие: {{ok:false}} · Маскарад: sha256 · Окна: транзакция · Соседи: clean
              </div>
            </div>
          </div>
        </div>

        <!-- Events Scrubber Player -->
        <div class="dag-player">
          <button class="player-btn" onclick="togglePlay()">▶ Воспроизвести</button>
          <span style="font-size:12px; color:var(--text-muted);">Событие <strong id="player-cur-ev" style="color:#fff;">2058</strong> из {events_count}</span>
          <input type="range" class="player-scrubber" min="1" max="{events_count}" value="2058" oninput="updateScrubber(this.value)">
          <span style="font-size:11px; color:var(--accent-ok);">● Живой срез OMG-LIVE</span>
        </div>
      </div>
    </section>

    <!-- ─────────────────────────────────────────────────────────────
         MODE 3: ШТАБ РЕШЕНИЙ (Triage Deck with 7 Invariants)
         ───────────────────────────────────────────────────────────── -->
    <section class="view-screen" id="view-m3">
      <div class="triage-layout">
        <!-- 4 Horizon Gauges -->
        <div class="gauges-grid">
          <div class="gauge-box" style="border-top:2px solid var(--accent-warn);">
            <span style="font-size:11px; font-weight:700; color:var(--text-muted);">ЖДУТ РЕШЕНИЯ ВЛАДЕЛЬЦА</span>
            <div class="gauge-num" style="color:var(--accent-warn);"><span id="triage-badge-count">{len(remaining_ids)}</span> <span style="font-size:12px; color:var(--text-secondary); font-weight:normal;">развилки до рубежа</span></div>
          </div>
          <div class="gauge-box" style="border-top:2px solid var(--accent-ai);">
            <span style="font-size:11px; font-weight:700; color:var(--text-muted);">АКТИВНЫЕ АГЕНТЫ</span>
            <div class="gauge-num"><span>2</span> <span style="font-size:12px; color:var(--text-secondary); font-weight:normal;">места (Kimi, Claude)</span></div>
          </div>
          <div class="gauge-box" style="border-top:2px solid var(--accent-ok);">
            <span style="font-size:11px; font-weight:700; color:var(--text-muted);">ПРИНЯТО ПО РУБЕЖУ</span>
            <div class="gauge-num"><span>76 из 96</span> <span style="font-size:12px; color:var(--text-secondary); font-weight:normal;">(79%)</span></div>
          </div>
          <div class="gauge-box" style="border-top:2px solid var(--accent-info);">
            <span style="font-size:11px; font-weight:700; color:var(--text-muted);">РАСХОД ЗА ДЕНЬ</span>
            <div class="gauge-num"><span>$1.42</span> <span style="font-size:12px; color:var(--text-secondary); font-weight:normal;">/ лимит $10.00 (11.7 M ток.)</span></div>
          </div>
        </div>

        <!-- Split: Tasks Feed + Perplexity Citations -->
        <div class="triage-split">
          <div class="triage-feed" id="triage-cards-container"></div>

          <!-- Perplexity Grounding Sidebar -->
          <div style="display:flex; flex-direction:column; gap:16px;">
            <div style="background:var(--bg-panel); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:20px; display:flex; flex-direction:column; gap:12px;">
              <div style="font-size:12.5px; font-weight:700; color:var(--accent-ai);">ПУЛЬТ ОПЕРАТОРА (HERMES + LINEAR)</div>
              <p style="color:var(--text-secondary); font-size:12px; line-height:1.5;">
                Интерфейс не требует чтения терминала. Принятие решения в 1 клик (<strong>Space</strong> — влить, <strong>Esc</strong> — отклонить).
              </p>
              <div style="border-top:1px solid var(--border-subtle); padding-top:10px; font-size:12px; color:var(--text-secondary);">
                <strong>Фронт работ:</strong><br>
                • Claude 3.7: H1.3 — завершил правки роутинга.<br>
                • Kimi: E2.2 — подготовка 3-го прогона Q2.<br>
                • Codex: ожидает подтверждения коммита f3bf191.
              </div>
            </div>

            <div style="background:var(--bg-panel); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:20px; display:flex; flex-direction:column; gap:12px;">
              <div style="font-size:12.5px; font-weight:700; color:var(--accent-info);">ДОКАЗАТЕЛЬСТВА И ЦИТАТЫ (PERPLEXITY ENGINE)</div>
              <div style="font-size:12px; color:var(--text-secondary); line-height:1.5;">
                База SQLite events содержит 2 729 ревизий <a href="#" style="color:var(--accent-info);">[1] heads</a>. Рубеж L3 синхронизирован <a href="#" style="color:var(--accent-info);">[2] timeline</a>. Общий расход: 11,7 M токенов на 225 вызовов моделей <a href="#" style="color:var(--accent-info);">[3] calls</a>.
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>

    <!-- ─────────────────────────────────────────────────────────────
         MODE 4: СТУДИЯ КОДА & LIVE WEBVIEW (:3000)
         ───────────────────────────────────────────────────────────── -->
    <section class="view-screen" id="view-m4">
      <div class="studio-layout">
        <!-- File Tree -->
        <div class="studio-tree">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); padding:6px 10px; text-transform:uppercase;">ВЕТКА OM-MAP</div>
          <div class="nav-item active"><span>📄 OmMapScreen.tsx</span> <span class="badge-count" style="background:rgba(242,176,75,0.2); color:var(--accent-warn);">M</span></div>
          <div class="nav-item"><span>📄 dagreLayout.ts</span> <span class="badge-count" style="background:rgba(242,176,75,0.2); color:var(--accent-warn);">M</span></div>
          <div class="nav-item"><span>📄 MapCanvas.tsx</span> <span class="badge-count" style="background:rgba(242,176,75,0.2); color:var(--accent-warn);">M</span></div>
          <div class="nav-item"><span>📄 data/types.ts</span> <span class="badge-count" style="background:rgba(61,220,151,0.2); color:var(--accent-ok);">A</span></div>
          <div class="nav-item"><span>📄 package.json</span> <span class="badge-count" style="background:rgba(242,176,75,0.2); color:var(--accent-warn);">M</span></div>
        </div>

        <!-- Code Diff & Tests -->
        <div class="studio-code">
          <div style="height:38px; background:var(--bg-panel); border-bottom:1px solid var(--border-subtle); display:flex; align-items:center; justify-content:space-between; padding:0 16px;">
            <span style="font-family:var(--font-mono); font-size:12px; color:var(--accent-info);">OmMapScreen.tsx (дифф коммита f3bf191)</span>
            <button class="btn btn-primary" onclick="alert('Коммит f3bf191 слит в ветку om-map!')">✓ Влить коммит (Space)</button>
          </div>

          <div class="diff-stream">
            <div class="d-hunk">@@ -35,18 +35,26 @@ export function OmMapScreen() {{</div>
            <div class="diff-row d-del"><span class="d-num">35</span>- const defaultHash = window.location.pathname;</div>
            <div class="diff-row d-add"><span class="d-num">35</span>+ // Прямой вход по адресу http://localhost:3000/#/om-map</div>
            <div class="diff-row d-add"><span class="d-num">36</span>+ const isOmMap = window.location.hash === '#/om-map';</div>
            <div class="diff-row d-add"><span class="d-num">37</span>+ const [currentView, setCurrentView] = useState(isOmMap ? 'om-map' : 'feed');</div>
            <div class="diff-row"><span class="d-num">38</span>   useEffect(() => {{</div>
            <div class="diff-row"><span class="d-num">39</span>     const onHashChange = () => {{</div>
            <div class="diff-row d-add"><span class="d-num">40</span>+      if (window.location.hash === '#/om-map') setCurrentView('om-map');</div>
            <div class="diff-row"><span class="d-num">41</span>     }};</div>
            <div class="diff-row"><span class="d-num">42</span>     window.addEventListener('hashchange', onHashChange);</div>
            <div class="diff-row"><span class="d-num">43</span>   }}, []);</div>
          </div>

          <!-- Vitest Bar -->
          <div style="background:var(--bg-panel); border-top:1px solid var(--border-subtle); padding:10px 16px; display:flex; align-items:center; justify-content:space-between;">
            <span style="color:var(--accent-ok); font-size:12px; font-weight:700;">● Vitest: 8/8 тестов пройдено (0.19s) OK</span>
            <div style="font-size:11px; color:var(--text-muted); display:flex; gap:12px;">
              <span>ПУТИ: ✓</span> <span>ОТСУТСТВИЕ: ✓</span> <span>МАСКАРАД: ✓</span> <span>ОКНА: ✓</span> <span>СОСЕДИ: ✓</span>
            </div>
          </div>
        </div>

        <!-- Embedded Live Webview -->
        <div class="studio-preview">
          <div class="preview-header">
            <span>🚀 LIVE PRODUCT WEBVIEW (:3000/#/om-map)</span>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-secondary" style="padding:2px 8px; font-size:11px;" onclick="reloadIframe()">🔄 Обновить</button>
            </div>
          </div>
          <div class="preview-iframe-wrap">
            <iframe class="preview-iframe" id="live-frame" src="http://localhost:3000/#/om-map"></iframe>
          </div>
        </div>
      </div>
    </section>

  </main>
</div>

<!-- ═══════ DATA INJECTION & CLIENT LOGIC ═══════ -->
<script>
const nodesData = {nodes_json};
const edgesData = {edges_json};
const ladderData = {ladder_json};
const triageTasks = {triage_json};

let currentMode = 1;

function goMode(num) {{
  currentMode = num;
  document.querySelectorAll('.mode-btn').forEach((b, i) => b.classList.toggle('active', i + 1 === num));
  document.querySelectorAll('.view-screen').forEach((s, i) => s.classList.toggle('active', i + 1 === num));

  if (num === 1) location.hash = '#bus';
  if (num === 2) location.hash = '#om-map';
  if (num === 3) location.hash = '#triage';
  if (num === 4) location.hash = '#studio';

  updateHUD(num);
}}

function updateHUD(num) {{
  const where = document.getElementById('hud-where');
  const what = document.getElementById('hud-what');
  const why = document.getElementById('hud-why');

  if (num === 1) {{
    where.innerHTML = '<strong>OMG-Dev</strong> / #main';
    what.textContent = 'Лента шины сообщений и рабочий пульт Architect';
    why.textContent = 'Координация агентов в общем контексте с контролем вердиктов';
  }} else if (num === 2) {{
    where.innerHTML = '<strong>OMG-Dev</strong> / om-map (n8n)';
    what.textContent = 'Топологический граф контрактов R2 (55 узлов, 87 связей)';
    why.textContent = 'Наглядная архитектура без потери зависимостей и отказов';
  }} else if (num === 3) {{
    where.innerHTML = '<strong>OMG-Dev</strong> / triage/milestone-l3';
    what.textContent = 'Штаб решений: 9 оставшихся задач до шлюза L4';
    why.textContent = 'Принятие ключевых архитектурных развилок в 1 клик (Space)';
  }} else if (num === 4) {{
    where.innerHTML = '<strong>OMG-Dev</strong> / studio/diffs';
    what.textContent = 'Инженерный верстак: дифф OmMapScreen.tsx + живой превью';
    why.textContent = 'Синхронная проверка кода, тестов и работающего UI на одном экране';
  }}
}}

function toggleElem(id) {{
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}}

function reloadIframe() {{
  const f = document.getElementById('live-frame');
  if (f) f.src = f.src;
}}

/* Render DAG Canvas */
function initDAG() {{
  const ladderWrap = document.getElementById('ladder-strip-container');
  if (ladderWrap) {{
    ladderWrap.innerHTML = ladderData.map((l, i) => `
      <div class="ladder-chip ${{i === 3 ? 'active' : ''}}" onclick="selectLadder(${{i}})">
        ${{l.title || l.id}}
      </div>
    `).join('');
  }}

  const nodesWrap = document.getElementById('dag-nodes-container');
  const svgWrap = document.getElementById('dag-svg-edges');
  if (!nodesWrap || !svgWrap) return;

  // Topological / grid positioning
  const cols = 5;
  const colW = 280;
  const rowH = 130;
  const nodePositions = {{}};

  nodesWrap.innerHTML = nodesData.map((n, i) => {{
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 40 + col * colW;
    const y = 30 + row * rowH;
    nodePositions[n.id] = {{ x: x + 110, y: y + 45 }};

    const kindClass = n.kind === 'root' ? 'kind-root' : (n.kind === 'gate' ? 'kind-gate' : 'kind-step');
    return `
      <div class="dag-node" id="dnode-${{n.id}}" style="left:${{x}}px; top:${{y}}px;" onclick="inspectNode('${{n.id}}')">
        <div class="node-top">
          <span class="node-kind ${{kindClass}}">${{n.kind || 'BLOCK'}}</span>
          <span style="font-family:var(--font-mono); font-size:10px; color:var(--text-muted);">${{n.id}}</span>
        </div>
        <div class="node-title">${{n.title || n.id}}</div>
        <div class="node-purpose">${{n.purpose || ''}}</div>
      </div>
    `;
  }}).join('');

  // Render SVG Bezier Edges
  let svgPaths = '';
  edgesData.forEach(e => {{
    const p1 = nodePositions[e.source];
    const p2 = nodePositions[e.target];
    if (p1 && p2) {{
      const dx = (p2.x - p1.x) * 0.5;
      const stroke = e.relation === 'on_failure' ? 'var(--accent-bad)' : (e.relation === 'returns_to' ? 'var(--accent-warn)' : 'var(--accent-ok)');
      const dash = e.relation === 'on_failure' ? 'stroke-dasharray="4,4"' : (e.relation === 'returns_to' ? 'stroke-dasharray="2,2"' : '');
      svgPaths += `<path d="M ${{p1.x}} ${{p1.y}} C ${{p1.x + dx}} ${{p1.y}}, ${{p2.x - dx}} ${{p2.y}}, ${{p2.x}} ${{p2.y}}" fill="none" stroke="${{stroke}}" stroke-width="1.5" opacity="0.4" ${{dash}} />`;
    }}
  }});
  svgWrap.innerHTML = svgPaths;
}}

function inspectNode(id) {{
  const node = nodesData.find(n => n.id === id);
  if (!node) return;

  document.querySelectorAll('.dag-node').forEach(el => el.classList.remove('selected'));
  const card = document.getElementById('dnode-' + id);
  if (card) card.classList.add('selected');

  document.getElementById('insp-title').textContent = node.title || node.id;
  document.getElementById('insp-purpose').textContent = node.purpose || '—';
  document.getElementById('insp-benefit').textContent = node.benefit || 'Полезное проверенное изменение с сохраняемыми основаниями';
  document.getElementById('insp-outcome').textContent = node.outcome || 'persistent-through-run';
  document.getElementById('insp-beneficiary').textContent = node.beneficiary || 'owner';

  const b = node.boundary;
  let bStr = '—';
  if (typeof b === 'object' && b !== null) {{
    bStr = Object.entries(b).map(([k,v]) => `${{k}}: ${{v}}`).join(' · ');
  }} else if (typeof b === 'string') {{
    bStr = b;
  }}
  document.getElementById('insp-boundary').textContent = bStr;
}}

/* Render Triage Feed */
function initTriage() {{
  const wrap = document.getElementById('triage-cards-container');
  if (!wrap) return;

  wrap.innerHTML = triageTasks.map((t, idx) => `
    <div class="triage-card ${{idx === 0 ? 'focused' : ''}}" id="tcard-${{t.id}}">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <span class="inv-tag" style="color:var(--accent-warn); background:rgba(242,176,75,0.15);">ТРЕБУЕТСЯ РЕШЕНИЕ ВЛАДЕЛЬЦА · РУБЕЖ L3</span>
          <h3 style="font-size:15px; font-weight:700; color:#fff; margin-top:4px;">${{t.id}}: ${{t.title || 'Задача'}}</h3>
        </div>
        <span style="font-size:11px; color:var(--text-muted); font-family:var(--font-mono);">${{t.worker || 'worker'}}</span>
      </div>

      <!-- 7 Invariants Grid for this task -->
      <div class="inv-grid">
        <div><span style="font-size:10px; font-weight:700; color:var(--accent-info);">📍 ГДЕ:</span> <span style="font-size:11.5px; color:var(--text-secondary);">asvh/runtime/${{t.id.toLowerCase()}}.ts</span></div>
        <div><span style="font-size:10px; font-weight:700; color:var(--accent-ai);">⚡ ЧТО:</span> <span style="font-size:11.5px; color:var(--text-secondary);">Типизация кодов отказа</span></div>
        <div><span style="font-size:10px; font-weight:700; color:var(--accent-ok);">🎯 ЗАЧЕМ:</span> <span style="font-size:11.5px; color:var(--text-secondary);">Исключить невидимый пропуск сбоев</span></div>
        <div><span style="font-size:10px; font-weight:700; color:var(--text-muted);">⏱️ КОГДА:</span> <span style="font-size:11.5px; color:var(--text-secondary);">Рубеж L3 · Блокирует релиз</span></div>
        <div><span style="font-size:10px; font-weight:700; color:#d8b4fe;">📦 ОЖИДАЕМ:</span> <span style="font-size:11.5px; color:var(--text-secondary);">Контракт L3CriteriaPass</span></div>
        <div><span style="font-size:10px; font-weight:700; color:var(--accent-warn);">⚠️ РИСКИ:</span> <span style="font-size:11.5px; color:var(--text-secondary);">Декларативная схема без побочных эффектов</span></div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-subtle); padding-top:10px;">
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary" onclick="approveTriage('${{t.id}}')">
            <span>✓ Одобрить слияние</span>
            <span class="kbd">Space</span>
          </button>
          <button class="btn btn-secondary" onclick="goMode(4)">
            <span>👁 Сравнить дифф в Студии</span>
            <span class="kbd">D</span>
          </button>
        </div>
        <span style="font-size:11px; color:var(--text-muted);">Прогонов: ${{t.runs || 1}} · Вердикт: 7/10</span>
      </div>
    </div>
  `).join('');
}}

function approveTriage(id) {{
  const card = document.getElementById('tcard-' + id);
  if (!card) return;
  card.style.transition = 'all 200ms ease';
  card.style.opacity = '0';
  card.style.transform = 'translateX(40px)';
  setTimeout(() => {{
    card.remove();
    const b = document.getElementById('triage-badge-count');
    if (b) b.textContent = Math.max(0, parseInt(b.textContent) - 1);
  }}, 200);
}}

function updateScrubber(v) {{
  document.getElementById('player-cur-ev').textContent = v;
}}

/* Keyboard Navigation */
window.addEventListener('keydown', (e) => {{
  if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === '1') goMode(1);
  if (e.key === '2') goMode(2);
  if (e.key === '3') goMode(3);
  if (e.key === '4') goMode(4);
  if (e.key === ' ' && currentMode === 3) {{
    e.preventDefault();
    const first = document.querySelector('.triage-card');
    if (first) approveTriage(first.id.replace('tcard-', ''));
  }}
}});

window.addEventListener('DOMContentLoaded', () => {{
  initDAG();
  initTriage();
  if (nodesData.length > 0) inspectNode(nodesData[0].id);

  if (location.hash === '#om-map') goMode(2);
  else if (location.hash === '#triage') goMode(3);
  else if (location.hash === '#studio') goMode(4);
  else goMode(1);
}});
</script>

</body>
</html>
"""

with open(TARGET_HTML, "w", encoding="utf-8") as f:
    f.write(html_code)

print(f"Successfully generated {TARGET_HTML} with full data.")
