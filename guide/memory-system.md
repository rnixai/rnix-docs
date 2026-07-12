# Memory System

Rnix provides a persistent memory subsystem that allows agents to accumulate knowledge across sessions. Inspired by how human memory works — commit important facts, recall them later, and build a user profile over time.

---

## Architecture

The memory subsystem operates at two scopes:

- **Project scope** (`memory`) — Knowledge specific to the current project, stored in `.rnix/memory/`
- **Global scope** (`global_memory`) — Cross-project knowledge, stored in `~/.config/rnix/memory/`

Each scope is backed by a `FileMemoryProvider` that persists entries to disk as plain-text files.

### Kernel Components

| Component | Location | Role |
|-----------|----------|------|
| `MemoryStore` | `kernel/memory/store.go` | Dual-scope API surface with security scanning |
| `FileMemoryProvider` | `kernel/memory/provider.go` | File-based storage per scope |
| `RecallIndex` | `kernel/memory/recall.go` | TF-IDF search index over historical conversations |
| `Writeback` | `kernel/memory/writeback.go` | Async knowledge extraction from completed processes |
| `SecurityScanner` | `kernel/memory/scanner.go` | Content scanning before writes |

---

## VFS Devices

The memory subsystem exposes three VFS devices:

### /dev/memory/commit

Write persistent knowledge entries. Supports five actions:

| Action | Description |
|--------|-------------|
| `add` | Append a new knowledge entry |
| `replace` | Swap an existing entry (exact match) with new content |
| `remove` | Delete an entry (exact match) |
| `snapshot` | Read all current entries |
| `capacity` | Check remaining capacity (character limit) |

**Dual scope:** Set `target` to `"memory"` (project, default) or `"global_memory"` (global).

**Example request:**

```json
{
  "action": "add",
  "target": "memory",
  "content": "The API uses JWT authentication with RS256 signing"
}
```

### /dev/memory/recall

Search historical process conversations and extracted knowledge. Read-only.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | `string` | — | Search keywords |
| `max_results` | `int` | `20` | Maximum results |
| `summarize` | `bool` | `false` | LLM-summarize results for concise injection |

**Example request:**

```json
{
  "query": "authentication implementation details",
  "max_results": 10,
  "summarize": true
}
```

### /dev/memory/profile

Manage user profile (role, preferences, expertise). Same action semantics as `/dev/memory/commit` but fixed to `user` target scope.

**Example request:**

```json
{
  "action": "add",
  "content": "User prefers concise code comments in English"
}
```

---

## Security Scanning

All writes to memory devices pass through `ScanContent()` before persistence. The scanner rejects content containing:

- API keys and secrets
- Credential patterns
- Potentially dangerous code patterns

Rejected writes return an error with the reason.

---

## Writeback

When a process completes, the `Writeback` component asynchronously extracts useful knowledge from the conversation and commits it to the project memory. This happens in the background and does not block the process lifecycle.

---

## MEMORY.md as a Recall Source

Each scope's entries are persisted to a `MEMORY.md` file (project: `.rnix/memory/MEMORY.md`, global: `~/.config/rnix/memory/MEMORY.md`). This file is not just storage — it is a **first-class source for `/dev/memory/recall`**, indexed alongside historical conversations:

- **Real-time injection on commit** — every write through `/dev/memory/commit` (or `/dev/memory/profile`) re-indexes that scope's entries into the shared `RecallIndex` immediately (`IndexMemorySource`), so a fact committed in one process becomes recallable by later processes without a restart.
- **Rebuild on daemon startup** — when the daemon starts, it reads each `MEMORY.md` from disk and rebuilds the index (`IndexMemoryFile`), so committed knowledge survives daemon restarts and is searchable again from a cold start.
- **Recall coverage** — a `recall` query matches both extracted conversation knowledge and the entries in `MEMORY.md`, so hand-curated memories rank alongside auto-extracted ones.

::: tip
The process that performs a commit works from a frozen prompt snapshot for the remainder of its current step, so it does not see its own just-committed entry until a later step or a subsequent process. The entry is still injected into the shared index immediately for **other** processes.
:::

---

## Configuration

Memory settings are configured in `memory.yaml`:

| Setting | Default | Description |
|---------|---------|-------------|
| `store.memory_char_limit` | `50000` | Max characters for project memory entries |
| `store.user_char_limit` | `10000` | Max characters for user profile entries |

---

## Related Documentation

- [VFS Path Specification](/reference/vfs) — Device path details
- [Configuration](/guide/configuration) — Memory configuration files
- [Autonomous Agents](/guide/autonomous-agents) — How agents use memory
