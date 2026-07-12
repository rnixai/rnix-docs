## 4. CLI Command Reference

### 4.1 Global Flags

| Flag | Short | Type | Description |
|------|--------|------|------|
| `--json` | — | `bool` | JSON format output |
| `--verbose` | `-v` | `bool` | Verbose output |
| `--quiet` | `-q` | `bool` | Quiet output |
| `--model` | `-m` | `string` | LLM model to use (e.g. `sonnet`/`opus`/`haiku`) |
| `--provider` | — | `string` | LLM provider override (see `providers.yaml`) |
| `--fallback-model` | — | `string` | Override agent fallback model (empty = use agent manifest) |
| `--fallback-provider` | — | `string` | Override agent fallback provider (empty = same as primary) |
| `--reasoning-effort` | — | `string` | Reasoning effort passed through to the provider (e.g. `low`/`medium`/`high`); empty uses the provider default. See [LLM Providers › Reasoning Effort](/guide/llm-providers#reasoning-effort) |

**Output Mode Priority:** `--json` > `--quiet` > `--verbose` > default

These flags are registered via `PersistentFlags` and apply to all subcommands.

### 4.2 rnix -i \<intent\> — Root Command

```
Usage: rnix -i <intent> [flags]
```

The intent is passed via the `-i`/`--intent` flag, **not** as a positional argument — the root command rejects positional arguments. Without `-i`, `rnix` prints help.

**Private Flags:**

| Flag | Short | Type | Default | Description |
|------|--------|------|--------|------|
| `--intent` | `-i` | `string` | `""` | Intent string to spawn an agent |
| `--max-steps` | — | `int` | `0` | Maximum reasoning steps (`0` = default 10) |
| `--agent` | — | `string` | `""` | Agent definition name |
| `--dashboard` | — | `bool` | `false` | Open dashboard after spawning the agent |
| `--parent` | — | `uint` | `0` | Attach the spawned process under this parent PID (defaults to `$RNIX_PARENT_PID` when set). _Added in 0.11.0._ |

The global `--model`/`--provider`/`--reasoning-effort` flags (see §4.1) also apply to the root command.

**`--parent` / `RNIX_PARENT_PID` — Attach an externally spawned process to the tree.** By default a process spawned from outside a running Rnix process becomes a root of the process tree. Passing `--parent <pid>` (or exporting `RNIX_PARENT_PID=<pid>` for tools that shell out to `rnix`) attaches it under the given parent PID instead, so the Dashboard shows accurate parent/child relationships and spawn-depth limits still apply. The flag takes precedence over the environment variable.

**Default Output Example:**

```
[kernel] spawning PID 1 (claude/sonnet)...
[agent/1] reasoning step 1...
[agent/1] reasoning step 2...
══ Result ══════════════════════════════════════════════════════════════════════
  Analysis result content...
════════════════════════════════════════════════════════════════════════════════
[kernel] PID 1 exited(0) | claude/sonnet | tokens: 1234 | elapsed: 6.2s
```

**Examples:**

```bash
rnix -i "analyze ./README.md"
rnix -i "refactor error handling in main.go"
rnix -i "analyze project structure" --json
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
  start     Start the daemon if it is not already running
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

**`rnix daemon start` Output Example:**

```
daemon started
status:  running
...
```

When the daemon is already running, `start` prints `daemon is already running` and reports its current status.

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
Usage: rnix ps [flags]
Arguments: None (cobra.NoArgs)
```

**Flags:**

| Flag | Description |
|------|-------------|
| `-a`, `--all` | Show all processes including completed/dead (active + historical) |
| `-v`, `--verbose` | Show extra columns (PPID, Intent) |
| `-q`, `--quiet` | Print one PID per line |
| `-j`, `--json` | Output structured JSON |
| `--uuid` | Show UUID column (auto-enabled with `-a`) |

**Default Mode — Table Format:**

```
  PID   STATE     SKILL              TOKENS   ELAPSED
─────   ─────────   ───────────────   ────────   ────────
    1   running   code-analysis        456      3.2s
    2   zombie    —                    123      1.1s

1 active, 1 zombie, 2 total
```

**--all — Include Historical Processes:**

```bash
$ rnix ps -a
  PID   UUID                                  STATE      SKILL              TOKENS   ELAPSED
─────   ────────────────────────────────────   ────────   ───────────────   ────────   ────────
    1   019746a0-1234-7000-8000-000000000001   running    code-analysis        456      3.2s
    2   019746a0-1234-7000-8000-000000000002   dead       security-scan       1200      8.5s

1 active, 1 dead, 2 total
```

The UUID column is automatically shown when `-a` is used, since UUIDs are essential for identifying historical processes (e.g., for `rnix resume`).

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

### rnix wait \<pid\> — Block Until Process Exit {#rnix-wait}

_Added in 0.11.0._

Block until the target process reaches a terminal state (`Zombie` / `Dead`), then propagate its exit code as this command's own exit code. This enables spawn-then-poll orchestration over the shell channel without parsing `rnix ps` output. Already-finished processes (including reaped ones found in history) return immediately.

```
Usage: rnix wait <pid> [--timeout <duration>] [--json]
Arguments: <pid> — Process ID (a positive integer, exactly 1 argument)
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--timeout` | `string` | `""` | Bound the wait (Go duration, e.g. `30s`, `2m`). On expiry the command exits `124` (GNU `timeout` convention) and the target process is left untouched, so the same PID can be waited again to keep polling. Must be positive; omit to wait forever. |
| `--json` | `bool` | `false` | Emit structured JSON (`pid` / `exit_code` / `exit_reason` / `timed_out`). |

**Exit codes:** the target's exit code (terminal state) / `124` (timeout) / `1` (bad arguments, NOT_FOUND, or daemon down).

Unlike most commands, `wait` does **not** auto-start the daemon: a freshly started daemon has no process to wait for, so a daemon-down state is a hard failure. A suspended process does not complete a wait (Unix `wait(2)` semantics: the wait blocks across suspend/resume); use `--timeout` to bound that case.

**Success Output:**

```
PID 1 exited with code 0 (completed)
```

**JSON Output:**

```json
{"ok": true, "data": {"pid": 1, "exit_code": 0, "exit_reason": "completed", "timed_out": false}}
```

**Examples:**

```bash
rnix wait 1                  # block until PID 1 exits, propagate its code
rnix wait 1 --timeout 30s    # give up after 30s (exit 124), leave PID 1 running
rnix wait 1 --json           # machine-readable result
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

**--raw — Raw LLM Request/Response Capture:**

Replays the raw request and response recorded for each LLM call of the process — the HTTP request/response for API-based providers, or the full command invocation and output for CLI-based providers. Useful for verifying exactly what was sent to a model (prompt, parameters, reasoning effort). Add a step number to inspect a single call. Credentials are redacted in the capture.

```bash
rnix strace <pid> --raw                  # all captured LLM calls
rnix strace <pid> --raw --step 3         # a single reasoning step
rnix strace <pid> --raw --uuid <uuid>    # locate an already-reaped process
```

The `--uuid <uuid>` flag overrides PID resolution with an explicit process UUID, letting `--raw` locate processes that have already been reaped (PID no longer in the table).

Works for both live and already-finished processes (captures are persisted with the process history). See [Debugging › Raw LLM I/O](/guide/debugging#raw-llm-io).

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

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--with-mcp-examples` | `bool` | `false` | Generate an `mcp.yaml` containing a Playwright MCP example server |

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

### 4.20 rnix resume \<pid|uuid\> — Resume Process

Resume a process from a checkpoint (`Suspended`) **or** from history (`Dead` / `Zombie` / `context_full` / circuit-broken). This is checkpoint/history-based resume — it is *not* the same as unpausing a SIGPAUSE-paused process; for that use SIGRESUME (via dashboard `p` key or `rnix kill <pid>` with signal 5).

```
Usage: rnix resume [--fork] [--from-step N] [--new-input <text>] <pid|uuid>
Arguments: <pid|uuid> — Process ID or UUID (exactly 1 argument)
```

| Flag | Description |
|------|-------------|
| `--fork` | Resume into a **new** UUID instead of inheriting the original. The forked process records an `origin_uuid` lineage link, so the original UUID stays independently resumable (Git-style exploration). |
| `--from-step N` | Truncate history replay at step `N` before resuming (a *truncated fork*). Requires the history path and conflicts with checkpoints — returns `ErrInvalid` if both apply. `0` = no truncation. |
| `--new-input <text>` | Append this text as a new user turn after the historical context is restored, before reasoning continues — steer the resumed process with fresh input while keeping its full prior context. _Added in 0.11.0._ |

Accepts both a PID (for a running daemon process) and a UUID (for resuming from persisted checkpoints or history). See [Process Resume](/guide/process-resume) for the full resume / fork model and the Dashboard Lineage view.

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
| `--global` / `-g` | `bool` | `false` | Install to user scope (`~/.config/rnix/skills/` or `~/.agents/skills/`) regardless of cwd |
| `--shared` | `bool` | `false` | Install to the agents namespace (`.agents/skills/`) for cross-tool interop with the agentskills.io ecosystem |

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

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--global` / `-g` | `bool` | `false` | Only show skills under user scope (`~/.config/rnix/skills/` + `~/.agents/skills/`) |
| `--project` / `-p` | `bool` | `false` | Only show skills under project scope (`<projectDir>/.rnix/skills/` + `<projectDir>/.agents/skills/`) |

`--global` and `--project` are mutually exclusive.

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

### 4.27 rnix agtest \[file-or-dir\] — Agent Behavior Testing {#rnix-agtest}

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
| `--tier1` | `bool` | `false` | Enforce the Tier1 discipline (`agtest.ValidateTier1`): non-empty assertions, only `output` / `syscalls` assertions (no `quality`), and the `replay` provider. A violating suite is rejected before execution. _Added in 0.11.0._ |

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
$ rnix agtest tests/agtest/tier1/ --tier1        # PR-gate discipline
```

**Subcommand: `rnix agtest import <uuid>`** _(Added in 0.11.0)_

Turn a persisted process run into a Tier1 regression-case skeleton — the "failure → case" workflow that closes the regression loop. Reads the process's `steps.jsonl` / `proc-info.json` / `events.jsonl` **directly from disk** (no daemon required) and writes a case-file + replay response-script pair for manual review.

```
Usage: rnix agtest import <uuid> [--out <dir>]
Arguments: <uuid> — Full UUID, last-6 short id (dashboard `~xxxxxx` convention), or a unique prefix (exactly 1 argument)
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--out` | `string` | `tests/agtest/imported` | Output directory for the generated case + response script |

The generated files are intentionally **not** wired into the Tier1 suite: the case has no live `assert:` block (only commented-out suggestions), so `agtest.ValidateTier1` rejects it until a human fills in real assertions. Ambiguous short-id / prefix matches are reported with the candidate list rather than silently picking the first. Review the output, then move both files into `tests/agtest/tier1/` under the next `NN-slug` ordinal.

```bash
$ rnix agtest import a1b2c3                                  # last-6 short id
$ rnix agtest import a1b2c3d4-e5f6-4789-a012-3456789abcde    # full uuid
$ rnix agtest import a1b2c3 --out /tmp/imported              # override output dir
```

See [Testing › Agent Behavior Regression (agtest)](/guide/testing#agent-behavior-regression-agtest) for the full two-tier framework and failure-to-case workflow.

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

### 4.33 rnix config — Configuration Management {#rnix-config}

Inspect active daemon configuration.

```
Usage: rnix config [command]
Subcommands:
  show    Show active daemon configuration
```

**Subcommand: `rnix config show`**

Display the active feature profile and individual feature flags. Attempts to connect to the running daemon first; falls back to reading the global config file (`~/.config/rnix/config.yaml`) if the daemon is not running.

```
Usage: rnix config show
Arguments: None (cobra.NoArgs)
```

**Daemon Running — Output Example:**

```
Feature Profile: adaptive
  compaction:     true
  diff_memory:    true
  discover_skill: true
  immune:         false
  planning:       true
  replan:         true
  spawn:          true
  specialize:     true
  stem_matcher:   true
```

**Daemon Not Running — Fallback Output Example:**

```
Feature Profile: full (from config, daemon not running)
  compaction:     true
  diff_memory:    true
  discover_skill: true
  immune:         true
  planning:       true
  replan:         true
  spawn:          true
  specialize:     true
  stem_matcher:   true
```

Feature flags are always listed in alphabetical order.

> **Note**: The feature profile can be overridden via the `RNIX_FEATURE_PROFILE` environment variable. See [Feature Profiles](/guide/configuration#feature-profiles) for configuration details.

---

### 4.34 rnix mcp — MCP Server Inspection {#rnix-mcp}

Inspect and validate [Model Context Protocol](/guide/mcp-integration) (MCP) server mounts on the running daemon.

```
Usage: rnix mcp [command]
Subcommands:
  list           List active MCP server mounts on the daemon
  test <name>    Probe a configured server (connect → tools/list → resources/list → prompts/list)
  logs <name>    Show captured stderr of a mounted MCP server
  reload         Re-read mcp.yaml and refresh the daemon's MCP registry
```

**Subcommand: `rnix mcp list`**

List the MCP mounts the daemon currently holds. This is a pure read: when the daemon is not running it prints a friendly empty list and exits `0` (consistent with `rnix ps`).

```
Usage: rnix mcp list
Arguments: None (cobra.NoArgs)
```

**Subcommand: `rnix mcp test <name>`**

Run a one-shot probe against a server declared in `mcp.yaml`. The probe spins up a fresh transport on the daemon, walks four stages — `connect` / `tools_list` / `resources_list` / `prompts_list` — then tears it down, leaving no mount in the registry. This command **requires the daemon to be running** (the transport must live in the daemon's process tree to avoid orphan subprocesses), so a daemon-down state exits `1`.

```
Usage: rnix mcp test <name>
Arguments: <name> — MCP server name from mcp.yaml (exactly 1 argument)
```

**Subcommand: `rnix mcp logs <name>`**

Print the most recent 256 stderr lines captured from a mounted MCP server's child process — the first place to look when an MCP tool starts failing (e.g. `npx error: ENOENT`, `chromium not found`). Like `mcp list`, this is a pure read: daemon-down prints a hint and exits `0`; an unknown / unmounted server name exits `1` with the list of available servers.

```
Usage: rnix mcp logs <name>
Arguments: <name> — Mounted MCP server name (exactly 1 argument)
```

**Subcommand: `rnix mcp reload`**

Re-parse `mcp.yaml` and swap the daemon's MCP server registry without a restart. Run this after editing `mcp.yaml` (adding / removing / re-configuring a server) so `mcp test` and future mounts see the change immediately. It refreshes the lookup table only — already-mounted servers are left untouched. Like `mcp test`, this **requires the daemon to be running**, so daemon-down exits `1`. A bad `mcp.yaml` leaves the previous registry intact and reports the parse error.

```
Usage: rnix mcp reload
Arguments: None (cobra.NoArgs)
```

---

### 4.35 rnix check — Subsystem Diagnostics {#rnix-check}

Run targeted environment / configuration checks for a single rnix subsystem (currently `mcp`). This is distinct from `rnix doctor`, which focuses on LLM-provider health.

```
Usage: rnix check [command]
Subcommands:
  mcp    Verify MCP runtime prerequisites (node, npx, optional Chromium)
```

**Subcommand: `rnix check mcp`**

Check that the host has the binaries needed to run the MCP servers declared in `mcp.yaml`. It probes `node` + `npx` by default; if any server references `playwright`, it additionally probes for a Chromium install (`npx playwright install chromium`). Reports a `pass` / `warn` / `fail` status — a `fail` exits `1`.

```
Usage: rnix check mcp
Arguments: None (cobra.NoArgs)
```

---

### 4.36 rnix doctor — LLM Provider Health Diagnostics {#rnix-doctor}

Run environment health checks across rnix configuration and each configured LLM provider. This is the LLM-provider counterpart to [`rnix check`](#rnix-check) (which focuses on subsystem prerequisites like MCP). It reports cwd, command resolvability, auth mode, and — with `--probe` — a live `"Respond with hello."` probe per provider. Reports a `pass` / `warn` / `fail` status.

```
Usage: rnix doctor [--probe] [--provider <name>] [--json]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--probe` | `bool` | `false` | Run a live hello probe per provider (small token usage; billed) |
| `--provider` | `string` | `""` | Only check the named provider (matches `providers.yaml`) |
| `--json` | `bool` | `false` | Machine-readable output |

**Examples:**

```bash
rnix doctor                    # static checks only
rnix doctor --probe            # include live hello probe (billed)
rnix doctor --provider claude  # check a single provider
rnix doctor --json             # machine-readable output
```

---

### 4.37 rnix gc — Garbage-Collect Process Data {#rnix-gc}

Remove terminated process data under `.rnix/data/steps/<uuid>/` that exceeds the active retention policy (`gc.retention_days` / `gc.max_entries` in `~/.config/rnix/config.yaml`). Running and Suspended processes are **never** eligible — gc cannot kill live work. Bulk operations (more than 100 candidates) prompt for confirmation unless `--force` or `--json` is provided.

```
Usage: rnix gc [--dry-run] [--force] [--json]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--dry-run` | `bool` | `false` | Preview candidates without deleting |
| `--force` | `bool` | `false` | Skip confirmation for bulk deletes (>100 entries) |
| `--json` | `bool` | `false` | Emit JSON output (implies `--force`) |

**Examples:**

```bash
rnix gc --dry-run        # Preview candidates without deleting
rnix gc                  # Interactive cleanup
rnix gc --force          # Skip confirmation
rnix gc --json           # Machine-readable output (implies --force)
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
Usage: rnix record start|stop <pid>
      rnix record list
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
Usage: rnix agtest <file-or-dir> [--dry-run] [--timeout <ms>] [--json] [--verbose]
```

Declarative YAML test cases with three assertion types (reasoning/syscall/quality), supporting batch execution and CI integration.

### 9.10 rnix dashboard — Visual Debugging Panel

```
Usage: rnix dashboard [--replay <record-id>]
```

Multi-pane TUI: agent tree, trace timeline, context heatmap. Supports offline replay.

### 9.11 rnix intent — Declarative Intent

```
Usage: rnix intent status
      rnix intent list
```

LLM-driven intent decomposition with Reconciler for continuous reconciliation. `status` / `list` inspect intent state. To declare a new intent use the top-level `rnix apply "<description>"` (see §4.22).

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

### 9.20 rnix config — Configuration Management

```
Usage: rnix config show
```

Display active feature profile and flags. Connects to daemon for live state; falls back to global config file if daemon is not running.

---

### 9.21 rnix mcp — MCP Server Inspection

```
Usage: rnix mcp list | test <name> | logs <name>
```

Inspect MCP mounts on the daemon: `list` active mounts, `test` a configured server with a 4-stage probe, or tail a server's captured `logs`. See [§4.34](#rnix-mcp).

---

### 9.22 rnix check — Subsystem Diagnostics

```
Usage: rnix check mcp
```

Verify a subsystem's host prerequisites (`mcp`: node, npx, optional Chromium). Reports `pass` / `warn` / `fail`. See [§4.35](#rnix-check).

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
| `2` | `"budget_exhausted"` | Cumulative token budget exceeded (`max_tokens`), self-suspended |
| `2` | `"max_turns_reached"` | Maximum reasoning turns exceeded, self-suspended |
| `2` | `"loop_detected"` | Repetitive action loop detected, self-suspended |
| `2` | `"user_suspended"` | User-initiated suspension (SIGPAUSE) |
| `3` | `"context_full"` | Per-step input tokens exceeded `context_budget`, self-suspended (recoverable via resume) |
