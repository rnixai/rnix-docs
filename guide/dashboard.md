# Visual Debugging Dashboard

The `rnix dashboard` command launches a multi-pane TUI for visual debugging, combining agent tree view, tracing timeline, and context heatmap in a single interface.

---

## Overview

```bash
$ rnix dashboard
```

```
┌─ Agent Tree ──────────┬─ Tracing Timeline ─────────────────────┐
│                        │                                        │
│ ● PID 1 (running)      │ [0.0s]─────[3.8s]─────[8.0s]──[10.5s]│
│   ├─ PID 5 analyst ●   │  ██████    Open Read Write Close      │
│   ├─ PID 6 doc-gen ◐   │       ████████ LLM call (5.2s)        │
│   └─ PID 7 checker ○   │                    ██ tool call        │
│                        │                                        │
├────────────────────────┼────────────────────────────────────────┤
│ Context Heatmap        │ Details                                │
│ ████ System prompt 27% │ PID 5: code-analyst                   │
│ ███  Skill bodies  19% │ State: running, Step: 4/10            │
│ ████ Dialog        21% │ Tokens: 2,340 / 8,192                 │
│ █████ Tool results 32% │ Skills: code-analysis, security-scan  │
└────────────────────────┴────────────────────────────────────────┘
```

---

## Panes

### Agent Tree Pane

Real-time display of all processes with parent-child relationships:

- Process state indicators: `●` running, `◐` zombie, `○` dead
- Token consumption per process
- Current execution stage (step N/M)
- Expand/collapse subtrees with arrow keys

### Tracing Timeline Pane

Horizontal timeline showing syscall events for the selected agent (or entire Compose workflow):

- Zoom in/out with `+`/`-`
- Scroll with left/right arrows
- Filter by category: `f` → LLM / Tool / IPC / VFS
- LLM calls highlighted with duration annotation

### Context Heatmap Pane

Visualizes the selected agent's context composition:

- Color-coded by source: system prompt / skill instructions / tool results / dialog history
- Area proportional to token count
- Color intensity indicates activity level (active / warm / cold)

---

## Interactive Operations

| Key | Action |
|-----|--------|
| `↑`/`↓` | Navigate agent tree |
| `Enter` | Select agent (links all panes) |
| `k` | Kill selected process |
| `g` | Attach gdb to selected process |
| `l` | View log for selected process |
| `r` | Start recording selected process |
| `f` | Filter timeline by category |
| `+`/`-` | Zoom timeline |
| `q` | Quit dashboard |

Selecting an agent in the tree **links** the timeline and heatmap to show that agent's data.

---

## Offline Replay

Load persisted recording files for offline analysis:

```bash
$ rnix dashboard --replay <record-id>
```

Provides the same multi-pane view with full navigation through historical data, without needing a running daemon.

---

## Related Documentation

- [Debugging](/guide/debugging) — strace and gdb
- [Distributed Tracing](/guide/distributed-tracing) — Trace IDs and blame analysis
- [Time-Travel Debugging](/guide/time-travel) — Recording and replay
- [Monitoring](/guide/monitoring) — rnix top process monitor
