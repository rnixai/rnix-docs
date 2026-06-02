# LLM Providers & Serve Gateway

Rnix supports multiple LLM providers through declarative configuration and exposes them as an OpenAI-compatible HTTP API gateway.

---

## Multi-Provider Configuration

### providers.yaml

Define LLM providers declaratively in `~/.config/rnix/providers.yaml` (global) or `.rnix/providers.yaml` (project override). The daemon parses this at startup and registers each as a VFS device at `/dev/llm/<name>`.

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

  - name: ollama
    driver: openai-compat
    base_url: http://localhost:11434/v1
    default_model: llama3

  - name: groq
    driver: openai-compat
    base_url: https://api.groq.com/openai/v1
    api_key_env: GROQ_API_KEY
    default_model: llama-3.3-70b-versatile

  - name: deepseek
    driver: openai-compat
    base_url: https://api.deepseek.com/v1
    api_key_env: DEEPSEEK_API_KEY
    default_model: deepseek-chat

  - name: gemini
    driver: gemini
    api_key_env: GOOGLE_API_KEY
    default_model: gemini-2.0-flash

  - name: openai
    driver: openai
    api_key_env: OPENAI_API_KEY
    default_model: gpt-4o

  - name: anthropic-api
    driver: anthropic
    api_key_env: ANTHROPIC_API_KEY
    default_model: claude-sonnet-4-20250514

  - name: qwen
    driver: qwen-cli
    default_model: qwen3-coder
```

### Driver Types

| Driver | How It Works | Examples |
|--------|-------------|----------|
| `claude-cli` | Invokes Claude Code CLI (`claude -p`) | Anthropic Claude |
| `cursor-cli` | Invokes Cursor CLI (`agent --print`) | Cursor |
| `openai-compat` | Calls OpenAI-compatible HTTP API endpoint | Ollama, Groq, DeepSeek, any OpenAI-compatible server |
| `qwen-cli` | Invokes Qwen Code CLI (`qwen --chat`) | Qwen Code |
| `openai` | Official OpenAI SDK (`github.com/openai/openai-go/v3`) | OpenAI GPT-4, GPT-4o |
| `gemini` | Native Gemini API (`google.golang.org/genai`) | Google Gemini |
| `anthropic` | Official Anthropic SDK (`anthropic-sdk-go`) | Claude (via API, not CLI) |

### CLI Command Alias

CLI drivers invoke a binary to interact with the LLM. Use the `command` field to override the default binary name:

| Driver | Default Command |
|--------|----------------|
| `claude-cli` | `claude` |
| `cursor-cli` | `agent` |
| `qwen-cli` | `qwen` |

```yaml
- name: cursor
  driver: cursor-cli
  command: cursor-agent   # Override default "agent"
```

### Provider Resolution

When spawning an agent, the provider is resolved:

1. `--provider` CLI flag (highest priority)
2. `agent.yaml` → `models.provider`
3. `providers.yaml` → `default_provider`
4. Built-in default: `deepseek`

### Provider Fallback

When the preferred provider fails (HTTP 5xx, connection timeout, auth failure), the system automatically tries the fallback:

```yaml
# agent.yaml
models:
  provider: groq          # Primary
  preferred: llama-3.3-70b
  fallback: ollama         # Fallback provider
