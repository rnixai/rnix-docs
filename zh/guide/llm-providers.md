# LLM 提供商与 Serve 网关

Rnix 通过声明式配置支持多个 LLM 提供商，并将它们作为 OpenAI 兼容的 HTTP API 网关对外暴露。

---

## 多提供商配置

### providers.yaml

在 `~/.config/rnix/providers.yaml`（全局）或 `.rnix/providers.yaml`（项目覆盖）中声明式定义 LLM 提供商。daemon 在启动时解析该文件，将每个提供商注册为 VFS 设备 `/dev/llm/<name>`。

```yaml
version: "1"
default_provider: deepseek

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

### 驱动类型

| 驱动 | 工作方式 | 示例 |
|------|---------|------|
| `claude-cli` | 调用 Claude Code CLI（`claude -p`） | Anthropic Claude |
| `cursor-cli` | 调用 Cursor CLI（`agent --print`） | Cursor |
| `openai-compat` | 调用 OpenAI 兼容的 HTTP API 端点 | Ollama、Groq、DeepSeek 及任何 OpenAI 兼容服务 |
| `qwen-cli` | 调用通义千问 Code CLI（`qwen --chat`） | Qwen Code |
| `openai` | OpenAI 官方 SDK（`github.com/openai/openai-go/v3`） | OpenAI GPT-4、GPT-4o |
| `gemini` | 原生 Gemini API（`google.golang.org/genai`） | Google Gemini |
| `anthropic` | Anthropic 官方 SDK（`anthropic-sdk-go`） | Claude（通过 API，非 CLI） |

### CLI 命令别名

CLI 驱动通过调用二进制命令与 LLM 交互。使用 `command` 字段覆盖默认命令名：

| 驱动 | 默认命令 |
|------|---------|
| `claude-cli` | `claude` |
| `cursor-cli` | `agent` |
| `qwen-cli` | `qwen` |

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
4. 内置默认值：`deepseek`

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

### 高级提供商选项

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `mode` | `string` | `"stream"` | 响应模式：`"stream"` 为 SSE 流式，`"call"` 为单次响应 |
| `max_tokens` | `int` | `0` | 每次 LLM 调用的最大输出 token 数；`0` 使用 API 默认值 |
| `cost_per_token` | `float64` | `0` | 每 token 成本（美元），用于预算追踪；`0` 禁用成本追踪 |
| `thinking_budget` | `int` | `0` | 思考预算 token 数（`gemini`、`anthropic` 和 `openai-compat` 驱动）；`0` 禁用 |
| `extra_args` | `string[]` | `[]` | 传递给 CLI 的额外参数（仅 `claude-cli`、`cursor-cli`、`qwen-cli`） |

**示例** — 带思考预算的 Gemini：

```yaml
- name: gemini-thinking
  driver: gemini
  api_key_env: GOOGLE_API_KEY
  default_model: gemini-2.5-pro
  thinking_budget: 8192
```

**示例** — DeepSeek V4 扩展推理：

```yaml
- name: deepseek-think
  driver: openai-compat
  base_url: https://api.deepseek.com/v1
  api_key_env: DEEPSEEK_API_KEY
  default_model: deepseek-reasoner
  thinking_budget: 16384
```

---

## CLI 驱动能力探测

CLI 类驱动（`claude-cli`、`cursor-cli`、`qwen-cli`）通过外部 CLI 工具与 LLM 交互。其中 `claude-cli` 驱动内置了**能力探测**系统，可自动适配不同 CLI 版本。

### 能力探测

首次使用时，Claude CLI 驱动执行 `claude -p --help`（5s 超时）并扫描输出以检测可选标志：

| 能力 | 标志 | 效果 |
|------|------|------|
| `partialMessages` | `--include-partial-messages` | 启用流式 LLM 部分响应 |
| `addDir` | `--add-dir` | 将额外目录打包到 agent 上下文 |
| `permissionMode` | `--permission-mode` | 控制工具执行权限 |

探测每个驱动实例仅执行一次并缓存结果。若探测超时或失败，所有能力默认为 `false`（保守模式）。

### 备选二进制解析

驱动按以下路径搜索 CLI 二进制：

1. `claude`（默认）或 provider 配置中的 `command` 值
2. `openclaude`（备选）
3. 扩展搜索路径：`~/.local/bin`、nvm 最新 node bin、`~/.bun/bin`

### DriverMetaProvider

CLI 驱动实现 `DriverMetaProvider` 接口，暴露运行时元数据用于可观测性：

| 键 | 描述 | 示例 |
|----|------|------|
| `resolved_bin` | 解析后的二进制绝对路径 | `/usr/local/bin/claude` |
| `permission_mode` | 活跃的权限模式 | `bypassPermissions` |
| `cap_partial_messages` | 是否支持流式 | `"true"` / `"false"` |
| `cap_add_dir` | 是否支持目录打包 | `"true"` / `"false"` |
| `cap_permission_mode` | 是否支持权限模式 | `"true"` / `"false"` |

元数据记录在 strace 事件（`claude_cli.resolve`、`claude_cli.capabilities`）中，可在 Dashboard 进程详情中查看。

### Prompt 上下文注入

为节省一次启动往返，当进程带有项目目录或 skill 时，`claude-cli` 驱动会在首条 prompt 前面拼接一段简短的 `# Instructions` 块——让模型无需额外的工具调用即可知道自己身在何处、拥有哪些 skill：

