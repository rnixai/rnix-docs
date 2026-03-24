# Configuration Guide

Rnix uses a two-tier configuration system with YAML files, agent definitions, and skill definitions. Run `rnix init` to bootstrap the configuration environment.

---

## Two-Tier Configuration

Rnix follows a **global + project** configuration model:

| Tier | Location | Purpose |
|------|----------|---------|
| **Global** | `~/.config/rnix/` (or `$XDG_CONFIG_HOME/rnix/`) | User-wide defaults, shared agents and skills |
| **Project** | `<project>/.rnix/` | Project-specific overrides and definitions |

### Directory Structure

```
~/.config/rnix/              ← Global (created by rnix init)
├── providers.yaml           ← LLM provider definitions
├── config.yaml              ← Global configuration
├── agents/                  ← Global agent definitions
│   └── code-analyst/
│       ├── agent.yaml
│       └── instructions.md
└── skills/                  ← Global skill definitions
    └── code-analysis/
        └── SKILL.md

<project>/.rnix/             ← Project (created by rnix init in project dir)
├── providers.yaml           ← Project provider overrides (optional)
├── config.yaml              ← Project configuration (optional)
├── agents/                  ← Project-specific agents
├── skills/                  ← Project-specific skills
└── data/                    ← Runtime data (records, traces)
```

### Merge Rules

- **YAML files** (`providers.yaml`, `config.yaml`): Deep merge — project-level values override global-level
- **Resource directories** (`agents/`, `skills/`): Shadow — project-level definitions with the same name completely shadow global-level

### Initialization

```bash
# Create both global (~/.config/rnix/) and project (.rnix/) directories
$ rnix init
[init] created ~/.config/rnix/
[init] created .rnix/
```

`rnix init` is idempotent — it skips existing files and directories.

---

## providers.yaml — LLM Providers

This file defines available LLM providers. Located at `~/.config/rnix/providers.yaml` (global) and optionally `.rnix/providers.yaml` (project override).

```yaml
version: "1"
default_provider: claude

providers:
  - name: claude
    driver: claude-cli
    default_model: haiku

  - name: cursor
    driver: cursor-cli

  - name: groq
    driver: openai-compat
    base_url: https://api.groq.com/openai/v1
    default_model: llama-3.3-70b-versatile
    api_key_env: GROQ_API_KEY

  - name: ollama
    driver: openai-compat
    base_url: http://localhost:11434/v1
    default_model: llama3

  - name: deepseek
    driver: openai-compat
    base_url: https://api.deepseek.com/v1
    default_model: deepseek-chat
    api_key_env: DEEPSEEK_API_KEY
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `version` | `string` | Config format version (`"1"`) |
| `default_provider` | `string` | Default provider when none specified (default: `claude`) |
| `providers[].name` | `string` | Provider name, maps to `/dev/llm/<name>` |
| `providers[].driver` | `string` | Driver type: `claude-cli`, `cursor-cli`, or `openai-compat` |
| `providers[].default_model` | `string` | Default model name |
| `providers[].base_url` | `string` | API base URL (for `openai-compat` driver) |
| `providers[].api_key_env` | `string` | Environment variable name for API key |

### Driver Types

| Driver | How It Works | Examples |
|--------|-------------|----------|
| `claude-cli` | Invokes Claude Code CLI (`claude -p`) | Anthropic Claude |
| `cursor-cli` | Invokes Cursor CLI (`agent --print`) | Cursor |
| `openai-compat` | Calls OpenAI-compatible HTTP API | Ollama, Groq, DeepSeek, any OpenAI-compatible endpoint |

### Provider Resolution Priority

When spawning an agent, the LLM provider is resolved in this order:

1. `--provider` CLI flag (highest priority)
2. `agent.yaml` → `models.provider` field
3. `providers.yaml` → `default_provider`
4. Built-in default: `claude`

### Model Resolution Priority

1. `--model` CLI flag
2. `agent.yaml` → `models.preferred` field
3. Provider's `default_model`
4. Driver's built-in default

### API Key Management

API keys are referenced via environment variables — never stored directly in config files:

```yaml
- name: groq
  driver: openai-compat
  api_key_env: GROQ_API_KEY   # Reads $GROQ_API_KEY at runtime