```

### Health Check

```bash
$ rnix providers status
Provider     Driver  Status    Model              Latency
claude       cli     healthy   sonnet             -
cursor       cli     healthy   claude-3.5-sonnet  -
ollama       http    healthy   llama3             45ms
groq         http    healthy   llama-3.3-70b      120ms
deepseek     http    offline   deepseek-chat      timeout
```

### Advanced Provider Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `string` | `"stream"` | Response mode: `"stream"` for SSE streaming, `"call"` for single-shot response |
| `max_tokens` | `int` | `0` | Maximum output tokens per LLM call; `0` uses the API default |
| `cost_per_token` | `float64` | `0` | Per-token cost in USD for budget tracking; `0` disables cost tracking |
| `thinking_budget` | `int` | `0` | Thinking budget in tokens (`gemini`, `anthropic`, and `openai-compat` drivers); `0` disables thinking |
| `extra_args` | `string[]` | `[]` | Additional CLI arguments passed to the binary (`claude-cli`, `cursor-cli`, `qwen-cli` only) |

**Example** — Gemini with thinking budget:

```yaml
- name: gemini-thinking
  driver: gemini
  api_key_env: GOOGLE_API_KEY
  default_model: gemini-2.5-pro
  thinking_budget: 8192
```

**Example** — DeepSeek V4 with extended reasoning:

```yaml
- name: deepseek-think
  driver: openai-compat
  base_url: https://api.deepseek.com/v1
  api_key_env: DEEPSEEK_API_KEY
  default_model: deepseek-reasoner
  thinking_budget: 16384
```

---

## CLI Driver Capabilities

CLI-based drivers (`claude-cli`, `cursor-cli`, `qwen-cli`) wrap external CLI tools. The `claude-cli` driver includes an advanced **capability probing** system that adapts to different CLI versions.

### Capability Probing

On first use, the Claude CLI driver runs `claude -p --help` (5s timeout) and scans the output to detect optional flags:

| Capability | Flag | Effect |
|------------|------|--------|
| `partialMessages` | `--include-partial-messages` | Enable streaming of partial LLM responses |
| `addDir` | `--add-dir` | Bundle additional directories into the agent context |
| `permissionMode` | `--permission-mode` | Control tool execution permissions |

Probing runs once per driver instance and caches results. If the probe times out or fails, all capabilities default to `false` (conservative mode).

### Fallback Binary Resolution

The driver searches multiple paths for the CLI binary:

1. `claude` (default) or the value of `command` in provider config
2. `openclaude` (fallback)
3. Extended search paths: `~/.local/bin`, nvm's latest node bin, `~/.bun/bin`

### DriverMetaProvider

CLI drivers implement the `DriverMetaProvider` interface, exposing runtime metadata for observability:

| Key | Description | Example |
|-----|-------------|---------|
| `resolved_bin` | Absolute path to resolved binary | `/usr/local/bin/claude` |
| `permission_mode` | Active permission mode | `bypassPermissions` |
| `cap_partial_messages` | Streaming support detected | `"true"` / `"false"` |
| `cap_add_dir` | Directory bundling support | `"true"` / `"false"` |
| `cap_permission_mode` | Permission mode support | `"true"` / `"false"` |

This metadata is recorded in strace events (`claude_cli.resolve`, `claude_cli.capabilities`) and visible in the dashboard's process detail view.

### Prompt Context Injection

To save a startup round-trip, the `claude-cli` driver prepends a short `# Instructions` block to the first prompt whenever the process has a project directory or skills — so the model knows where it is and what skills it has without spending a tool call to discover them:

```
# Instructions

Working directory: /path/to/project

Accessible skill bundle: /path/to/project/.claude/skills/code-review, web-research

# User request

<the actual intent>
```

The skill bundle is also exposed to the CLI's own built-in tools via `--add-dir` (when that capability is present). If neither a project directory nor skills are set, the raw intent is sent unmodified.

### Permission Mode

The `claude-cli` driver runs under a configurable permission mode, set per provider in `providers.yaml`:

```yaml
providers:
  claude:
    driver: claude-cli
    model: sonnet
    permission_mode: bypassPermissions   # default
```

| Mode | Behavior |
|------|----------|
| `bypassPermissions` | Skip all permission confirmations (the daemon default) |
| `acceptEdits` | Auto-accept file edits; other operations still confirm |
| `plan` | Planning only — no real operations are executed |
| `default` | Use the Claude CLI's native default behavior |

