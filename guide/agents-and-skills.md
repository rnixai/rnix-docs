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
reasoning: linear           # linear (default) or ooda
models:
  provider: claude          # claude, cursor, ollama, groq, etc.
  preferred: sonnet
  fallback: haiku
context_budget: 8192
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
| `reasoning` | string | Reasoning mode: `linear` (default) or `ooda` |
| `models.provider` | string | LLM provider name |
| `models.preferred` | string | Preferred model |
| `models.fallback` | string | Fallback model/provider |
| `context_budget` | int | Max token budget (0 = unlimited) |
| `skills` | []string | Skill references |
| `mcp.servers` | map | MCP server dependencies |

### instructions.md

Plain Markdown file with the agent's role definition, injected as part of the LLM system prompt.

---

## Skill Definition

Each skill lives in `skills/<name>/SKILL.md` (global: `~/.config/rnix/skills/`, project: `.rnix/skills/`) using YAML frontmatter + Markdown body:

```markdown
---
name: code-analysis
description: >
  Analyze code quality, identify bugs, performance issues
  and security vulnerabilities.
allowed-tools: /dev/fs /dev/shell
metadata:
  author: rnix
  version: "1.0"
synergy:
  security-scan:
    description: "Enables deep security-aware code review"
    instructions: |
      When combined with security-scan, correlate code quality
      issues with security implications.
---

# Code Analysis

## When to Use
Use this skill when asked to review, analyze, or audit code.

## Workflow
1. Read source files via /dev/fs
2. Run analysis tools via /dev/shell
3. Generate structured report
```

| Frontmatter Field | Type | Description |
|-------------------|------|-------------|
| `name` | string | Unique identifier |
| `description` | string | Short description (~100 tokens) |
| `allowed-tools` | string | Space-separated VFS device paths |
| `metadata` | map | Arbitrary key-value pairs |
| `synergy` | map | Synergy declarations for Skill combinations |

### allowed-tools (Permission Model)

The `allowed-tools` field is the core security boundary. An agent can only access VFS devices listed across its loaded skills:

```
Agent loads: [code-analysis, security-scan]
  code-analysis: /dev/fs /dev/shell
  security-scan: /dev/fs
  → AllowedDevices = [/dev/fs, /dev/shell]  (union)
```

Empty `allowed-tools` means no restrictions (all devices accessible).

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
│  /dev/fs           /dev/fs           │
│  /dev/shell        /dev/shell        │
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

Install, search, and update Skills from the community registry:

```bash
$ rnix skill install code-analysis    # Install from registry
$ rnix skill search "security"        # Search available skills
$ rnix skill update code-analysis     # Update to latest version
$ rnix skill list                     # List installed skills
```

See [Skill Packages](/guide/skill-packages) for details.

---

## Related Documentation

- [Skill Packages](/guide/skill-packages) — Install/search/update
- [Token Economy](/guide/token-economy) — Reputation and synergy
- [Autonomous Agents](/guide/autonomous-agents) — OODA and stem cell
- [MCP Integration](/guide/mcp-integration) — MCP server configuration
- [Reference Manual](/reference/) — Complete agent.yaml and SKILL.md field reference
