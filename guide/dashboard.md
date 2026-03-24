# Visual Debugging Dashboard

The `rnix dashboard` command launches a multi-pane TUI for visual debugging, combining agent tree view, tracing timeline, context heatmap, process details, intent visualization, and more in a single interface.

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

## View Modes

The dashboard supports three view modes for flexible layout control:

| Mode | Description | Key |
|------|-------------|-----|
| **Default** | Standard multi-pane layout (tree + timeline + heatmap) | `d` |
| **Expanded** | Enlarges the focused pane, shrinks others | `e` |
| **Fullscreen** | Shows only the focused pane, fills entire screen | `f` |

Cycle through modes with `v`. The current mode indicator appears in the status bar.

---

## Panes

### Agent Tree Pane

Real-time display of all processes with parent-child relationships:

- Process state indicators: `●` running, `◐` zombie, `○` dead
- Token consumption per process
- Current execution stage (step N/M)
- Expand/collapse subtrees with arrow keys
- Shows process UUID alongside PID for unique identification

### Tracing Timeline Pane

Horizontal timeline showing syscall events for the selected agent (or entire Compose workflow):

- **Three-level detail**: press `Enter` on an event to drill down:
  - Level 1: Event category (LLM / Tool / IPC / VFS)
  - Level 2: Event parameters and timing
  - Level 3: Full request/response payload
- Zoom in/out with `+`/`-`
- Scroll with left/right arrows
- Filter by category: `f` → LLM / Tool / IPC / VFS
- LLM calls highlighted with duration annotation

### Context Heatmap Pane

Visualizes the selected agent's context composition:

- Color-coded by source: system prompt / skill instructions / tool results / dialog history
- Area proportional to token count
- Color intensity indicates activity level (active / warm / cold)

### Process Detail Panel

Press `Enter` on a process in the tree to open the detail panel:

- Full process metadata (PID, UUID, PPID, state, provider, model)
- Skills loaded and allowed devices
- Token usage and budget
- Current step and execution progress
- MCP mount information

### Prompt View

Press `p` on a selected process to view the complete prompt:

- System prompt content
- Message history with role indicators
- Token count per message segment
- Formatted for readability with syntax highlighting

### Intent Tree Panel

Press `i` to toggle the Intent Tree visualization:

- Shows the decomposition DAG for declarative intents
- Node states: pending, decomposing, await_confirm, executing, completed, failed
- Dependency edges between sub-intents
- Progress indicators per node

### Security Anomaly Panel

Press `s` to toggle the Immune System anomaly panel (when immune system is enabled):

- Active security alerts with severity levels
- Behavior baseline deviations
- Threat signatures matched
- Suspended process list

### Distributed Tracing Panel

Press `t` to toggle the distributed tracing panel:

- Span tree visualization for cross-process causal tracing
- Trace ID and span hierarchy
- Duration and token usage per span
- Critical path highlighting

### Multi-Agent Evaluation Panel

Press `m` to toggle the multi-agent evaluation view:

- Agent reputation scores
- Collaboration topology
- Skill synergy data
- SLA compliance metrics

---

## History View

Press `h` to switch to history view mode. Browse ended processes:

- Process list sorted by completion time
- PID, UUID, provider/model, exit code, tokens used, elapsed time
- Select a historical process to view its:
  - Full step recording (StepRecord)
  - Context at completion
  - LLM conversation history

### LLM Conversation Viewer

Press `c` on a selected process (running or historical) to view the full LLM conversation:

- Complete message exchange with the LLM
- Role indicators (system, user, assistant, tool)
- Token count per message
- Timestamp and step correlation

---

## Navigation

### Top to Dashboard Navigation

From `rnix top`, press `d` to switch directly to the dashboard, carrying the current process selection. From dashboard, press `t` to return to `rnix top`.

---

## Interactive Operations

| Key | Action |
|-----|--------|
| `↑`/`↓` | Navigate agent tree |
| `Enter` | Select agent / drill into detail |
| `Tab` | Switch between panes |
| `k` | Kill selected process |
| `g` | Attach gdb to selected process |
| `l` | View log for selected process |
| `r` | Start recording selected process |
| `p` | View prompt for selected process |
| `c` | View LLM conversation for selected process |
| `i` | Toggle Intent Tree panel |
| `s` | Toggle Security Anomaly panel |
| `t` | Toggle Distributed Tracing panel |
| `m` | Toggle Multi-Agent Evaluation panel |
| `h` | Switch to History view |
| `v` | Cycle view modes (Default → Expanded → Fullscreen) |
| `d` | Switch to Default view |
| `e` | Switch to Expanded view |
| `f` | Filter timeline by category / switch to Fullscreen |
| `+`/`-` | Zoom timeline |
| `q` | Quit dashboard |

Selecting an agent in the tree **links** all panels to show that agent's data.

---

## Step Recording

The dashboard integrates with the Step Recording system. Each `reasonStep` is recorded as a `StepRecord` containing:

- Step number and timestamp
- LLM messages and responses
- Token count per step
- Tool calls with inputs and results
- Action type (tool_call, plan, spawn, complete, etc.)
- Step summary

Step records are persisted as NDJSON in `.rnix/data/steps/<uuid>/steps.jsonl` and can be browsed in the History view.

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
- [Security](/guide/security) — Immune system configuration