```
# Instructions

Working directory: /path/to/project

Accessible skill bundle: /path/to/project/.claude/skills/code-review, web-research

# User request

<实际的 intent>
```

该 skill bundle 同时通过 `--add-dir`（在具备该能力时）暴露给 CLI 自带的内置工具。若既无项目目录也无 skill，则原样发送 intent，不做修改。

### 权限模式（Permission Mode）

`claude-cli` 驱动在可配置的权限模式下运行，按 provider 在 `providers.yaml` 中设置：

```yaml
providers:
  claude:
    driver: claude-cli
    model: sonnet
    permission_mode: bypassPermissions   # 默认值
```

| 模式 | 行为 |
|------|------|
| `bypassPermissions` | 跳过所有权限确认（daemon 默认值） |
| `acceptEdits` | 自动接受文件编辑；其余操作仍需确认 |
| `plan` | 仅规划——不执行任何实际操作 |
| `default` | 使用 Claude CLI 的原生默认行为 |

**为何 `bypassPermissions` 是 daemon 默认值，且在此安全：** Rnix 进程在 daemon 下运行且无 TTY，因此交互式的 CLI 权限弹窗会*永久阻塞进程*。权限控制改由 CLI 下一层的 Rnix VFS 设备白名单（`allowed_tools`）强制执行。若你安装的 CLI **不**支持 `--permission-mode`，请将 `permission_mode` 留空以省略该标志。

### 故障排查

| 症状 | 可能原因 | 修复 |
|------|----------|------|
| 看不到流式中间消息，输出在完成后一次性返回 | 安装的 CLI 缺少 `--include-partial-messages` | `claude -p --help \| grep include-partial-messages`；通过 `npm update -g @anthropic-ai/claude-code` 更新 |
| 进程在首次 LLM 调用时挂起，daemon 日志无响应 | 不支持 `--permission-mode` → CLI 弹出 daemon 无法应答的 TTY 提示 | 用 `claude -p --help \| grep permission-mode` 确认；若缺失，设 `permission_mode: ""`（省略该标志）或更新 CLI |
| Spawn 失败：`no claude-compatible CLI found in PATH: tried [claude openclaude]` | 二进制不在 PATH 及任何扩展搜索路径中 | 安装（`npm install -g @anthropic-ai/claude-code`）、用 `which claude` 验证，或在 `providers.yaml` 中固定 `command: /full/path/claude` |
| Dashboard 详情面板没有 `Binary:` / `Capabilities:` 行 | 该进程未使用 CLI 驱动（API 驱动不实现 `DriverMetaProvider`） | 预期行为——驱动元数据仅对 `claude-cli` 等 CLI 驱动显示 |

---

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

## 提示词缓存

### Anthropic 原生缓存

使用 `anthropic` 驱动时，Rnix 会自动在三个位置注入 `cache_control` 断点，以最大化跨推理步骤的缓存复用：

1. **系统提示词** — 完整的 Agent 系统提示（指令 + Skills）
2. **工具定义** — 所有已注册的 VFS 设备 Schema
3. **最近用户轮次** — 最新的用户消息

这符合 Anthropic 针对 agentic 工作负载的推荐缓存策略。无需额外配置——只要使用 `anthropic` 驱动且模型支持缓存，缓存就会自动生效。

**缓存命中率语义** — 仪表盘在时间线中展示每步的缓存命中率。`anthropic` 驱动的计算公式为：

```
命中率 = CacheReadInputTokens / (input_tokens + CacheReadInputTokens)
```

`openai-compat` 和 CLI 驱动的计算公式为：

```
命中率 = cached_tokens / input_tokens   （OpenAI 惯例：input 已包含 cached）
```

详见[可视化仪表盘](/zh/guide/dashboard#追踪时间线面板)中的时间线显示。

### 启用 Anthropic 驱动

```yaml
- name: anthropic-api
  driver: anthropic
  api_key_env: ANTHROPIC_API_KEY
  default_model: claude-sonnet-4-20250514
```

在环境变量或项目 `.env` 文件中设置 `ANTHROPIC_API_KEY`。

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
