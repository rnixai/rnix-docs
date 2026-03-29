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
    command: agent              # CLI 二进制命令名（默认："agent"）

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

### CLI 命令别名

CLI 驱动通过调用二进制命令与 LLM 交互。使用 `command` 字段覆盖默认命令名：

| 驱动 | 默认命令 |
|------|---------|
| `claude-cli` | `claude` |
| `cursor-cli` | `agent` |

```yaml
- name: cursor
  driver: cursor-cli
  command: cursor-agent   # 覆盖默认的 "agent"
```

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

API Key 按以下优先级解析：

1. **项目 `.env` 文件** — 当项目含 `.rnix/` 目录时从项目根目录加载（`.env` → `.env.local` → `.env.{RNIX_ENV}` → `.env.{RNIX_ENV}.local`）
2. **Daemon 进程环境变量** — `os.Getenv` 兜底

这意味着你可以为每个项目单独定义 API Key，而不会污染 daemon 的全局环境。详见[配置指南 > 环境文件](/zh/guide/configuration#环境文件-env)。

### 项目级 Provider 覆盖

项目可以通过在 `.rnix/` 中放置 `providers.yaml` 来覆盖或扩展全局 provider：

```
myproject/.rnix/providers.yaml
```

项目级 provider 与全局 provider **深度合并**——你可以只覆盖特定字段（如 `api_key_env` 或 `default_model`），无需重新定义整个 provider 列表。全局不存在的项目级 provider 会被添加为仅在该项目中可用的新 provider。

---

## LLM Serve 网关

### 概述

`rnix serve` 启动一个 OpenAI 兼容的 HTTP 服务器，将所有已注册的提供商暴露为标准 API 端点。外部工具（VS Code 扩展、Web UI、其他应用）无需了解 Rnix 内部细节即可使用 LLM 能力。

```bash
$ rnix serve --port 8080
[serve] starting OpenAI-compatible API server on http://localhost:8080
[serve] registered providers: claude, cursor, ollama, groq
[serve] endpoints: /v1/chat/completions, /v1/models, /health
```

**命令行标志：**

| 标志 | 默认值 | 说明 |
|------|--------|------|
| `--port` | `8080` | HTTP 监听端口 |

服务器绑定到 `127.0.0.1`（仅本地访问）。请求体大小限制为 **4 MB**。启动时会对所有提供商执行健康检查（每个 3 秒超时）。

### 端点

#### POST /v1/chat/completions

标准 OpenAI Chat Completions API。`model` 参数路由到对应的 VFS LLM 驱动：

**请求体字段：**

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `model` | `string` | 是 | 模型标识符（提供商名或 `provider:model`） |
| `messages` | `array` | 是 | 消息数组（`{role, content}`），至少 1 条 |
| `stream` | `bool` | 否 | 启用 SSE 流式响应 |
| `temperature` | `float64` | 否 | 采样温度 |
| `max_tokens` | `int` | 否 | 最大生成 token 数 |

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "ollama",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

**模型路由：**

| model 值 | 解析方式 |
|----------|---------|
| `"ollama"` | `/dev/llm/ollama` → 使用提供商的 `default_model` |
| `"groq:llama-3.3-70b"` | `/dev/llm/groq` 并指定具体模型 |
| `"llama-3.3-70b"` | 反向查找：找到 `default_model` 匹配的提供商 |
| `"unknown"` | 回退到 `default_provider`，输入视为模型名 |

如果找不到提供商，返回 `404` 并附带可用提供商列表。

**流式响应** — 设置 `"stream": true` 获取 SSE 响应：

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "ollama", "messages": [{"role": "user", "content": "Hello"}], "stream": true}'
```

流式响应以 `data: [DONE]\n\n` 结尾（符合 OpenAI SSE 规范）。

**响应格式（非流式）：**

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

列出所有已注册的提供商及可用模型。不健康的提供商会被排除；未检查的提供商会被包含。设置了 `default_model` 的提供商会生成两个条目：

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

健康检查端点，用于监控和负载均衡：

```json
{"status": "ok", "providers": 4}
```

### 错误响应

所有错误遵循 OpenAI 错误格式：

```json
{
  "error": {
    "message": "Provider 'xyz' not found. Available providers: claude, cursor",
    "type": "invalid_request_error",
    "code": "model_not_found"
  }
}
```

| HTTP 状态码 | 错误码 | 场景 |
|------------|--------|------|
| `400` | `invalid_request` | JSON 无效、缺少 `model` 或 `messages` |
| `404` | `model_not_found` | 提供商不存在 |
| `502` | `upstream_error` | LLM 驱动返回错误或空响应 |
| `504` | `timeout` | LLM 请求超时 |

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
