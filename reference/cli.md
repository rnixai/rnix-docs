## 4. CLI Command Reference

### 4.1 Global Flags

| Flag | Short | Type | Description |
|------|--------|------|------|
| `--json` | — | `bool` | JSON format output |
| `--verbose` | `-v` | `bool` | Verbose output |
| `--quiet` | `-q` | `bool` | Quiet output |

**Output Mode Priority:** `--json` > `--quiet` > `--verbose` > default

These three flags are registered via `PersistentFlags` and apply to all subcommands.

### 4.2 rnix [intent] — Root Command

```
Usage: rnix [intent]
Arguments: [intent] — arbitrary-length intent string (multiple arguments joined with spaces)
```

**Private Flags:**

| Flag | Short | Type | Default | Description |
|------|--------|------|--------|------|
| `--model` | `-m` | `string` | `""` | LLM model (`sonnet`/`opus`/`haiku`) |
| `--max-steps` | — | `int` | `0` | Maximum reasoning steps (`0` = default 10) |
| `--agent` | — | `string` | `""` | Agent definition name |
| `--provider` | — | `string` | `""` | LLM provider (`claude`/`cursor`) |

**Default Output Example:**

```
[kernel] spawning PID 1 (claude/haiku)...
[agent/1] reasoning step 1...
[agent/1] reasoning step 2...
══ Result ══════════════════════════════════════════════════════════════════════
  Analysis result content...
════════════════════════════════════════════════════════════════════════════════
[kernel] PID 1 exited(0) | claude/haiku | tokens: 1234 | elapsed: 6.2s
```

**JSON Success Response:**

```json
{"ok": true, "data": {"pid": 1, "result": "...", "tokens_used": 1234, "elapsed_ms": 6200, "exit_code": 0}}
```

**JSON Error Response:**

```json
{"ok": false, "error": {"code": "TIMEOUT", "message": "...", "syscall": "Write", "device": "/dev/llm"}}
```

### 4.3 rnix daemon — Daemon Management

```
Usage: rnix daemon [command]
Subcommands:
  status    Show daemon status (running state, version, socket path, process count)
  stop      Stop the running daemon
```

**`rnix daemon status` Output Example:**

```
status:  running
version: 0.1.0
socket:  /run/user/1000/rnix/rnix.sock
procs:   1 active / 3 total
```

**`rnix daemon stop` Output Example:**

```
daemon stopped
```

When the daemon is not running:

```
daemon is not running
```
```

### 4.3 rnix ps — Process List

```
Usage: rnix ps
Arguments: None (cobra.NoArgs)
```

**Four Output Modes:**

**Default Mode — Table Format:**

```
  PID   STATE     SKILL              TOKENS   ELAPSED
─────   ─────────   ───────────────   ────────   ────────
    1   running   code-analysis        456      3.2s
    2   zombie    —                    123      1.1s

