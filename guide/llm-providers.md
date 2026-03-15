# LLM Providers & Serve Gateway

Rnix supports multiple LLM providers through declarative configuration and exposes them as an OpenAI-compatible HTTP API gateway.

---

## Multi-Provider Configuration

### rnix-providers.yaml

Define LLM providers declaratively. The daemon parses this at startup and registers each as a VFS device at `/dev/llm/<name>`.

```yaml
default_provider: claude

providers:
  claude:
    driver: cli
    command: "claude"
    args: ["-p"]
    default_model: "sonnet"

  cursor:
    driver: cli
    command: "agent"
    args: ["--print"]
    default_model: "claude-3.5-sonnet"

  ollama:
    driver: http
    base_url: "http://localhost:11434/v1"
    default_model: "llama3"

  groq:
    driver: http
    base_url: "https://api.groq.com/openai/v1"
    api_key_env: "GROQ_API_KEY"
    default_model: "llama-3.3-70b"

  deepseek:
    driver: http
    base_url: "https://api.deepseek.com/v1"
    api_key_env: "DEEPSEEK_API_KEY"
    default_model: "deepseek-chat"
```

### Driver Types

| Driver | How It Works | Examples |
|--------|-------------|----------|
| `cli` | Executes local CLI tool via `exec.CommandContext` | Claude Code CLI, Cursor CLI |
| `http` | Calls OpenAI-compatible HTTP API endpoint | Ollama, Groq, DeepSeek, any OpenAI-compatible server |

### Provider Resolution

When spawning an agent, the provider is resolved:

1. `--provider` CLI flag (highest priority)
2. `agent.yaml` → `models.provider`
3. `rnix-providers.yaml` → `default_provider`
4. Built-in default: `claude`

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

### API Key Management

HTTP providers reference API keys via environment variables — keys are never stored in config files:

```yaml
groq:
  driver: http
  api_key_env: "GROQ_API_KEY"   # Reads $GROQ_API_KEY at runtime
```

---

## LLM Serve Gateway

### Overview

`rnix serve` starts an OpenAI-compatible HTTP server that exposes all registered providers as standard API endpoints. External tools (VS Code extensions, web UIs, other applications) can consume LLM capabilities without understanding Rnix internals.

```bash
$ rnix serve
[serve] starting OpenAI-compatible API server on http://localhost:8080
[serve] registered providers: claude, cursor, ollama, groq
[serve] endpoints: /v1/chat/completions, /v1/models
```

### Endpoints

#### POST /v1/chat/completions

Standard OpenAI Chat Completions API. The `model` parameter routes to the corresponding VFS LLM driver:

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ollama",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

**Model routing:**
- `"ollama"` → `/dev/llm/ollama` → uses provider's `default_model`
- `"groq:llama-3.3-70b"` → `/dev/llm/groq` with specific model
- `"claude"` → `/dev/llm/claude`

**Streaming** — set `"stream": true` for SSE responses:

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "ollama", "messages": [...], "stream": true}'
```

Response format: `data: {"choices":[{"delta":{"content":"..."}}]}\n\n`

#### GET /v1/models

Lists all registered and healthy providers with available models:

```json
{
  "data": [
    {"id": "claude", "object": "model", "owned_by": "anthropic"},
    {"id": "ollama", "object": "model", "owned_by": "local"},
    {"id": "groq", "object": "model", "owned_by": "groq"}
  ]
}
```

### Architecture

The serve gateway **shares the daemon's driver instances** and `rnix-providers.yaml` configuration. Adding or changing a provider only requires editing the config and restarting the daemon.

```
External Tool → HTTP → rnix serve → VFS /dev/llm/* → Provider Driver → LLM
```

---

## Related Documentation

- [Configuration](/guide/configuration) — All configuration files
- [Agents & Skills](/guide/agents-and-skills) — Provider selection in agent manifests
- [Reference Manual](/reference/) — VFS path specification for /dev/llm/*
