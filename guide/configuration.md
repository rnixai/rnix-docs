# Configuration Guide

Rnix uses several YAML configuration files to control LLM providers, bootstrap services, multi-agent workflows, and agent/skill definitions. This guide covers each configuration file and its options.

---

## Overview

| File | Purpose | Location |
|------|---------|----------|
| `rnix-providers.yaml` | LLM provider definitions | Project root |
| `rnix-init.yaml` | Bootstrap services and supervisor trees | Project root |
| `rnix-compose.yaml` | Multi-agent workflow DAGs | Project root |
| `lib/agents/*/agent.yaml` | Agent manifests | `lib/agents/` |
| `lib/skills/*/SKILL.md` | Skill definitions | `lib/skills/` |

---

## rnix-providers.yaml — LLM Providers

This file defines available LLM providers. Rnix ships with built-in support for Claude Code CLI and Cursor CLI, but you can configure additional providers here.

```yaml
default_provider: claude

providers:
  claude:
    driver: claude-cli
    model: sonnet
    # Uses Claude Code CLI (claude -p)
    # Requires: npm install -g @anthropic-ai/claude-code

  cursor:
    driver: cursor-cli
    model: gpt-4
    # Uses Cursor CLI (agent --print)
    # Requires: CURSOR_API_KEY environment variable
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `default_provider` | `string` | Default provider when none specified (default: `claude`) |
| `providers.<name>.driver` | `string` | Driver type: `claude-cli` or `cursor-cli` |
| `providers.<name>.model` | `string` | Default model name |
| `providers.<name>.base_url` | `string` | API base URL (for custom endpoints) |
| `providers.<name>.api_key` | `string` | API key (prefer environment variables) |

### Provider Resolution Priority

When spawning an agent, the LLM provider is resolved in this order:

1. `--provider` CLI flag (highest priority)
2. `agent.yaml` → `models.provider` field
3. `rnix-providers.yaml` → `default_provider`
4. Built-in default: `claude`

### Model Resolution Priority

1. `--model` CLI flag
2. `agent.yaml` → `models.preferred` field
3. Provider's default model
4. Driver's built-in default

---

## rnix-init.yaml — Bootstrap Services

This file defines services that start automatically when the daemon launches. It supports supervisor trees for fault-tolerant agent management.

```yaml
version: "1.0"

services:
  health-monitor:
    intent: "Monitor system health and report anomalies"
    agent: "monitor"
    restart: always
    max_restarts: 3

  code-watcher:
    intent: "Watch for file changes and trigger analysis"
    agent: "watcher"
    restart: on-failure
    depends_on:
      - health-monitor
```

### Service Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `intent` | `string` | Required | Intent string for the service agent |
| `agent` | `string` | `""` | Named agent definition (empty = generic) |
| `restart` | `string` | `"no"` | Restart policy: `no`, `always`, `on-failure` |
| `max_restarts` | `int` | `3` | Maximum restart attempts |
| `depends_on` | `[]string` | `[]` | Services that must start first |

### Restart Policies

| Policy | Behavior |
|--------|----------|
| `no` | Never restart (default) |
| `always` | Restart on any exit |
| `on-failure` | Restart only on non-zero exit code |

---

## rnix-compose.yaml — Multi-Agent Workflows

Compose files define DAG-based multi-agent workflows. The compose engine automatically resolves dependencies, schedules parallel execution, and passes results between agents.

```yaml
version: "1.0"
intent: "Code review workflow"
model: "haiku"

agents:
  analyzer:
    intent: "Analyze kernel/kernel.go code quality"
    agent: "code-analyst"

  doc-gen:
    intent: "Generate improvement documentation"
    depends_on:
      analyzer: completed

  checker:
    intent: "Verify analysis and documentation quality"
    depends_on:
      doc-gen: completed