1 active, 1 zombie, 2 total
```

**--verbose — With Extra Fields:**

Includes PPID and Intent columns.

**--quiet — One PID Per Line:**

```
1
2
```

**--json — Structured JSON:**

```json
{
  "ok": true,
  "data": {
    "processes": [
      {
        "pid": 1,
        "ppid": 0,
        "state": "running",
        "intent": "Analyze code",
        "skills": ["code-analysis"],
        "tokens_used": 456,
        "elapsed_ms": 3200
      }
    ]
  }
}
```

**When No Active Processes:** `No active processes.`

### 4.4 rnix kill \<pid\> — Process Termination

```
Usage: rnix kill <pid>
Arguments: <pid> — Process ID (decimal number, exactly 1 argument)
Signal: Always sends SIGTERM(1)
```

**Success Output:**

```
[kernel] PID 1: signal sent (SIGTERM)
```

### 4.5 rnix strace \<pid\> — Syscall Tracing

```
Usage: rnix strace <pid>
Arguments: <pid> — Process ID (exactly 1 argument)
```

**Three Output Modes:**

**Default Mode — Formatted Trace Lines:**

```
[strace] attached to PID 1 (state: running)
[  0.013s] Open(flags=2, path="/dev/llm/claude") → 3    1ms
[  0.014s] Write(fd=3, size=1234) → <nil>    5.20s  ← LLM call
[  5.214s] Read(fd=3, length=65536) → 892B      2ms
[  5.216s] Open(flags=2, path="/dev/fs/./src/main.go") → 4    1ms
[  5.217s] Write(fd=4, size=56) → <nil>    0µs
[  5.217s] Read(fd=4, length=1048576) → 2048    1ms
[  5.218s] Close(fd=4) → <nil>    0µs
[strace] detached from PID 1 (process exited)
```

**Annotation Markers:**

- `← LLM call` — operations involving `/dev/llm/` devices
- `← slow op` — operations taking more than 1 second

**--verbose — Full Parameters and Results**

**--json — Per-line JSON (SyscallEventWire Structure):**

```json
{"timestamp_ms": 13, "pid": 1, "syscall": "Open", "args": {"flags": 2, "path": "/dev/llm/claude"}, "result": 3, "duration_ms": 1.0}
```

**SIGINT Behavior:** Only detaches the trace; does not affect the traced process.

### 4.6 rnix version — Version Information

```
Usage: rnix version
```

**Default Output:**

```
rnix v0.1.0
commit:  cd9c568
built:   2026-03-15T07:23:57Z
```

**Dev Build (no ldflags):**

```
rnix v0.1.0-dev
```

**JSON Output:**

```json
{"ok": true, "data": {"version": "0.1.0", "git_commit": "cd9c568", "build_date": "2026-03-15T07:23:57Z"}}
```

### 4.7 JSON Response Format

All commands supporting `--json` use a unified `JSONResponse` wrapper:

```go
type JSONResponse struct {
    OK    bool `json:"ok"`
    Data  any  `json:"data,omitempty"`
    Error any  `json:"error,omitempty"`
}
```

**On Success:** `ok=true`, `data` contains command-specific data

**On Failure:** `ok=false`, `error` contains structured error information:

```go
type jsonErrorData struct {
    Code    string `json:"code"`
    Message string `json:"message"`
    Syscall string `json:"syscall,omitempty"`
    Device  string `json:"device,omitempty"`
}
```

### 4.8 rnix init — Initialize Configuration

Initialize global configuration (`~/.config/rnix/`) and project configuration (`.rnix/`) directories.

```
Usage: rnix init
Arguments: None
```

**Behavior:**

1. **Global init** — Creates `~/.config/rnix/` with subdirectories `agents/`, `skills/`, extracts embedded agents and skills, generates default `providers.yaml` and `config.yaml`
2. **Project init** — Creates `.rnix/` in the current working directory with subdirectories `agents/`, `skills/`, `data/`, and a stub `config.yaml`

If the directories already exist, the corresponding step is skipped with a message.

**Example:**

```
$ rnix init
initialized global config: /home/user/.config/rnix
initialized project config: /path/to/project/.rnix
```

### 4.9 rnix top — Real-time Process Monitor

Interactive TUI showing process tree, status, and resource consumption in real-time.

```
Usage: rnix top
Arguments: None (cobra.NoArgs)
```

**Display:** Full-screen alternate-screen TUI with a summary bar (active count, total tokens, uptime) and a process table showing PID, PPID, STATE, AGENT, TOKENS, and ELAPSED columns. Processes are displayed as a tree hierarchy based on parent-child relationships.

**Keybindings:**

| Key | Action |
|-----|--------|
| `q` / `Ctrl+C` | Quit |
| `j` / `Down` | Move cursor down |
| `k` / `Up` | Move cursor up |
| `Enter` | Show process detail panel |
| `K` | Kill selected process (SIGTERM) |
| `Esc` | Back to list view (from detail) |

**Refresh Rate:** 500ms polling interval.

### 4.10 rnix log \<pid\> — Reasoning Log Viewer

Stream reasoning logs from a running agent, categorized as `[think]`, `[tool]`, and `[output]`.

```
Usage: rnix log <pid>
Arguments: <pid> — Process ID (exactly 1 argument)
```

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--filter` | `string` | `""` | Filter by log category (`think`, `tool`, `output`) |

**Example:**

```
$ rnix log 5
[rnix log] attached to PID 5

[  0.123] [think]  Analyzing the project structure...
[  1.456] [tool]   /dev/fs/./src/main.go → reading file
[  3.789] [output] The project has 3 modules...
```

