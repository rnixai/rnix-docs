# MCP Integration

Rnix integrates with Model Context Protocol (MCP) servers, exposing their tools as native VFS paths that agents can access through standard Open/Read/Write/Close operations. MCP server tools are registered as first-class `ToolDef`s, enabling the LLM to reason about them with full metadata.

---

## Overview

MCP (Model Context Protocol) is a standard for connecting AI models to external tools and data sources. In Rnix, MCP servers are mounted as VFS devices, making MCP tools accessible through the same file abstraction used for LLMs, filesystem, and shell.

```
Agent Process
    │
    │  Open("/mnt/mcp/1-github/tools/search_repos")
    ▼
VFS DeviceRegistry
    │
    │  prefix match → /mnt/mcp/1-github
    ▼
MCP Transport (stdio)
    │
    │  tools/call: search_repos
    ▼
MCP Server Process (npx @anthropic/mcp-github)
```

### Native ToolDef Exposure (Route B)

MCP server tools are exposed as native `ToolDef` entries — not just raw VFS paths. This means the LLM sees full tool metadata (name, description, parameter schema) for each MCP tool, identical to how built-in tools are presented. Tools are registered per-mount with process-scoped isolation.

---

## Configuring MCP Servers

### In Agent Manifests

The most common way to use MCP is through agent manifests. Declare MCP servers in `agent.yaml`:

```yaml
# agents/my-agent/agent.yaml
name: my-agent
description: "Agent with GitHub and filesystem MCP tools"
skills:
  - code-analysis
mcp:
  servers:
    github:
      command: "npx"
      args: ["-y", "@anthropic/mcp-github"]
      env:
        GITHUB_TOKEN: "${GITHUB_TOKEN}"
      timeout: 30s
      max_output_tokens: 4096

    filesystem:
      command: "npx"
      args: ["-y", "@anthropic/mcp-filesystem", "/home/user/projects"]
```

### MCPServerConfig Fields

| Field | Type | Description |
|-------|------|-------------|
| `command` | `string` | Executable to launch the MCP server |
| `args` | `[]string` | Command-line arguments |
| `env` | `map[string]string` | Environment variables (supports `${VAR}` expansion) |
| `transport_type` | `string` | Transport type: `"stdio"` (default) |
| `timeout` | `duration` | Per-server timeout (default: `30s`) |
| `max_output_tokens` | `int` | Maximum tokens per tool output (prevents context overflow) |

### Per-Server Timeout & Output Configuration

Each MCP server can have independent timeout and output limits:

```yaml
mcp:
  servers:
    github:
      command: "npx"
      args: ["-y", "@anthropic/mcp-github"]
      timeout: 15s              # Fast API, shorter timeout
      max_output_tokens: 2048

    large-dataset:
      command: "python"
      args: ["./mcp-servers/data-server.py"]
      timeout: 120s             # Slow queries, longer timeout
      max_output_tokens: 16384  # Large results allowed
```

Output truncation applies at the ToolDef level — results exceeding `max_output_tokens` are truncated with a clear marker, preventing context window overflow.

---

## Mount Lifecycle

When an agent with MCP dependencies is spawned, Rnix manages the full mount lifecycle:

### 1. Concurrent Auto-Mount on Spawn

All MCP servers declared in an agent manifest are mounted **concurrently** — each server connects in its own goroutine with per-entry locking, eliminating serial bottlenecks when an agent depends on multiple MCP servers.

```
Spawn(intent, agent)
    │
    ├── For each MCP server in agent.mcp.servers (concurrently):
    │     │
    │     ├── Reserve placeholder (MCPStatusConnecting) with per-entry lock
    │     ├── Connect transport (outside cross-path lock, bounded by MountTimeout)
    │     ├── On success: List tools → register ToolDefs → finalize → release lock
    │     └── On failure: delete placeholder → close transport → release lock
    │
    ├── On all success: continue with agent execution
    └── On any failure: rollback all mounts, free context, return error
```

**Per-server mount timeout** defaults to 5 seconds (configurable via `MountTimeout` in MCPConfig). Each mount operates independently — a slow server does not block other mounts from completing.

### 2. Ref-Counted Mount Management

MCP mounts use reference counting to track usage across process subtrees:

- **Mount**: Increments ref count. Physical server starts on first reference.
- **Unmount**: Decrements ref count. Physical server stops when count reaches zero.
- **Mount Restoration**: On process resume, mounts are restored from persisted state with proper ref counts.

This prevents premature server shutdown when multiple processes share a mount (e.g., parent and child processes).

### 3. Usage During Execution

The agent interacts with MCP tools through standard VFS operations:

```
Open("/mnt/mcp/1-github/tools/search_repos") → FD(5)
Write(FD(5), {"query": "rnix language:go"})   → ok
Read(FD(5))                                    → search results
Close(FD(5))                                   → ok
```

### 4. Process Group Isolation & Graceful Shutdown

MCP transport processes are launched in isolated process groups with platform-specific hardening:

- **Signal isolation**: SIGINT/SIGTERM to the Rnix daemon does not propagate to MCP child processes
- **Linux hardening**: `Setpgid` + `Pdeathsig=SIGKILL` ensures child cleanup even on daemon crash
- **Two-phase graceful shutdown**: On unmount, Rnix first sends `SIGTERM` to the entire process group, then waits up to 5 seconds for clean exit. If the server does not terminate within the grace period, `SIGKILL` is sent as a forced fallback
- **Orphan prevention**: OS process group mechanism provides a last resort for cleanup
- **Idempotent Close**: A `closed` flag prevents panics on redundant `Close()` calls during concurrent teardown

During daemon shutdown (`rnix daemon stop`), `UnmountAll()` is called to cleanly tear down all active MCP mounts before the kernel exits.