```

### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | `string` | Compose spec version (currently `"1.0"`) |
| `intent` | `string` | Overall workflow description |
| `model` | `string` | Global default model (agents can override) |
| `agents` | `map` | Agent definitions |

### Agent Fields

| Field | Type | Description |
|-------|------|-------------|
| `intent` | `string` | Task description for this agent |
| `agent` | `string` | Named agent definition (optional) |
| `model` | `string` | Model override for this agent |
| `provider` | `string` | Provider override for this agent |
| `depends_on` | `map` | Dependencies: `<upstream>: completed` |
| `timeout` | `duration` | Execution timeout |
| `max_retries` | `int` | Retry count on failure |

### DAG Scheduling

The compose engine:

1. **Parses the dependency graph** — builds a DAG from `depends_on` relations
2. **Topological sort** — determines execution layers
3. **Parallel execution** — agents in the same layer run concurrently
4. **Result injection** — upstream agent output is injected into downstream agent context

### Running Compose Workflows

```bash
# Run the workflow
rnix compose up

# Run with JSON output
rnix compose up --json

# Stop all compose processes
rnix compose down
```

---

## Agent Manifest — agent.yaml

Each agent is defined by an `agent.yaml` file and an `instructions.md` file in `lib/agents/<name>/`.

```yaml
name: code-analyst
description: "Code quality analysis agent"
models:
  provider: claude
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

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Unique agent identifier |
| `description` | `string` | No | Human-readable description |
| `models` | `object` | No | LLM model preferences |
| `models.provider` | `string` | No | LLM provider (`claude` or `cursor`) |
| `models.preferred` | `string` | No | Preferred model name |
| `models.fallback` | `string` | No | Fallback model name |
| `context_budget` | `int` | No | Max token budget (0 = unlimited) |
| `skills` | `[]string` | No | Referenced skill names |
| `mcp` | `object` | No | MCP server configurations |

### MCP Configuration in Agents

Agents can declare MCP server dependencies. During spawn:

1. Each MCP server is mounted at `/mnt/mcp/{pid}-{serverName}`
2. Mount paths are added to the process `AllowedDevices`
3. If any mount fails, all mounts are rolled back
4. On process exit, all MCP mounts are automatically unmounted

---

## Skill Definition — SKILL.md

Skills are defined as `SKILL.md` files in `lib/skills/<name>/`, using YAML frontmatter + Markdown body format.

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
  tags:
    - code
    - quality
---

# Code Analysis

## When to Use
...

## Workflow
1. Read source files via /dev/fs
2. Run analysis via /dev/shell
3. Generate report
```

### Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Unique skill identifier |
| `description` | `string` | No | Short description (~100 tokens) |
| `allowed-tools` | `string` | Key field | Space-separated VFS device paths |
| `metadata` | `map` | No | Arbitrary key-value pairs |

### allowed-tools and Security

The `allowed-tools` field is the core of Rnix's permission model. A skill can only access VFS devices listed here:

| Device | Capability |
|--------|------------|
| `/dev/fs` | Host filesystem read/write |
| `/dev/shell` | Shell command execution |
| `/dev/llm/claude` | LLM inference (Claude) |
| `/dev/llm/cursor` | LLM inference (Cursor) |

When multiple skills are loaded by an agent, their `allowed-tools` are **unioned** — the agent can access any device permitted by any of its skills.

Empty `allowed-tools` means **no restrictions** (can access all devices).

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `RNIX_ASCII` | Set to `1` to force ASCII mode (disable Unicode glyphs) |
| `RNIX_LOG_DIR` | Log directory for monitor.sh |
| `CURSOR_API_KEY` | API key for Cursor CLI provider |
| `XDG_RUNTIME_DIR` | Used to determine socket path |

## Socket Path

The daemon socket location follows this priority:

1. `$XDG_RUNTIME_DIR/rnix/rnix.sock` (e.g., `/run/user/1000/rnix/rnix.sock`)
2. `/tmp/rnix-{uid}/rnix.sock` (fallback)

Directory permissions: `0700` (current user only).

---

## Related Documentation

- [Quick Start](/guide/quick-start) — Installation and first run
- [Core Concepts](/guide/concepts) — Process, VFS, Agent/Skill model
- [Reference Manual](/reference/) — Complete API and CLI reference
