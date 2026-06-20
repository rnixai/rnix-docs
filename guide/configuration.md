# Configuration Guide

Rnix uses a layered configuration system with YAML files, agent definitions, and skill definitions. Run `rnix init` to bootstrap the configuration environment.

---

## Configuration Model

Rnix configuration has three independent dimensions:

### 1. Config Layering (XDG-style)

YAML config files (`providers.yaml`, `config.yaml`, `web-search.yaml`) follow a **global + project** two-tier model:

| Tier | Location | Purpose |
|------|----------|---------|
| **Global** | `~/.config/rnix/` (or `$XDG_CONFIG_HOME/rnix/`) | User-wide defaults |
| **Project** | `<project>/.rnix/` | Project-specific overrides |

YAML files deep-merge: project values override global values.

### 2. Skill Storage (agentskills.io 2×2 model)

Skills follow the [agentskills.io](https://agentskills.io/) specification's dual-scope × dual-namespace model. Rnix implements **two namespaces per scope**:

| | Native Namespace (Rnix) | Agents Namespace (agentskills.io) |
|---|---|---|
| **Project scope** | `<project>/.rnix/skills/` | `<project>/.agents/skills/` |
| **User scope** | `~/.config/rnix/skills/` | `~/.agents/skills/` |

- **Native namespace** (`.rnix/skills/`, `~/.config/rnix/skills/`): Rnix-specific skills, highest priority within each scope
- **Agents namespace** (`.agents/skills/`, `~/.agents/skills/`): Follows the agentskills.io cross-tool standard — skills placed here are visible to Cursor, OpenCode, Windsurf, and other compatible tools

Priority: `project/native > project/agents > user/native > user/agents`. See [Skill Packages](/guide/skill-packages) for the full resolution model.

### 3. Data Directory (sessions & history)

Runtime artifacts — reasoning steps, checkpoints, `events.jsonl`, and resumable history — are **not** stored next to your config. They live in a single global **data directory**, resolved in this order:

| Priority | Source | Resulting path |
|----------|--------|----------------|
| 1 | `RNIX_DATA_DIR` | the value, as-is |
| 2 | `XDG_DATA_HOME` | `$XDG_DATA_HOME/rnix` |
| 3 | (default) | `~/.local/share/rnix` |

Under the data directory, every project gets its own subtree in a **project registry**, keyed by a deterministic, human-readable ID:

```
<data-dir>/
└── projects/
    ├── my-api-3f9a1c2b/         ← <sanitized-basename>-<hash8>
    │   └── steps/
    │       └── <uuid>/          ← events.jsonl, proc-info.json, checkpoints
    └── another-repo-7c4e0d11/
        └── steps/
```

The ID is `<sanitized-basename>-<hash8>`, where `hash8` is the first 4 bytes of `sha256(absolute-project-path)`. The hash keeps two projects that share a basename (e.g. two different `api/` folders) from colliding, while the basename keeps the directory readable. Centralizing data this way lets `rnix ps -a`, `rnix record`, `rnix replay`, and `rnix resume` enumerate history **across every project** from one root, and lets [garbage collection](#garbage-collection) apply `retention_days` / `max_entries` globally.

> Older releases stored session data in a cwd-relative `<project>/.rnix/data/steps/`. That location is superseded by the global data directory — `.rnix/` now holds only config, state, and skills.

### Directory Structure

```
~/.config/rnix/                  ← Global config (created by rnix init)
├── providers.yaml
├── config.yaml
├── web-search.yaml
├── agents/                      ← Global agent definitions
│   └── code-analyst/
│       ├── agent.yaml
│       └── instructions.md
└── skills/                      ← User skills (native namespace)
    └── code-analysis/
        └── SKILL.md

~/.agents/skills/                ← User skills (agents namespace, agentskills.io standard)
└── web-research/                ←   Shared with Cursor, OpenCode, etc.
    └── SKILL.md

<project>/.rnix/                  ← Project config (created by rnix init)
├── providers.yaml
├── config.yaml
├── init.yaml
├── compose.yaml
├── web-search.yaml
├── agents/                      ← Project agent definitions
├── skills/                      ← Project skills (native namespace)
└── state/                       ← Runtime state (trust marker, etc.)
                                 ← (session data lives in the global data dir — see "3. Data Directory")

<project>/.agents/skills/        ← Project skills (agents namespace, agentskills.io standard)
└── shared-util/                 ←   Shared across tools in the project
    └── SKILL.md
```

> **Note**: `~/.agents/skills/` and `.agents/skills/` are **not** created by `rnix init`. They are created on first use (`rnix skill install --shared`). This follows agentskills.io convention where the `.agents/` directory belongs to the ecosystem, not any single tool.

### Merge Rules

- **YAML files** (`providers.yaml`, `config.yaml`, `web-search.yaml`): Deep merge — project overrides global
- **Agent directories** (`agents/`): Shadow — project agent with same name completely replaces global agent
- **Skill directories** (`skills/`): Shadow with 2×2 priority — `project/native > project/agents > user/native > user/agents`. Winning copy completely replaces shadowed copies.

> **Exception — `init.yaml`**: The daemon is a single per-user process, so its bootstrap config is read **only** from the global `~/.config/rnix/init.yaml`. It does **not** participate in the project-level merge and a project `.rnix/init.yaml` is never read.

### Initialization

```bash
# Create both global (~/.config/rnix/) and project (.rnix/) directories
$ rnix init
[init] created ~/.config/rnix/
[init] created .rnix/

# With MCP example configurations
$ rnix init --with-mcp-examples
[init] created ~/.config/rnix/
[init] created .rnix/
[init] added agents/playwright-demo/ with MCP Playwright config
[init] added agents/github-assistant/ with MCP GitHub config
```

`rnix init` is idempotent — it skips existing files and directories. `--with-mcp-examples` runs preflight checks to verify required binaries (e.g., `npx`) are available before creating example configs.

---

## config.yaml — Global Configuration

Located at `~/.config/rnix/config.yaml` (global) and optionally `.rnix/config.yaml` (project override).

### Feature Profiles

Feature profiles control which emergent subsystems are active at runtime. They enable **ablation experiments** — selectively disabling capabilities to measure each layer's contribution to overall intelligence emergence.

There are four named presets and a `custom` mode for fine-grained control:

| Profile | Description |
|---------|-------------|
| `baseline` | Foundation only — bare LLM + VFS devices. No planning, spawning, or adaptive mechanisms. |
| `core` | Foundation + core mechanisms — planning, subprocess spawning, context compaction. |
| `adaptive` | Core + feedback loops — runtime learning, skill acquisition, path re-planning. |
| `full` | All capabilities enabled, including immune system. **Default.** |
| `custom` | Per-flag control — any flag not explicitly listed defaults to `true`. |

**Configuration:**

```yaml
# .rnix/config.yaml or ~/.config/rnix/config.yaml
features:
  profile: full   # baseline | core | adaptive | full | custom
  custom:         # only used when profile is "custom"
    planning: true
    replan: false
    specialize: true
    discover_skill: true
    spawn: true
    diff_memory: false
    stem_matcher: false
    immune: true
    compaction: true
```

**Preset Matrix:**

| Feature | baseline | core | adaptive | full (default) |
|---------|----------|------|----------|----------------|
| `planning` | false | true | true | true |
| `replan` | false | false | true | true |
| `specialize` | false | false | true | true |
| `discover_skill` | false | false | true | true |
| `spawn` | false | true | true | true |
| `diff_memory` | false | false | true | true |
| `stem_matcher` | false | false | true | true |
| `immune` | false | false | false | true |
| `compaction` | false | true | true | true |

**Environment Variable Override:**

Set `RNIX_FEATURE_PROFILE` to override the config file setting. Valid values: `baseline`, `core`, `adaptive`, `full`, `custom`. Invalid values produce a warning and fall back to `full`.

```bash
RNIX_FEATURE_PROFILE=baseline rnix "analyze this code"
```

**Custom Mode:**

When `profile: custom`, only the flags explicitly listed under `custom:` are applied. Unlisted flags default to `true` — custom mode is for surgical ablation, not wholesale disabling.

**Inspecting the Active Profile:**

Use `rnix config show` to display the active feature profile and flags. See [CLI Reference](/reference/cli#rnix-config) for details.

See [Feature Profiles & Ablation](/guide/emergence#feature-profiles-ablation) for how profiles map to the emergence stack.

### Garbage Collection

```yaml
gc:
  retention_days: 30      # Delete dead_at entries older than N days; 0 = disabled
  max_entries: 500        # Keep at most N history entries; 0 = disabled
  interval_seconds: 3600  # Background scan period (min 60, default 1h)
```

- `retention_days` and `max_entries` are combined — hitting either triggers cleanup
- Set both to 0 to disable the GC daemon entirely
- Running and Suspended processes are permanently exempt

See [Process Resume](/guide/process-resume#garbage-collection) for GC CLI usage.

---

## providers.yaml — LLM Providers

This file defines available LLM providers. Located at `~/.config/rnix/providers.yaml` (global) and optionally `.rnix/providers.yaml` (project override).

```yaml
version: "1"
default_provider: deepseek

providers:
  - name: claude
    driver: claude-cli
    default_model: haiku

  - name: cursor
    driver: cursor-cli
    command: agent              # CLI binary name (default: "agent")

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
| `default_provider` | `string` | Default provider when none specified (default: `deepseek`) |
| `providers[].name` | `string` | Provider name, maps to `/dev/llm/<name>` |
| `providers[].driver` | `string` | Driver type (one of 8): `claude-cli`, `cursor-cli`, `qwen-cli`, `codex-cli`, `openai-compat`, `openai`, `gemini`, `anthropic` |
| `providers[].command` | `string` | CLI binary name override for CLI drivers |
| `providers[].default_model` | `string` | Default model name |
| `providers[].base_url` | `string` | API base URL (for `openai-compat` driver) |
| `providers[].api_key_env` | `string` | Environment variable name for API key |
| `providers[].timeout_sec` | `int` | Per-request timeout in seconds; `0` = driver default (5 min for CLI drivers) |
| `providers[].grace_sec` | `int` | CLI grace period between `SIGTERM` and `SIGKILL`; `0` = driver default (20s) |
| `providers[].models` | `map` | Per-model metadata, keyed by model name: `<model>: {context_window: N}`. Used to derive `context_budget` (context_window × 0.9) |

For the full set of advanced provider options (`mode`, `max_tokens`, `cost_per_token`, `thinking_budget`, `reasoning_effort`, `extra_args`, `permission_mode`), see [LLM Providers › Advanced Provider Options](/guide/llm-providers#advanced-provider-options).

### Driver Types

| Driver | How It Works | Examples |
|--------|-------------|----------|
| `claude-cli` | Invokes Claude Code CLI (`claude -p`) | Anthropic Claude |
| `cursor-cli` | Invokes Cursor CLI (`agent --print`) | Cursor |
| `qwen-cli` | Invokes Qwen Code CLI | Qwen Code |
| `codex-cli` | Invokes OpenAI Codex CLI | OpenAI Codex |
| `openai-compat` | Calls OpenAI-compatible HTTP API | Ollama, Groq, DeepSeek, any OpenAI-compatible endpoint |
| `openai` | Official OpenAI SDK | OpenAI GPT-4, GPT-4o |
| `gemini` | Native Gemini API | Google Gemini |
| `anthropic` | Official Anthropic SDK | Claude (via API, not CLI) |

### Provider Resolution Priority

1. `--provider` CLI flag (highest priority)
2. `agent.yaml` → `models.provider` field
3. `providers.yaml` → `default_provider`
4. Built-in default: `deepseek`

### Model Resolution Priority

1. `--model` CLI flag
2. `agent.yaml` → `models.preferred` field
3. Provider's `default_model`
4. Driver's built-in default

### Reasoning Effort

Set `reasoning_effort` on a provider (or per spawn) to control discrete reasoning strength. The value is passed through to the provider verbatim. It resolves through a four-tier fallback (per-spawn → agent → provider → native default) and supersedes the legacy `thinking_budget` where both are set; the budget path is retained as a fallback for providers that still require it. See [LLM Providers › Reasoning Effort](/guide/llm-providers#reasoning-effort) for details and the case-sensitivity note.

### API Key Management

API keys are referenced via environment variables — never stored directly in config files. Resolved from project `.env` files first, then daemon process environment.

---

## web-search.yaml — Web Search Backends

Configure search backends for the `/dev/web` device. Located at `~/.config/rnix/web-search.yaml` (global) or `.rnix/web-search.yaml` (project, takes priority).

```yaml
version: "1"
default_backend: tavily
backends:
  - name: tavily
    driver: tavily
    api_key_env: TAVILY_API_KEY
    max_results: 5
    search_depth: basic

  - name: exa
    driver: exa
    api_key_env: EXA_API_KEY
    num_results: 5

  - name: local-searxng
    driver: searxng
    base_url: http://localhost:8888
```

The project file fully overrides the global file (no merging). See [Web Search](/guide/web-search) for backend details and quick-start options.

---

## Environment Files (.env)

Rnix supports project-level `.env` files for managing API keys and other environment variables without polluting the daemon's process environment.

### Loading Order

1. `.env` — Base environment
2. `.env.local` — Local overrides (gitignore this)
3. `.env.{RNIX_ENV}` — Environment-specific (e.g., `.env.production`)
4. `.env.{RNIX_ENV}.local` — Environment-specific local overrides

### RNIX_ENV

The `RNIX_ENV` environment variable selects which environment-specific files to load. Default: `development`.

```bash
RNIX_ENV=production rnix "deploy the service"
```

### Project Isolation

Each spawn request generates an independent environment snapshot from `.env` files. Variables are **not** written to `os.Setenv` — different projects' environments are fully isolated, even when sharing the same daemon.

---

## init.yaml — Bootstrap Services & Supervisors

Defines services and supervised agent trees that start when the daemon launches. The daemon is a single per-user process, so bootstrap is a **global concern**: this file is read **only** from `~/.config/rnix/init.yaml`. A project-level `.rnix/init.yaml` is **never** read.

`rnix init` writes a scaffold here that defaults to an empty service list. Two top-level sections are supported: `services` and `supervisors`.

```yaml
services:
  - name: skills
    type: skill_registry
    required: false
    config:
      scan_path: lib/skills

  - name: mcp
    type: mcp_manager
    required: false

supervisors:
  - name: monitors
    strategy: one_for_one
    max_restarts: 3
    max_window: 60s
    required: false
    children:
      - name: health-monitor
        intent: "Monitor system health and report anomalies"
        agent: monitor
        model: deepseek-v4-flash
        restart: permanent
```

### Services

`services` is a **list**; each item is a `ServiceConfig`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `string` | Required | Display name for the service |
| `type` | `string` | Required | Registered service type — one of `skill_registry`, `mcp_manager`, `log_aggregator` |
| `required` | `bool` | `false` | `true` = bootstrap aborts if this service fails; `false` = warn and continue |
| `config` | `map` | `{}` | Type-specific key/value options (e.g. `skill_registry` accepts `scan_path`) |

> `mcp_manager` is loaded **implicitly** even when omitted, so MCP servers declared in `mcp.yaml` are always resolvable by `rnix mcp test`/`rnix mcp list`. A user-declared `mcp_manager` service takes precedence over the implicit one.

### Supervisors

`supervisors` is a **list**; each item is a `SupervisorConfig` describing a long-running supervised agent tree.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `string` | Required | Display name for the supervisor tree |
| `strategy` | `string` | `""` | Restart strategy for the tree |
| `max_restarts` | `int` | `0` | Maximum restarts within `max_window` |
| `max_window` | `duration` | `0` | Sliding window for the restart counter (e.g. `60s`) |
| `required` | `bool` | `false` | `true` = bootstrap aborts (and rolls back) on failure; `false` = warn and continue |
| `children` | `[]object` | `[]` | Child processes supervised by this tree |

Each entry under `children` is a `ChildConfig`:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Child display name |
| `intent` | `string` | Intent string for the child agent |
| `agent` | `string` | Named agent definition (optional; empty = generic) |
| `model` | `string` | Model override |
| `provider` | `string` | Provider override |
| `context_budget` | `int` | Per-step context window guard |
| `restart` | `string` | Child restart policy |

---

## compose.yaml — Multi-Agent Workflows

Compose files define DAG-based multi-agent workflows. Located at `.rnix/compose.yaml`.

```yaml
version: "1.0"
intent: "Code review workflow"
model: "deepseek-v4-flash"

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
| `provider` | `string` | Global default provider (agents can override) |
| `reasoning_effort` | `string` | Spec-level reasoning effort default (passthrough; agents can override) |
| `token_budget` | `int` | Overall token budget for the workflow |
| `agents` | `map` | Agent definitions |

### Agent Fields

| Field | Type | Description |
|-------|------|-------------|
| `intent` | `string` | Task description for this agent |
| `agent` | `string` | Named agent definition (optional) |
| `model` | `string` | Model override for this agent |
| `provider` | `string` | Provider override for this agent |
| `reasoning_effort` | `string` | Reasoning effort override for this agent (passthrough) |
| `skills` | `[]string` | Skill names to load for this agent |
| `priority` | `string` | Scheduling priority: `high`, `normal`, `low` |
| `max_tokens` | `int` | Per-process token budget |
| `timeout_ms` | `int` | Execution timeout in milliseconds |
| `depends_on` | `map` | Dependencies: `<upstream>: completed` |
| `candidates` | `[]string` | Candidate agents for auto-selection |

### Running Compose Workflows

```bash
rnix compose up          # Run the workflow
rnix compose up --json   # Run with JSON output
rnix compose down        # Stop all compose processes
rnix compose resume --node <name>  # Resume a failed DAG node
```

---

## Agent Manifest — agent.yaml

Each agent is defined by an `agent.yaml` file and an `instructions.md` file in `agents/<name>/` (global: `~/.config/rnix/agents/`, project: `.rnix/agents/`).

```yaml
name: code-analyst
description: "Code quality analysis agent"
models:
  provider: deepseek
  preferred: deepseek-v4-flash
  fallback: deepseek-v4-pro
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
      timeout: 30s
      max_output_tokens: 4096
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Unique agent identifier |
| `description` | `string` | No | Human-readable description |
| `models` | `object` | No | LLM model preferences |
| `models.provider` | `string` | No | LLM provider name |
| `models.preferred` | `string` | No | Preferred model name |
| `models.fallback` | `string` | No | Fallback model name (same provider) |
| `models.fallback_provider` | `string` | No | Cross-provider fallback; empty = same provider |
| `models.reasoning_effort` | `string` | No | Agent-level reasoning effort default (passthrough, no validation/case-mapping); empty = defer to provider snapshot |
| `context_budget` | `int` | No | Per-step context window guard: max input tokens allowed in a single LLM call. When exceeded, the process self-suspends with exit code 3 (`context_full`) and can be resumed. `0` = auto-derive from `context_window × 0.9`; explicitly set values are clamped to `min(budget, context_window)`. |
| `ctx_size` | `int` | No | Per-process message-history slot count (overrides the default 256) |
| `max_steps` | `int` | No | Maximum reasoning steps. `0` = use `DefaultMaxSteps` (currently `0`, i.e. no step-count limit). |
| `max_tokens` | `int` | No | Maximum total tokens (0 = unlimited) |
| `max_cost` | `float64` | No | Per-process cost budget in USD (0 = unlimited) |
| `step_timeout` | `string` | No | Per-step timeout as a duration string, e.g. `"10m"` (default `"5m"`; `"0"` = disabled) |
| `skills` | `[]string` | No | Referenced skill names |
| `deferred_skills` | `[]string` | No | Skills loaded metadata-only; body loaded on `discover_skill` |
| `tools` | `[]string` | No | Agent-level tool declaration, unioned with skill allowed-tools |
| `planning` | `bool` | No | Enable the planning capability (default `true` when unset) |
| `project_doc` | `bool` | No | Inject the project-root `AGENTS.md` into the system prompt (default `true`; set `false` to disable) |
| `language` | `string` | No | Preferred response language (e.g. `Chinese`, `English`); empty = no preference |
| `mcp` | `object` | No | MCP server configurations |

### MCP Server Config Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | `string` | Yes | Executable to launch the MCP server |
| `args` | `[]string` | No | Command-line arguments |
| `env` | `map[string]string` | No | Environment variables (`${VAR}` expansion) |
| `timeout` | `duration` | No | Per-server timeout (default: `30s`) |
| `max_output_tokens` | `int` | No | Max tokens per tool output |

---

## Skill Definition — SKILL.md

Skills are defined as `SKILL.md` files following the [agentskills.io](https://agentskills.io/) standard. Storage uses a four-path model (project/user × native/agents namespace):

| Path | Scope | Namespace | Priority |
|------|-------|-----------|----------|
| `<project>/.rnix/skills/` | project | native | 1 (highest) |
| `<project>/.agents/skills/` | project | agents | 2 |
| `~/.config/rnix/skills/` | user | native | 3 |
| `~/.agents/skills/` | user | agents | 4 (lowest) |

See [Skill Packages](/guide/skill-packages) for the full multi-scope management model.

```markdown
---
name: code-analysis
description: >
  Analyze code quality, identify bugs, performance issues
  and security vulnerabilities.
allowed-tools: /dev/fs /dev/shell /dev/web
metadata:
  author: rnix
  version: "1.0"
  tags: "code, quality"
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
| `/dev/web` | Web search and fetch |
| `/mnt/mcp/*` | MCP server tools |

When multiple skills are loaded by an agent, their `allowed-tools` are **unioned** — the agent can access any device permitted by any of its skills. Empty `allowed-tools` means **no restrictions** (can access all devices).

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `RNIX_ENV` | Select environment for `.env` file loading (default: `development`) |
| `RNIX_ASCII` | Set to `1` to force ASCII mode (disable Unicode glyphs) |
| `RNIX_FEATURE_PROFILE` | Feature profile override: `baseline`, `core`, `adaptive`, `full`, `custom` |
| `XDG_CONFIG_HOME` | Override global config directory (default: `~/.config`) |
| `XDG_RUNTIME_DIR` | Used to determine socket path |
| `TAVILY_API_KEY` | Tavily search API key (auto-detected for `/dev/web`) |
| `EXA_API_KEY` | Exa search API key (auto-detected for `/dev/web`) |
| `RNIX_SEARCH_URL` | SearXNG instance URL (auto-detected for `/dev/web`) |

## Socket Path

The daemon socket location follows this priority:

1. `$XDG_RUNTIME_DIR/rnix/rnix.sock` (e.g., `/run/user/1000/rnix/rnix.sock`)
2. `/tmp/rnix-{uid}/rnix.sock` (fallback)

Directory permissions: `0700` (current user only).

---

## Related Documentation

- [Quick Start](/guide/quick-start) — Installation and first run
- [LLM Providers](/guide/llm-providers) — Provider details and serve gateway
- [Web Search](/guide/web-search) — Search backend configuration
- [Skill Packages](/guide/skill-packages) — Multi-scope skill management
- [Process Resume](/guide/process-resume) — GC configuration and process recovery
- [MCP Integration](/guide/mcp-integration) — MCP server configuration
- [Intelligence Emergence](/guide/emergence) — Emergent architecture and feature profile mapping
- [Core Concepts](/guide/concepts) — Process, VFS, Agent/Skill model
- [Reference Manual](/reference/) — Complete API and CLI reference