```

API keys are resolved from the following sources (in priority order):

1. **Project `.env` files** (if project has `.rnix/` directory)
2. **Daemon process environment** (`os.Getenv`)

See [Environment Files](#environment-files-env) below for details.

---

## Environment Files (.env)

Rnix supports project-level `.env` files for managing API keys and other environment variables without polluting the daemon's process environment.

### Loading Order

When a spawn request specifies a project directory (containing `.rnix/`), the daemon loads `.env` files from the project root in this order (later files override earlier):

1. `.env` — Base environment
2. `.env.local` — Local overrides (gitignore this)
3. `.env.{RNIX_ENV}` — Environment-specific (e.g., `.env.production`)
4. `.env.{RNIX_ENV}.local` — Environment-specific local overrides

### RNIX_ENV

The `RNIX_ENV` environment variable selects which environment-specific files to load. Default: `development`.

```bash
# Use production environment
RNIX_ENV=production rnix "deploy the service"

# Default (development)
rnix "analyze code quality"
```

Valid values: alphanumeric characters, hyphens, and underscores (`^[a-zA-Z0-9_-]+$`).

### Syntax

```bash
# Key=Value (unquoted)
API_KEY=sk-xxx

# Double-quoted (supports \n, \t, \\, \" escapes)
PROMPT="Hello\nWorld"

# Single-quoted (literal, no escapes)
REGEX='foo\.bar'

# Empty value
EMPTY_VAR=

# Comments
# This is a comment
API_KEY=value  # Inline comment

# Optional export prefix
export DATABASE_URL=postgres://localhost/mydb
```

### Project Isolation

Each spawn request generates an independent environment snapshot from `.env` files. Variables are **not** written to `os.Setenv` — different projects' environments are fully isolated, even when sharing the same daemon.

### Example

```
myproject/
├── .rnix/
│   └── providers.yaml    ← Project provider overrides
├── .env                   ← API_KEY=dev-key
├── .env.local             ← API_KEY=my-local-key (gitignored)
├── .env.production        ← API_KEY=prod-key
└── .gitignore             ← *.local, .env.local
```

---

## init.yaml — Bootstrap Services

This file defines services that start automatically when the daemon launches. Located at `~/.config/rnix/init.yaml` or `.rnix/init.yaml`.

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

## compose.yaml — Multi-Agent Workflows

Compose files define DAG-based multi-agent workflows. Located at `.rnix/compose.yaml` or project root.

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

### Running Compose Workflows

```bash
rnix compose up          # Run the workflow
rnix compose up --json   # Run with JSON output
rnix compose down        # Stop all compose processes
```

---

## Agent Manifest — agent.yaml

Each agent is defined by an `agent.yaml` file and an `instructions.md` file in `agents/<name>/` (global: `~/.config/rnix/agents/`, project: `.rnix/agents/`).

```yaml
name: code-analyst
description: "Code quality analysis agent"
models:
  provider: claude
  preferred: sonnet
  fallback: haiku
context_budget: 8192
max_steps: 20
max_tokens: 50000
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
| `models.provider` | `string` | No | LLM provider name |
| `models.preferred` | `string` | No | Preferred model name |
| `models.fallback` | `string` | No | Fallback model name |
| `context_budget` | `int` | No | Max token budget (0 = unlimited) |
| `max_steps` | `int` | No | Maximum reasoning steps (0 = default 10) |
| `max_tokens` | `int` | No | Maximum total tokens (0 = unlimited) |
| `skills` | `[]string` | No | Referenced skill names |
| `mcp` | `object` | No | MCP server configurations |

### Shadow Resolution

When the same agent name exists in both project and global directories, the **project-level definition completely shadows the global one**. There is no merging at the agent level.

---

## Skill Definition — SKILL.md

Skills are defined as `SKILL.md` files in `skills/<name>/` (global: `~/.config/rnix/skills/`, project: `.rnix/skills/`).

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
| `/dev/llm/<provider>` | LLM inference |

When multiple skills are loaded by an agent, their `allowed-tools` are **unioned** — the agent can access any device permitted by any of its skills.

Empty `allowed-tools` means **no restrictions** (can access all devices).

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `RNIX_ENV` | Select environment for `.env` file loading (default: `development`) |
| `RNIX_ASCII` | Set to `1` to force ASCII mode (disable Unicode glyphs) |
| `XDG_CONFIG_HOME` | Override global config directory (default: `~/.config`) |
| `XDG_RUNTIME_DIR` | Used to determine socket path |

## Socket Path

The daemon socket location follows this priority:

1. `$XDG_RUNTIME_DIR/rnix/rnix.sock` (e.g., `/run/user/1000/rnix/rnix.sock`)
2. `/tmp/rnix-{uid}/rnix.sock` (fallback)

Directory permissions: `0700` (current user only).

---

## Related Documentation

- [Quick Start](/guide/quick-start) — Installation and first run
- [LLM Providers](/guide/llm-providers) — Provider details and serve gateway
- [Core Concepts](/guide/concepts) — Process, VFS, Agent/Skill model
- [Reference Manual](/reference/) — Complete API and CLI reference
