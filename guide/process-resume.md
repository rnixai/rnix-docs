# Process Pause, Resume & Recovery

Rnix redefines process lifecycle with first-class pause/resume primitives and a "Dead is frozen" resume philosophy. Processes can be suspended mid-execution, persisted across daemon restarts, and resumed from disk — including historical (Dead/Zombie) processes.

---

## Design Philosophy

Traditional Unix treats "dead" as terminal — once a process exits, it's gone. Rnix treats **Dead as a frozen state**: process data persists on disk until garbage collection cleans it up. Any Dead, Zombie, or Suspended process can be revived via `rnix resume`.

This design addresses a recurring pain point: daemon crashes, manual kills, or natural completions that leave a complete observation trail on disk (steps, events, context profiles, checkpoint data) but no way to continue.

**Key principle**: Resume is **not a state transition** — it's "build a new process from history." The state machine (Created → Running → Zombie → Dead) remains unchanged. Resume spawns a fresh process seeded with prior execution data.

---

## Process States

| State | Meaning | Can Resume? | Persisted? |
|-------|---------|-------------|------------|
| **Created** | Allocated, not yet started | — | No |
| **Running** | Reasoning loop active | — | Live in procTable |
| **Suspended** | SIGPAUSE active, loop blocked | `rnix resume` | `.rnix/data/steps/<uuid>/` |
| **Zombie** | Reasoning ended, awaiting reaper | `rnix resume` | `.rnix/data/steps/<uuid>/` |
| **Dead** | Reaped, removed from procTable | `rnix resume` | `.rnix/data/steps/<uuid>/` |

### SIGPAUSE / SIGRESUME

Signals for process suspension and resumption:

```bash
# Suspend a running process
rnix suspend <pid>            # Single process (SIGPAUSE)

# Resume a suspended or historical process
rnix resume <pid|uuid>        # From persisted state
rnix resume --fork <pid|uuid> # New UUID, linked to original
```

::: tip Subtree suspension
There is **no top-level `rnix pause --subtree` CLI command**. Suspending an entire process subtree is available **only from within the Dashboard** (which drives it over IPC). The top-level CLI exposes single-process `rnix suspend <pid>` only.
:::

When paused, the reasoning loop blocks at the next I/O boundary — the process remains in `Running` state with `IsPaused = true`. The elapsed time counter freezes. Heartbeat monitoring skips paused processes (they intentionally stop sending heartbeats).

### Subtree Operations

The `SubtreeManager` provides unified suspend/resume across process trees. This is exposed **through the Dashboard only** (driven over IPC) — there is no top-level CLI flag for it:

```
PID 1 orchestrator (Running)
├── PID 2 coder (Running)
├── PID 3 reviewer (Running)
└── PID 4 researcher (Suspended)

# (Dashboard subtree-suspend on PID 1)
# Suspends PID 1, 2, 3. PID 4 already suspended.
# Tree state: all members suspended, ancestors aware of suspension reason.
```

Resume propagates upward: resuming a descendant wakes the ancestor chain so the orchestrator can continue managing its subtree.

---

## Resume Modes

| Mode | Command | UUID | Use Case |
|------|---------|------|----------|
| **Continue** | `rnix resume <pid\|uuid>` | Preserved | Recovery after daemon crash |
| **Fork** | `rnix resume --fork <pid\|uuid>` | New UUID + `origin_uuid` | Git-style exploration |
| **Truncated Fork** | `rnix resume --fork --from-step N <pid\|uuid>` | New UUID | Retry from mid-history |
| **Compose Node** | `rnix compose resume --node <name>` | Reuses above | DAG node recovery |

### Continue Mode

Preserves the original UUID. Best for transparent recovery:

```bash
# Daemon crashes at step 12/20
$ rnix daemon status
# ... daemon restarted ...

$ rnix resume abc123-def456
[kernel] resuming UUID abc123 from checkpoint (step 10/20)...
[kernel] PID 5 spawned (deepseek/deepseek-v4-flash) | resumed from abc123
```

For Suspended processes: uses `checkpoint.json` for full context restoration (fastest path).  
For Dead/Zombie: replays `steps.jsonl` history. Falls back without checkpoint.

### Fork Mode

Creates a new UUID with `origin_uuid` linking back. The original process data is never mutated:

```bash
$ rnix resume --fork abc123-def456
[kernel] forking from abc123 → new UUID xyz789...
[kernel] PID 6 spawned (deepseek/deepseek-v4-flash) | forked from abc123
```

Dashboard shows the lineage: `xyz789 (forked from abc123)`.

### Truncated Fork

Jump to a specific step, useful for correcting mid-execution errors:

```bash
$ rnix resume --fork --from-step 5 abc123
# Replays history up to step 5, then resumes reasoning from step 6
```

> **Note**: `--from-step` requires the history path. Conflicts with checkpoints — `ErrInvalid` if both apply.

---

## Checkpoint System

Periodic best-effort checkpoints prevent long-running tasks from restarting from zero:

- **Frequency**: Every 5 reasoning steps or 30 seconds (whichever comes first)
- **Format**: `checkpoint.json` in `.rnix/data/steps/<uuid>/`
- **Contents**: Full context snapshot, tool state, progress markers
- **Failure semantics**: Checkpoint write failures do NOT block the reasoning loop

```
.rnix/data/steps/<uuid>/
├── steps.jsonl          # Reasoning steps (LLM requests/responses)
├── events.jsonl         # Syscall events (real-time EventWriter)
├── ctx-profile.json     # Context heatmap snapshot (saved at reap)
├── process-meta.json    # System prompt + tool definitions
├── proc-info.json       # Process metadata snapshot
└── checkpoint.json      # Periodic checkpoint (every 5 steps / 30s)
```

---

## Daemon Restart Persistence

Suspended processes and their data survive daemon restarts:

- **On shutdown**: Suspended processes are serialized to disk via `LoadSuspendedFromDisk`
- **On startup**: The daemon scans `.rnix/data/steps/` and rehydrates Suspended processes
- **PID seeding**: PID counter is seeded from disk (`max(existing PIDs)`) to prevent reuse
- **Placeholder runtime state**: Suspended processes get a rehydrated placeholder that holds the state until explicitly resumed

```bash
# Before restart
$ rnix ps
PID  STATE       AGENT
1    Running     orchestrator
2    Suspended   coder

# After daemon restart
$ rnix ps
PID  STATE       AGENT
3    Suspended   coder          # Rehydrated from disk, PID reseeded

$ rnix resume <pid|uuid>
# Resumes from checkpoint, inherits rehydrated PID
```

---

## Garbage Collection

Long-lived data needs cleanup. Configure in `~/.config/rnix/config.yaml`:

```yaml
gc:
  retention_days: 30      # Example value, NOT the default. Delete entries older than N days
  max_entries: 500        # Example value, NOT the default. Keep at most N history entries
  interval_seconds: 3600  # Background scan interval (min 60, default 1h)
```

::: warning Defaults
`retention_days` and `max_entries` both **default to `0` (GC disabled)** — see `kernel/gc_config.go`. The `30` / `500` above are illustrative; you must set them explicitly to enable garbage collection.
:::

### GC Rules

- `retention_days` and `max_entries` are combined — hitting either triggers cleanup
- Set both to 0 to disable the GC daemon entirely
- **Running and Suspended processes are permanently exempt**
- Corrupt `proc-info.json` or missing `dead_at` → skipped with warning log

### CLI

```bash
rnix gc --dry-run          # Preview candidates (table)
rnix gc --dry-run --json   # Preview candidates (JSON, script-friendly)
rnix gc                    # Execute cleanup; >100 entries prompts [y/N]
rnix gc --force            # Skip confirmation
rnix gc --json             # JSON output (implies --force)
```

---

## IPC Commands

| Command | Description |
|---------|-------------|
| `rnix suspend <pid>` | Suspend a process (SIGPAUSE) |
| `rnix resume <pid\|uuid>` | Resume from persisted state |
| `rnix resume --fork <pid\|uuid>` | Resume with new UUID |
| `rnix resume --fork --from-step N <pid\|uuid>` | Resume from step N |
| `rnix compose resume --node <name>` | Resume a compose DAG node |
| `rnix ps -a` | List all processes, including resumable Dead/Suspended ones |
| `rnix gc` | Garbage collect old process data |

---

## Related Documentation

- [Core Concepts](/guide/concepts) — Process lifecycle and state machine
- [Dashboard](/guide/dashboard) — Visual process management with pause/resume
- [Configuration](/guide/configuration) — GC settings
- [Monitoring](/guide/monitoring) — Heartbeat monitor and supervisor trees
