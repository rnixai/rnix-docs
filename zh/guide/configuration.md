# 配置指南

Rnix 使用多个 YAML 配置文件来控制 LLM 提供商、引导服务、多智能体工作流以及 Agent/Skill 定义。本指南涵盖每个配置文件及其选项。

---

## 概览

| 文件 | 用途 | 位置 |
|------|------|------|
| `rnix-providers.yaml` | LLM 提供商定义 | 项目根目录 |
| `rnix-init.yaml` | 引导服务和 Supervisor 树 | 项目根目录 |
| `rnix-compose.yaml` | 多智能体工作流 DAG | 项目根目录 |
| `lib/agents/*/agent.yaml` | Agent 清单 | `lib/agents/` |
| `lib/skills/*/SKILL.md` | Skill 定义 | `lib/skills/` |

---

## rnix-providers.yaml — LLM 提供商

此文件定义可用的 LLM 提供商。Rnix 内置支持 Claude Code CLI 和 Cursor CLI，你也可以在此配置额外的提供商。

```yaml
default_provider: claude

providers:
  claude:
    driver: claude-cli
    model: sonnet
    # 使用 Claude Code CLI (claude -p)
    # 前置条件: npm install -g @anthropic-ai/claude-code

  cursor:
    driver: cursor-cli
    model: gpt-4
    # 使用 Cursor CLI (agent --print)
    # 前置条件: 设置 CURSOR_API_KEY 环境变量
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `default_provider` | `string` | 未指定时使用的默认提供商（默认：`claude`） |
| `providers.<name>.driver` | `string` | 驱动类型：`claude-cli` 或 `cursor-cli` |
| `providers.<name>.model` | `string` | 默认模型名称 |
| `providers.<name>.base_url` | `string` | API 基础 URL（自定义端点） |
| `providers.<name>.api_key` | `string` | API 密钥（建议使用环境变量） |

### 提供商解析优先级

Spawn 智能体时，LLM 提供商按以下优先级解析：

1. `--provider` CLI flag（最高优先级）
2. `agent.yaml` → `models.provider` 字段
3. `rnix-providers.yaml` → `default_provider`
4. 内置默认值：`claude`

### 模型解析优先级

1. `--model` CLI flag
2. `agent.yaml` → `models.preferred` 字段
3. 提供商默认模型
4. 驱动内置默认值

---

## rnix-init.yaml — 引导服务

此文件定义 daemon 启动时自动运行的服务，支持 Supervisor 树实现容错管理。

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

## rnix-compose.yaml — 多智能体工作流

Compose 文件定义基于 DAG 的多智能体工作流。引擎自动解析依赖、并行调度，并在智能体间传递结果。

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

详细字段说明请参阅 [参考手册](/reference/)。

## Skill 定义 — SKILL.md

详细字段说明请参阅 [参考手册](/reference/)。

---

## 环境变量

| 变量 | 说明 |
|------|------|
| `RNIX_ASCII` | 设为 `1` 强制 ASCII 模式（禁用 Unicode） |
| `RNIX_LOG_DIR` | monitor.sh 日志目录 |
| `CURSOR_API_KEY` | Cursor CLI 提供商 API 密钥 |
| `XDG_RUNTIME_DIR` | 用于确定 socket 路径 |

## Socket 路径

Daemon socket 位置优先级：

1. `$XDG_RUNTIME_DIR/rnix/rnix.sock`（如 `/run/user/1000/rnix/rnix.sock`）
2. `/tmp/rnix-{uid}/rnix.sock`（备选）

目录权限：`0700`（仅当前用户）。

---

## 相关文档

- [快速上手](/guide/quick-start) — 安装和首次运行
- [核心概念](/guide/concepts) — 进程、VFS、Agent/Skill 模型
- [参考手册](/reference/) — 完整 API 和 CLI 参考
