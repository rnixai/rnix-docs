## 7. Process Model Reference

### 7.1 ProcessState State Machine

```
                  ┌──────────────┐
                  │  Suspended   │
                  └──────────────┘
                   ▲            │
        budget /   │            │ resume
        SIGPAUSE   │            ▼
Created ──→ Running ──→ Zombie ──→ Dead
   │           │           │
   │  Start()  │ Terminate │  Reap()
   │  Begin    │ Complete/ │  Wait reaps
   │  reasoning│ Error/    │  Resource
   │           │ Timeout/  │  release
   │           │ Kill      │
```

| Constant | Value | String Representation | Description |
|------|-----|---------|------|
| `StateCreated` | `0` | `"created"` | Process object allocated, reasoning not started |
| `StateRunning` | `1` | `"running"` | Reasoning loop executing |
| `StateZombie` | `2` | `"zombie"` | Reasoning finished, awaiting resource reclamation |
| `StateDead` | `3` | `"dead"` | All resources released |
| `StateSuspended` | `4` | `"suspended"` | Reasoning loop persistently halted (budget exhausted or SIGPAUSE); resumable |

### 7.2 State Transition Rules

**Valid Transitions:**

| Source State | Target State | Trigger Condition |
|---------|---------|---------|
| Created | Running | `Start()` — reasoning goroutine starts |
| Running | Zombie | `Terminate()` — completed/error/timeout/Kill |
| Running | Suspended | Token/cost budget exhausted, or persistent halt via SIGPAUSE |
| Suspended | Running | `resume` — process re-spawned from checkpoint, reasoning loop restarts |
| Zombie | Dead | `Reap()` — Wait reclaims |

**Invalid Transitions:** All other combinations are invalid. Attempting an invalid transition returns `*SyscallError` (`INTERNAL`).

`StateDead` is a frozen state rather than a terminal one — its on-disk data remains resumable until garbage-collected (see [Process Resumption](/guide/process-resume)).

### 7.3 ExitStatus Structure

```go
type ExitStatus struct {
    Code   int    // 0 = normal exit, non-zero = abnormal
    Reason string // Human-readable exit reason
    Err    error  // Underlying error (nil on normal exit)
}
```

**Common Exit Reasons:**

| Code | Reason | Description |
|------|--------|------|
| `0` | `"completed"` | Normal completion |
| `1` | `"unexpected exit"` | Unexpected exit |
| `1` | `"max steps exceeded"` | Exceeded maximum reasoning steps |
| `1` | Error description | Error during reasoning |
| `2` | `"budget_exceeded"` | Token budget exceeded |

### 7.4 Resource Release Order

`reapProcess` performs resource release in the following strict order (idempotency guaranteed via `sync.Once`):

| Step | Operation | Description |
|------|------|------|
| 0 | `handleOrphanChildren` | Handle orphan child processes: Running children are reparented to PID 0; Zombie children are pushed to reapCh |
| 1 | `Cancel()` | Cancel process context (idempotent) |
| 2 | `wg.Wait()` | Wait for reasoning goroutine to complete (goroutine internally defers `CloseAll` to close all FDs) |
| 3 | `close(DebugChan)` | Set `proc.DebugChan` to `nil` first (under lock), then close the channel |
| 4 | `CtxFree(CtxID)` | Release context space |
| 5 | `Reap()` | State transition Zombie -> Dead |
| 6 | `RemoveProcess(pid)` | Remove from the process table |

### 7.5 Signal Definitions

| Constant | Value | Blockable | Description |
|------|-----|-----------|------|
| `SIGTERM` | `1` | Yes | Termination signal (graceful shutdown) |
| `SIGKILL` | `2` | No | Force kill |
| `SIGINT` | `3` | Yes | Interrupt signal |
| `SIGPAUSE` | `4` | Yes | Pause reasoning loop |
| `SIGRESUME` | `5` | Yes | Resume paused reasoning loop |

**Signal Delivery:** Uses `resolveSignalDisposition` to atomically determine the dispatch path within a single lock hold (blocked → pending / handler / default), avoiding TOCTOU races.

**SIGPAUSE/SIGRESUME:** reasonStep calls `proc.WaitIfPaused()` at the start of each step; if `resumeCh` is non-nil, it blocks until Resume closes the channel. If the process context is cancelled while paused (e.g., killed), the process exits with code 1 and reason `"context cancelled while paused"`.

**SignalTree:** `SignalTree(pid, signal)` delivers a signal to the target process and all its living descendants recursively, skipping zombie/dead processes. Returns the count of affected processes. Used by the dashboard `p` key for tree-wide pause/resume.

### 7.6 Pause State

When a process receives SIGPAUSE, it enters a paused state while remaining in `StateRunning`:

| Field | Type | Description |
|-------|------|-------------|
| `resumeCh` | `chan struct{}` | `nil` = not paused; non-nil = paused, closed on Resume |
| `pausedAt` | `time.Time` | Timestamp when `Pause()` was called; zero when not paused |

**Key behaviors:**

- **Elapsed time freezing**: The dashboard tree freezes the elapsed timer at `PausedAt - CreatedAt` while a process is paused, preventing the timer from ticking during intentional idle periods.
- **Heartbeat monitor**: The heartbeat monitor explicitly skips paused processes. Since paused processes stop sending heartbeats (the reasoning loop is blocked), without this check the monitor would incorrectly flag them as stalled.
- **Idempotent**: `Pause()` is idempotent (no-op if already paused); `Resume()` is idempotent (no-op if not paused).
- **Display**: Paused processes show `⏸` (or `[P]` in ASCII mode) instead of the normal running state badge.
