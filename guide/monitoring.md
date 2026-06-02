# Monitoring & Supervisor

Real-time process monitoring, categorized reasoning logs, token budget management, heartbeat monitor, supervisor trees, and init bootstrap.

---

## rnix top — Real-Time Monitor

```bash
$ rnix top
```

```
rnix top — Real-time Monitor                        Refresh: 1s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PID  PPID  STATE     AGENT         TOKENS   ELAPSED  INTENT
1    0     running   code-analyst  2,340    4.5s     Analyze code quality
2    1     running   default       890      2.1s     Check dependencies
3    0     zombie    —             1,567    8.3s     Security scan
4    0     paused    doc-writer    450      1.2s     Generate docs (paused)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Processes: 4 | Running: 2 | Zombie: 1 | Paused: 1
Tokens: 5,247 | Elapsed: 8.3s
```

**Interactive operations:**
- Navigate with arrow keys
- `k` — kill selected process
- `d` — view process details (switches to dashboard)
- `s` — attach strace
- `p` — pause/resume selected process
- `q` — quit

Paused processes (`⏸`) appear with their elapsed timer frozen at the moment of pause. The heartbeat monitor skips paused processes — they intentionally stop sending heartbeats.

---

## Heartbeat Monitor

The heartbeat monitor tracks process liveness through heartbeat timestamps. It operates in **passive (warn-only) mode** — detecting stalls but never automatically intervening.

### Design Philosophy

Heartbeat monitoring is observational, not interventional. This is an intentional architectural decision: the daemon never takes destructive action based on heuristics.

- **Warn-only**: Emits `ProcessStalled` events and log warnings, but does **not** auto-suspend, cancel steps, or terminate processes
- **No auto-recovery**: Supervisor trees handle crash recovery; heartbeat is the detection layer only
- **Paused process exemption**: Processes in SIGPAUSE state are explicitly skipped — they've intentionally stopped their reasoning loop
- **Continuous observation**: Stall records persist until the process exits or heartbeat recovers — consecutive stall count grows without limit (5, 6, 7, ...) providing increasing severity signal

### Stall Escalation Levels

The monitor checks each process every 30 seconds (configurable). When a heartbeat gap exceeds the process's `StepTimeout`:

| Level | Consecutive Stalls | Action Label | Actual Behavior |
|-------|-------------------|--------------|-----------------|
| **Warning** | 1–2 | `warn` | Log warning, emit `ProcessStalled` event |
| **Elevated** | 3 | `cancel_step` | Log "(would cancel step, passive mode, no action)" |
| **Critical** | 4+ | `suspend` | Log "(would suspend, passive mode, no action)" |

All levels emit `ProcessStalled` events with the action label for Dashboard and observability consumption. No destructive action is taken at any level.

### Stall Detection

| Status | Condition | Dashboard Indicator |
|--------|-----------|---------------------|
| **Healthy** | Last heartbeat within step timeout | Green pulse |
| **Stall Warning** | 1–2 consecutive stalls | Yellow pulse |
| **Stall Critical** | 3+ consecutive stalls | Red pulse with intensity bar |

### Dashboard Stall Heatmap

The Dashboard detail pane renders a visual stall intensity indicator:

- **Color mapping**: `< 3` consecutive stalls → warning (yellow), `≥ 4` → error (red)
- **Intensity bar**: Filled proportionally to `min(consecutiveStalls, 4) / 4`
- **Live status**: Queried via IPC `heartbeat_status` method, which returns running state, check interval, total detections, and per-process stall details

### Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `checkInterval` | `duration` | `30s` | How often to check all processes |
| `StepTimeout` | `duration` | per-process | Heartbeat gap threshold for stall detection (`0` = disabled) |

### Script-Runner Heartbeats

Script-runner processes maintain heartbeats for their full lifetime — not just during active execution. This prevents false stall detection during idle periods between script steps.

---

## Daemon Status

```bash
$ rnix daemon status
[daemon] status: running
[daemon] pid: 12345
[daemon] socket: /run/user/1000/rnix/rnix.sock
[daemon] version: rnix v0.10.0 (commit: abc1234, built: 2026-05-28)
[daemon] uptime: 3h 22m
[daemon] processes: 5 running, 2 suspended, 12 history
```

The daemon reports:
- **Version**: Three-source fallback (build info → VERSION file → git describe)
- **Build metadata**: Commit hash and build timestamp
- **Process counts**: Running, suspended, and historical (dead/zombie) process counts

---

## rnix log — Reasoning Logs

View an agent's reasoning process with categorized output:

```bash
$ rnix log <pid>
[think] Analyzing the main.go file structure...
[tool]  Open(/dev/fs/./src/main.go) → read 2,048 bytes
[think] Found 3 potential issues in error handling...
[tool]  Open(/dev/shell) → ran "golangci-lint run ./..."
[output] ## Code Quality Report
         1. Missing error wrapping on line 45...
```

**Categories:**
- `[think]` — LLM reasoning (internal thoughts)
- `[tool]` — Tool calls (VFS operations)
- `[output]` — Final output to user

**Filtering:**

```bash
rnix log <pid> --filter think    # Only reasoning
rnix log <pid> --filter tool     # Only tool calls
rnix log <pid> --filter output   # Only output
```

---

## Token Budget Management

Set per-agent or per-workflow token limits:

**CLI override:**
```bash
rnix -i "Analyze code" --max-tokens 10000
```

---

## Supervisor Trees

Supervisor trees provide automatic crash recovery for critical agent processes:

### Restart Strategies

| Strategy | Behavior |
|----------|----------|
| `one_for_one` | Restart only the failed process |
| `one_for_all` | Restart all processes in the group when one fails |
| `rest_for_one` | Restart the failed process and all processes started after it |

### Configuration

Define supervisor trees in `init.yaml`:

```yaml
services:
  critical-worker:
    intent: "Process incoming tasks"
    restart: always
    max_restarts: 5
    restart_strategy: one_for_one

  dependent-worker:
    intent: "Post-process results"
    restart: on-failure
    depends_on:
      - critical-worker
```

### Supervisor Behavior

- **`always`**: Restart on any exit (success or failure)
- **`on-failure`**: Restart only on non-zero exit
- **`no`**: Never restart (default)
- **`max_restarts`**: Cap on restart attempts within the daemon session

Supervisors integrate with the heartbeat monitor — restarted processes re-register their heartbeat automatically.

---

## Related Documentation

- [Dashboard](/guide/dashboard) — Visual monitoring with heartbeat status and stall indicators
- [Process Resume](/guide/process-resume) — Pause/resume and process recovery
- [Debugging](/guide/debugging) — strace and gdb for deep inspection
- [Configuration](/guide/configuration) — init.yaml supervisor configuration
- [Security](/guide/security) — Immune system anomaly detection
