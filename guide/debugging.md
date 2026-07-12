# Debugging (strace & gdb)

Rnix provides a comprehensive debugging toolkit inspired by Unix and GDB, enabling deep inspection of AI agent behavior at the syscall level.

---

## strace — Syscall Tracing

Trace every syscall an agent makes in real-time, from any terminal.

```bash
$ rnix strace <pid>
[strace] attached to PID 1 (state: running)
[  0.013s] Open(path="/dev/llm/claude") → 3    1ms
[  0.014s] Write(fd=3, size=1234) → <nil>    5.20s  ← LLM call
[  5.214s] Read(fd=3, length=65536) → 892B    2ms
[  5.216s] Open(path="/dev/fs/./src/main.go") → 4    1ms
[  5.217s] Write(fd=4, size=56) → <nil>    0µs
[  5.217s] Read(fd=4, length=1048576) → 2048    1ms
[  5.218s] Close(fd=4) → <nil>    0µs
[strace] detached from PID 1 (process exited)
```

**Key features:**
- Cross-terminal attach — trace any process from any terminal
- Automatic annotation — `← LLM call` for `/dev/llm/` ops, `← slow operation` for >1s ops
- Non-blocking — event buffer (256) silently drops when full, never blocking the agent
- Three output modes: default (formatted), `--verbose` (full args), `--json` (machine-readable)
- SIGINT only detaches tracing, does not affect the traced process

---

## Raw LLM I/O {#raw-llm-io}

`strace` shows that an LLM call happened; `--raw` shows exactly what was sent and received. For every LLM call, Rnix can record the raw request and response and let you replay it afterward:

- **API-based providers** — the HTTP request (URL, headers, body) and response, with parameters such as `reasoning_effort` and `thinking_budget` visible exactly as transmitted.
- **CLI-based providers** — the full command invocation (arguments and stdin) plus stdout, stderr, and exit code.

```bash
$ rnix strace <pid> --raw            # every captured LLM call
$ rnix strace <pid> --raw --step 3   # a single reasoning step
```

**Key points:**
- Credentials (authorization headers, API keys, tokens) are automatically redacted before anything is written.
- Capture is enabled by default, bounded by a size limit, and subject to the same retention policy as other process history — so it works for both live and already-finished processes.
- **Failed calls are recorded too** — a call that errors out is captured with an `outcome: error` marker and the error text, rendered as a `⚠ outcome: error — <error>` line above the response. Failure is exactly when you most want the real request back, so a primary failure followed by a successful fallback leaves two records for the same step.
- The same captures are available from the Dashboard inspector's **Raw I/O** view and over IPC, sharing one backend.

