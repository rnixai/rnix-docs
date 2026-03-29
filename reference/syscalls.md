## 1. Syscall Reference

### 1.1 Overview

The Rnix kernel interface is organized into multiple functional categories, defining a total of 45 syscalls:

| Category | Syscall Count | Responsibilities |
|---------|-------------|------|
| Process Management (ProcessManager) | 5 | Process creation, termination, waiting, querying |
| Context Management (ContextManager) | 4 | Context space allocation, read/write, release |
| File System (FileSystem) | 5 | VFS device open, read/write, close, metadata query |
| Debugging (Debugger) | 1 | Automatic recording and tracing of syscall events |
| IPC (Send, Recv, Pipe, etc.) | 10 | Inter-process message passing and pipes |
| Signal & Capability | 10 | Signal handling, capability grant/revoke/check |
| Supervisor & Init | 10 | Supervisor trees, init bootstrap |

All syscalls return a structured `*SyscallError` on failure (see [6.2 SyscallError](#62-syscallerror)), containing the syscall name, PID, device path, underlying error, and categorized error code.

All syscall entries and exits are automatically recorded as `SyscallEvent` to the process's `DebugChan` (see [1.5 Debugging](#15-debugging-debugger)).

### 1.2 Process Management (ProcessManager)

#### Spawn

Creates and starts an agent process, which automatically enters the reasoning loop.

```
Signature: Spawn(intent string, agent *agents.AgentInfo, opts SpawnOpts) (PID, error)
```

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `intent` | `string` | User intent string |
| `agent` | `*agents.AgentInfo` | Agent definition (optional, `nil` means generic mode) |
| `opts` | `SpawnOpts` | Configuration options (see table below) |

**SpawnOpts Fields:**

| Field | Type | Default | Description |
|------|------|--------|------|
| `Model` | `string` | `""` | LLM model name (priority: CLI > Agent manifest > driver default) |
| `SystemPrompt` | `string` | `""` | System prompt (when non-empty, appended after Agent instructions) |
| `MaxTurns` | `int` | `0` | Maximum reasoning steps (`0` = use default `DefaultMaxSteps=10`) |
| `MaxTokens` | `int` | `0` | Maximum total tokens (`0` = unlimited) |
| `TimeoutMs` | `int64` | `0` | Timeout in milliseconds |
| `ParentPID` | `PID` | `0` | Parent process PID (`0` = top-level CLI spawn) |

**Return Value:** `(PID, error)`

**Error Codes:**

| Error Code | Trigger Condition |
|--------|---------|
| `NOT_FOUND` | Parent process does not exist (`ParentPID > 0` but lookup failed) |
| `INTERNAL` | Context allocation failed or system prompt setup failed |
| `DRIVER` | LLM device `/dev/llm/claude` open failed |

**Behavior:**

1. Creates a `Process` (allocates PID, records Skills, AllowedDevices)
2. Maintains parent-child relationship (registers to parent's Children list when `ParentPID > 0`)
3. Aggregates the Agent's `SystemPrompt()` and `AllowedTools()`
4. `CtxAlloc(64)` — allocates context space
5. `SetSystemPrompt` + `AppendMessage(user, intent)` — initializes context
6. `Open("/dev/llm/claude", O_RDWR)` — obtains LLM device FD
7. Starts goroutine — `Created -> Running` — enters `reasonStep` loop
8. Triggers `OnSpawn` callback notification (with resolved provider and model)

**Example:**

```go
pid, err := kern.Spawn("Analyze code", agentInfo, kernel.SpawnOpts{
    Model:    "sonnet",
    MaxTurns: 5,
})
```

---

#### Kill

Sends a termination signal to the target process.

```
Signature: Kill(pid PID, signal Signal) error
```

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `pid` | `PID` | Target process ID |
| `signal` | `Signal` | `SIGTERM(1)`, `SIGKILL(2)`, `SIGINT(3)`, `SIGPAUSE(4)`, or `SIGRESUME(5)` |

**Return Value:** `error`

**Error Codes:**

| Error Code | Trigger Condition |
|--------|---------|
| `NOT_FOUND` | Process does not exist |
| `INVALID` | Invalid signal value (not SIGTERM or SIGKILL) |

**Idempotency:** Killing a process already in Zombie or Dead state is a no-op and does not return an error.

**Behavior:** Calls the process's `Cancel()` to cancel the context, causing LLM calls in the reasoning goroutine to be interrupted. For `SIGPAUSE`, pauses the reasoning loop; for `SIGRESUME`, resumes a paused loop.

**Example:**

```go
err := kern.Kill(1, types.SIGTERM)
```

---

#### Wait

Blocks until the target process enters Zombie state, then performs the full resource release sequence.

```
Signature: Wait(pid PID) (ExitStatus, error)
```

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `pid` | `PID` | Target process ID |

**Return Value:** `(ExitStatus, error)`

`ExitStatus` structure:

| Field | Type | Description |
|------|------|------|
| `Code` | `int` | Exit code (`0` = normal, non-zero = abnormal) |
| `Reason` | `string` | Human-readable exit reason |
| `Err` | `error` | Underlying error (`nil` on normal exit) |

**Error Codes:**

| Error Code | Trigger Condition |
|--------|---------|
| `NOT_FOUND` | Process does not exist |

**Behavior:** Blocks reading from the `proc.Done` channel. After receiving the exit status, triggers `reapProcess` (resource release sequence, see [7.4 Resource Release Order](#74-resource-release-order)). `reapProcess` guarantees idempotency via `sync.Once` — even if Wait and the background reaper are called concurrently, it executes only once.

**Example:**

```go
exit, err := kern.Wait(1)
fmt.Printf("exit code: %d, reason: %s\n", exit.Code, exit.Reason)
```

---

#### ListProcs

Returns a snapshot list of all processes.

```
Signature: ListProcs() []ProcInfo
```

**Parameters:** None

**Return Value:** `[]ProcInfo`

**ProcInfo Structure:**

| Field | Type | Description |
|------|------|------|
| `PID` | `PID` | Process ID |
| `PPID` | `PID` | Parent process ID |
| `State` | `ProcessState` | Process state |
| `Intent` | `string` | User intent |
| `Skills` | `[]string` | Skill name list |
| `TokensUsed` | `int` | Cumulative token consumption |
| `CreatedAt` | `time.Time` | Creation time |
| `CtxID` | `CtxID` | Context ID |
| `Result` | `string` | Final output result |
| `AllowedDevices` | `[]string` | Device permission whitelist |
| `Provider` | `string` | Resolved LLM provider name |
| `Model` | `string` | Resolved model name |

**Behavior:** Iterates the process table, acquires a lock on each process to read a snapshot. The return value is a value copy with no references to the process objects.

**Example:**

```go
procs := kern.ListProcs()
for _, p := range procs {
    fmt.Printf("PID %d: %s (%s)\n", p.PID, p.Intent, p.State)
}
```

---

#### GetPID

Gets the current process PID, similar to Unix's `getpid(2)` system call.

```
Signature: Process.GetPID() PID
```

**Return Value:** The caller's own process PID (`types.PID`).

**Behavior:** Implemented as a method on `Process` (rather than a `ProcessManager` interface method), because PID is an immutable property of the process itself. PID does not change after creation, so no locking is required.

---

### 1.3 Context Management (ContextManager)

#### CtxAlloc

Allocates a new context space.

```
Signature: CtxAlloc(size int) (CtxID, error)
```

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `size` | `int` | Maximum number of messages |

**Return Value:** `(CtxID, error)`

**Default Value:** `DefaultCtxSize = 64`

**Error Codes:**

| Error Code | Trigger Condition |
|--------|---------|
| `INTERNAL` | `size <= 0` |

**Behavior:** Allocates a globally incrementing `CtxID`, creates an empty `Context` object (`Messages` is an empty slice, `MaxSize` is the specified value).

**Example:**

```go
cid, err := ctxMgr.CtxAlloc(64)
```

---

#### CtxRead

Reads context content.

```
Signature: CtxRead(cid CtxID, offset int, length int) ([]byte, error)
```

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `cid` | `CtxID` | Context ID |
| `offset` | `int` | Message start index (0-based) |
| `length` | `int` | Number of messages to read |

**Special Usage:** `offset=0, length=0` reads all content.

**Return Value:** `([]byte, error)` — JSON-serialized context

**Return Format:**

```json
{
  "system_prompt": "...",
  "messages": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ]
}
```

**Error Codes:**

| Error Code | Trigger Condition |
|--------|---------|
| `NOT_FOUND` | Context does not exist |
| `INTERNAL` | JSON serialization failed |

**Example:**

```go
data, err := ctxMgr.CtxRead(cid, 0, 0) // Read all
```

---

#### CtxWrite

Writes a message to the context.

```
Signature: CtxWrite(cid CtxID, offset int, data []byte) error
```

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `cid` | `CtxID` | Context ID |
| `offset` | `int` | `0` = append new message; `1..N` = overwrite the `offset`-th message (1-based index, corresponds to `Messages[offset-1]`) |
| `data` | `[]byte` | JSON-serialized `Message` |

**Message Format:**

```json
{"role": "system|user|assistant|tool", "content": "...", "tool_call_id": "..."}
```

**Role Enum:** `system`, `user`, `assistant`, `tool`

**Return Value:** `error`

**Error Codes:**

| Error Code | Trigger Condition |
|--------|---------|
| `NOT_FOUND` | Context does not exist |
| `INTERNAL` | JSON parsing failed, capacity full (when `offset=0`), offset out of bounds (`offset < 1` or `offset > len(Messages)`) |

**Example:**

```go
msg := `{"role": "user", "content": "Analyze code"}`
err := ctxMgr.CtxWrite(cid, 0, []byte(msg)) // Append message
```

---

#### CtxFree

Releases context space.

```
Signature: CtxFree(cid CtxID) error
```

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `cid` | `CtxID` | Context ID |

**Return Value:** `error`

**Error Codes:**

| Error Code | Trigger Condition |
|--------|---------|
| `NOT_FOUND` | Context does not exist |

**Example:**

```go
err := ctxMgr.CtxFree(cid)
```

---

### 1.4 File System (FileSystem)

#### Open

Opens a VFS device path and returns a file descriptor.

```
Signature: Open(pid PID, path string, flags OpenFlag) (FD, error)
```

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `pid` | `PID` | Process ID |
| `path` | `string` | VFS path (e.g., `/dev/llm/claude`) |
| `flags` | `OpenFlag` | `O_RDONLY(0)`, `O_WRONLY(1)`, `O_RDWR(2)` |

**Return Value:** `(FD, error)` — FD starts from 3 and increments

**Path Matching Rules:**

1. **Exact match** — path matches exactly (e.g., `/dev/shell`)
2. **Longest prefix match** — selects the longest prefix, remaining part is passed as subpath to the device factory
   - Example: `/dev/fs/path/to/file` -> matches `/dev/fs`, subpath = `/path/to/file`

**Error Codes:**

| Error Code | Trigger Condition |
|--------|---------|
| `NOT_FOUND` | Device does not exist |
| `DRIVER` | Device factory failed to create file |

**Example:**

```go
fd, err := v.Open(pid, "/dev/llm/claude", vfs.O_RDWR)
```

---

#### Read

Reads data from a file descriptor.

```
Signature: Read(pid PID, fd FD, length int) ([]byte, error)
```

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `pid` | `PID` | Process ID |
| `fd` | `FD` | File descriptor |
| `length` | `int` | Maximum number of bytes to read |

**Return Value:** `([]byte, error)`

**Error Codes:**

| Error Code | Trigger Condition |
|--------|---------|
| `NOT_FOUND` | FD is invalid (process has no FDTable or FD does not exist) |
| `DRIVER` | Driver read failed |

**Example:**

```go
data, err := v.Read(pid, fd, 65536)
```

---

#### Write

Writes data to a file descriptor.

```
Signature: Write(ctx context.Context, pid PID, fd FD, data []byte) error
```

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `ctx` | `context.Context` | Supports cancellation (Kill signal interrupts LLM calls) |
| `pid` | `PID` | Process ID |
| `fd` | `FD` | File descriptor |
| `data` | `[]byte` | Data to write |

**Return Value:** `error`

**Error Codes:**

| Error Code | Trigger Condition |
|--------|---------|
| `NOT_FOUND` | FD is invalid |
| `DRIVER` | Driver write failed |

> `Write` accepts a `context.Context` parameter to support interrupting in-progress LLM calls during Kill. This is the only VFS operation that requires a `ctx` parameter.

**Example:**

```go
err := v.Write(ctx, pid, fd, []byte(`{"intent":"Analyze code"}`))
```

---

#### Close

Closes a file descriptor.

```
Signature: Close(pid PID, fd FD) error
```

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `pid` | `PID` | Process ID |
| `fd` | `FD` | File descriptor |

**Return Value:** `error`

**Error Codes:**

| Error Code | Trigger Condition |
|--------|---------|
| `NOT_FOUND` | FD is invalid |
| `DRIVER` | Driver close failed |

**Behavior:** Calls the device's `Close()` method and atomically removes the FD from the FDTable.

**Example:**

```go
err := v.Close(pid, fd)
```

---

#### Stat

Queries path metadata.

```
Signature: Stat(path string) (FileStat, error)
```

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `path` | `string` | VFS path |

**Return Value:** `(FileStat, error)`

**FileStat Structure:**

| Field | Type | Description |
|------|------|------|
| `Name` | `string` | Path name |
| `Size` | `int64` | File size |
| `IsDevice` | `bool` | Whether it is a device |
| `DevicePath` | `string` | Matched device registration path |

**Error Codes:**

| Error Code | Trigger Condition |
|--------|---------|
| `NOT_FOUND` | Device does not exist |
| `DRIVER` | Metadata retrieval failed |

**Example:**

```go
stat, err := v.Stat("/dev/llm/claude")
```

---

### 1.5 Debugging (Debugger)

#### SyscallEvent Automatic Recording

All syscall entries and exits are automatically recorded as `SyscallEvent`, delivered through the process's `DebugChan` (buffer size 256).

**Event Creation:**

```go
event := debug.NewEvent(pid, createdAt, syscall, args)
```

**Event Completion:**

```go
debug.CompleteEvent(&event, result, err, duration)
```

**SyscallEvent Structure:**

| Field | Type | Description |
|------|------|------|
| `Timestamp` | `time.Duration` | Offset relative to process creation time |
| `PID` | `PID` | Process ID |
| `Syscall` | `string` | Matches the interface method name (`"Spawn"`, `"Open"`, `"CtxWrite"`, etc.) |
| `Args` | `map[string]any` | Call parameter snapshot |
| `Result` | `any` | Return value |
| `Err` | `error` | Error information |
| `Duration` | `time.Duration` | Execution duration |

**Delivery Mechanism:**

- Written non-blockingly to `DebugChan` via `debug.EmitEvent(ch, event)`
- Silently dropped when the buffer is full (does not block syscall execution)
- Skipped when `DebugChan` is `nil` (zero overhead)
- Before closing, `proc.DebugChan` is set to `nil` first (under lock) to prevent concurrent writes

**Consumption:** Retrieved via streaming through the IPC `attach_debug` method (see [5.8 AttachDebug Streaming Protocol Example](#58-attachdebug-streaming-protocol-example)).

---


### 8.1 IPC Management (IPCManager)

#### Send

Send a message to the target process.

```
Signature: Send(senderPID PID, targetPID PID, data []byte) error
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `senderPID` | `PID` | Sender process ID |
| `targetPID` | `PID` | Target process ID |
| `data` | `[]byte` | Message data |

**Error Codes:** `NOT_FOUND` (target process does not exist)

#### Recv

Block to receive a message.

```
Signature: Recv(pid PID) (*Message, error)
```

Blocks until a message arrives or the queue is closed (when the process exits).

#### Pipe

Create an inter-process pipe.

```
Signature: Pipe(writerPID PID, readerPID PID) (writeFD FD, readFD FD, error)
```

Returns two file descriptors: writer end and reader end. The AgentShell `|` syntax calls this syscall under the hood.

### 8.2 Signal Management (SignalManager)

#### Signal

Deliver a signal to the target process.

```
Signature: Signal(pid PID, sig Signal) error
```

5 signals:

| Signal | Value | Blockable | Custom Handler | Default Behavior |
|--------|-------|-----------|----------------|------------------|
| `SIGTERM` | `1` | Yes | Yes | Cancel context |
| `SIGKILL` | `2` | No | No | Force Cancel |
| `SIGINT` | `3` | Yes | Yes | Cancel context |
| `SIGPAUSE` | `4` | Yes | Yes | Pause reasoning loop |
| `SIGRESUME` | `5` | Yes | Yes | Resume reasoning loop |

#### SigBlock / SigUnblock

```
Signature: SigBlock(pid PID, sig Signal) error
Signature: SigUnblock(pid PID, sig Signal) error
```

When a signal is blocked, it enters the pending set. When unblocked, pending signals are delivered immediately.

Signal delivery uses `resolveSignalDisposition` to atomically determine the dispatch path within a single lock hold, avoiding TOCTOU races.

### 8.3 Process Group Management (ProcGroupManager)

```
Signature: JoinGroup(pid PID, groupID PGID) error
Signature: LeaveGroup(pid PID, groupID PGID) error
Signature: GetProcGroup(groupID PGID) ([]PID, error)
Signature: SignalGroup(groupID PGID, signal Signal) error
```

`SignalGroup` broadcasts a signal to all members of the group, used for batch control in Compose orchestration.

### 8.4 Mount Management (MountManager)

```
Signature: Mount(path string, config MCPConfig) error
Signature: Unmount(path string) error
Signature: UnmountAll() error
```

MCP servers are mounted to `/mnt/mcp/{pid}-{serverName}` paths. `UnmountAll` is called during Shutdown.

### 8.5 Three-Level Concurrency Model

#### SpawnThread

```
Signature: proc.SpawnThread(intent string, fn func(*Thread)) (TID, error)
```

Shares parent process context with an independent goroutine. When the parent process is killed, child Thread contexts are also cancelled.

#### SpawnCoroutine

```
Signature: proc.SpawnCoroutine(intent string, fn func(*Coroutine)) (CoID, error)
Signature: proc.ResumeCoroutine(coid CoID) (any, error)
```

Cooperative scheduling via `yieldCh`/`resumeCh` channel pairs for value passing.

### 8.6 Supervisor Management

```
Signature: SpawnSupervisor(spec SupervisorSpec) (PID, error)
```

Creates a Supervisor tree node, supporting `one_for_one`, `one_for_all`, and `rest_for_one` restart strategies.

---