Press `Ctrl+C` to detach without affecting the traced process.

### 4.11 rnix gdb \<pid\> — Interactive Debugger

Attach to a running agent process and enter an interactive debugging session. Receives both syscall events and reasoning logs in real-time.

```
Usage: rnix gdb <pid>
Arguments: <pid> — Process ID (exactly 1 argument)
```

**Interactive Commands:**

| Command | Description |
|---------|-------------|
| `break syscall <name>` | Break on a specific syscall |
| `break reasoning` | Break before each reasoning step |
| `break quality --pattern <pat>` | Break when LLM output matches pattern |
| `break budget <tokens>` | Break when token usage reaches threshold |
| `delete <bp_id>` | Delete breakpoint by ID |
| `info breakpoints` | List all breakpoints |
| `continue` / `c` | Resume execution after breakpoint |
| `step [syscall\|reasoning]` | Execute next step |
| `inspect context` | Show context info with token estimates |
| `set model <name>` | Override LLM model |
| `set context append <text>` | Append text to context |
| `set skills add <name>` | Add a skill to the agent |
| `record start` / `record stop` | Start/stop recording within session |
| `detach` / `quit` / `q` | Disconnect from debug session |

**Example:**

```
$ rnix gdb 1
[gdb] attached to PID 1 (state=running, intent="Analyze code")
gdb> break syscall Write
[gdb] breakpoint 1 set: syscall Write
gdb> continue
```

### 4.12 rnix dashboard — Visual Debugging Dashboard

Interactive TUI dashboard showing agent tree, timeline, and heatmap in a multi-pane layout.

```
Usage: rnix dashboard
Arguments: None (cobra.NoArgs)
```

**Panes:**

- **Tree pane** — Process tree with status and token usage
- **Timeline pane** — Scrollable event timeline with categorized syscall events (LLM, Tool, IPC, VFS, Error)
- **Heatmap pane** — Context budget visualization with segment classification (system, skill, tool, user, assistant, leaked)

**Navigation:** Use tab to switch panes, arrow keys to scroll within panes, `p` to pause/resume the selected process tree, `q` to quit.

### 4.13 rnix record — Execution Recording

Record execution events (syscalls, LLM responses, context changes, state transitions) for offline analysis and time-travel debugging.

```
Usage: rnix record <start|stop|list> [pid]
Subcommands:
  start <pid>   Start recording events for the given process
  stop <pid>    Stop recording and persist to disk
  list          List all recorded sessions
```

**Examples:**

```
$ rnix record start 1
Recording started for PID 1 (record-id: 1-1709856000)

$ rnix record stop 1
Recording stopped for PID 1 (42 events captured)

$ rnix record list
RECORD-ID            PID    STATUS       EVENTS   START                INTENT
1-1709856000         1      completed    42       2026-03-15 10:00:00  Analyze code
```

### 4.14 rnix replay \<record-id\> — Replay Recorded Trace

Load a recorded execution trace and enter an interactive replay session. Reads local recording files and does not require a running daemon.

```
Usage: rnix replay <record-id>
Arguments: <record-id> — Recording identifier (exactly 1 argument)
```

**Interactive Commands:**

| Command | Description |
|---------|-------------|
| `next` / `n` | Forward one event |
| `prev` / `p` | Backward one event |
| `goto <seq_num>` | Jump to event by sequence number |
| `list` / `l` | Show events around current position |
| `diff <seq1> <seq2>` | Compare context at two time points |
| `fork` | Fork from current position for re-execution |
| `info` / `i` | Show recording summary |
| `quit` / `q` | Exit replay |

**Example:**

```
$ rnix replay 42-1709856000
[replay] Loading record 42-1709856000...
[replay] PID: 42 | Intent: "Analyze code" | Events: 15 | Status: completed
replay> next
```

### 4.15 rnix trace — Distributed Trace Viewer

View distributed trace data from completed Compose orchestrations. Trace data is read from local `.rnix/traces/` directory (no daemon required).

```
Usage: rnix trace [trace-id]
Arguments: [trace-id] — Optional trace identifier (0 or 1 argument)
```

Without arguments, lists all available traces. With a trace-id, shows the full span tree with timing and token usage.

