# Agent 与 Skill

Agent 定义"我是谁"（身份、模型偏好），Skill 定义"如何做 X"（程序性知识、工具权限）。这种分离使智能体能力可复用、可组合。

---

## Agent 定义

每个 Agent 存放在 `agents/<name>/` 目录中（全局：`~/.config/rnix/agents/`，项目：`.rnix/agents/`），包含两个文件：

```
agents/code-analyst/
├── agent.yaml        # 身份、模型偏好、Skill 引用
└── instructions.md   # 角色定义（系统提示词）
```

### agent.yaml

```yaml
name: code-analyst
description: "Code quality analysis agent"
planning: true              # true（默认）或 false
models:
  provider: claude          # claude, cursor, ollama, groq 等
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

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 唯一标识符 |
| `description` | string | 人类可读的描述 |
| `planning` | bool | Planning 能力：`true`（默认）或 `false` |
| `models.provider` | string | LLM 提供商名称 |
| `models.preferred` | string | 首选模型 |
| `models.fallback` | string | 备选模型/提供商 |
| `context_budget` | int | 最大 token 预算（0 = 不限制） |
| `skills` | []string | Skill 引用列表 |
| `mcp.servers` | map | MCP 服务器依赖 |

### instructions.md

纯 Markdown 文件，包含 Agent 的角色定义，作为 LLM 系统提示词的一部分注入。

---

## Skill 定义

每个 Skill 存放在 `skills/<name>/SKILL.md`（全局：`~/.config/rnix/skills/`，项目：`.rnix/skills/`），采用 YAML frontmatter + Markdown 正文格式：

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
synergy:
  security-scan:
    description: "Enables deep security-aware code review"
    instructions: |
      When combined with security-scan, correlate code quality
      issues with security implications.
---

# Code Analysis

## When to Use
Use this skill when asked to review, analyze, or audit code.

## Workflow
1. Read source files via /dev/fs
2. Run analysis tools via /dev/shell
3. Generate structured report
```

| Frontmatter 字段 | 类型 | 说明 |
|-------------------|------|------|
| `name` | string | 唯一标识符 |
| `description` | string | 简短描述（约 100 tokens） |
| `allowed-tools` | string | 空格分隔的 VFS 设备路径 |
| `metadata` | map | 任意键值对 |
| `synergy` | map | Skill 组合的协同声明 |

### allowed-tools（权限模型）

`allowed-tools` 字段是核心安全边界。Agent 只能访问其加载的所有 Skill 中列出的 VFS 设备：

```
Agent 加载: [code-analysis, security-scan]
  code-analysis: /dev/fs /dev/shell
  security-scan: /dev/fs
  → AllowedDevices = [/dev/fs, /dev/shell]（取并集）
```

`allowed-tools` 为空表示无限制（可访问所有设备）。

---

## 四层能力模型

```
┌──────────────────────────────────────┐
│      Process（运行时实例）              │
│  PID, State, FDTable, DebugChan      │
├──────────────────────────────────────┤
│         Agent（我是谁）                │
│  name, models, context_budget        │
│  instructions.md → 系统提示词         │
├──────────────────────────────────────┤
│     Skill A          Skill B         │
│  allowed-tools:    allowed-tools:    │
│  /dev/fs           /dev/fs           │
│  /dev/shell        /dev/shell        │
├──────────────────────────────────────┤
│      VFS 设备层                       │
│  /dev/fs  /dev/shell  /dev/llm/...   │
│  /mnt/mcp/*  /proc/*                 │
└──────────────────────────────────────┘
```

### 渐进式加载

Skill 采用两阶段加载以提高效率：

| 阶段 | 方法 | Tokens | 加载内容 |
|------|------|--------|---------|
| 发现 | `LoadMetadata` | ~100 | 仅名称、描述和权限 |
| 激活 | `LoadFull` | < 5000 | 完整 frontmatter + Markdown 正文 |

---

## Skill 包管理

从社区 Registry 安装、搜索和更新 Skill：

```bash
$ rnix skill install code-analysis    # 从 Registry 安装
$ rnix skill search "security"        # 搜索可用 Skill
$ rnix skill update code-analysis     # 更新到最新版本
$ rnix skill list                     # 列出已安装的 Skill
```

详见 [Skill 包管理](/zh/guide/skill-packages)。

---

## 相关文档

- [Skill 包管理](/zh/guide/skill-packages) — 安装/搜索/更新
- [Token 经济](/zh/guide/token-economy) — 声誉与协同
- [自主智能体](/zh/guide/autonomous-agents) — 统一推理与干细胞模式
- [MCP 集成](/zh/guide/mcp-integration) — MCP 服务器配置
- [参考手册](/zh/reference/) — 完整的 agent.yaml 和 SKILL.md 字段参考
