# Agents & Skills

Agents define "who I am" (identity, model preferences). Skills define "how to do X" (procedural knowledge, tool permissions). This separation enables reusable, composable agent capabilities.

---

## Agent Definition

Each agent lives in `agents/<name>/` (global: `~/.config/rnix/agents/`, project: `.rnix/agents/`) with two files:

```
agents/code-analyst/
├── agent.yaml        # Identity, model preferences, skill references
└── instructions.md   # Role definition (system prompt)
```

### agent.yaml

```yaml
name: code-analyst
description: "Code quality analysis agent"
planning: true              # true (default) or false
models:
  provider: deepseek        # deepseek, claude, cursor, ollama, groq, etc.
  preferred: deepseek-v4-flash
  fallback: deepseek-v4-pro
skills:
  - code-analysis
  - security-scan
mcp:
  servers:
    github:
      command: "npx"
      args: ["-y", "@anthropic/mcp-github"]
      env:
        GITHUB_TOKEN: "${GITHUB_TOKEN}"
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique identifier |
| `description` | string | Human-readable description |
| `planning` | bool | Planning capability: `true` (default) or `false` |
| `project_doc` | bool | Inject project-root `AGENTS.md` into the system prompt: `true` (default) or `false` to disable |
| `models.provider` | string | LLM provider name |
| `models.preferred` | string | Preferred model |
| `models.fallback` | string | Fallback model/provider |
| `context_budget` | int | Max token budget (0 = unlimited) |
| `skills` | []string | Skill references |
| `mcp.servers` | map | MCP server dependencies |

### instructions.md

Plain Markdown file with the agent's role definition, injected as part of the LLM system prompt.

### AGENTS.md Injection

At spawn, Rnix also reads the nearest project-root `AGENTS.md` and injects it as a `project_doc` cached section of the system prompt, positioned **after `agent_instructions` and before `memory`**. This aligns with the cross-tool AGENTS.md convention.

- **Nearest-wins lookup** — walks up from the working directory, with the project root as the boundary (never escapes the project).
- **Only `AGENTS.md`** is recognized — it never falls back to reading `CLAUDE.md`.
- **64 KiB cap** — larger files are UTF-8-safe truncated with a trailing marker.
- **Eager frozen snapshot** — read once at spawn and not re-read on `specialize`, protecting prompt-cache hit rate.
- **Opt-out** — set `project_doc: false` in `agent.yaml` (default is enabled). Direct spawns without an agent default to enabled.

Implemented in `kernel/sections.go` and `internal/config/agentsmd.go`.

---

## Skill Definition

Skills follow the [agentskills.io](https://agentskills.io/) standard — YAML frontmatter + Markdown body in `SKILL.md`. Rnix resolves skills via `ResolveSkillScopes` through a four-path model (project/user × native/agents):

| Priority | Path | Scope | Namespace |
|----------|------|-------|-----------|
| 1 (highest) | `<project>/.rnix/skills/<name>/SKILL.md` | project | native |
| 2 | `<project>/.agents/skills/<name>/SKILL.md` | project | agents |
| 3 | `~/.config/rnix/skills/<name>/SKILL.md` | user | native |
| 4 (lowest) | `~/.agents/skills/<name>/SKILL.md` | user | agents |

Resolution rules: `project > user` (cross-scope), `native > agents` (same-scope). The winning copy **completely replaces** all shadowed copies — no field merging. Shadowed copies trigger stderr warnings but are not visible in `skill list`.

Runtime loading uses `SkillLoader` which walks these paths in priority order via `ResolveSkillScopes(cwd)`. Only existing directories are returned; non-existent paths are silently skipped.

### SKILL.md Format

```markdown
---
name: code-analysis
description: >
  Analyze code quality, identify bugs, performance issues
  and security vulnerabilities.
allowed-tools: Read Write Edit Glob Grep Bash
metadata:
  author: rnix
  version: "1.0"
synergy:
  - with: security-scan
    instruction: |
      When combined with security-scan, correlate code quality
      issues with security implications.
---

# Code Analysis

## When to Use
Use this skill when asked to review, analyze, or audit code.

