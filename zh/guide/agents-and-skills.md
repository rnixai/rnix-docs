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
  provider: deepseek        # deepseek, claude, cursor, ollama, groq 等
  preferred: deepseek-v4-flash
  fallback: deepseek-v4-pro
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
| `project_doc` | bool | 是否将项目根 `AGENTS.md` 注入系统提示词：`true`（默认）或 `false` 禁用 |
| `models.provider` | string | LLM 提供商名称 |
| `models.preferred` | string | 首选模型 |
| `models.fallback` | string | 备选模型/提供商 |
| `context_budget` | int | 最大 token 预算（0 = 不限制） |
| `skills` | []string | Skill 引用列表 |
| `mcp.servers` | map | MCP 服务器依赖 |

### instructions.md

纯 Markdown 文件，包含 Agent 的角色定义，作为 LLM 系统提示词的一部分注入。

### AGENTS.md 注入

Spawn 时，Rnix 还会读取最近的项目根 `AGENTS.md`，作为系统提示词的 `project_doc` cached section 注入，位置在 **`agent_instructions` 之后、`memory` 之前**。这对齐了跨工具的 AGENTS.md 约定。

- **nearest-wins 查找** —— 从工作目录向上遍历，以项目根为边界（绝不越出项目）。
- **只认 `AGENTS.md`** —— 绝不回退读 `CLAUDE.md`。
- **64 KiB 上限** —— 超出的文件按 UTF-8 边界安全截断并附尾部标记。
- **eager 冻结快照** —— spawn 时读盘一次，`specialize`（会失效并重建 prompt）也不重读，以保护 prompt 缓存命中率。
- **可禁用** —— 在 `agent.yaml` 中设 `project_doc: false`（默认开启）。无 agent 的直接 spawn 默认开启。
- **优雅降级** —— 无 `AGENTS.md`、读取失败或进程无项目上下文时该段为空；spawn 正常完成，不报错。

注入的正文可在 `process-meta.json` 的 `system_prompt` 字段中以 `# Project Instructions (AGENTS.md)` 块的形式看到。实现见 `kernel/sections.go` 和 `internal/config/agentsmd.go`；完整行为规范见 [docs/agents-md-injection.md](https://github.com/rnixai/rnix/blob/main/docs/agents-md-injection.md)。

---

## Skill 定义

Skill 遵循 [agentskills.io](https://agentskills.io/) 标准 —— YAML frontmatter + Markdown 正文，存放在 `SKILL.md` 中。Rnix 通过 `ResolveSkillScopes` 以四路径模型（项目/用户 × native/agents）解析 Skill：

| 优先级 | 路径 | 范围 | 命名空间 |
|--------|------|------|----------|
| 1（最高） | `<project>/.rnix/skills/<name>/SKILL.md` | project | native |
| 2 | `<project>/.agents/skills/<name>/SKILL.md` | project | agents |
| 3 | `~/.config/rnix/skills/<name>/SKILL.md` | user | native |
| 4（最低） | `~/.agents/skills/<name>/SKILL.md` | user | agents |

解析规则：`project > user`（跨范围），`native > agents`（同范围）。优先级最高的副本**完全替换**所有被遮蔽的副本 —— 不做字段合并。被遮蔽的副本会触发 stderr 警告，但不会出现在 `skill list` 中。

运行时加载使用 `SkillLoader`，它通过 `ResolveSkillScopes(cwd)` 按优先级顺序遍历这些路径。仅返回实际存在的目录；不存在的路径会被静默跳过。

```markdown
---
name: code-analysis
description: >
  Analyze code quality, identify bugs, performance issues
  and security vulnerabilities.
allowed-tools: Read Write Edit Glob Grep Bash
metadata:
  author: rnix
  version: "1.0"
synergy:
  - with: security-scan
    instruction: |
      When combined with security-scan, correlate code quality
      issues with security implications.
---

# Code Analysis

## When to Use
Use this skill when asked to review, analyze, or audit code.

## Workflow
1. 用 Read / Glob / Grep 读取源文件
2. 用 Bash 运行分析工具
3. 生成结构化报告
```

| Frontmatter 字段 | 类型 | 说明 |
|-------------------|------|------|
| `name` | string | 唯一标识符 |
| `description` | string | 简短描述（约 100 tokens） |
| `allowed-tools` | string | 空格分隔的语义工具名（Claude Code 规范形态，如 `Read Write Bash`） |
| `metadata` | map | 任意键值对 |
| `synergy` | map | Skill 组合的协同声明 |

### allowed-tools（权限模型）

`allowed-tools` 字段是核心安全边界。自 Epic 54 / Decision 45 起，它列出的是**语义工具名**（PascalCase，Claude Code 规范形态），而非 VFS 设备路径。enforcement 为**工具级**：Agent 只能调用其加载的所有 Skill 中列出的工具，且授权按工具粒度（例如 `Read` 不放行 `Write`）。该机制由 `kernel/process.go` 的 `proc.AllowedTools` 实现。

```
Agent 加载: [code-analysis, security-scan]
  code-analysis: Read Grep Bash
  security-scan: Read
  → AllowedTools = [Read, Grep, Bash]（取并集）
```

`allowed-tools` 为空表示无限制（可访问所有工具）。

::: tip 向后兼容
旧的设备路径写法（`/dev/fs /dev/shell`）仍被接受并对老 Skill 做归一化，但新 Skill 应使用语义工具名。
:::

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
│  Read Grep         Read              │
│  Bash              Write             │
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

从社区 Registry 安装、搜索、更新和列出 Skill，支持多范围管理：

```bash
# 安装：writeScope 由 (global, shared) 标志组合决定
$ rnix skill install code-analysis          # project/native（项目 .rnix/ 目录中）
$ rnix skill install code-analysis -g       # user/native（~/.config/rnix/skills/）
$ rnix skill install code-analysis --shared # agents 命名空间（.agents/skills/）

# 列表：四路径去重视图
$ rnix skill list              # 所有范围（6 列表格）
$ rnix skill list -p           # 仅项目范围
$ rnix skill list -g           # 仅用户范围
$ rnix skill list --json       # JSON 格式，含 diagnostics 节点
$ rnix skill list --quiet      # 仅名称，每行一个

# 更新：写回到原始范围
$ rnix skill update code-analysis    # 单个 Skill（原始范围）
$ rnix skill update                  # 所有范围的全部社区 Skill

# 搜索：仅查询远程 Registry
$ rnix skill search "security"       # 按关键字搜索
```

关键行为：
- `-g` 和 `-p` 在 `skill list` 中**互斥**
- 更新保留 Skill 的原始范围（不会跨范围迁移）
- 被遮蔽的 Skill 仅以 stderr 警告形式出现，不会出现在 `skill list` 中
- 内置 Skill（Rnix 自带）不参与批量 `skill update`
- `skill search` 仅查询远程 Registry——不进行本地四路径扫描

详见 [Skill 包管理](/zh/guide/skill-packages) 获取完整参考：祖先目录遍历、信任检查、宽松校验、跨工具兼容性和 JSON 诊断。

---

## 相关文档

- [Skill 包管理](/zh/guide/skill-packages) — 安装/搜索/更新
- [Token 经济](/zh/guide/token-economy) — 声誉与协同
- [自主智能体](/zh/guide/autonomous-agents) — 统一推理与干细胞模式
- [MCP 集成](/zh/guide/mcp-integration) — MCP 服务器配置
- [参考手册](/zh/reference/) — 完整的 agent.yaml 和 SKILL.md 字段参考
