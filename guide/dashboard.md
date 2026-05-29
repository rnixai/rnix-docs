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
│   ├─ ● PID 5 analyst   │  ██████    Open Read Write Close      │
│   ├─ ⏸ PID 6 doc-gen   │       ████████ LLM call (5.2s)        │
│   └─ ○ PID 7 checker   │                    ██ tool call        │
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

- Process state indicators: `●` running, `⏸` paused, `◐` zombie, `✕` failed, `○` dead
- Token consumption per process
- Current execution stage (step N/M)
- Expand/collapse subtrees with arrow keys
- Shows process UUID alongside PID for unique identification
- **Subtree pause/resume**: select a parent process and toggle pause to affect the entire subtree

### Tracing Timeline Pane

Horizontal timeline showing syscall events for the selected agent (or entire Compose workflow):

- **Default sort: ascending** — steps are displayed oldest-first, matching debug reading order. Press `o` to toggle between ascending and descending.
- **Three-level detail**: press `Enter` on an event to drill down:
  - Level 1: Event category (LLM / Tool / IPC / VFS)
  - Level 2: Event parameters and timing
  - Level 3: Full request/response payload
- **Tool call aggregation (toolAggGroup)**: 3+ consecutive steps with the same tool are folded into a group (`▶`). Press `Enter` on the group header to expand; press again to collapse. `[`/`]` jump between groups.
- **Cache hit rate column**: each LLM step shows a cache hit % computed with driver-aware semantics (see [LLM Providers](/guide/llm-providers#prompt-caching)).
- **Dynamic context window**: the timeline header shows the context window size for the current model.
- **Stall intensity rendering**: stalled steps show visual intensity indicators — color-coded by duration and severity
- **EXIT severity**: uses authoritative `ExitCode` from the process for exit event coloring
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
- **Heartbeat status**: live, stalled, or paused indicator with stall intensity for degraded processes
- **Pause duration**: for suspended processes, shows elapsed pause time

### Stall Intensity Rendering

When a process stalls (stops sending heartbeats but hasn't exceeded timeout), the detail panel renders visual indicators:

| Level | Indicator | Meaning |
|-------|-----------|---------|
| **Normal** | Green pulse | Heartbeat received within threshold |
| **Stall Warning** | Yellow pulse | Heartbeat overdue, process may be stuck on a long operation |
| **Stall Critical** | Red pulse | Heartbeat significantly overdue, may require intervention |

Stall detection is passive (warn-only) — the dashboard reports status but does not automatically intervene.

### Prompt View

Press `P` (Shift+P) on a selected step in the Timeline to inspect the LLM prompt at that point. The Prompt Viewer has three tabs:

- **Messages**: Conversation history with role indicators (system, user, assistant, tool). For CLI driver processes (Claude CLI, Cursor CLI), the initial user intent is automatically seeded as the first message.
- **System**: Full system prompt content loaded for this process, including agent instructions and skill bodies.
- **Tools**: Details of the tool invoked at this step — name, description, path/parameters, input JSON, result output, error (if any), and execution duration. This information is sourced from the StepRecord, matching what the Timeline displays.

Navigate between tabs with `←`/`→` or click the tab headers. Step through the timeline with `↑`/`↓` to compare prompts across steps.

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

## Unified Process Tree (with History)

The Agent Tree pane shows **all** processes — running, completed, failed, and suspended — in a single unified view. There is no separate history mode; dead processes appear alongside active ones.

- Columns: PID, state indicator (`●` running, `⏸` paused, `✓` done, `✕` failed), agent/model, tokens, elapsed, exit code, reason
- **Elapsed time freezing**: when a process is paused (SIGPAUSE), its elapsed timer freezes at `PausedAt - CreatedAt` instead of continuing to advance. The timer resumes counting when the process is resumed (SIGRESUME).
- Summary bar: Running / Done / Failed / Suspended counts, total tokens, average lifetime
- Sort modes: by time (newest first, active before dead), by PID, or by state
- Historical processes are loaded from persisted data in `.rnix/data/steps/<uuid>/proc-info.json`
- Dead subtrees can be collapsed/expanded for cleaner navigation
- Select any process (alive or dead) to view its full observation data:
  - **Detail panel** — PID, UUID, provider/model, state, skills, tokens, heartbeat status
  - **Timeline** — events loaded from `events.jsonl` on disk
  - **Heatmap** — context snapshot from `ctx-profile.json`
  - **Steps/LLM** — reasoning steps from `steps.jsonl` + system prompt from `process-meta.json`

### Resumable Process Listing

Press `R` (Shift+R) to filter the tree to show only resumable processes — Suspended, Zombie, and Dead processes with persisted data on disk. From this view, press `Enter` on a process to resume it.

### LLM Conversation Viewer

Press `L` (Shift+L) on a selected process (running or historical) to enter the full-screen LLM conversation viewer:

- Step-by-step navigation (`h`/`l` or `←`/`→`) through reasoning steps
- Each step shows the complete LLM request and response
- Role indicators (system, user, assistant, tool) with token counts
- For historical (dead) processes, data is loaded from `steps.jsonl` on disk
- Step list panel shows action type, token count, and duration per step
- Press `Esc` to return to the previous view

---

## Debug Mode

Press `d` to enter debug mode — a dedicated view combining real-time strace events with context profiling:

- **Strace pane** — live syscall event stream (Open, Read, Write, Close) with timing and device annotations
- **Context profile pane** — segment-level context heatmap and budget analysis
- **Device latency stats** — per-device average latency and error counts
- For historical processes, events are loaded from `events.jsonl` on disk

### Debug Mode Keybindings

| Key | Action |
|-----|--------|
| `j`/`k` | Navigate events |
| `s` | Toggle strace stream |
| `S` (Shift+S) | Toggle step-mode display |
| `f` | Filter events by category |
| `v` | Expand event detail |
| `Tab` | Switch between strace and context panes |
| `d` or `Esc` | Exit debug mode |

---

## Navigation

### V2.1 Key Bindings

The dashboard follows V2.1 navigation conventions:

| Key | Context | Action |
|-----|---------|--------|
| `j`/`↓` | Tree, Timeline, History | Move down one visible row (skips collapsed group internals) |
| `k`/`↑` | Tree, Timeline, History | Move up one visible row |
| `Enter` | Timeline | **Context-aware**: on group header → toggle fold; on leaf → drill-in (Level 2 expand) |
| `[` | Timeline | Dual-mode: no search → jump to previous group; search active → previous match |
| `]` | Timeline | Dual-mode: no search → jump to next group; search active → next match |
| `e` | Timeline | Expand all steps — **sticky**: new steps auto-expand |
| `E` (Shift+E) | Timeline | Expand errors-only — sticky mode showing only error steps |
| `C` | Timeline | Collapse all steps |

### Pane Navigation

| Key | Action |
|-----|--------|
| `1`–`8` | Jump directly to pane by number |
| `Tab` | Cycle focus to next pane |
| `Shift+Tab` | Cycle focus to previous pane |
| `z` | Expand focused pane / restore layout |

### Scrolling (Tree, Timeline, History)

| Key | Action |
|-----|--------|
| `j`/`↓` | Move down one item |
| `k`/`↑` | Move up one item |
| `PgDn` | Page down |
| `PgUp` | Page up |
| `g`/`Home` | Jump to top |
| `G`/`End` | Jump to bottom |

### Timeline-Specific

| Key | Action |
|-----|--------|
| `Enter` | Context-aware: fold toggle or drill-in |
| `v` | Expand step detail (L2) |
| `V` (Shift+V) | Debug detail (L3) |
| `e` | Expand all — sticky |
| `E` (Shift+E) | Expand errors-only — sticky |
| `C` | Collapse all |
| `o` | Toggle sort direction (ascending ↑ default / descending ↓) |
| `[` | Jump to previous group / search match |
| `]` | Jump to next group / search match |
| `n` | Jump to next error |
| `N` (Shift+N) | Jump to previous error |
| `P` (Shift+P) | Open prompt viewer for selected step |
| `f` | Enter filter mode |

### Filter Mode (press `f` in Timeline)

| Key | Action |
|-----|--------|
| `T` | Toggle tool_call steps |
| `P` | Toggle plan steps |
| `A` | Toggle text steps |
| `C` | Toggle complete steps |
| `S` | Toggle spawn steps |
| `R` | Toggle replan steps |
| `Z` | Toggle specialize steps |
| `*` | Enable all |
| `Esc` | Exit filter mode |

### Top to Dashboard Navigation

From `rnix top`, press `d` to switch directly to the dashboard, carrying the current process selection.

---

## Interactive Operations

| Key | Action |
|-----|--------|
| `p` | Pause/resume selected process (toggle SIGPAUSE/SIGRESUME) |
| `P` (Shift+P) | Pause/resume entire subtree (SignalTree with propagation) |
| `K` (Shift+K) | Kill selected process |
| `R` (Shift+R) | Resume suspended process (from persisted state) |
| `l` | View log for selected process |
| `r` | Toggle recording for selected process |
| `a` | Toggle alerts panel |
| `L` (Shift+L) | Open LLM conversation viewer |
| `d` | Enter Debug mode |
| `?` | Show keyboard shortcut help overlay |
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

- [Process Resume](/guide/process-resume) — Pause, resume, and process recovery
- [Debugging](/guide/debugging) — strace and gdb
- [Distributed Tracing](/guide/distributed-tracing) — Trace IDs and blame analysis
- [Time-Travel Debugging](/guide/time-travel) — Recording and replay
- [Monitoring](/guide/monitoring) — rnix top, heartbeat monitor, and supervisor trees
- [Security](/guide/security) — Immune system configuration