## Workflow
1. Read source files with Read / Glob / Grep
2. Run analysis tools with Bash
3. Generate structured report
```

| Frontmatter Field | Type | Description |
|-------------------|------|-------------|
| `name` | string | Unique identifier |
| `description` | string | Short description (~100 tokens) |
| `allowed-tools` | string | Space-separated semantic tool names (Claude Code canonical form, e.g. `Read Write Bash`) |
| `metadata` | map | Arbitrary key-value pairs |
| `synergy` | map | Synergy declarations for Skill combinations |

### allowed-tools (Permission Model)

The `allowed-tools` field is the core security boundary. Since Epic 54 / Decision 45, it lists **semantic tool names** (PascalCase, the Claude Code canonical form) rather than VFS device paths. Enforcement is **tool-level**: an agent can only invoke the tools listed across its loaded skills, and grants are per-tool (e.g. `Read` does not authorize `Write`). This is implemented via `proc.AllowedTools` in `kernel/process.go`.

```
Agent loads: [code-analysis, security-scan]
  code-analysis: Read Grep Bash
  security-scan: Read
  → AllowedTools = [Read, Grep, Bash]  (union)
```

Empty `allowed-tools` means no restrictions (all tools accessible).

::: tip Backward compatibility
The legacy device-path form (`/dev/fs /dev/shell`) is still accepted and normalized for older skills, but new skills should use semantic tool names.
:::

---

## Four-Layer Capability Model

```
┌──────────────────────────────────────┐
│      Process (Runtime Instance)      │
│  PID, State, FDTable, DebugChan      │
├──────────────────────────────────────┤
│         Agent (Who I Am)             │
│  name, models, context_budget        │
│  instructions.md → System prompt     │
├──────────────────────────────────────┤
│     Skill A          Skill B         │
│  allowed-tools:    allowed-tools:    │
│  Read Grep         Read              │
│  Bash              Write             │
├──────────────────────────────────────┤
│      VFS Device Layer                │
│  /dev/fs  /dev/shell  /dev/llm/...   │
│  /mnt/mcp/*  /proc/*                 │
└──────────────────────────────────────┘
```

### Progressive Loading

Skills are loaded in two phases for efficiency:

| Phase | Method | Tokens | What's Loaded |
|-------|--------|--------|---------------|
| Discovery | `LoadMetadata` | ~100 | Name, description, permissions only |
| Activation | `LoadFull` | < 5000 | Full frontmatter + Markdown body |

---

## Skill Package Management

Install, search, update, and list Skills from the community registry with multi-scope support:

```bash
# Install: writeScope determined by (global, shared) flag combination
$ rnix skill install code-analysis          # project/native (in .rnix/ project)
$ rnix skill install code-analysis -g       # user/native (~/.config/rnix/skills/)
$ rnix skill install code-analysis --shared # agents namespace (.agents/skills/)

# List: deduplicated view across four paths
$ rnix skill list              # all scopes (6-column table)
$ rnix skill list -p           # project scope only
$ rnix skill list -g           # user scope only
$ rnix skill list --json       # JSON with diagnostics node
$ rnix skill list --quiet      # names only, one per line

# Update: writes back to origin scope
$ rnix skill update code-analysis    # single skill (origin scope)
$ rnix skill update                  # all community skills across all scopes

# Search: remote registry only
$ rnix skill search "security"       # search by keyword
```

Key behaviors:
- `-g` and `-p` are **mutually exclusive** on `skill list`
- Update preserves the skill's origin scope (does not migrate across scopes)
- Shadowed skills appear only as stderr warnings, never in `skill list`
- Builtin skills (shipped with Rnix) are excluded from bulk `skill update`
- `skill search` only queries the remote registry — no local four-path scanning

See [Skill Packages](/guide/skill-packages) for the complete reference: ancestor traversal, trust check, lenient validation, cross-tool compatibility, and JSON diagnostics.

---

## Related Documentation

- [Skill Packages](/guide/skill-packages) — Install/search/update
- [Token Economy](/guide/token-economy) — Reputation and synergy
- [Autonomous Agents](/guide/autonomous-agents) — Unified reasoning and stem cell
- [MCP Integration](/guide/mcp-integration) — MCP server configuration
- [Reference Manual](/reference/) — Complete agent.yaml and SKILL.md field reference
