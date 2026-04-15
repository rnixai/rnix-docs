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
| `/dev/memory/commit` | `drivers/memory` | Exact match | Persistent knowledge commit (add/replace/remove) |
| `/dev/memory/recall` | `drivers/memory` | Exact match | Cross-process knowledge search (read-only) |
| `/dev/memory/profile` | `drivers/memory` | Exact match | User profile management |
| `/dev/tasks` | `drivers/tasks` | Prefix match | Dynamic task management (create/update/list) |
| `/dev/tty` | `drivers/tty` | Exact match | Interactive user Q&A |
| `/dev/skills/manage` | `drivers/skills` | Exact match | Runtime skill management (create/patch/delete) |
| `/dev/web` | `drivers/web` | Prefix match | Web access (fetch + search) |
| `/dev/lsp` | `drivers/lsp` | Prefix match | LSP-based code intelligence |
| `/dev/cron` | `drivers/cron` | Prefix match | Scheduled recurring jobs |

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

### 2.6 /dev/memory/commit — Persistent Memory Device

**Path:** `/dev/memory/commit`
**Driver:** `drivers/memory.MemoryCommitDriver`
**Match:** Exact match

Provides persistent knowledge management for agents. Supports dual-scope storage: `memory` (project scope) and `global_memory` (global scope). All writes pass through security scanning.

**Write Request Format (JSON):**

```json
{
  "action": "add|replace|remove|snapshot|capacity",
  "target": "memory|global_memory",
  "content": "knowledge entry text",
  "old": "existing entry for replace/remove",
  "new": "replacement text for replace"
}
```

**Actions:** `add` — append a knowledge entry; `replace` — swap old→new; `remove` — delete matching entry; `snapshot` — read all entries; `capacity` — check remaining capacity.

### 2.7 /dev/memory/recall — Knowledge Search Device

**Path:** `/dev/memory/recall`
**Driver:** `drivers/memory.MemoryRecallDriver`
**Match:** Exact match

Read-only device for searching historical process conversations and extracted knowledge. Supports optional LLM summarization of results.

**Write Request Format (JSON):**

```json
{
  "query": "search keywords",
  "max_results": 20,
  "summarize": false
}
```

**Read Response:** Returns matching knowledge entries ranked by relevance. If `summarize: true`, an auxiliary LLM condenses results for concise context injection.

### 2.8 /dev/memory/profile — User Profile Device

**Path:** `/dev/memory/profile`
**Driver:** `drivers/memory.MemoryProfileDriver`
**Match:** Exact match

Manages user profile information (role, preferences, expertise). Fixed to `user` target scope. Same action semantics as `/dev/memory/commit`.

**Write Request Format (JSON):**

```json
{
  "action": "add|replace|remove|snapshot|capacity",
  "content": "user preference or profile entry",
  "old": "existing entry",
  "new": "replacement"
}
```

### 2.9 /dev/tasks — Task Management Device

**Path:** `/dev/tasks`
**Driver:** `drivers/tasks.TasksDriver`
**Match:** Prefix match

Dynamic task management for agents. Tasks are stored in-memory per daemon session.

**Operations:** `task_create` — create a new task with subject/description; `task_update` — update status (pending→in_progress→completed), add dependencies, change owner; `task_list` — list all tasks with status.

### 2.10 /dev/tty — Interactive User Q&A Device

**Path:** `/dev/tty`
**Driver:** `drivers/tty.TtyDriver`
**Match:** Exact match

Allows agents to ask the user questions during execution. Questions are forwarded to the user via IPC and block until a response is received (5-minute timeout).

**Write Request Format (JSON):**

```json
{
  "questions": [
    {
      "question": "Which approach do you prefer?",
      "options": ["Option A", "Option B"],
      "multi_select": false
    }
  ]
}
```

### 2.11 /dev/skills/manage — Dynamic Skill Management Device

**Path:** `/dev/skills/manage`
**Driver:** `drivers/skills.SkillManageDriver`
**Match:** Exact match

Runtime skill lifecycle management. Agents can create, modify, or delete skills programmatically.

**Write Request Format (JSON):**

```json
{
  "action": "create|patch|delete",
  "name": "skill-name",
  "description": "What the skill does",
  "allowed_tools": "/dev/fs /dev/shell",
  "body": "# Skill instructions in markdown"
}
```

### 2.12 /dev/web — Web Access Device

**Path:** `/dev/web`
**Driver:** `drivers/web.WebDriver`
**Match:** Prefix match

Provides web access capabilities: URL fetching with HTML-to-markdown conversion and web search. Includes a 15-minute page cache.

**Operations:** `web_fetch` — fetch and process a URL; `web_search` — search the web with domain filtering.

### 2.13 /dev/lsp — LSP Code Intelligence Device

**Path:** `/dev/lsp`
**Driver:** `drivers/lsp.LspDriver`
**Match:** Prefix match

Language Server Protocol integration for code intelligence. Default server: `gopls`.

**Operations:** `goToDefinition`, `findReferences`, `hover`, `documentSymbol`, `workspaceSymbol`, `goToImplementation`, `prepareCallHierarchy`, `incomingCalls`, `outgoingCalls`.

### 2.14 /dev/cron — Scheduled Jobs Device

**Path:** `/dev/cron`
**Driver:** `drivers/cron.CronDriver`
**Match:** Prefix match

Manages scheduled recurring jobs. When a job triggers, it spawns a new agent process with the configured intent. Jobs are persisted to disk and survive daemon restarts.

### 2.15 Agent and Skill Definitions

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

### 2.16 VFSFile Interface and OpenFlag Enum

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

### 2.17 FD Allocation Rules

- **Starting value:** 3 (0/1/2 reserved for stdin/stdout/stderr)
- **Allocation method:** Per-process independent `fdTable` with an internal `nextFD` counter that increments monotonically
- **Scope:** Each `Process` has its own independent `FDTable`
- **Release:** `Close` atomically removes the FD from `fdTable`; on process exit, `CloseAll` closes all open FDs

---

