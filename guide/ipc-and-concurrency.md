# IPC & Concurrency

Rnix provides Unix-style inter-process communication (IPC) and a three-level concurrency model for multi-agent collaboration.

---

## Message Passing — Send / Recv

Agents can send typed messages to other processes by PID:

```go
// Send a message to PID 2
kern.Send(senderPID, targetPID, data)

// Block-receive next message
msg, err := kern.Recv(pid)
```

Messages are queued per-process with buffered channels. `Recv` blocks until a message arrives or the queue is closed (on process exit).

---

## Pipes

Connect one agent's output directly to another's input:

```go
writeFD, readFD, err := kern.Pipe(writerPID, readerPID)
```

In AgentShell, pipe syntax is even simpler:

```bash
spawn "Analyze code" --agent=analyst | spawn "Generate docs"
```

The `|` operator creates a pipe where the first agent's output becomes `[PIPE_INPUT]` context for the second.

---

## Process Groups

Group multiple processes for batch operations:

```go
kern.JoinGroup(pid, groupID)      // Join a group
kern.LeaveGroup(pid, groupID)     // Leave a group
pids, _ := kern.GetProcGroup(gid) // List members
kern.SignalGroup(groupID, signal)  // Broadcast signal to all members
```

Process groups are used by Compose orchestration for batch control — e.g., killing all agents in a workflow with a single `SignalGroup`.

---

## Signal System

Five signals with configurable handling:

| Signal | Value | Blockable | Custom Handler | Default |
|--------|-------|-----------|----------------|---------|
| `SIGTERM` | 1 | Yes | Yes | Cancel context |
| `SIGKILL` | 2 | No | No | Force cancel |
| `SIGINT` | 3 | Yes | Yes | Cancel context |
| `SIGPAUSE` | 4 | Yes | Yes | Pause reasoning loop |
| `SIGRESUME` | 5 | Yes | Yes | Resume reasoning loop |

```go
// Send signal
kern.Signal(pid, types.SIGPAUSE)

// Block/unblock signals
kern.SigBlock(pid, types.SIGTERM)
kern.SigUnblock(pid, types.SIGTERM)  // delivers pending
```

**SIGPAUSE/SIGRESUME**: The reasoning loop calls `WaitIfPaused()` at each step start. When paused, the agent blocks until SIGRESUME. The `pausedAt` timestamp is recorded, and the dashboard freezes the elapsed timer at `PausedAt - CreatedAt`. The heartbeat monitor skips paused processes to avoid false stall detection.

Signal delivery uses `resolveSignalDisposition` to atomically determine the dispatch path (blocked → pending / custom handler / default) within a single lock hold, preventing TOCTOU races.

### SignalTree

`SignalTree(pid, signal)` delivers a signal recursively to a process and all its living descendants, skipping zombie/dead processes. Returns the count of affected processes.

```go
affected, err := kern.SignalTree(pid, types.SIGPAUSE)  // Pause entire subtree
affected, err := kern.SignalTree(pid, types.SIGRESUME)  // Resume entire subtree
```

Used by the dashboard `p` key for tree-wide pause/resume toggle. The IPC method `signal_tree` exposes this as a client-callable operation.

---

## Three-Level Concurrency Model

| Level | Primitive | Scheduling | Isolation | Use Case |
|-------|-----------|------------|-----------|----------|
| **Process** | `Spawn` | Preemptive (independent goroutine + context) | Own PID, CtxID, FD table | Independent tasks |
| **Thread** | `SpawnThread` | Preemptive (own goroutine, shared parent ctx) | Shared parent context | Parallel subtasks |
| **Coroutine** | `SpawnCoroutine` | Cooperative (yield/resume) | Shared parent context | Streaming, state machines |

### Threads

Threads share the parent process's context but run in their own goroutine:

```go
tid, err := proc.SpawnThread("Analyze security", func(t *Thread) {
    // Runs in parallel, shares parent's CtxID
    // Parent Kill cancels child thread's context
})
```

- Derives context via `context.WithCancel(parentCtx)` — parent Kill cascades
- Each thread has its own TID, state, and Done channel
- `ClearThreads()` during reap cancels all and waits for completion

### Coroutines

Coroutines use cooperative scheduling with explicit yield/resume:

```go
coid, err := proc.SpawnCoroutine("Stream processor", func(co *Coroutine) {
    for item := range items {
        result := process(item)
        co.Yield(result)  // Yield value and suspend
    }
})

// Resume and get yielded value
value, err := proc.ResumeCoroutine(coid)
```

- Channel-pair (`yieldCh`/`resumeCh`) for value passing
- ClearCoroutines handles both blocking states (drain yieldCh, close resumeCh)

---

## Related Documentation

- [Core Concepts](/guide/concepts) — Process model and VFS fundamentals
- [Compose Orchestration](/guide/compose) — Multi-agent DAG workflows
- [Architecture](/guide/architecture) — Kernel internals and process model
- [Reference Manual](/reference/) — Complete IPC syscall signatures
