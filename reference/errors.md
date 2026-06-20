## 6. Error Handling and Type Reference

### 6.1 ErrCode Enum

All error types share a unified `ErrCode` classification code:

| Error Code | Value | Meaning |
|--------|-----|------|
| `ErrTimeout` | `"TIMEOUT"` | Operation timed out |
| `ErrNotFound` | `"NOT_FOUND"` | Resource does not exist (process, context, FD, device) |
| `ErrPermission` | `"PERMISSION"` | Permission denied (e.g., writing to read-only /proc) |
| `ErrInternal` | `"INTERNAL"` | Internal error (state anomaly, serialization failure, etc.) |
| `ErrDriver` | `"DRIVER"` | Device driver error (LLM call failure, file read/write failure, etc.) |
| `ErrInvalid` | `"INVALID"` | Invalid parameter (e.g., invalid signal value) |
| `ErrIsDirectory` | `"IS_DIRECTORY"` | Target path is a directory where a file was expected |
| `ErrBrokenPipe` | `"BROKEN_PIPE"` | Write to a pipe with no live reader |
| `ErrServiceUnavailable` | `"SERVICE_UNAVAILABLE"` | Transient driver/service failure during an in-flight call |
| `ErrAlreadyMounted` | `"ALREADY_MOUNTED"` | Mount path is already in use |
| `ErrResourceExhausted` | `"RESOURCE_EXHAUSTED"` | A resource limit (budget, capacity, quota) has been hit |
| `ErrForceKilled` | `"FORCE_KILLED"` | Graceful SIGTERM timed out and the driver/transport escalated to SIGKILL |
| `ErrDeviceDisconnected` | `"DEVICE_DISCONNECTED"` | Device (e.g., MCP child process) is known-disconnected; the call fast-fails |

### 6.2 SyscallError

Kernel-layer error, returned by all syscalls on failure.

```go
type SyscallError struct {
    Syscall string        // Name of the failing syscall
    PID     types.PID     // PID of the process that invoked the syscall
    Device  string        // Related VFS path
    Err     error         // Underlying error
    Code    types.ErrCode // Categorized error code
}
```

**Formatted Output:** `[TIMEOUT] PID 1 Spawn: /dev/llm/claude (context deadline exceeded)`

**`Unwrap()` Support:** Implements the `errors.Unwrap` interface, supporting `errors.Is` and `errors.As` chained error checking.

### 6.3 VFSError

VFS-layer error, returned by VFS operations on failure.

```go
type VFSError struct {
    Op     string        // Operation name ("Open", "Read", "Write", "Close", "Stat")
    PID    types.PID     // Process PID
    Device string        // VFS path
    Err    error         // Underlying error
    Code   types.ErrCode // Categorized error code
}
```

**Formatted Output:** `[NOT_FOUND] PID 1 Open: /dev/unknown (device not found: /dev/unknown)`

**`Unwrap()` Support:** Yes

### 6.4 DriverError

Driver-layer error, used internally by device drivers to avoid circular dependency from `drivers/` to `kernel/`.

```go
type DriverError struct {
    Op     string        // Operation name
    Device string        // Device path
    Err    error         // Underlying error
    Code   types.ErrCode // Categorized error code
}
```

**Formatted Output:** `[DRIVER] Write: /dev/llm/claude (exec: command not found)`

**`Unwrap()` Support:** Yes

**Error Code Propagation:** The VFS layer extracts the `Code` from `DriverError` via `errors.As` and propagates it to `VFSError`.

### 6.5 ContextError

Context-layer error.

```go
type ContextError struct {
    Op   string        // Operation name ("CtxAlloc", "CtxRead", "CtxWrite", "CtxFree")
    CID  types.CtxID   // Context ID
    Err  error         // Underlying error
    Code types.ErrCode // Categorized error code
}
```

**Formatted Output:** `[NOT_FOUND] CtxID 1 CtxFree: context not found`

**`Unwrap()` Support:** Yes

### 6.6 Basic Types

| Type | Go Definition | Description |
|------|---------|------|
| `PID` | `uint64` | Process ID (increments from 1, never recycled) |
| `FD` | `int` | File descriptor (increments from 3) |
| `CtxID` | `uint64` | Context ID (increments from 1) |
| `ErrCode` | `string` | Error classification code |
| `Signal` | `int` | Process signal |
| `ProcessState` | `int` | Process state |
| `UUID` | `uuid.UUID` | UUID v7 — globally unique process identifier across daemon restarts |
| `TraceID` | `string` | Distributed trace identifier |
| `SpanID` | `string` | Distributed trace span identifier |
| `PGID` | `uint64` | Process group identifier |
| `TID` | `uint64` | Thread identifier |
| `CoID` | `uint64` | Coroutine identifier |

---

