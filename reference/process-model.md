## 7. Process Model Reference

### 7.1 ProcessState State Machine

```
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

### 7.2 State Transition Rules

**Valid Transitions:**

| Source State | Target State | Trigger Condition |
|---------|---------|---------|
| Created | Running | `Start()` — reasoning goroutine starts |
| Running | Zombie | `Terminate()` — completed/error/timeout/Kill |
| Zombie | Dead | `Reap()` — Wait reclaims |

**Invalid Transitions:** All other combinations are invalid. Attempting an invalid transition returns `*SyscallError` (`INTERNAL`).

`StateDead` has no valid subsequent state.

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

**SIGPAUSE/SIGRESUME:** reasonStep calls `proc.WaitIfPaused()` at the start of each step; if `resumeCh` is non-nil, it blocks until Resume closes the channel.
