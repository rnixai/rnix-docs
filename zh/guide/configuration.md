# 配置指南

Rnix 使用双层配置系统，通过 YAML 配置文件、Agent 定义和 Skill 定义来控制行为。运行 `rnix init` 可初始化配置环境。

---

## 双层配置体系

Rnix 遵循 **全局 + 项目** 配置模型：

| 层级 | 位置 | 用途 |
|------|------|------|
| **全局层** | `~/.config/rnix/`（或 `$XDG_CONFIG_HOME/rnix/`） | 用户级默认配置、共享的 agent 和 skill |
| **项目层** | `<project>/.rnix/` | 项目级覆盖和定义 |

### 目录结构

```
~/.config/rnix/              ← 全局（由 rnix init 创建）
├── providers.yaml           ← LLM 提供商定义
├── config.yaml              ← 全局配置
├── agents/                  ← 全局 Agent 定义
│   └── code-analyst/
│       ├── agent.yaml
│       └── instructions.md
└── skills/                  ← 全局 Skill 定义
    └── code-analysis/
        └── SKILL.md

<project>/.rnix/             ← 项目（由 rnix init 在项目目录创建）
├── providers.yaml           ← 项目级提供商覆盖（可选）
├── config.yaml              ← 项目级配置（可选）
├── agents/                  ← 项目专属 Agent
├── skills/                  ← 项目专属 Skill
└── data/                    ← 运行时数据（records、traces）
```

### 合并规则

- **YAML 配置文件**（`providers.yaml`、`config.yaml`）：递归 deep merge，项目级覆盖全局级
- **资源目录**（`agents/`、`skills/`）：Shadow 遮蔽，项目级同名定义完全遮蔽全局级

### 初始化

```bash
# 同时创建全局 (~/.config/rnix/) 和项目 (.rnix/) 目录
$ rnix init
[init] created ~/.config/rnix/
[init] created .rnix/
```

`rnix init` 是幂等操作——跳过已存在的文件和目录。

---

## providers.yaml — LLM 提供商

此文件定义可用的 LLM 提供商。位于 `~/.config/rnix/providers.yaml`（全局）和可选的 `.rnix/providers.yaml`（项目覆盖）。

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

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | `string` | 配置格式版本（`"1"`） |
| `default_provider` | `string` | 未指定时使用的默认提供商（默认：`claude`） |
| `providers[].name` | `string` | 提供商名称，映射到 `/dev/llm/<name>` |
| `providers[].driver` | `string` | 驱动类型：`claude-cli`、`cursor-cli` 或 `openai-compat` |
| `providers[].command` | `string` | CLI 驱动的二进制命令名覆盖（如 `agent`、`claude`、`/usr/local/bin/claude`） |
| `providers[].default_model` | `string` | 默认模型名称 |
| `providers[].base_url` | `string` | API 基础 URL（用于 `openai-compat` 驱动） |
| `providers[].api_key_env` | `string` | API 密钥的环境变量名 |

### 驱动类型

| 驱动 | 工作方式 | 示例 |
|------|---------|------|
| `claude-cli` | 调用 Claude Code CLI（`claude -p`） | Anthropic Claude |
| `cursor-cli` | 调用 Cursor CLI（`agent --print`） | Cursor |
| `openai-compat` | 调用 OpenAI 兼容 HTTP API 端点 | Ollama、Groq、DeepSeek、任何 OpenAI 兼容服务 |

### CLI 命令别名

CLI 驱动（`claude-cli`、`cursor-cli`）通过调用二进制命令与 LLM 交互。默认命令名如下：

| 驱动 | 默认命令 |
|------|---------|
| `claude-cli` | `claude` |
| `cursor-cli` | `agent` |

使用 `command` 字段覆盖二进制命令名——适用于 CLI 安装在非标准路径或使用不同名称的情况：

```yaml
providers:
  - name: cursor
    driver: cursor-cli
    command: cursor-agent        # 覆盖默认的 "agent"

  - name: claude
    driver: claude-cli
    command: /usr/local/bin/claude   # 完整路径覆盖
```