**Why `bypassPermissions` is the daemon default — and safe here:** Rnix processes run under the daemon with no TTY, so an interactive CLI permission prompt would *block the process forever*. Permission control is instead enforced one layer below the CLI, by Rnix's VFS device allowlist (`allowed_tools`). If your installed CLI does **not** support `--permission-mode`, leave `permission_mode` empty so the flag is omitted.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Streaming partial messages never appear; output arrives all at once | Installed CLI lacks `--include-partial-messages` | `claude -p --help \| grep include-partial-messages`; update via `npm update -g @anthropic-ai/claude-code` |
| Process hangs on its first LLM call, daemon log silent | `--permission-mode` unsupported → CLI shows a TTY prompt the daemon can't answer | Confirm with `claude -p --help \| grep permission-mode`; if absent, set `permission_mode: ""` (omit the flag) or update the CLI |
| Spawn fails: `no claude-compatible CLI found in PATH: tried [claude openclaude]` | Binary not on PATH or any extended search path | Install (`npm install -g @anthropic-ai/claude-code`), verify with `which claude`, or pin `command: /full/path/claude` in `providers.yaml` |
| Dashboard detail pane shows no `Binary:` / `Capabilities:` lines | The process isn't using a CLI driver (API drivers don't implement `DriverMetaProvider`) | Expected behavior — driver metadata is only shown for CLI drivers like `claude-cli` |

---

## Prompt Caching

### Anthropic Native Caching

When using the `anthropic` driver, Rnix automatically injects `cache_control` breakpoints at three positions to maximize cache reuse across reasoning steps:

1. **System prompt** — the full agent system prompt (instructions + skills)
2. **Tool definitions** — all registered VFS device schemas
3. **Last user turn** — the most recent user message

This maps to Anthropic's recommended caching strategy for agentic workloads. No configuration is required — caching activates whenever the `anthropic` driver is in use and the model supports it.

**Cache hit rate semantics** — the dashboard reports per-step cache hit rate. For the `anthropic` driver, the formula is:

```
hit_rate = CacheReadInputTokens / (input_tokens + CacheReadInputTokens)
```

For `openai-compat` and CLI drivers, the formula is:

```
hit_rate = cached_tokens / input_tokens   (OpenAI convention: input includes cached)
```

