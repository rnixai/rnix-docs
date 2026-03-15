# LLM 提供商与 Serve 网关

Rnix 通过声明式配置支持多个 LLM 提供商，并将它们作为 OpenAI 兼容的 HTTP API 网关对外暴露。

---

## 多提供商配置

### providers.yaml

在 `~/.config/rnix/providers.yaml`（全局）或 `.rnix/providers.yaml`（项目覆盖）中声明式定义 LLM 提供商。daemon 在启动时解析该文件，将每个提供商注册为 VFS 设备 `/dev/llm/<name>`。

```yaml
version: "1"
default_provider: claude

providers:
  - name: claude
    driver: claude-cli
    default_model: haiku

  - name: cursor
    driver: cursor-cli

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
```

### 驱动类型

| 驱动 | 工作方式 | 示例 |
|------|---------|------|
| `claude-cli` | 调用 Claude Code CLI（`claude -p`） | Anthropic Claude |
| `cursor-cli` | 调用 Cursor CLI（`agent --print`） | Cursor |
| `openai-compat` | 调用 OpenAI 兼容的 HTTP API 端点 | Ollama、Groq、DeepSeek 及任何 OpenAI 兼容服务 |

### 提供商解析

Spawn 智能体时，提供商按以下优先级解析：

1. `--provider` CLI flag（最高优先级）
2. `agent.yaml` → `models.provider`
3. `providers.yaml` → `default_provider`
4. 内置默认值：`claude`

### 提供商降级

当首选提供商失败（HTTP 5xx、连接超时、认证失败）时，系统自动尝试备选提供商：

```yaml
# agent.yaml
models:
  provider: groq          # 主提供商
  preferred: llama-3.3-70b
  fallback: ollama         # 备选提供商
```

### 健康检查

```bash
$ rnix providers status
Provider     Driver  Status    Model              Latency
claude       cli     healthy   sonnet             -
cursor       cli     healthy   claude-3.5-sonnet  -
ollama       http    healthy   llama3             45ms
groq         http    healthy   llama-3.3-70b      120ms
deepseek     http    offline   deepseek-chat      timeout
```

### API Key 管理

HTTP 提供商通过环境变量引用 API Key——密钥不会存储在配置文件中：

```yaml
- name: groq
  driver: openai-compat
  api_key_env: GROQ_API_KEY   # 运行时读取 $GROQ_API_KEY
```

---

## LLM Serve 网关

### 概述

`rnix serve` 启动一个 OpenAI 兼容的 HTTP 服务器，将所有已注册的提供商暴露为标准 API 端点。外部工具（VS Code 扩展、Web UI、其他应用）无需了解 Rnix 内部细节即可使用 LLM 能力。

```bash
$ rnix serve
[serve] starting OpenAI-compatible API server on http://localhost:8080
[serve] registered providers: claude, cursor, ollama, groq
[serve] endpoints: /v1/chat/completions, /v1/models
```

### 端点

#### POST /v1/chat/completions

标准 OpenAI Chat Completions API。`model` 参数路由到对应的 VFS LLM 驱动：

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ollama",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

**模型路由：**
- `"ollama"` → `/dev/llm/ollama` → 使用提供商的 `default_model`
- `"groq:llama-3.3-70b"` → `/dev/llm/groq` 指定具体模型
- `"claude"` → `/dev/llm/claude`

**流式响应** — 设置 `"stream": true` 获取 SSE 响应：

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "ollama", "messages": [...], "stream": true}'
```

响应格式：`data: {"choices":[{"delta":{"content":"..."}}]}\n\n`

#### GET /v1/models

列出所有已注册且健康的提供商及可用模型：

```json
{
  "data": [
    {"id": "claude", "object": "model", "owned_by": "anthropic"},
    {"id": "ollama", "object": "model", "owned_by": "local"},
    {"id": "groq", "object": "model", "owned_by": "groq"}
  ]
}
```

### 架构

Serve 网关**共享 daemon 的驱动实例**和 `providers.yaml` 配置。添加或修改提供商只需编辑配置文件并重启 daemon。

```
外部工具 → HTTP → rnix serve → VFS /dev/llm/* → 提供商驱动 → LLM
```

---

## 相关文档

- [配置](/zh/guide/configuration) — 所有配置文件
- [Agent 与 Skill](/zh/guide/agents-and-skills) — Agent 配置中的提供商选择
- [参考手册](/zh/reference/) — /dev/llm/* 的 VFS 路径规范