**Subcommand: `rnix trace blame <trace-id>`**

Analyze a distributed trace to identify performance bottlenecks and error root causes. Shows critical path analysis, duration/token hotspots, and error propagation chains.

```
Usage: rnix trace blame <trace-id>
Arguments: <trace-id> — Trace identifier (exactly 1 argument)
```

**Examples:**

```
$ rnix trace
TRACE-ID             SPANS  DURATION  STATUS
abcdef1234567890     5      12.3s     completed

$ rnix trace abcdef1234567890 --verbose
$ rnix trace blame abcdef1234567890
```

### 4.16 rnix ctx-profile \<pid\> — Context Usage Analyzer

Analyze the context of a running or zombie agent process. Shows context classification (active/warm/cold/leaked), identifies top token consumers, and provides optimization suggestions.

```
Usage: rnix ctx-profile <pid>
Arguments: <pid> — Process ID (exactly 1 argument)
```

Requires a running daemon (context data lives in the daemon's memory).

**Example:**

```
$ rnix ctx-profile 1
$ rnix ctx-profile 1 --json
```

### 4.17 rnix ctx-growth \<pid\> — Context Growth Predictor

Predict token growth trend for a running agent process. Shows historical growth rate, predicts budget exhaustion timing, and displays alert status when remaining budget drops below 20%.

```
Usage: rnix ctx-growth <pid>
Arguments: <pid> — Process ID (exactly 1 argument)
```

Requires a running daemon (token history lives in the daemon's memory).

**Example:**

```
$ rnix ctx-growth 1
$ rnix ctx-growth 1 --json
```

### 4.18 rnix compose — Multi-Agent Orchestration

Manage multi-agent workflows defined in `compose.yaml`.

**Subcommand: `rnix compose up`**

Parse `compose.yaml`, resolve dependencies, and spawn all agents in DAG order.

```
Usage: rnix compose up
```

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--file` | `-f` | `string` | `compose.yaml` | Compose file path |

**Subcommand: `rnix compose down`**

Stop all running agents from the compose orchestration and release resources.

```
Usage: rnix compose down
```

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--file` | `-f` | `string` | `compose.yaml` | Compose file path |

**Examples:**

```
$ rnix compose up
$ rnix compose up -f my-workflow.yaml
$ rnix compose down
$ rnix compose down -f my-workflow.yaml --json
```

### 4.19 rnix suspend \<pid\> — Suspend Agent Process

Suspend a running agent process by sending SIGPAUSE. The reasoning loop pauses at the start of the next step and blocks until SIGRESUME is received. The process remains in `StateRunning` while paused — this is distinct from checkpoint-based suspension.

```
Usage: rnix suspend <pid>
Arguments: <pid> — Process ID (exactly 1 argument)
```

**Success Output:**

```
[kernel] PID 1: signal sent (SIGPAUSE)
```

**Note:** To pause/resume an entire process tree (including descendants), use the dashboard `p` key which calls `SignalTree`.

### 4.20 rnix resume \<pid|uuid\> — Resume Suspended Process

Resume a suspended agent process from its checkpoint. This command is for checkpoint-based resume (from `StateSuspended`), not for unpausing a SIGPAUSE-paused process — use SIGRESUME for that (via dashboard `p` key or `rnix kill <pid>` with signal 5).

```
Usage: rnix resume <pid|uuid>
Arguments: <pid|uuid> — Process ID or UUID (exactly 1 argument)
```

Supports both PID (for running daemon processes) and UUID (for resuming from persisted checkpoints).

### 4.21 rnix heartbeat — Heartbeat Monitor

Heartbeat monitor management. The monitor tracks liveness of running processes by checking heartbeat timestamps. Paused processes (SIGPAUSE active) are explicitly skipped — they intentionally stop sending heartbeats while the reasoning loop is blocked.

**Subcommand: `rnix heartbeat status`**

Show heartbeat monitor status for all active processes.

```
Usage: rnix heartbeat status
Arguments: None (cobra.NoArgs)
```

### 4.22 rnix apply \<intent\> — Declarative Intent Decomposition

Declare a high-level intent. The system decomposes it into a sub-intent tree (Intent Tree), each sub-intent maps to one or more agent processes.

```
Usage: rnix apply <intent>
Arguments: <intent> — Intent string (exactly 1 argument)
```

**Flags:**

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--yes` | `-y` | `bool` | `false` | Skip confirmation and start execution immediately |
| `--update` | `-u` | `string` | `""` | Incremental update an existing intent |

With `--update`, performs incremental merge of new sub-intents into an existing intent tree without re-decomposing completed nodes.

**Examples:**

```
$ rnix apply "build a REST API for user management"
$ rnix apply "build a REST API" --yes
$ rnix apply "add comments feature" --update intent-1
```

### 4.23 rnix intent — Intent Management

Commands for managing declarative intent trees.

**Subcommand: `rnix intent status [intent-id]`**

Display the current state of an intent tree: overall progress, per-node completion, and active agents. Without an argument, shows all active intents.

```
Usage: rnix intent status [intent-id]
Arguments: [intent-id] — Optional intent identifier (0 or 1 argument)
```

**Subcommand: `rnix intent list`**

Display a table of all intents (active + completed).

```
Usage: rnix intent list
Arguments: None
```

**Examples:**

```
$ rnix intent status
$ rnix intent status intent-1
$ rnix intent list --json
```

### 4.24 rnix skill — Skill Package Management

Install, update, and manage skills from the community registry.

**Subcommand: `rnix skill install <name> [name...]`**

Download and install one or more skills from the community skill registry.

```
Usage: rnix skill install <name> [name...]
Arguments: One or more skill names (minimum 1)
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--force` | `bool` | `false` | Force install even if already installed |

**Subcommand: `rnix skill search [keyword]`**

Search for skills in the community registry by keyword. Without arguments, browses all available skills.

```
Usage: rnix skill search [keyword]
Arguments: [keyword] — Optional search keyword (0 or 1 argument)
```

**Subcommand: `rnix skill update [name...]`**

Check for updates and update installed skills from the community registry. Without arguments, updates all installed community skills.

```
Usage: rnix skill update [name...]
Arguments: Zero or more skill names
```

**Subcommand: `rnix skill list`**

List all locally available skills, including system built-in skills and community-installed skills.

```
Usage: rnix skill list
Arguments: None (cobra.NoArgs)
```

**Examples:**

```
$ rnix skill install code-analysis
$ rnix skill search code
$ rnix skill update
$ rnix skill list
```

### 4.25 rnix run \<script.ash\> — AgentShell Script Runner

Read and execute an AgentShell script file. Supports shebang (`#!/usr/bin/env rnix run`) for direct execution.

```
Usage: rnix run <script.ash> [args...]
Arguments: <script.ash> — Script file path (minimum 1 argument); additional arguments passed to the script
```

**Environment Variables Set:**

| Variable | Description |
|----------|-------------|
| `RNIX_SCRIPT_FILE` | Absolute path to the script file |
| `RNIX_SCRIPT_DIR` | Directory containing the script |
| `RNIX_ARGS` | All script arguments joined with spaces |
| `RNIX_ARG_N` | Individual argument by index (0-based) |

**Example:**

```
$ rnix run deploy.ash
$ rnix run deploy.ash --env staging
$ ./deploy.ash  # with shebang and chmod +x
```

### 4.26 rnix serve — OpenAI-Compatible HTTP Gateway

Start an OpenAI-compatible HTTP server that exposes registered LLM providers as standard API endpoints.

```
Usage: rnix serve
Arguments: None
```

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--port` | `int` | `8080` | HTTP listen port |

The server binds to `127.0.0.1` (localhost only). Loads providers from the global `providers.yaml` configuration, runs health checks, and serves until interrupted by SIGINT/SIGTERM with a 5-second graceful shutdown period.

**Example:**

```
$ rnix serve --port 3000
Serving 2 providers on http://127.0.0.1:3000
```

### 4.27 rnix agtest \[file-or-dir\] — Agent Behavior Testing

Run declarative agent behavior regression tests defined in YAML files.

```
Usage: rnix agtest [file-or-dir]
Arguments: <file-or-dir> — Single YAML file or directory containing *.yaml files (exactly 1 argument)
```

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--dry-run` | `bool` | `false` | Parse and validate only, do not execute tests |
| `--timeout` | `int64` | `60000` | Global timeout per test case in milliseconds |

**Output (text mode):**

```
[agtest] running 3 test case(s)...

  + test-greeting (1.2s)
  x test-analysis (3.5s)
    exit_code: expected 0, got 1
  - test-skip (skipped)

[agtest] 3 total, 1 passed, 1 failed, 1 skipped, 0 errors (4.7s)
```

**Example:**

```
$ rnix agtest tests/
$ rnix agtest test.yaml --dry-run
$ rnix agtest tests/ --timeout 120000 --json
```

### 4.28 rnix reputation \[agent\] — Agent Reputation Scores

Show reputation scores based on historical SLA evaluation results. Without arguments, lists all agents in a table. With an agent name, shows detailed information.

```
Usage: rnix reputation [agent]
Arguments: [agent] — Optional agent name (0 or 1 argument)
```

**Table Output (listing mode):**

```
AGENT                SCORE  SUCCESS  AVG TOKENS  AVG DURATION  RECORDS  TREND
code-reviewer         0.85   92.0%       1,234        3200ms       15  improving
```

**Detail Output (single agent):**

```
Agent: code-reviewer
Score: 0.85
Success Rate: 92.0%
Avg Token Usage: 1,234
Avg Duration: 3200ms
Total Records: 15
Trend: improving
```

### 4.29 rnix lineage \<pid\> — Stem Agent Differentiation Lineage

Show the complete differentiation path from stem agent to current specialized form. Displays each skill loading step with timestamp and trigger reason.

```
Usage: rnix lineage <pid>
Arguments: <pid> — Process ID (exactly 1 argument)
```

**Example:**

```
$ rnix lineage 42
Lineage for PID 42

[1] 2026-03-15 10:00:00  initial differentiation
    Skills: code-analysis
    Trigger: "Analyze the code"
    Source: keyword-match

[2] 2026-03-15 10:01:30  progressive specialization
    Skills: code-analysis, testing
    Trigger: "Also write tests"
    Source: specialize
```

### 4.30 rnix topology — Collaboration Topology

Show agent collaboration topology and reinforced paths.

```
Usage: rnix topology
Arguments: None (cobra.NoArgs)
```

**Output Sections:**

- **NODES** — Agent name, reputation score, connection count
- **EDGES** — From/to agent, spawn count, message count, total interactions, reinforced marker
- **REINFORCED PATHS** — High-frequency collaboration paths identified by the system

**Example:**

```
$ rnix topology
Collaboration Topology (3 agents, 4 edges)

NODES:
AGENT                REPUTATION  CONNECTIONS
code-analyst               0.85            3

EDGES:
FROM                 TO                   SPAWN  MSG  TOTAL  REINFORCED
code-analyst         test-writer              5    2      7  *
```

### 4.31 rnix synergy — Skill Synergy Combinations

Skill synergy combination management.

**Subcommand: `rnix synergy list`**

Show historical performance data for skill combinations. Displays success rates, token usage, and recommendations.

```
Usage: rnix synergy list
Arguments: None
```

**Output Columns:**

| Column | Description |
|--------|-------------|
| SKILLS | Comma-separated skill combination |
| SUCCESS | Success rate percentage |
| AVG TOKENS | Average token usage |
| EXECUTIONS | Total execution count |
| VS SOLO | Success rate difference vs individual skills |
| TOKEN GAIN | Token usage improvement percentage |
| STATUS | `recommended` if the combination is recommended |

**Example:**

```
$ rnix synergy list
$ rnix synergy list --json
```

### 4.32 rnix immune — Adaptive Immune Security

Adaptive immune security management.

**Subcommand: `rnix immune status`**

Show immune daemon status, behavior profiles, alerts, and suspended processes.

```
Usage: rnix immune status
Arguments: None (cobra.NoArgs)
```

**Output:** Running status, profile count, active monitors, threat memory, behavior profile table (agent template, samples, token rate, duration, last updated), alerts with remediation actions, and suspended process list.

**Subcommand: `rnix immune resume <pid>`**

Resume a previously suspended process.

```
Usage: rnix immune resume <pid>
Arguments: <pid> — Process ID (exactly 1 argument)
```

**Subcommand: `rnix immune similarity [agent-name]`**

Show capability similarity for an agent, listing other agents with similar skill profiles.

```
Usage: rnix immune similarity [agent-name]
Arguments: [agent-name] — Optional agent name (0 or 1 argument)
```

**Examples:**

```
$ rnix immune status
Immune Daemon: running (uptime: 5m30s)
Security: OK
Profiles: 3
Active Monitors: 2
Threat Memory: 0 signatures

$ rnix immune resume 42
$ rnix immune similarity code-analyst
```

---


### 9.1 rnix top — Real-time Process Monitor

```
Usage: rnix top
```

TUI real-time display of process tree, status, token consumption, and execution progress. Supports interactive operations (kill, strace, detail view).

### 9.2 rnix log — Reasoning Log

```
Usage: rnix log <pid> [--filter <category>]
Categories: think | tool | output
```

Displays reasoning logs categorized as `[think]`/`[tool]`/`[output]`.

### 9.3 rnix compose — Multi-Agent Orchestration

```
Usage: rnix compose up [--json]
      rnix compose down
```

`up` starts the DAG workflow from `compose.yaml`. `down` terminates all processes and cleans up resources.

### 9.4 rnix skill — Skill Package Management

```
Usage: rnix skill install <name>
      rnix skill search <keyword>
      rnix skill update [name]
      rnix skill list
```

### 9.5 rnix gdb — Interactive Debugging

```
Usage: rnix gdb <pid>
```

GDB-style interactive debugger with breakpoint support (syscall/reasoning/quality/budget), single-stepping, state inspection, and runtime parameter hot-modification.

Subcommands: `break`, `continue`, `step`, `inspect`, `set`, `detach`

### 9.6 rnix record / replay — Time-Travel Debugging

```
Usage: rnix record <pid>
      rnix replay <record-id>
```

Full execution recording (syscall + LLM calls + context snapshots). Replay supports forward/backward navigation, context diff, and fork-continue branch exploration.

### 9.7 rnix trace / blame — Distributed Tracing

```
Usage: rnix trace <trace-id>
      rnix trace blame <trace-id>
```

Cross-process causal chain tracing. `blame` automatically analyzes the critical path with the highest duration, token usage, or errors.

### 9.8 rnix ctx-profile — Context Analysis

```
Usage: rnix ctx-profile <pid>
```

Analyzes context usage: active/warm/cold/leaked classification, top consumer identification, and growth trend prediction.

### 9.9 rnix agtest — Reasoning Regression Testing

```
Usage: rnix agtest <test-file> [--case <name>] [--json] [--verbose]
```

Declarative YAML test cases with three assertion types (reasoning/syscall/quality), supporting batch execution and CI integration.

### 9.10 rnix dashboard — Visual Debugging Panel

```
Usage: rnix dashboard [--replay <record-id>]
```

Multi-pane TUI: agent tree, trace timeline, context heatmap. Supports offline replay.

### 9.11 rnix intent — Declarative Intent

```
Usage: rnix intent apply "<description>"
      rnix intent status
      rnix intent reset <node-id>
```

LLM-driven intent decomposition with Reconciler for continuous reconciliation. Supports incremental updates.

### 9.12 rnix serve — LLM Gateway

```
Usage: rnix serve [--port <port>]
Default: localhost:8080
```

OpenAI-compatible HTTP server. Endpoints: `/v1/chat/completions` (sync + SSE streaming), `/v1/models`. The model parameter supports `provider:model` composite format routing.

### 9.13 rnix immune — Security Monitoring

```
Usage: rnix immune status
```

Shows Immune Daemon status: monitored process count, active alerts, suspended processes, and threat memory entries.

### 9.14 rnix reputation — Reputation System

```
Usage: rnix reputation [agent-name]
```

View historical performance of Agent templates: success rate, token efficiency, SLA compliance, reputation score.

### 9.15 rnix lineage — Differentiation Lineage

```
Usage: rnix lineage <pid>
```

View the complete differentiation path of a stem agent: base → auto-matched Skills → runtime-loaded Skills.

### 9.16 rnix topology — Collaboration Topology

```
Usage: rnix topology
```

Shows agent collaboration topology: collaboration frequency, capability overlap, and reinforced paths.

### 9.17 rnix synergy — Skill Synergy

```
Usage: rnix synergy list
```

Shows known effective Skill combinations and their historical performance improvement data.

### 9.19 rnix run — AgentShell Script

```
Usage: rnix run <script.ash>
```

Execute AgentShell script files. Supports shebang `#!/usr/bin/env rnix run`.

---

## 10. VFS Path Extensions

### 10.1 /dev/llm/* — Multi-Provider Devices

Dynamically registered via `providers.yaml`. One VFS path per provider:

| Path | Driver Type | Description |
|------|-------------|-------------|
| `/dev/llm/claude` | CLI | Claude Code CLI |
| `/dev/llm/cursor` | CLI | Cursor CLI |
| `/dev/llm/qwen` | CLI | Qwen Code CLI |
| `/dev/llm/ollama` | HTTP API | Ollama (local) |
| `/dev/llm/groq` | HTTP API | Groq Cloud |
| `/dev/llm/deepseek` | HTTP API | DeepSeek API |
| `/dev/llm/gemini` | Native API | Google Gemini |
| `/dev/llm/openai` | Native API | OpenAI GPT-4, GPT-4o |
| `/dev/llm/anthropic-api` | Native API | Claude (via Anthropic SDK) |
| `/dev/llm/<custom>` | HTTP API | Any OpenAI-compatible API |

### 10.2 /mnt/mcp/* — MCP Mount Points

Auto-mounted during Spawn, format `/mnt/mcp/{pid}-{serverName}`. Sub-paths map to MCP protocol operations (see VFS Path Specification §2 for MCP sub-path table).

### 10.3 /dev/memory/* — Memory Devices

Persistent knowledge management for agents. Three sub-devices:

| Path | Description |
|------|-------------|
| `/dev/memory/commit` | Write persistent knowledge entries (add/replace/remove/snapshot/capacity) |
| `/dev/memory/recall` | Search historical conversations and extracted knowledge (read-only) |
| `/dev/memory/profile` | Manage user profile (role, preferences, expertise) |

See [VFS Path Specification](/reference/vfs) for detailed request formats.

### 10.4 /dev/tasks — Task Management

Dynamic task management for agents. Supports `task_create`, `task_update`, and `task_list` operations.

### 10.5 /dev/tty — Interactive User Q&A

Allows agents to ask the user questions during execution. Questions are forwarded via IPC and block until a response is received.

### 10.6 /dev/skills/manage — Dynamic Skill Management

Runtime skill lifecycle management. Agents can create, modify, or delete skills programmatically.

### 10.7 /dev/web — Web Access

Web access capabilities: URL fetching with HTML-to-markdown conversion and web search with domain filtering.

### 10.8 /dev/lsp — LSP Code Intelligence

Language Server Protocol integration for code intelligence. Supports `goToDefinition`, `findReferences`, `hover`, `documentSymbol`, and more.

### 10.9 /dev/cron — Scheduled Jobs

Manages scheduled recurring jobs. When a job triggers, it spawns a new agent process with the configured intent.

---

## 11. Extended Type Reference

### 11.1 Signal Complete Definitions (Phase 2 Update)

| Constant | Value | Description |
|----------|-------|-------------|
| `SIGTERM` | `1` | Termination signal (graceful shutdown) |
| `SIGKILL` | `2` | Force kill |
| `SIGINT` | `3` | Interrupt signal |
| `SIGPAUSE` | `4` | Pause reasoning loop |
| `SIGRESUME` | `5` | Resume reasoning loop |

### 11.2 Unified Reasoning Loop

Single `reasonStep` loop where LLM autonomously selects ActionType each step: tool_call, plan, spawn, complete, specialize, replan, text. `planning: true/false` (default true) controls whether plan guidance is injected. Built-in circuit breaker: 3 consecutive tool_call/spawn failures trigger automatic termination.

### 11.3 ExitStatus Exit Code Conventions (Complete)

| Code | Reason | Description |
|------|--------|-------------|
| `0` | `"completed"` | Normal completion |
| `1` | `"unexpected exit"` | Unexpected exit |
| `1` | `"max steps exceeded"` | Exceeded maximum reasoning steps |
| `1` | Error description | Error during reasoning |
| `2` | `"budget_exceeded"` | Token budget exceeded |