### 提供商解析优先级

Spawn 智能体时，LLM 提供商按以下优先级解析：

1. `--provider` CLI flag（最高优先级）
2. `agent.yaml` → `models.provider` 字段
3. `providers.yaml` → `default_provider`
4. 内置默认值：`claude`

### 模型解析优先级

1. `--model` CLI flag
2. `agent.yaml` → `models.preferred` 字段
3. 提供商的 `default_model`
4. 驱动内置默认值

### API 密钥管理

API 密钥通过环境变量引用——不直接存储在配置文件中：

```yaml
- name: groq
  driver: openai-compat
  api_key_env: GROQ_API_KEY   # 运行时读取 $GROQ_API_KEY
```

API 密钥按以下优先级解析：

1. **项目 `.env` 文件**（当项目含 `.rnix/` 目录时）
2. **Daemon 进程环境变量**（`os.Getenv` 兜底）

详见下方[环境文件 (.env)](#环境文件-env) 章节。

---

## 环境文件 (.env)

Rnix 支持项目级 `.env` 文件，用于管理 API 密钥和其他环境变量，不会污染 daemon 的进程环境。

### 加载顺序

当 spawn 请求指定项目目录（含 `.rnix/`）时，daemon 按以下顺序从项目根目录加载 `.env` 文件（后者覆盖前者）：

1. `.env` — 基础环境
2. `.env.local` — 本地覆盖（建议加入 .gitignore）
3. `.env.{RNIX_ENV}` — 环境特定（如 `.env.production`）
4. `.env.{RNIX_ENV}.local` — 环境特定的本地覆盖

### RNIX_ENV

`RNIX_ENV` 环境变量选择要加载的环境特定文件。默认值：`development`。

```bash
# 使用生产环境
RNIX_ENV=production rnix "部署服务"

# 默认（development）
rnix "分析代码质量"
```

合法值：字母、数字、连字符、下划线（`^[a-zA-Z0-9_-]+$`）。

### 语法

```bash
# 键=值（无引号）
API_KEY=sk-xxx

# 双引号（支持 \n、\t、\\、\" 转义）
PROMPT="Hello\nWorld"

# 单引号（字面值，不转义）
REGEX='foo\.bar'

# 空值
EMPTY_VAR=

# 注释
# 这是注释
API_KEY=value  # 行内注释

# 可选 export 前缀
export DATABASE_URL=postgres://localhost/mydb
```

### 项目间隔离

每次 spawn 请求都会从 `.env` 文件生成独立的环境快照。变量**不会**写入 `os.Setenv`——不同项目的环境完全隔离，即使共享同一个 daemon。

### 示例

```
myproject/
├── .rnix/
│   └── providers.yaml    ← 项目级 provider 覆盖
├── .env                   ← API_KEY=dev-key
├── .env.local             ← API_KEY=my-local-key（已 gitignore）
├── .env.production        ← API_KEY=prod-key
└── .gitignore             ← *.local, .env.local
```

---

## init.yaml — 引导服务

此文件定义 daemon 启动时自动运行的服务，支持 Supervisor 树实现容错管理。位于 `~/.config/rnix/init.yaml` 或 `.rnix/init.yaml`。

```yaml
version: "1.0"

services:
  health-monitor:
    intent: "监控系统健康状态并报告异常"
    agent: "monitor"
    restart: always
    max_restarts: 3

  code-watcher:
    intent: "监听文件变更并触发分析"
    agent: "watcher"
    restart: on-failure
    depends_on:
      - health-monitor
```

### 服务字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `intent` | `string` | 必需 | 服务智能体的意图字符串 |
| `agent` | `string` | `""` | 命名 Agent 定义（空 = 通用） |
| `restart` | `string` | `"no"` | 重启策略：`no`、`always`、`on-failure` |
| `max_restarts` | `int` | `3` | 最大重启次数 |
| `depends_on` | `[]string` | `[]` | 必须先启动的服务 |

### 重启策略

| 策略 | 行为 |
|------|------|
| `no` | 不重启（默认） |
| `always` | 任何退出均重启 |
| `on-failure` | 仅非零退出码时重启 |

---

## compose.yaml — 多智能体工作流

Compose 文件定义基于 DAG 的多智能体工作流。位于 `.rnix/compose.yaml` 或项目根目录。

```yaml
version: "1.0"
intent: "代码审查工作流"
model: "haiku"

agents:
  analyzer:
    intent: "分析 kernel/kernel.go 的代码质量"
    agent: "code-analyst"

  doc-gen:
    intent: "基于分析结果生成改进文档"
    depends_on:
      analyzer: completed

  checker:
    intent: "检查分析和文档的质量"
    depends_on:
      doc-gen: completed
```

### 顶层字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | `string` | Compose 规范版本（当前 `"1.0"`） |
| `intent` | `string` | 工作流整体描述 |
| `model` | `string` | 全局默认模型（各 Agent 可覆盖） |
| `agents` | `map` | Agent 定义映射 |

### Agent 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `intent` | `string` | 该 Agent 的任务描述 |
| `agent` | `string` | 命名 Agent 定义（可选） |
| `model` | `string` | 模型覆盖 |
| `provider` | `string` | 提供商覆盖 |
| `depends_on` | `map` | 依赖关系：`<上游>: completed` |
| `timeout` | `duration` | 执行超时 |
| `max_retries` | `int` | 失败重试次数 |

---

## Agent 清单 — agent.yaml

每个 Agent 由 `agent.yaml` 和 `instructions.md` 定义，位于 `agents/<name>/`（全局：`~/.config/rnix/agents/`，项目：`.rnix/agents/`）。

```yaml
name: code-analyst
description: "代码质量分析智能体"
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

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | 是 | 唯一 Agent 标识符 |
| `description` | `string` | 否 | 人类可读描述 |
| `models` | `object` | 否 | LLM 模型偏好 |
| `models.provider` | `string` | 否 | LLM 提供商名称 |
| `models.preferred` | `string` | 否 | 首选模型名称 |
| `models.fallback` | `string` | 否 | 备选模型名称 |
| `context_budget` | `int` | 否 | 最大 token 预算（0 = 不限制） |
| `max_steps` | `int` | 否 | 最大推理步骤数（0 = 默认 10） |
| `max_tokens` | `int` | 否 | 最大总 token 数（0 = 不限制） |
| `skills` | `[]string` | 否 | 引用的 Skill 名称列表 |
| `mcp` | `object` | 否 | MCP 服务器配置 |

## Skill 定义 — SKILL.md

详细字段说明请参阅 [参考手册](/reference/)。

---

## 环境变量

| 变量 | 说明 |
|------|------|
| `RNIX_ENV` | 选择 `.env` 文件加载的环境（默认：`development`） |
| `RNIX_ASCII` | 设为 `1` 强制 ASCII 模式（禁用 Unicode） |
| `XDG_CONFIG_HOME` | 覆盖全局配置目录（默认：`~/.config`） |
| `XDG_RUNTIME_DIR` | 用于确定 socket 路径 |

## Socket 路径

Daemon socket 位置优先级：

1. `$XDG_RUNTIME_DIR/rnix/rnix.sock`（如 `/run/user/1000/rnix/rnix.sock`）
2. `/tmp/rnix-{uid}/rnix.sock`（备选）

目录权限：`0700`（仅当前用户）。

---

## 相关文档

- [快速上手](/zh/guide/quick-start) — 安装和首次运行
- [LLM 提供商](/zh/guide/llm-providers) — 提供商详情和 Serve Gateway
- [核心概念](/zh/guide/concepts) — 进程、VFS、Agent/Skill 模型
- [参考手册](/zh/reference/) — 完整 API 和 CLI 参考
