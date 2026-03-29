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

