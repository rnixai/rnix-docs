# Rnix Architecture

This document is intended for contributors who want to deeply understand Rnix's internal design. It is recommended to first familiarize yourself with [Core Concepts](concepts.md) before reading — concept definitions are not repeated here; instead, the focus is on **design decisions, interface boundaries, data flow, and extension paths**.

> For specific API signatures and parameter details, see the [Reference Manual](/reference/).
> For hands-on operational guides, see the [Tutorials](/tutorials/).

---

## Table of Contents

1. [Microkernel Design](#_1-microkernel-design)
2. [Process Model](#_2-process-model)
3. [Driver Layer](#_3-driver-layer)
4. [Context Management](#_4-context-management)

---

## 1. Microkernel Design

### 1.1 Design Philosophy

The Rnix kernel uses an **interface composition pattern** — system calls are classified by function into independent sub-interfaces, and a unified `KernelImpl` struct composes their implementations. This design choice emerges from the intersection of the OS metaphor and Go language characteristics:

- **Unix microkernel metaphor**: Traditional microkernels separate process management, filesystem, and IPC into independent servers. Rnix simulates this separation within a single process using interface boundaries, with each sub-interface taking responsibility for a single functional domain.
- **Natural fit with Go interface composition**: Go's philosophy of small interfaces + composition over large interfaces is a perfect match — each sub-interface defines only 2-5 methods, with clear responsibilities, independently testable and evolvable.

Design record: Interface composition vs single large interface vs function collection — the core reason for choosing interface composition is **extensibility**: adding a new category of syscalls only requires defining a new interface and implementing it on `KernelImpl`, without affecting compilation or testing of existing sub-interfaces.

### 1.2 KernelImpl and Sub-Interfaces

`KernelImpl` is the kernel's core implementation struct, defined in `kernel/kernel.go`:

```go
type KernelImpl struct {
    procTable   *xsync.SyncMap[types.PID, *Process]
    vfs         *vfs.VFS
    ctxMgr      *rnixctx.Manager
    callbacks   KernelCallbacks
    reapCh      chan types.PID
    stopCh      chan struct{}
    reaperWg    sync.WaitGroup
    shutdownOnce sync.Once
    msgQueues   *xsync.SyncMap[types.PID, *MessageQueue]
    msgSeq      atomic.Uint64
    procGroups  *xsync.SyncMap[types.PGID, *ProcGroup]
    mountMgr    MountManager
}
```

It implicitly implements the following 6 classified sub-interfaces through its method set:

| Sub-Interface | Methods | Responsibility |
|---------------|---------|----------------|
| **ProcessManager** | `Spawn(intent, agent, opts) (PID, error)` | Process creation (allocate PID, context, FD, start reasoning goroutine) |
|  | `Kill(pid, signal) error` | Send signal to process (SIGTERM/SIGKILL/SIGPAUSE/SIGRESUME) |
|  | `Wait(pid) (ExitStatus, error)` | Block until process ends and trigger reapProcess resource release |
| **MountManager** | `Mount(path, config) error` | Mount MCP server to `/mnt/mcp/` |
|  | `Unmount(path) error` | Unmount MCP server |
|  | `UnmountAll() error` | Unmount all MCP (called during Shutdown) |
| **IPCManager** | `Send(senderPID, targetPID, data) error` | Send message to target process |
|  | `Recv(pid) (*Message, error)` | Block to receive message |
|  | `Pipe(writerPID, readerPID) (writeFD, readFD, error)` | Create inter-process pipe |
| **SignalManager** | `Signal(pid, sig) error` | Deliver signal (includes custom handler dispatch) |
|  | `SigBlock(pid, sig) error` | Block signal |
|  | `SigUnblock(pid, sig) error` | Unblock signal and deliver pending |
| **ProcGroupManager** | `JoinGroup(pid, groupID) error` | Join process group |
|  | `LeaveGroup(pid, groupID) error` | Leave process group |
|  | `GetProcGroup(groupID) ([]PID, error)` | Query process group member list |
|  | `SignalGroup(groupID, signal) error` | Broadcast signal to process group |
| **SupervisorManager** | `SpawnSupervisor(spec) (PID, error)` | Create supervisor tree node |

Compile-time interface compliance check ensures `KernelImpl` satisfies the `ProcessManager` constraint:

```go
var _ ProcessManager = (*KernelImpl)(nil)
```

### 1.3 KernelCallbacks Mechanism

`KernelCallbacks` is the notification channel from kernel to CLI/UI layer, decoupling kernel from presentation logic:

```go
type KernelCallbacks interface {
    OnSpawn(pid types.PID, intent, provider, model string)
    OnStep(pid types.PID, step int, total int)
    OnComplete(pid types.PID, result string, exit ExitStatus)
    OnError(pid types.PID, err error)
}
```

| Callback | Trigger | Purpose |
|----------|---------|---------|
| OnSpawn | After process registered in process table | CLI displays `[kernel] spawning PID N (provider/model)...` |
| OnStep | At start of each reasonStep loop | CLI displays `[agent] step X/N` |
| OnComplete | After finishProcess writes ExitStatus | CLI displays final result and exit code |
| OnError | When exit.Err is non-nil in finishProcess | CLI displays error message |

Passing `nil` disables callbacks (silent mode), suitable for testing and embedded integration.

### 1.4 Data Flow: From Spawn to Completion

A complete agent execution follows this data flow:

```
CLI Layer                Kernel Layer              VFS/Driver Layer
  │                        │                         │
  │  Spawn(intent, agent)  │                         │
  ├───────────────────────>│                         │
  │                        │  CtxAlloc(64)           │
  │                        ├────────────────────────>│ context.Manager
  │                        │                         │
  │                        │  SetSystemPrompt(cid)   │
  │                        ├────────────────────────>│ context.Manager
  │                        │                         │
  │                        │  Open(/dev/llm/claude)  │
  │                        ├────────────────────────>│ vfs.DeviceRegistry
  │                        │                         │
  │                        │  [Start reasoning goroutine]
  │                        │                         │
  │     OnSpawn(pid, provider, model) │                         │
  │<───────────────────────│                         │
  │                        │                         │
  │                     ┌──┤ reasonStep loop         │
  │     OnStep(1/10)    │  │                         │
  │<────────────────────┤  │  BuildPrompt(cid)       │
  │                     │  ├────────────────────────>│ context.Manager
  │                     │  │                         │
  │                     │  │  Write(llmFD, req)      │
  │                     │  ├────────────────────────>│ /dev/llm/claude
  │                     │  │                         │
  │                     │  │  Read(llmFD)            │
  │                     │  ├────────────────────────>│ /dev/llm/claude
  │                     │  │                         │
  │                     │  │  [Parse action]         │
  │                     │  │                         │
  │                     │  │  If tool_call:          │
  │                     │  │  Open/Write/Read/Close   │
  │                     │  ├────────────────────────>│ /dev/fs, /dev/shell, ...
  │                     │  │                         │
  │                     │  │  AppendToolResult(cid)   │
  │                     │  ├────────────────────────>│ context.Manager
  │                     │  │                         │
  │                     └──┤ If text → complete      │
  │                        │                         │
  │                        │  finishProcess(exit)     │
  │   OnComplete(result)   │                         │
  │<───────────────────────│                         │
  │                        │                         │
  │  Wait(pid) / Reap      │                         │
  ├───────────────────────>│  reapProcess sequence   │
  │                        ├────────────────────────>│ CtxFree, CloseAll, ...
```

### 1.5 Extension Paths

**Adding a new syscall:**

1. Define a new interface in `kernel/kernel.go` (e.g., `type FooManager interface { ... }`)
2. Implement methods on `KernelImpl`
3. Add compile-time check: `var _ FooManager = (*KernelImpl)(nil)`
4. Register the new syscall name in `debug.NewEvent`
5. Add an IPC method (`ipc/protocol.go`) so CLI can invoke it

**Adding a new device driver:**

1. Implement a `vfs.VFSFileFactory` function
2. Call `devRegistry.Register(path, factory)` in the initialization code in `cmd/rnix/main.go`
3. VFS automatically handles Open/Read/Write/Close routing

---

## 2. Process Model

### 2.1 Process Struct Design

`Process` is defined in `kernel/process.go` and is the complete runtime representation of a Rnix process. Fields are grouped by function:

**Identity and State (immutable / mu-protected):**

| Field | Type | Description |
|-------|------|-------------|
| PID | `types.PID` | Globally unique, immutable after creation |
| UUID | `uuid.UUID` | UUID v7 — globally unique across daemon restarts, time-ordered |
| PPID | `types.PID` | Parent process PID, modifiable when orphan is reparented |
| State | `types.ProcessState` | Current state machine state, mu-protected |
| Intent | `string` | Intent description at creation, immutable |
| Skills | `[]string` | List of loaded skill names |
| Children | `[]types.PID` | Child process PID list |
| CreatedAt | `time.Time` | Process creation time (used for elapsed and strace timestamps) |
| Exit | `*ExitStatus` | Non-nil when Zombie/Dead, records exit status |

**Resources and Channels:**

| Field | Type | Description |
|-------|------|-------------|
| FDTable | `map[types.FD]vfs.VFSFile` | File descriptor table (VFS manages actual state internally) |
| DebugChan | `chan types.SyscallEvent` | Buffer 256, strace trace channel |
| LogChan | `chan types.LogEntry` | Buffer 256, reasoning log channel |
| Done | `chan ExitStatus` | Buffer 1, process exit signal |
| CtxID | `types.CtxID` | Associated context space ID |

**Reasoning State:**

| Field | Type | Description |
|-------|------|-------------|
| Result | `string` | Final reasoning output |
| TokensUsed | `int` | Cumulative token consumption |
| ContextBudget | `int` | Token budget (0 = unlimited) |
| AllowedDevices | `[]string` | Device whitelist (nil = all allowed) |
| MCPMounts | `[]string` | Auto-mounted MCP paths |

**Concurrency Subsystems (all mu-protected):**

| Field | Type | Description |
|-------|------|-------------|
| groups | `[]types.PGID` | Process group memberships |
| sigHandlers | `map[Signal]SignalHandler` | Custom signal handlers |
| blockedSignals | `map[Signal]struct{}` | Blocked signal set |
| pendingSignals | `map[Signal]struct{}` | Pending signal set |
| resumeCh | `chan struct{}` | SIGPAUSE/SIGRESUME coordination (`nil` = not paused) |
| pausedAt | `time.Time` | Timestamp when Pause() was called; zero if not paused |
| threads | `map[TID]*Thread` | Thread table |
| coroutines | `map[CoID]*Coroutine` | Coroutine table |

**Synchronization Primitives:**

| Field | Type | Description |
|-------|------|-------------|
| mu | `sync.Mutex` | Protects all mutable state |
| cancel | `context.CancelFunc` | Cancels reasoning goroutine |
| ctx | `context.Context` | Reasoning goroutine's context |
| wg | `sync.WaitGroup` | Waits for reasoning goroutine completion |
| reapOnce | `sync.Once` | Ensures reapProcess executes only once |

### 2.2 State Machine

Process states follow strict one-directional transition rules; rollback is not allowed:

```
Created ──Start()──→ Running ──Terminate()──→ Zombie ──Reap()──→ Dead
```

| Transition | Method | Trigger |
|------------|--------|---------|
| Created → Running | `Start()` | Reasoning goroutine launches |
| Running → Zombie | `Terminate(exit)` | Reasoning complete/error/timeout/Kill/budget exceeded |
| Zombie → Dead | `Reap()` | Wait call or auto-reaper cleanup |

State transition logic uses a `validTransitions` table-driven approach:

```go
var validTransitions = map[types.ProcessState][]types.ProcessState{
    types.StateCreated: {types.StateRunning},
    types.StateRunning: {types.StateZombie},
    types.StateZombie:  {types.StateDead},
}
```

Illegal transitions return `*SyscallError` (`ErrInternal`). `transitionLocked` checks transition legality while holding mu, ensuring concurrency safety.

### 2.3 PID Allocation Strategy

PIDs use a package-level `atomic.Uint64` for globally incrementing allocation:

```go
var pidCounter atomic.Uint64

func nextPID() types.PID {
    return types.PID(pidCounter.Add(1))
}
```

Design decisions:

- **No recycling**: PIDs increase monotonically, never reused. This simplifies process reference lifecycle management — references holding old PIDs won't accidentally point to new processes.
- **Starting from 1**: PID 0 is reserved for the "kernel/init" virtual process; top-level processes spawned directly by CLI have PPID 0.
- **Atomic operations**: No locking needed; multiple concurrent Spawns are safe.

### 2.4 Goroutine Lifecycle Management

Each process has a **dedicated reasoning goroutine**, launched during Spawn:

```go
proc.wg.Add(1)
go func() {
    defer proc.wg.Done()
    defer func() { _ = k.vfs.CloseAll(proc.PID) }()
    _ = proc.Start()    // Created → Running
    k.reasonStep(proc, llmFD, opts)
}()
```

Key constraints:

1. **wg tracking**: `wg.Add(1)` is called before goroutine launch; `wg.Done()` is ensured via defer. `wg.Wait()` in reapProcess waits for goroutine exit.
2. **context.Cancel cancellation**: Kill(SIGKILL) calls `proc.Cancel()`; the reasonStep loop checks `proc.ctx.Done()` at the start of each step.
3. **defer CloseAll**: All open VFS file descriptors are closed before goroutine exit.
4. **SIGPAUSE/SIGRESUME**: reasonStep calls `proc.WaitIfPaused()` at the start of each step; if `resumeCh` is non-nil, it blocks until Resume closes the channel. If the process context is cancelled while paused (e.g., killed via SIGKILL), the process exits with code 1 and reason `"context cancelled while paused"`. The `pausedAt` field records when the pause started, enabling the dashboard to freeze the elapsed timer at `PausedAt - CreatedAt`. The heartbeat monitor explicitly skips paused processes to avoid false stall detection.

### 2.5 Resource Release Order

`reapProcess` (defined in `kernel/reap.go`) executes a strict resource release sequence. Idempotency is ensured via `reapOnce` — Wait and the auto-reaper may call concurrently, but only the first one executes:

| Step | Operation | Purpose |
|------|-----------|---------|
| 1 | `handleOrphanChildren(proc)` | Reparent running children to PID 0, push zombie children to reapCh |
| 2 | `proc.Cancel()` | Cancel context, notify reasoning goroutine to stop |
| 3 | `proc.wg.Wait()` | Wait for reasoning goroutine exit (its defer calls CloseAll) |
| 4 | `close(DebugChan)`, `close(LogChan)` | Nil-ify first then close, preventing race with emitEvent |
| 5 | `msgQueue.close()` | Close message queue, unblock Recv |
| 6 | `removeFromAllGroups` | Clean up process group memberships |
| 7 | `ClearSignalState()` | Clean up signal handler/blocked/pending/resumeCh |
| 8 | `ClearThreads()` | Cancel all threads and wait for completion |
| 9 | `ClearCoroutines()` | Clean up coroutines (close resumeCh, drain yieldCh) |
| 10 | `CtxFree(CtxID)` | Free context space |
| 11 | `proc.Reap()` | Zombie → Dead state transition |
| 12 | `RemoveProcess(pid)` | Remove from process table |

Step order is critical: orphan children must be handled first (step 1), then stop the goroutine (steps 2-3), then close channels (steps 4-5), and finally release resources (steps 10-12).

### 2.6 Three-Level Concurrency Model

Rnix provides three granularities of concurrency primitives, mapped to different use cases:

| Level | Primitive | Scheduling Model | Resource Isolation | Use Case |
|-------|-----------|-------------------|-------------------|----------|
| **Process** | `Spawn` | Preemptive (independent goroutine + context) | Independent PID, CtxID, FD table | Independent tasks |
| **Thread** | `SpawnThread` | Preemptive (independent goroutine, shared parent ctx) | Shared parent process context | Parallel subtasks |
| **Coroutine** | `SpawnCoroutine` | Cooperative (yield/resume) | Shared parent process context | Streaming, state machines |

The Thread struct contains TID, ParentPID, Intent, State, Done, Result, Err and internal sync fields (mu, cancel, ctx), deriving a child context via `context.WithCancel(parentCtx)`. When the parent process is killed, child Thread contexts are also cancelled.

Coroutines use `yieldCh` / `resumeCh` channel pairs for cooperative yielding and resuming, with value passing. ClearCoroutines during process reaping handles two blocking scenarios: blocking on `yieldCh <- value` (resolved by a drain goroutine) and blocking on `<-resumeCh` (resolved by closing the channel).

### 2.7 Process Groups and Signal System

**Process groups** allow logically grouping multiple processes, broadcasting signals to all members via `SignalGroup`, suitable for batch control in Compose orchestration.

**The signal system** supports 5 signals:

| Signal | Blockable | Custom Handler | Default Behavior |
|--------|-----------|----------------|------------------|
| SIGTERM | Yes | Yes | Cancel context |
| SIGKILL | No | No | Force Cancel |
| SIGINT | Yes | Yes | Cancel context |
| SIGPAUSE | Yes | Yes | Pause reasoning loop |
| SIGRESUME | Yes | Yes | Resume reasoning loop |

Signal delivery uses `resolveSignalDisposition` to atomically determine the dispatch path within a single lock hold (blocked → pending / handler / default), avoiding TOCTOU races.

---

## 3. Driver Layer

### 3.1 VFS Device Registration Mechanism

VFS (Virtual File System) is Rnix's resource abstraction layer. All external resources — LLM, filesystem, shell, MCP tools — are uniformly represented as "files" that can be Open/Read/Write/Closed.

**Core Abstraction (`vfs/vfs.go`):**

```go
type VFSFile interface {
    Read(length int) ([]byte, error)
    Write(ctx context.Context, data []byte) error
    Close() error
    Stat() (FileStat, error)
}

type VFSFileFactory func(subpath string, flags OpenFlag) (VFSFile, error)
```

**Device Registry (`vfs/dev.go`):**

`DeviceRegistry` uses `xsync.Registry` (a `sync.Map`-based registry with register/unregister semantics) to manage path-to-factory mappings:

```go
type DeviceRegistry struct {
    registry *xsync.Registry[VFSFileFactory]
}
```

- `Register(path, factory)`: Register device (path must be unique; duplicate registration returns error)
- `Unregister(path)`: Unregister device (used during MCP Unmount)
- `Open(path, flags)`: Exact match first, then longest prefix match (`/dev/llm/claude` matches `/dev/llm/claude/subpath`)

**Path Resolution Strategy:**

1. Exact match: `Open("/dev/fs", ...)` → factory("", flags)
2. Longest prefix match: `Open("/dev/fs/src/main.go", ...)` → factory("/src/main.go", flags)

This allows device drivers to handle subpaths — for example, the `/dev/fs` driver accesses arbitrary files in the host filesystem via subpath.

**FD Table:**

Each process has an independent FD table (`fdTable`) in the VFS layer, with FDs allocated starting from 3 (0/1/2 reserved for semantic alignment with stdin/stdout/stderr). The FD table is managed by VFS, not directly held by the Process struct — Process.FDTable is only used to track whether an FD exists.

### 3.2 Registered Devices

The following devices are registered at system startup in `cmd/rnix/main.go`:

| Device Path | Driver Package | Description |
|-------------|---------------|-------------|
| `/dev/llm/claude` | `drivers/llm` | LLM calls (Claude Code CLI) |
| `/dev/llm/cursor` | `drivers/llm` | LLM calls (Cursor CLI) |
| `/dev/fs` | `drivers/fs` | Host filesystem read-only access |
| `/dev/shell` | `drivers/shell` | Shell command execution |
| `/proc` | `vfs.ProcFS` | Dynamic process info (`/proc/{pid}/status`, `intent`, `context`) |
| `/mnt/mcp/{pid}-{server}` | Dynamic registration | MCP tools (auto-mounted during Spawn) |

### 3.3 LLMDriver Interface

LLMDriver is defined in `drivers/llm/driver.go` and abstracts LLM capabilities:

```go
type LLMDriver interface {
    Call(ctx context.Context, req LLMRequest) (*LLMResponse, error)
    Stream(ctx context.Context, req LLMRequest) (<-chan StreamEvent, error)
    Info() DriverInfo
}
```

**LLMRequest:**

| Field | Type | Description |
|-------|------|-------------|
| Intent | `string` | User intent |
| SystemPrompt | `string` | System prompt |
| Model | `string` | Model identifier (empty = driver default) |
| MaxTurns | `int` | Maximum interaction turns |
| TimeoutMs | `int64` | Timeout in milliseconds |

**LLMResponse:**

| Field | Type | Description |
|-------|------|-------------|
| Content | `string` | LLM output content |
| TokensUsed | `int` | Tokens consumed in this call |

Current implementation includes two LLM drivers:

| Driver | VFS Path | CLI Command | Features |
|--------|----------|-------------|----------|
| `ClaudeCliDriver` | `/dev/llm/claude` | `claude -p` | Supports `--system-prompt`, `--max-turns` |
| `CursorCliDriver` | `/dev/llm/cursor` | `agent --print` | System prompt concatenated into prompt, no `--max-turns` |

Adding a new LLM driver only requires implementing the `LLMDriver` interface and registering it with VFS. The kernel's Spawn resolves the LLM device path via `resolveLLMDevice()` based on the `--provider` CLI flag or agent.yaml `models.provider`. reasonStep interacts with the LLM through VFS Read/Write, without directly depending on specific driver implementations.

### 3.4 MCP Mount Mechanism

MCP (Model Context Protocol) integration is implemented through dynamic mounting, exposing MCP tools as VFS paths to agents.

**MCPTransport Interface (`vfs/mcp.go`):**

```go
type MCPTransport interface {
    Connect(ctx context.Context) error
    Call(ctx context.Context, method string, params json.RawMessage) (json.RawMessage, error)
    Close() error
    Ping(ctx context.Context) error
}

type TransportFactory func(config MCPConfig) (MCPTransport, error)
```

The interface is defined in the `vfs` package (not `drivers/mcp`) — this is a **dependency inversion** design: vfs defines the interface, drivers/mcp provides the implementation, avoiding a reverse dependency from vfs → drivers.

**MountManager (interface defined in `kernel/kernel.go`, implemented in `vfs/mount.go`'s `vfs.MountManager` struct):**

Mount flow:
1. `TransportFactory(config)` → create transport
2. `transport.Connect(ctx)` → establish connection (500ms timeout)
3. `mcpFileFactory(transport)` → create VFSFileFactory
4. `devReg.Register(path, factory)` → register in device registry
5. Store mount record

Unmount flow:
1. Remove from mounts table
2. `transport.Close()` → close connection
3. `devReg.Unregister(path)` → remove from device registry

**VFS Subpath Mapping:**

Subpaths under the mount point map to MCP protocol operations:

| VFS Path | MCP Operation | Read Behavior | Write Behavior |
|----------|---------------|---------------|----------------|
| `/mnt/mcp/{mount}/` | — | Returns `["tools","resources"]` | — |
| `/mnt/mcp/{mount}/tools` | `tools/list` | Returns tool list | — |
| `/mnt/mcp/{mount}/tools/{name}` | `tools/call` | Returns last call result | Invokes tool call |
| `/mnt/mcp/{mount}/resources` | `resources/list` | Returns resource list | — |
| `/mnt/mcp/{mount}/resources/{uri}` | `resources/read` | Reads resource content | — |

### 3.5 Agent Auto-Mount Lifecycle

An agent's `agent.yaml` can declare MCP dependencies. These are handled automatically during Spawn:

1. **Mount**: Iterate `agent.MCPConfigs`, execute `Mount("/mnt/mcp/{pid}-{serverName}", config)` for each MCP server
2. **Whitelist injection**: Mount paths are automatically added to `proc.AllowedDevices`
3. **Failure rollback**: If any MCP mount fails, already-mounted paths are rolled back, context is freed, and an error is returned
4. **Auto-unmount**: `finishProcess` calls `Unmount` for each mount before terminating the process; unmount failures do not block process exit

---

## 4. Context Management

### 4.1 Context Struct

`Context` is defined in `context/context.go` and represents an independent conversation space:

```go
type Context struct {
    ID           types.CtxID
    SystemPrompt string
    Messages     []Message
    MaxSize      int
    mu           sync.RWMutex
}

type Message struct {
    Role       Role   `json:"role"`
    Content    string `json:"content"`
    ToolCallID string `json:"tool_call_id,omitempty"`
}
```

Role enum: `system`, `user`, `assistant`, `tool`.

MaxSize limits the Messages slice length (number of messages). The current MVP does not limit individual message byte size.

### 4.2 Manager Methods

`Manager` manages the complete context lifecycle, with methods in three categories:

**Allocation and Release:**

| Method | Signature | Description |
|--------|-----------|-------------|
| CtxAlloc | `(size int) (CtxID, error)` | Allocate context, size is message capacity |
| CtxFree | `(cid CtxID) error` | Free context (reapProcess step 10) |

**Content Operations:**

| Method | Signature | Description |
|--------|-----------|-------------|
| SetSystemPrompt | `(cid, prompt) error` | Set/update system prompt |
| AppendMessage | `(cid, role, content) error` | Append conversation message |
| AppendToolResult | `(cid, toolCallID, content) error` | Append tool execution result |
| CtxWrite | `(cid, offset, data) error` | Low-level write (offset=0 append, >0 overwrite) |
| CtxRead | `(cid, offset, length) ([]byte, error)` | Low-level read (JSON serialized) |

**Query:**

| Method | Signature | Description |
|--------|-----------|-------------|
| BuildPrompt | `(cid) (*PromptResult, error)` | Assemble complete LLM prompt |
| GetContextSummary | `(ctxID) (string, error)` | Summary for `/proc/{pid}/context` |

### 4.3 Prompt Assembly Flow

`BuildPrompt` returns a `PromptResult` containing `SystemPrompt` and `Messages` fields. reasonStep assembles these into an LLM request:

1. **System prompt construction** (Spawn phase):
   - `Agent.SystemPrompt()` = instructions.md content + all activated Skill bodies injected
   - If SpawnOpts also provides SystemPrompt, concatenate: `opts.SystemPrompt + "\n\n" + agentPrompt`

2. **Message history accumulation** (reasonStep loop):
   - Initial: AppendMessage(user, intent)
   - Each LLM response: AppendMessage(assistant, resp.Content)
   - Tool call results: AppendToolResult(toolPath, result)

3. **Send to LLM**:
   - `BuildPrompt(cid)` → PromptResult (SystemPrompt + Messages snapshot)
   - Serialize to `llmRequest{Intent, SystemPrompt, Model, Messages}`
   - Write to LLM VFS device

### 4.4 Token Budget Management

Token budgets prevent a single process from over-consuming LLM resources.

**Budget source priority (highest to lowest):**

1. `SpawnOpts.ContextBudget` (CLI `--budget` or Compose config)
2. `AgentManifest.ContextBudget` (configured in agent.yaml)
3. 0 (unlimited)

Negative budgets are normalized to 0 during Spawn.

**Execution logic** (in the reasonStep loop):

```
After each LLM Read returns:
    proc.TokensUsed += resp.TokensUsed

    if budget > 0 && TokensUsed >= ContextBudget:
        emitLog("Token budget exceeded: N/M")
        emitEvent(action: "budget_exceeded")
        finishProcess(ExitStatus{Code: 2, Reason: "budget_exceeded"})
        return
```

Exit code conventions:
- **0** — Normal completion
- **1** — Error (LLM failure, tool failure, timeout, etc.)
- **2** — Budget exceeded (`budget_exceeded`)

### 4.5 Context and Process Lifecycle Binding

Context lifecycle is strictly bound to its owning process:

| Process Event | Context Operation |
|---------------|-------------------|
| Spawn begins | `CtxAlloc(64)` allocates context |
| Spawn fails (MCP mount error, etc.) | `CtxFree(cid)` immediate release |
| reasonStep loop | Continuous AppendMessage / BuildPrompt |
| reapProcess step 10 | `CtxFree(cid)` final release |

Threads and Coroutines share the parent process's context (via CtxID) and do not allocate independently. This means concurrent threads' AppendMessage calls to the same context are serialized by `Context.mu`, ensuring message order consistency.

---

## 5. Step Recording System

### 5.1 StepRecord

Each `reasonStep` iteration is recorded as a `StepRecord`, capturing the complete execution data for debugging and analysis:

| Field | Type | Description |
|-------|------|-------------|
| StepNumber | `int` | Sequential step counter |
| Timestamp | `time.Time` | Step start time |
| Messages | `[]Message` | LLM messages sent in this step |
| TokensUsed | `int` | Tokens consumed in this step |
| RawResponse | `string` | Full LLM response |
| Action | `string` | Action type (tool_call, plan, spawn, complete, specialize, replan, text) |
| Summary | `string` | Step summary |
| ToolPath | `string` | VFS path (for tool_call actions) |
| ToolInput | `string` | Tool input data |
| ToolResult | `string` | Tool execution result |
| ToolError | `string` | Tool error (if any) |

### 5.2 StepWriter

`StepWriter` persists `StepRecord` entries as NDJSON (one JSON object per line) to disk:

```
.rnix/data/steps/<uuid>/steps.jsonl
```

The directory is keyed by process UUID, enabling cross-session access to historical step data even after the daemon restarts.

### 5.3 IPC Methods

Two IPC methods expose step data:

| Method | Type | Description |
|--------|------|-------------|
| `get_step_detail` | Request-Response | Retrieve a single step record by PID and step number |
| `list_steps` | Request-Response | List all step summaries for a process |

These methods power the Dashboard's history view and LLM conversation viewer.

---

## Further Reading

- [Core Concepts](/guide/concepts) — Build the Rnix mental model
- [Reference Manual](/reference/) — Precise API signatures and parameter details
- [Tutorials](/tutorials/) — Hands-on practical guides
  - [Writing Your First Skill](/tutorials/writing-first-skill)
  - [Debugging Your First Bug](/tutorials/debugging-first-bug)
  - [Composing Multi-Agent Workflows](/tutorials/composing-multi-agent-workflow)