See the [Dashboard](/guide/dashboard#tracing-timeline-pane) for how this is surfaced in the timeline.

### Enabling the Anthropic Driver

```yaml
- name: anthropic-api
  driver: anthropic
  api_key_env: ANTHROPIC_API_KEY
  default_model: claude-sonnet-4-20250514
```

Set `ANTHROPIC_API_KEY` in your environment or project `.env` file.

### API Key Management

HTTP providers reference API keys via environment variables — keys are never stored in config files:

```yaml
- name: groq
  driver: openai-compat
  api_key_env: GROQ_API_KEY   # Reads $GROQ_API_KEY at runtime
```

API keys are resolved in this order:

1. **Project `.env` files** — loaded from the project root when `.rnix/` exists (`.env` → `.env.local` → `.env.{RNIX_ENV}` → `.env.{RNIX_ENV}.local`)
2. **Daemon process environment** — `os.Getenv` fallback

This means you can define API keys per-project without polluting the daemon's global environment. See [Configuration > Environment Files](/guide/configuration#environment-files-env) for `.env` syntax and loading order.

### Project-Level Provider Overrides

A project can override or extend global providers by placing a `providers.yaml` in `.rnix/`:

```
myproject/.rnix/providers.yaml
```

Project providers are **deep-merged** with global providers — you can override specific fields (like `api_key_env` or `default_model`) without redefining the entire provider list. Project-level providers that don't exist globally are added as new providers available only in that project.

---

## LLM Serve Gateway

### Overview

`rnix serve` starts an OpenAI-compatible HTTP server that exposes all registered providers as standard API endpoints. External tools (VS Code extensions, web UIs, other applications) can consume LLM capabilities without understanding Rnix internals.

```bash
$ rnix serve --port 8080
[serve] starting OpenAI-compatible API server on http://localhost:8080
[serve] registered providers: claude, cursor, ollama, groq
[serve] endpoints: /v1/chat/completions, /v1/models, /health
```

**Flags:**

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | `8080` | HTTP listen port |

The server binds to `127.0.0.1` (localhost only). Request body size is limited to **4 MB**. On startup, the server runs health checks on all providers (3s timeout per provider).

### Endpoints

#### POST /v1/chat/completions

Standard OpenAI Chat Completions API. The `model` parameter routes to the corresponding VFS LLM driver:

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | `string` | Yes | Model identifier (provider name or `provider:model`) |
| `messages` | `array` | Yes | Message array (`{role, content}`), at least 1 message |
| `stream` | `bool` | No | Enable SSE streaming response |
| `temperature` | `float64` | No | Sampling temperature |
| `max_tokens` | `int` | No | Maximum tokens to generate |

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ollama",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

**Model routing:**

| Model String | Resolution |
|-------------|------------|
| `"ollama"` | `/dev/llm/ollama` → uses provider's `default_model` |
| `"groq:llama-3.3-70b"` | `/dev/llm/groq` with explicit model |
| `"llama-3.3-70b"` | Reverse lookup: finds a provider whose `default_model` matches |
| `"unknown-model"` | Falls back to `default_provider`, input treated as model name |

If no provider is found, returns `404` with available provider list.

**Streaming** — set `"stream": true` for SSE responses:

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "ollama", "messages": [{"role": "user", "content": "Hello"}], "stream": true}'
```

Stream terminates with `data: [DONE]\n\n` per OpenAI SSE spec.

**Response format (non-streaming):**

```json
{
  "id": "chatcmpl-1234567890",
  "object": "chat.completion",
  "created": 1711600000,
  "model": "ollama",
  "choices": [
    {
      "index": 0,
      "message": {"role": "assistant", "content": "Hello! How can I help?"},
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 25,
    "total_tokens": 35
  }
}
```

#### GET /v1/models

Lists all registered providers with available models. Unhealthy providers are excluded; unchecked providers are included. Each provider with a `default_model` generates two entries:

```json
{
  "object": "list",
  "data": [
    {"id": "claude", "object": "model", "created": 1711600000, "owned_by": "claude"},
    {"id": "claude:haiku", "object": "model", "created": 1711600000, "owned_by": "claude"},
    {"id": "ollama", "object": "model", "created": 1711600000, "owned_by": "ollama"},
    {"id": "ollama:llama3", "object": "model", "created": 1711600000, "owned_by": "ollama"}
  ]
}
```

#### GET /health

Health check endpoint for monitoring and load balancers:

```json
{"status": "ok", "providers": 4}
```

### Error Responses

All errors follow the OpenAI error format:

```json
{
  "error": {
    "message": "Provider 'xyz' not found. Available providers: claude, cursor",
    "type": "invalid_request_error",
    "code": "model_not_found"
  }
}
```

| HTTP Status | Code | Scenario |
|-------------|------|----------|
| `400` | `invalid_request` | Invalid JSON, missing `model` or `messages` |
| `404` | `model_not_found` | Provider not found |
| `502` | `upstream_error` | LLM driver returned an error or empty response |
| `504` | `timeout` | LLM request timed out |

### Architecture

The serve gateway **shares the daemon's driver instances** and `providers.yaml` configuration. Adding or changing a provider only requires editing the config and restarting the daemon.

```
External Tool → HTTP → rnix serve → VFS /dev/llm/* → Provider Driver → LLM
```

---

## Related Documentation

- [Configuration](/guide/configuration) — All configuration files
- [Agents & Skills](/guide/agents-and-skills) — Provider selection in agent manifests
- [Reference Manual](/reference/) — VFS path specification for /dev/llm/*
