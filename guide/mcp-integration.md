# MCP Integration

Rnix integrates with Model Context Protocol (MCP) servers, exposing their tools as VFS paths that agents can access through standard Open/Read/Write/Close operations.

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

---

## Configuring MCP Servers

### In Agent Manifests

The most common way to use MCP is through agent manifests. Declare MCP servers in `agent.yaml`:

```yaml
# lib/agents/my-agent/agent.yaml
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

---

## Mount Lifecycle

When an agent with MCP dependencies is spawned, Rnix manages the full mount lifecycle:

### 1. Auto-Mount on Spawn

```
Spawn(intent, agent)
    │
    ├── For each MCP server in agent.mcp.servers:
    │     │
    │     ├── Create transport (stdio)
    │     ├── Connect (500ms timeout)
    │     ├── Register VFS device at /mnt/mcp/{pid}-{serverName}
    │     └── Add mount path to process AllowedDevices
    │
    ├── On success: continue with agent execution
    └── On failure: rollback all mounts, free context, return error
```

### 2. Usage During Execution

The agent interacts with MCP tools through standard VFS operations:

```
Open("/mnt/mcp/1-github/tools/search_repos") → FD(5)
Write(FD(5), {"query": "rnix language:go"})   → ok
Read(FD(5))                                    → search results
Close(FD(5))                                   → ok
```

### 3. Auto-Unmount on Exit

When a process finishes (enters `finishProcess`):

1. Each MCP mount is unmounted in order
2. Transport connections are closed
3. VFS device registrations are removed
4. Unmount failures do not block process exit

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

The current implementation uses stdio transport:

1. Launches the MCP server as a child process
2. Communicates via stdin/stdout using JSON-RPC
3. Server stderr is captured for diagnostics
4. Connection timeout: 500ms

---

## Permissions

MCP mount paths are automatically added to the process `AllowedDevices` whitelist during spawn. This means:

- If an agent declares MCP servers, it automatically has permission to access them
- No additional `allowed-tools` configuration is needed in skills
- Other processes cannot access another process's MCP mounts (PID-scoped paths)

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| MCP server fails to start | Spawn fails, all mounts rolled back |
| Connection timeout (>500ms) | Spawn fails, all mounts rolled back |
| Tool call fails during execution | VFS Read returns error (DRIVER code) |
| MCP server crashes mid-execution | Subsequent Read/Write returns error |
| Unmount fails on process exit | Warning logged, process exit continues |

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

- [Configuration](/guide/configuration) — Agent manifest MCP fields
- [Architecture](/guide/architecture) — MCP mount mechanism internals
- [Core Concepts](/guide/concepts) — VFS device model
- [Reference Manual](/reference/) — VFS path specification
