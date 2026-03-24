# Rnix Reference Manual

This manual is the authoritative technical reference for Rnix, intended for developers who write Agents/Skills using Rnix or debug issues. All signatures, parameters, return values, paths, and protocols in this document precisely match the current code implementation.

> For an introduction to Rnix's design philosophy and core concepts, see the [Core Concepts documentation](/guide/concepts).
> For quick installation and first-run guidance, see the [Quick Start Guide](/guide/quick-start).

---

## Table of Contents

1. [Syscall Reference](#1-syscall-reference)
   - [1.1 Overview](#11-overview)
   - [1.2 Process Management (ProcessManager)](#12-process-management-processmanager)
   - [1.3 Context Management (ContextManager)](#13-context-management-contextmanager)
   - [1.4 File System (FileSystem)](#14-file-system-filesystem)
   - [1.5 Debugging (Debugger)](#15-debugging-debugger)
2. [VFS Path Specification](#2-vfs-path-specification)
   - [2.1 Overview](#21-overview)
   - [2.2 /dev/llm/claude — LLM Driver Device](#22-devllmclaude--llm-driver-device)
   - [2.3 /dev/fs — Host Filesystem Device](#23-devfs--host-filesystem-device)
   - [2.4 /dev/shell — Shell Execution Device](#24-devshell--shell-execution-device)
   - [2.5 /proc/{pid}/ — Dynamic Process Information](#25-procpid--dynamic-process-information)
   - [2.6 Agent and Skill Definitions](#26-agent-and-skill-definitions)
   - [2.7 VFSFile Interface and OpenFlag Enum](#27-vfsfile-interface-and-openflag-enum)
   - [2.8 FD Allocation Rules](#28-fd-allocation-rules)
3. [Agent and Skill Manifests](#3-agent-and-skill-manifests)
   - [3.1 agent.yaml Field Descriptions](#31-agentyaml-field-descriptions)
   - [3.2 AgentModels Sub-structure](#32-agentmodels-sub-structure)
   - [3.3 instructions.md Format](#33-instructionsmd-format)
   - [3.4 Agent Loading Process](#34-agent-loading-process)
   - [3.5 SKILL.md Format](#35-skillmd-format)
   - [3.6 SkillManifest Fields](#36-skillmanifest-fields)
   - [3.7 Progressive Loading Strategy](#37-progressive-loading-strategy)
   - [3.8 Complete Example](#38-complete-example)
4. [CLI Command Reference](#4-cli-command-reference)
   - [4.1 Global Flags](#41-global-flags)
   - [4.2 rnix \[intent\] — Root Command](#42-rnix-intent--root-command)
   - [4.3 rnix ps — Process List](#43-rnix-ps--process-list)
   - [4.4 rnix kill — Process Termination](#44-rnix-kill-pid--process-termination)
   - [4.5 rnix strace — Syscall Tracing](#45-rnix-strace-pid--syscall-tracing)
   - [4.6 rnix version — Version Information](#46-rnix-version--version-information)
   - [4.7 JSON Response Format](#47-json-response-format)
   - [4.8 rnix init — Initialize Configuration](#48-rnix-init--initialize-configuration)
   - [4.9 rnix top — Real-time Process Monitor](#49-rnix-top--real-time-process-monitor)
   - [4.10 rnix log — Reasoning Log Viewer](#410-rnix-log--reasoning-log-viewer)
   - [4.11 rnix gdb — Interactive Debugger](#411-rnix-gdb--interactive-debugger)
   - [4.12 rnix dashboard — Visual Debugging Dashboard](#412-rnix-dashboard--visual-debugging-dashboard)
   - [4.13 rnix record — Execution Recording](#413-rnix-record--execution-recording)
   - [4.14 rnix replay — Replay Recorded Trace](#414-rnix-replay--replay-recorded-trace)
   - [4.15 rnix trace — Distributed Trace Viewer](#415-rnix-trace--distributed-trace-viewer)
   - [4.16 rnix ctx-profile — Context Usage Analyzer](#416-rnix-ctx-profile--context-usage-analyzer)
   - [4.17 rnix ctx-growth — Context Growth Predictor](#417-rnix-ctx-growth--context-growth-predictor)
   - [4.18 rnix compose — Multi-Agent Orchestration](#418-rnix-compose--multi-agent-orchestration)
   - [4.19 rnix apply — Declarative Intent Decomposition](#419-rnix-apply--declarative-intent-decomposition)
   - [4.20 rnix intent — Intent Management](#420-rnix-intent--intent-management)
   - [4.21 rnix skill — Skill Package Management](#421-rnix-skill--skill-package-management)
   - [4.22 rnix run — AgentShell Script Runner](#422-rnix-run--agentshell-script-runner)
   - [4.23 rnix serve — OpenAI-Compatible HTTP Gateway](#423-rnix-serve--openai-compatible-http-gateway)
   - [4.24 rnix agtest — Agent Behavior Testing](#424-rnix-agtest--agent-behavior-testing)
   - [4.25 rnix reputation — Agent Reputation Scores](#425-rnix-reputation--agent-reputation-scores)
   - [4.26 rnix lineage — Stem Agent Differentiation Lineage](#426-rnix-lineage--stem-agent-differentiation-lineage)
   - [4.27 rnix topology — Collaboration Topology](#427-rnix-topology--collaboration-topology)
   - [4.28 rnix synergy — Skill Synergy Combinations](#428-rnix-synergy--skill-synergy-combinations)
   - [4.29 rnix immune — Adaptive Immune Security](#429-rnix-immune--adaptive-immune-security)
5. [IPC Architecture](#5-ipc-architecture)
   - [5.1 Daemon Lifecycle](#51-daemon-lifecycle)
   - [5.2 Socket Path Rules](#52-socket-path-rules)
   - [5.3 NDJSON Protocol](#53-ndjson-protocol)
   - [5.4 Method Enum](#54-method-enum)
   - [5.5 StreamEvent Streaming Protocol](#55-streamevent-streaming-protocol)
   - [5.6 Connection Reuse Semantics](#56-connection-reuse-semantics)
   - [5.7 Spawn Streaming Protocol Example](#57-spawn-streaming-protocol-example)
   - [5.8 AttachDebug Streaming Protocol Example](#58-attachdebug-streaming-protocol-example)
6. [Error Handling and Type Reference](#6-error-handling-and-type-reference)
   - [6.1 ErrCode Enum](#61-errcode-enum)
   - [6.2 SyscallError](#62-syscallerror)
   - [6.3 VFSError](#63-vfserror)
   - [6.4 DriverError](#64-drivererror)
   - [6.5 ContextError](#65-contexterror)
   - [6.6 Basic Types](#66-basic-types)
7. [Process Model Reference](#7-process-model-reference)
   - [7.1 ProcessState State Machine](#71-processstate-state-machine)
   - [7.2 State Transition Rules](#72-state-transition-rules)
   - [7.3 ExitStatus Structure](#73-exitstatus-structure)
   - [7.4 Resource Release Order](#74-resource-release-order)
   - [7.5 Signal Definitions](#75-signal-definitions)

---

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

## 2. VFS Path Specification

### 2.1 Overview

VFS (Virtual File System) is Rnix's unified resource abstraction layer, following the Unix "everything is a file" philosophy. All external resources are accessed through VFS device paths.

**Device Model:** Each VFS path maps to a `VFSFileFactory`, managed by `DeviceRegistry` for registration and lookup.

**Path Matching Mechanism:**

1. **Exact match** — path matches the registered path exactly
2. **Longest prefix match** — path starts with a registered path, the longest prefix is selected; the remaining part is passed as `subpath` to the device factory

**Registered Device Paths:**

| VFS Path | Driver Module | Match Type | Description |
|---------|---------|---------|------|
| `/dev/llm/claude` | `drivers/llm` | Exact match | Claude Code CLI invocation |
| `/dev/llm/cursor` | `drivers/llm` | Exact match | Cursor CLI invocation |
| `/dev/fs` | `drivers/fs` | Prefix match | Host filesystem (subpath used as file path) |
| `/dev/shell` | `drivers/shell` | Exact match | Shell command execution |
| `/proc` | `vfs/proc.go` | Prefix match | Dynamic process information |

Device registration is completed during daemon startup via dependency injection (`cmd/rnix/main.go`).

### 2.2 /dev/llm/claude — LLM Driver Device

**Path:** `/dev/llm/claude`
**Driver:** `drivers/llm.ClaudeCliDriver`
**Match:** Exact match

**Write Request Format (JSON):**

```json
{
  "intent": "Analyze code",
  "system_prompt": "...",
  "model": "sonnet",
  "max_turns": 1,
  "timeout_ms": 30000,
  "messages": [{"role": "user", "content": "..."}]
}
```

**Read Response Format (JSON):**

```json
{
  "content": "LLM response content",
  "tokens_used": 1234
}
```

**Underlying Implementation:** Each Write call = one `exec.CommandContext` execution of the `claude -p` CLI. Supports context cancellation (Kill signal interruption).

### 2.3 /dev/llm/cursor — Cursor CLI Driver Device

**Path:** `/dev/llm/cursor`
**Driver:** `drivers/llm.CursorCliDriver`
**Match:** Exact match

**Write Request Format (JSON):** Same as `/dev/llm/claude`.

**Differences:**
- Underlying call uses `agent --print` CLI (Cursor CLI)
- No `--system-prompt` parameter; system prompt is concatenated into the prompt with a `[System Instructions]` marker
- No `--max-turns` parameter (silently ignored)
- stream-json event format includes four types: `system` (init), `assistant`, `tool_call`, `result`
- Requires `CURSOR_API_KEY` environment variable

**Provider Selection:** Specified via `--provider` CLI flag or agent.yaml `models.provider` field. See section 4.2 for details.

### 2.3 /dev/fs — Host Filesystem Device

**Path:** `/dev/fs`
**Driver:** `drivers/fs.HostFSDriver`
**Match:** Prefix match

**Path Resolution:** `/dev/fs/path/to/file` -> subpath = `/path/to/file` -> maps to host filesystem path

**Operations:**

- **Write** — Write operation parameters (file path, read requests, etc.)
- **Read** — Read file content
- **Close** — Release resources

### 2.4 /dev/shell — Shell Execution Device

**Path:** `/dev/shell`
**Driver:** `drivers/shell.ShellDriver`
**Match:** Exact match

**Operations:**

- **Write** — Write shell commands
- **Read** — Read command execution results
- **Close** — Release resources

**Underlying Implementation:** Executes shell commands via `exec.CommandContext`, inheriting the current user's permissions.

### 2.5 /proc/{pid}/ — Dynamic Process Information

**Path:** `/proc`
**Driver:** `vfs.ProcFS`
**Match:** Prefix match

**Read-only filesystem** — Write operations return a `PERMISSION` error.

**Sub-paths:**

| Sub-path | Format | Content |
|--------|------|------|
| `/proc/{pid}/status` | JSON | Process status snapshot |
| `/proc/{pid}/intent` | Plain text | Original intent string |
| `/proc/{pid}/context` | Plain text | Context summary |

**`/proc/{pid}/status` JSON Format:**

```json
{
    "pid": 1,
    "ppid": 0,
    "state": "running",
    "intent": "Analyze code",
    "skills": ["code-analysis"],
    "tokens_used": 456,
    "elapsed_ms": 3200,
    "allowed_devices": ["/dev/fs", "/dev/shell"]
}
```

**Path Parsing Rules:** The subpath format is `/{pid}/{file}`, where `{file}` must be one of `status`, `intent`, or `context`.

**Snapshot Semantics:** Content is generated as a snapshot at Open time; subsequent Read operations read the snapshot data.

### 2.6 Agent and Skill Definitions

These two paths are the filesystem storage locations for Agents and Skills, read directly by `AgentLoader` and `SkillLoader` (not through the VFS device mechanism).

**Agent Directory Structure:**

```
agents/{agent-name}/
├── agent.yaml        # Agent configuration manifest
└── instructions.md   # Agent role instructions (system prompt)
```

**Skill Directory Structure:**

```
skills/{skill-name}/
└── SKILL.md          # Skill definition (YAML frontmatter + Markdown body)
```

### 2.7 VFSFile Interface and OpenFlag Enum

All device drivers must implement the `VFSFile` interface:

```go
type VFSFile interface {
    Read(length int) ([]byte, error)
    Write(ctx context.Context, data []byte) error
    Close() error
    Stat() (FileStat, error)
}
```

**VFSFileFactory Signature:**

```go
type VFSFileFactory func(subpath string, flags OpenFlag) (VFSFile, error)
```

**OpenFlag Enum:**

| Constant | Value | Description |
|------|-----|------|
| `O_RDONLY` | `0` | Read-only |
| `O_WRONLY` | `1` | Write-only |
| `O_RDWR` | `2` | Read-write |

### 2.8 FD Allocation Rules

- **Starting value:** 3 (0/1/2 reserved for stdin/stdout/stderr)
- **Allocation method:** Per-process independent `fdTable` with an internal `nextFD` counter that increments monotonically
- **Scope:** Each `Process` has its own independent `FDTable`
- **Release:** `Close` atomically removes the FD from `fdTable`; on process exit, `CloseAll` closes all open FDs

---

## 3. Agent and Skill Manifests

### 3.1 agent.yaml Field Descriptions

The `AgentManifest` structure defines the Agent's configuration manifest:

| Field | Type | Required | Description |
|------|------|---------|------|
| `name` | `string` | Required | Agent name (unique identifier) |
| `description` | `string` | Optional | Agent description |
| `models` | `AgentModels` | Optional | LLM model preferences |
| `context_budget` | `int` | Optional | Context budget (token count) |
| `skills` | `[]string` | Optional | Referenced Skill name list |

### 3.2 AgentModels Sub-structure

| Field | Type | Description |
|------|------|------|
| `provider` | `string` | LLM provider (`claude` (default) or `cursor`) |
| `preferred` | `string` | Preferred model (e.g., `sonnet`) |
| `fallback` | `string` | Fallback model (e.g., `haiku`) |

**Model Selection Priority:** CLI `--model` flag > Agent manifest `preferred` > driver default

**Provider Selection Priority:** CLI `--provider` flag > Agent manifest `models.provider` > default `claude`

### 3.3 instructions.md Format

A plain Markdown file containing the Agent's role definition and system prompt. The content becomes part of the LLM system prompt.

**Concatenation Rule:** `SystemPrompt() = Agent instructions.md + "\n\n" + Skill A body + "\n\n" + Skill B body + ...`

### 3.4 Agent Loading Process

`AgentLoader.Load(agentName)` performs the following steps:

1. **Path safety check** — Prevents directory traversal attacks (verifies the path does not escape the base directory)
2. **Read agent.yaml** — Parses into `AgentManifest`
3. **Validate required fields** — `name` field must be non-empty
4. **Read instructions.md** — Used as system prompt text
5. **Load referenced Skills** — Iterates `manifest.Skills`, calling `skillLoader.LoadFull(skillName)` for each
6. **Return AgentInfo** — Contains three parts: `Manifest`, `Instructions`, `Skills`

### 3.5 SKILL.md Format

SKILL.md follows the Agent Skills industry standard format: YAML frontmatter + Markdown body.

```markdown
---
name: skill-name
description: >
  Multi-line description text
allowed-tools: /dev/fs /dev/shell
metadata:
  key: value
---

# Markdown Body (Procedural Knowledge)

Operation guides, workflow descriptions, etc.
```

**Parsing Rules:**

1. File must start with `---`
2. Content between the two `---` markers is the YAML frontmatter
3. Content after the second `---` is the Markdown body
4. Not starting with `---` -> error `"SKILL.md must start with ---"`
5. Missing closing `---` -> error `"SKILL.md missing closing ---"`

### 3.6 SkillManifest Fields

| Field | YAML Key | Type | Required | Description |
|------|---------|------|---------|------|
| `Name` | `name` | `string` | Required | Skill name |
| `Description` | `description` | `string` | Optional | Skill description |
| `AllowedToolsRaw` | `allowed-tools` | `string` | Key field | Space-separated VFS device paths |
| `Metadata` | `metadata` | `map[string]string` | Optional | Arbitrary key-value pairs |

**AllowedTools() Parsing:**

- `"/dev/fs /dev/shell"` -> `["/dev/fs", "/dev/shell"]`
- Empty string -> `nil` (no restriction, can access all devices)

### 3.7 Progressive Loading Strategy

Rnix provides two levels of loading granularity for Skills:

| Method | Loaded Content | Estimated Tokens | Use Case |
|------|---------|-----------|------|
| `LoadMetadata(skillName)` | YAML frontmatter only | ~100 | Discovery phase (enumerate names, descriptions, permissions) |
| `LoadFull(skillName)` | frontmatter + Markdown body | < 5000 | Activation phase (inject into system prompt) |

### 3.8 Complete Example

**agent.yaml Example (`agents/code-analyst/agent.yaml`):**

```yaml
name: code-analyst
description: "Agent that analyzes code quality, identifies issues, and provides improvement suggestions"
models:
  provider: claude
  preferred: sonnet
  fallback: haiku
context_budget: 8192
skills:
  - code-analysis
```

**SKILL.md Example (`skills/code-analysis/SKILL.md`):**

```markdown
---
name: code-analysis
description: >
  Analyze code quality, identify bugs, performance issues and security
  vulnerabilities.
allowed-tools: /dev/fs /dev/shell
metadata:
  author: rnix
  version: "1.0"
---

# Code Analysis

## When to use this skill
...
```

---

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
version: 0.5.0
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

**Navigation:** Use tab to switch panes, arrow keys to scroll within panes, `q` to quit.

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

### 4.19 rnix apply \<intent\> — Declarative Intent Decomposition

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

### 4.20 rnix intent — Intent Management

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

### 4.21 rnix skill — Skill Package Management

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

### 4.22 rnix run \<script.ash\> — AgentShell Script Runner

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

### 4.23 rnix serve — OpenAI-Compatible HTTP Gateway

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

### 4.24 rnix agtest \[file-or-dir\] — Agent Behavior Testing

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

### 4.25 rnix reputation \[agent\] — Agent Reputation Scores

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

### 4.26 rnix lineage \<pid\> — Stem Agent Differentiation Lineage

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

### 4.27 rnix topology — Collaboration Topology

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

### 4.28 rnix synergy — Skill Synergy Combinations

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

### 4.29 rnix immune — Adaptive Immune Security

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

## 5. IPC Architecture

### 5.1 Daemon Lifecycle

Rnix uses a daemon architecture: a single background daemon holds the unique kernel instance and process table; all CLI commands act as clients communicating via Unix domain socket.

**Auto-start (`EnsureDaemon`):**

1. CLI command calls `EnsureDaemon()`
2. Attempts to connect to the existing daemon and sends `ping`
3. Connection failure -> clears stale socket file
4. Starts a new daemon process (`rnix daemon --internal`, `setsid` independent process group)
5. Polls for readiness (retries every 100ms, 3-second timeout)
6. Returns the connected `*Client`

**Auto-stop (Idle Timeout):**

- Default timeout: 60 seconds (`DefaultIdleTimeout`)
- Stop condition: no active processes AND no active connections
- Check interval: every 5 seconds (`idleCheckEvery`)
- Timer is paused when processes are running or connections are active

**Manual Stop:**

```bash
rnix daemon stop
```

**Stale Socket Cleanup:**

- Ping to existing socket times out -> delete old socket file -> start new daemon
- Daemon writes PID to `rnix.pid` file at startup (for diagnostic purposes)

### 5.2 Socket Path Rules

Socket path is determined by the following priority:

1. **`$XDG_RUNTIME_DIR/rnix/rnix.sock`** — e.g., `/run/user/1000/rnix/rnix.sock`
2. **`/tmp/rnix-{uid}/rnix.sock`** — fallback (when `$XDG_RUNTIME_DIR` is not set)

Directory permissions: `0700` (accessible only by the current user).

Tests can inject a custom path via the `SocketPathOverride` variable.

### 5.3 NDJSON Protocol

IPC communication uses the NDJSON (Newline Delimited JSON) format, one JSON object per line.

**Request Format:**

```json
{"method": "ping|spawn|list_procs|kill|attach_debug|shutdown", "payload": {...}}
```

| Field | Type | Description |
|------|------|------|
| `method` | `string` | Request method (see [5.4 Method Enum](#54-method-enum)) |
| `payload` | `object` | Method-specific request parameters (optional) |

**Response Format:**

```json
{"ok": true, "payload": {...}}
{"ok": false, "error": {"code": "...", "message": "..."}}
```

| Field | Type | Description |
|------|------|------|
| `ok` | `bool` | Whether the request succeeded |
| `payload` | `object` | Method-specific response data (on success) |
| `error` | `object` | Structured error information (on failure) |

### 5.4 Method Enum

| Method | Type | Payload Type | Description |
|--------|------|-------------|------|
| `ping` | Request-Response | — | Liveness check, returns version |
| `spawn` | Streaming | `SpawnRequest` | Creates a process, streams progress events |
| `list_procs` | Request-Response | — | Gets the list of all active processes |
| `list_all_procs` | Request-Response | — | Gets the list of all processes including history |
| `kill` | Request-Response | `KillRequest` | Sends a signal to a process |
| `attach_debug` | Streaming | `AttachDebugRequest` | Subscribes to a SyscallEvent stream |
| `get_step_detail` | Request-Response | `StepDetailRequest` | Retrieves a single step record |
| `list_steps` | Request-Response | `ListStepsRequest` | Lists all step summaries for a process |
| `get_proc_detail` | Request-Response | `ProcDetailRequest` | Gets detailed process information |
| `shutdown` | Request-Response | — | Gracefully shuts down the daemon |

**SpawnRequest:**

```json
{"intent": "Analyze code", "agent": "code-analyst", "model": "sonnet", "max_steps": 10}
```

**KillRequest:**

```json
{"pid": 1, "signal": 1}
```

**AttachDebugRequest:**

```json
{"pid": 1}
```

**PingResponse:**

```json
{"version": "0.1.0"}
```

### 5.5 StreamEvent Streaming Protocol

Streaming methods (`spawn`, `attach_debug`) push events line by line using `StreamEvent`:

```json
{"type": "progress|complete|error|syscall_event|eof", "payload": {...}}
```

**StreamEventType Enum:**

| Type | Description | Use Case |
|------|------|---------|
| `progress` | Reasoning step progress | spawn stream |
| `complete` | Process completed | spawn stream |
| `error` | Error | spawn stream |
| `syscall_event` | SyscallEvent | attach_debug stream |
| `eof` | End-of-stream marker | attach_debug stream |

**ProgressPayload Structure (spawn stream):**

| Field | Type | Event | Description |
|------|------|------|------|
| `event` | `string` | All | `"spawn"`, `"step"`, `"complete"`, `"error"` |
| `pid` | `PID` | All | Process ID |
| `intent` | `string` | spawn | User intent |
| `provider` | `string` | spawn | Resolved LLM provider name |
| `model` | `string` | spawn | Resolved model name |
| `step` | `int` | step | Current step count |
| `total` | `int` | step | Maximum step count |
| `result` | `string` | complete | Final result |
| `exit_code` | `int` | complete | Exit code |
| `exit_reason` | `string` | complete | Exit reason |
| `tokens_used` | `int` | complete | Token consumption |
| `error_message` | `string` | error | Error message |

**SyscallEventWire Structure (attach_debug stream):**

| Field | Type | Description |
|------|------|------|
| `timestamp_ms` | `int64` | Relative to process creation time (milliseconds) |
| `pid` | `PID` | Process ID |
| `syscall` | `string` | Syscall name |
| `args` | `map[string]any` | Call parameters |
| `result` | `any` | Return value |
| `error` | `string` | Error message |
| `duration_ms` | `float64` | Execution duration (milliseconds) |

### 5.6 Connection Reuse Semantics

The IPC Server uses a request-loop connection model:

**Non-streaming Methods (`ping`, `list_procs`, `kill`):**

- After sending the Response, continues waiting for the next Request on the same connection
- Clients can send multiple requests on a single connection
- Use case: `EnsureDaemon()`'s `ping` liveness check shares the connection with subsequent operations

**Streaming Methods (`spawn`, `attach_debug`):**

- The handler takes over the connection for streaming transmission
- After the stream ends, the handler returns and the connection is closed
- No new requests are accepted on the same connection

**`shutdown` Method:**

- After sending the Response, asynchronously triggers `Shutdown()`; the handler returns and closes the connection

### 5.7 Spawn Streaming Protocol Example

```
Client → Server:  {"method":"spawn","payload":{"intent":"Analyze code","agent":"code-analyst"}}

Server → Client:  {"ok":true,"payload":{"pid":1}}
Server → Client:  {"type":"progress","payload":{"event":"spawn","pid":1,"intent":"Analyze code"}}
Server → Client:  {"type":"progress","payload":{"event":"step","pid":1,"step":1,"total":10}}
Server → Client:  {"type":"progress","payload":{"event":"step","pid":1,"step":2,"total":10}}
Server → Client:  {"type":"complete","payload":{"event":"complete","pid":1,"result":"Analysis results...","exit_code":0,"tokens_used":1234}}

（Connection closed; IPC Server automatically calls kern.Reap(pid) to clean up the Zombie process）
```

### 5.8 AttachDebug Streaming Protocol Example

```
Client → Server:  {"method":"attach_debug","payload":{"pid":1}}

Server → Client:  {"ok":true}
Server → Client:  {"type":"syscall_event","payload":{"timestamp_ms":13,"pid":1,"syscall":"Open","args":{"flags":2,"path":"/dev/llm/claude"},"result":3,"duration_ms":1.0}}
Server → Client:  {"type":"syscall_event","payload":{"timestamp_ms":14,"pid":1,"syscall":"Write","args":{"fd":3,"size":1234},"duration_ms":5200.0}}
Server → Client:  {"type":"syscall_event","payload":{"timestamp_ms":5214,"pid":1,"syscall":"Read","args":{"fd":3,"length":65536},"result":892,"duration_ms":2.0}}
...
Server → Client:  {"type":"eof"}

（Process exits → DebugChan closed → range loop ends → sends eof → connection closed）
```

---

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
