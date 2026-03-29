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