See [Configuration › Raw Capture](/guide/configuration#raw-capture) for the `raw_capture` config keys.

---

## Orchestration Exit Codes

When a process orchestrates sub-tasks, its exit code reflects **genuine** failure, not incidental noise. As of 0.11.0:

- A process that completes successfully **no longer reports a failed exit code merely because of a handled, non-fatal tool error**. A tool call that erred but was recovered from does not, by itself, fail the parent.
- Failure is driven by real signals instead: a genuine child-task failure, or **repeated** tool errors that trip the cumulative tool-error breaker.

This makes a non-zero exit code a reliable signal that something actually went wrong, so `rnix wait` and CI gates can trust it.

---

## gdb — Interactive Debugger

Attach to a running agent for interactive debugging with breakpoints, stepping, and runtime inspection.

### Attach / Detach

```bash
$ rnix gdb <pid>
[gdb] attached to PID 1 (state: running, step 3/10)
(rnix-gdb) help
  break <type> [args]  - Set breakpoint
  continue             - Resume execution
  step [syscall|reason] - Step forward
  inspect <target>     - Inspect state
  set <target> <value> - Modify runtime parameter
  detach               - Detach and resume
(rnix-gdb)
```

Detach lets the agent continue running normally.

### Breakpoint Types

Four breakpoint types cover different debugging scenarios:

| Type | Syntax | Trigger |
|------|--------|---------|
| **Syscall** | `break syscall Open` | When a specific syscall is invoked |
| **Reasoning** | `break reason` | Before each LLM call |
| **Quality** | `break quality "must contain code examples"` | When output fails quality check |
| **Budget** | `break budget 5000` | When token consumption reaches threshold |

**Quality breakpoints** support two evaluation modes:
- **Pattern matching** — keywords or regex that output must contain/not contain
- **LLM evaluation** — natural language quality criteria evaluated by a lightweight model (haiku), triggering when not satisfied

```
(rnix-gdb) break syscall Write
Breakpoint 1 set: syscall Write
(rnix-gdb) break quality "output must include error handling recommendations"
Breakpoint 2 set: quality (LLM-evaluated)
(rnix-gdb) continue
[breakpoint 1] Write(fd=3, size=2048) at step 4
(rnix-gdb)
```

### Step Execution

Step through agent execution one syscall or one reasoning step at a time:

```
(rnix-gdb) step syscall
[step] Open(path="/dev/fs/./main.go") → FD(4)    1ms
(rnix-gdb) step reason
[step] Reasoning step 5/10 complete (tokens: 342)
```

### State Inspection

Inspect any aspect of the agent's runtime state:

```
(rnix-gdb) inspect context
SystemPrompt: "You are a code analyst..."  (1,245 tokens)
Messages: 8 entries (user: 3, assistant: 3, tool: 2)
Total tokens: 4,567 / budget: 8,192

(rnix-gdb) inspect fds
FD  Path                  Flags
3   /dev/llm/claude       O_RDWR
4   /dev/fs/./src/main.go O_RDWR

(rnix-gdb) inspect skills
Skills: [code-analysis, security-scan]
AllowedDevices: [/dev/fs, /dev/shell, /dev/llm/claude]
```

### Hot Modification

Modify runtime parameters without restarting the agent:

```
(rnix-gdb) set model opus
Model changed: sonnet → opus (effective next LLM call)

(rnix-gdb) set context.system_prompt "Updated instructions..."
System prompt updated (effective next reasoning step)

(rnix-gdb) set budget 10000
Budget changed: 8192 → 10000
```

Modifiable parameters: model, system prompt, context messages, skill references, environment variables, token budget. Changes take effect on the next reasoning step.

---

## Script-Runner Observability

When agents execute AgentShell scripts (`.ash` files), Rnix emits structured events to `events.jsonl`, providing full visibility into script execution flow.

### Event File

Script events are written as NDJSON (newline-delimited JSON) to:

```
.rnix/data/steps/<process-uuid>/events.jsonl
```

Each line is a self-contained JSON object with immediate flush for real-time availability.

### Event Types

| Event | Trigger | Purpose |
|-------|---------|---------|
| `ScriptStmtBegin` | At every statement entry | Marks statement start (while, spawn, if, pipeline, export, etc.) |
| `ScriptStmtEnd` | At every statement exit | Marks completion with success/error/stop status |
| `ScriptSpawn` | Before `spawn` execution | Captures agent spawn intent |
| `ScriptWhileIter` | Each while-loop iteration | Tracks iteration count (1-based) |
| `ScriptCondition` | After condition evaluation in `if`/`while` | Records condition result (true/false) and operand values |

### Event Schema

```json
{
  "ts_ms": 1050.5,
  "pid": 12345,
  "syscall": "ScriptWhileIter",
  "args": {
    "line": 12,
    "iteration": 1,
    "condition": "$N != 5"
  },
  "dur_ms": 0,
  "trace_id": "",
  "span_id": ""
}
```

| Field | Description |
|-------|-------------|
| `ts_ms` | Milliseconds since process start |
| `pid` | Process ID |
| `syscall` | Event type (one of the 5 Script* types) |
| `args` | Event-specific metadata — always includes `line` (1-based source line) |
| `dur_ms` | Always `0` for script events |

### Dashboard Integration

The Dashboard Timeline pane renders script events in real-time with formatted summaries:

```
L12 ▸ while                          (statement begin)
L12 ↻ while iter=1 ($N != 5)        (loop iteration)
L12 ? $N != 5 → T                   (condition evaluated true)
L47 ↳ spawn "build hello" → $r      (agent spawn)
L47 ✓ spawn                         (statement completed)
```

Events are fetched every ~500ms via IPC and deduplicated using a per-UUID watermark. Three or more consecutive same-type events are folded into collapsible groups to keep the timeline readable.

### Viewing Events

Events can be consumed through:

1. **Dashboard** — Real-time Timeline pane with formatted display and aggregation
2. **IPC** — `list_events` method returns all events for a process by PID or UUID
3. **Direct file access** — Read `events.jsonl` from `.rnix/data/steps/<uuid>/`

---

## Related Documentation

- [Time-Travel Debugging](/guide/time-travel) — Record, replay, and fork-continue
- [Distributed Tracing](/guide/distributed-tracing) — Cross-process causal tracing
- [Visual Dashboard](/guide/dashboard) — Multi-pane TUI debugging
- [Regression Testing](/guide/testing) — Automated behavior testing
- [Reference Manual](/reference/) — Complete syscall and CLI command details