### 5. Auto-Unmount on Exit

When a process finishes (enters `finishProcess`):

1. Each MCP mount is unmounted in order (ref-count decremented)
2. Transport connections are closed when ref count reaches zero
3. VFS device registrations are removed
4. Unmount failures do not block process exit

### 6. Mount Restoration on Resume

When a process is resumed (see [Process Resume](/guide/process-resume)), MCP mounts are restored:

- Suspended processes: mounts re-established from persisted state
- Resume from Dead/Zombie: mounts re-created from agent manifest
- Mount paths are re-registered with the resumed process's new PID

---

## MCP Management Commands

### `rnix mcp logs`

Capture stderr output from MCP server processes for diagnostics:

```bash
$ rnix mcp logs <mount-name>
[stderr] Starting GitHub MCP server v2.1.0...
[stderr] Connected to github.com API
[stderr] Tool "search_repos" registered
```

Useful for debugging server startup failures, tool registration issues, and runtime errors.

### `rnix check mcp`

Run subsystem diagnostics on MCP configuration:

```bash
$ rnix check mcp
✓ MCP transport layer: OK
✓ Agent MCP configs found: 3 agents with MCP servers
  - my-agent: github, filesystem
  - pr-reviewer: github
  - data-analyzer: postgres
✓ Server binaries found:
  - npx: /usr/local/bin/npx
  - python: /usr/bin/python3
✗ Warning: agent 'data-analyzer' MCP server 'postgres' — command 'pg-mcp' not in PATH
```

Checks include: transport health, agent config validity, server binary availability, and environment variable resolution.

### `rnix init --with-mcp-examples`

Bootstrap a new project with example MCP configurations:

```bash
$ rnix init --with-mcp-examples
[init] created ~/.config/rnix/
[init] created .rnix/
[init] added agents/playwright-demo/ with MCP Playwright config
[init] added agents/github-assistant/ with MCP GitHub config
```

Preflight checks verify that required server binaries (e.g., `npx`) are available before creating example configs.

---

## VFS Path Mapping

MCP mounts expose a structured path hierarchy:

| VFS Path | MCP Operation | Read | Write |
|----------|---------------|------|-------|
| `/mnt/mcp/{mount}/` | — | Returns `["tools","resources"]` | — |
| `/mnt/mcp/{mount}/tools` | `tools/list` | Returns tool list | — |
| `/mnt/mcp/{mount}/tools/{name}` | `tools/call` | Returns last call result | Invokes tool |
| `/mnt/mcp/{mount}/resources` | `resources/list` | Returns resource list | — |
| `/mnt/mcp/{mount}/resources/{uri}` | `resources/read` | Reads resource content | — |

### Mount Path Format

Mount paths follow the pattern `/mnt/mcp/{pid}-{serverName}`:

- `{pid}` — the spawning process ID (ensures isolation between processes)
- `{serverName}` — the server name from the MCP configuration

Example: Process PID 3 with a `github` MCP server → `/mnt/mcp/3-github`

### Empty MCP Mounts

Agents can declare `mcp: {}` (empty mounts) as a marker that MCP support is configured but no servers are needed. The agent hint is preserved for diagnostics and `rnix check mcp` output.

---

## Transport Architecture

### MCPTransport Interface

The transport abstraction is defined in the `vfs` package (dependency inversion — vfs defines the interface, `drivers/mcp` provides the implementation):

```go
type MCPTransport interface {
    Connect(ctx context.Context) error
    Call(ctx context.Context, method string, params json.RawMessage) (json.RawMessage, error)
    Close() error
    Ping(ctx context.Context) error
}
```

### Stdio Transport

The current implementation uses stdio transport with enhanced reliability:

1. Launches the MCP server as a child process in an isolated process group
2. Communicates via stdin/stdout using JSON-RPC
3. Server stderr is captured for diagnostics (`rnix mcp logs`)
4. Connection timeout: per-server configurable (default 30s)
5. Automatic reconnection with backoff for transient failures
6. Health checks via periodic `Ping` calls

---

## Permissions

MCP mount paths are treated as **additive permits** — they extend the process's `AllowedDevices` whitelist rather than serving as a base-device restriction. This means:

- If an agent declares MCP servers, it automatically has permission to access them
- No additional `allowed-tools` configuration is needed in skills
- Other processes cannot access another process's MCP mounts (PID-scoped paths)
- MCP permissions are additive: they expand capabilities, never restrict them

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| MCP server fails to start | Spawn fails, all mounts rolled back |
| Connection timeout | Spawn fails, all mounts rolled back (timeout per-server configurable) |
| Tool call fails during execution | VFS Read returns error (DRIVER code) |
| MCP server crashes mid-execution | Auto-reconnect attempted; subsequent Read/Write returns error on failure |
| Unmount fails on process exit | Warning logged, process exit continues |
| MCP server stderr output | Captured, accessible via `rnix mcp logs` |

---

## Example: Using MCP in strace

When an agent uses MCP tools, `rnix strace` shows the VFS operations:

```
[  1.234s] Open(path="/mnt/mcp/1-github/tools/search_repos") → 5    2ms
[  1.236s] Write(fd=5, size=45) → <nil>    350ms
[  1.586s] Read(fd=5, length=1048576) → 2048    1ms
[  1.587s] Close(fd=5) → <nil>    0µs
```

---

## Related Documentation

- [Configuration](/guide/configuration) — Agent manifest MCP fields and per-server config
- [Process Resume](/guide/process-resume) — MCP mount restoration on resume
- [Architecture](/guide/architecture) — MCP mount mechanism internals
- [Core Concepts](/guide/concepts) — VFS device model
- [Reference Manual](/reference/) — VFS path specification
