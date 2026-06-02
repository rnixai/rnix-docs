# 配置指南

Rnix 使用分层配置系统，通过 YAML 配置文件、Agent 定义和 Skill 定义来控制行为。运行 `rnix init` 可初始化配置环境。

---

## 配置模型

Rnix 的配置有三个独立维度：

### 1. 配置文件分层（XDG 风格）

YAML 配置文件（`providers.yaml`、`config.yaml`、`web-search.yaml`）遵循 **全局 + 项目** 双层模型：

| 层级 | 位置 | 用途 |
|------|------|------|
| **全局层** | `~/.config/rnix/`（或 `$XDG_CONFIG_HOME/rnix/`） | 用户级默认配置 |
| **项目层** | `<project>/.rnix/` | 项目级覆盖 |

YAML 文件采用深度合并：项目级值覆盖全局级值。

### 2. Skill 存储（agentskills.io 2×2 模型）

Skill 遵循 [agentskills.io](https://agentskills.io/) 规范的 dual-scope × dual-namespace 模型。Rnix 在每个 scope 下实现了**两个 namespace**：

| | Native Namespace（Rnix） | Agents Namespace（agentskills.io） |
|---|---|---|
| **Project scope** | `<project>/.rnix/skills/` | `<project>/.agents/skills/` |
| **User scope** | `~/.config/rnix/skills/` | `~/.agents/skills/` |

- **Native namespace**（`.rnix/skills/`、`~/.config/rnix/skills/`）：Rnix 专属 skill，同 scope 内优先级最高
- **Agents namespace**（`.agents/skills/`、`~/.agents/skills/`）：遵循 agentskills.io 跨工具标准——置于此处的 skill 对 Cursor、OpenCode、Windsurf 等兼容工具可见

优先级：`project/native > project/agents > user/native > user/agents`。详见 [Skill 包管理](/zh/guide/skill-packages)。

### 3. 数据目录（会话与历史）

运行时产物——推理步骤、检查点、`events.jsonl`、可恢复历史——**不**存放在配置旁边，而是位于单一的全局**数据目录**，按以下顺序解析：

| 优先级 | 来源 | 解析路径 |
|--------|------|----------|
| 1 | `RNIX_DATA_DIR` | 取其原值 |
| 2 | `XDG_DATA_HOME` | `$XDG_DATA_HOME/rnix` |
| 3 | （默认） | `~/.local/share/rnix` |

在数据目录下，每个项目在**项目注册表**中拥有自己的子树，以一个确定性的、可读的 ID 作为键：

```
<data-dir>/
└── projects/
    ├── my-api-3f9a1c2b/         ← <sanitized-basename>-<hash8>
    │   └── steps/
    │       └── <uuid>/          ← events.jsonl、proc-info.json、检查点
    └── another-repo-7c4e0d11/
        └── steps/
```

ID 形如 `<sanitized-basename>-<hash8>`，其中 `hash8` 是 `sha256(项目绝对路径)` 的前 4 字节。哈希可避免两个同名 basename 的项目（例如两个不同的 `api/` 目录）相互冲突，basename 则保持目录可读。如此集中存储，使得 `rnix ps -a`、`rnix record`、`rnix replay`、`rnix resume` 能从单一根目录**跨所有项目**枚举历史，也让下文的**垃圾回收（GC）**能全局地应用 `retention_days` / `max_entries`。

> 旧版本曾将会话数据存放在相对当前目录的 `<project>/.rnix/data/steps/`。该位置已被全局数据目录取代——`.rnix/` 现在仅保存配置、状态和 skill。

### 目录结构

```
~/.config/rnix/                  ← 全局配置（由 rnix init 创建）
├── providers.yaml
├── config.yaml
├── web-search.yaml
├── agents/                      ← 全局 Agent 定义
│   └── code-analyst/
│       ├── agent.yaml
│       └── instructions.md
└── skills/                      ← 用户 skill（native namespace）
    └── code-analysis/
        └── SKILL.md

~/.agents/skills/                ← 用户 skill（agents namespace，agentskills.io 标准）
└── web-research/                ←   与 Cursor、OpenCode 等共享
    └── SKILL.md

<project>/.rnix/                  ← 项目配置（由 rnix init 创建）
├── providers.yaml
├── config.yaml
├── init.yaml
├── compose.yaml
├── web-search.yaml
├── agents/                      ← 项目 Agent 定义
├── skills/                      ← 项目 skill（native namespace）
└── state/                       ← 运行时状态（trust marker 等）
                                 ← （会话数据位于全局数据目录——见"3. 数据目录"）

<project>/.agents/skills/        ← 项目 skill（agents namespace，agentskills.io 标准）
└── shared-util/                 ←   项目内跨工具共享
    └── SKILL.md
```

> **注意**：`~/.agents/skills/` 和 `.agents/skills/` **不**由 `rnix init` 创建，而是在首次使用（`rnix skill install --shared`）时创建。这遵循 agentskills.io 约定——`.agents/` 目录属于生态，不属于单一工具。

### 合并规则

- **YAML 文件**（`providers.yaml`、`config.yaml`、`web-search.yaml`）：深度合并——项目覆盖全局
- **Agent 目录**（`agents/`）：Shadow——同名项目 agent 完全替代全局 agent
- **Skill 目录**（`skills/`）：Shadow，按 2×2 优先级——`project/native > project/agents > user/native > user/agents`。胜出副本完全替代被 shadow 的副本。

### 初始化

```bash
# 同时创建全局（~/.config/rnix/）和项目（.rnix/）目录
$ rnix init
[init] created ~/.config/rnix/
[init] created .rnix/

# 带 MCP 示例配置
$ rnix init --with-mcp-examples
[init] created ~/.config/rnix/
[init] created .rnix/
[init] added agents/playwright-demo/ with MCP Playwright config
[init] added agents/github-assistant/ with MCP GitHub config
```

`rnix init` 是幂等的——已存在的文件和目录会被跳过。`--with-mcp-examples` 会在创建示例配置之前执行预检查，验证所需二进制文件（如 `npx`）是否可用。

---

## config.yaml — 全局配置

位于 `~/.config/rnix/config.yaml`（全局）和可选的 `.rnix/config.yaml`（项目覆盖）。

### 特性档案（Feature Profile）

特性档案控制运行时激活哪些涌现子系统。它们支持**消融实验**——选择性禁用能力，以衡量每一层对整体智能涌现的贡献。

提供四个命名预设和一个 `custom` 模式，用于精细控制：

| 档案 | 描述 |
|------|------|
| `baseline` | 仅基础设施——裸 LLM + VFS 设备。无规划、无子进程、无自适应机制。 |
| `core` | 基础设施 + 核心机制——规划、子进程派生、上下文压缩。 |
| `adaptive` | 核心 + 反馈闭环——运行时学习、技能获取、路径重规划。 |
| `full` | 所有能力启用，包括免疫系统。**默认值。** |
| `custom` | 逐项控制——未显式列出的 flag 默认为 `true`。 |

**配置方式：**

```yaml
# .rnix/config.yaml 或 ~/.config/rnix/config.yaml
features:
  profile: full   # baseline | core | adaptive | full | custom
  custom:         # 仅 profile=custom 时生效
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

**预设矩阵：**

| 特性 | baseline | core | adaptive | full（默认） |
|------|----------|------|----------|--------------|
| `planning` | false | true | true | true |
| `replan` | false | false | true | true |
| `specialize` | false | false | true | true |
| `discover_skill` | false | false | true | true |
| `spawn` | false | true | true | true |
| `diff_memory` | false | false | true | true |
| `stem_matcher` | false | false | true | true |
| `immune` | false | false | false | true |
| `compaction` | false | true | true | true |

**环境变量覆盖：**

设置 `RNIX_FEATURE_PROFILE` 可覆盖配置文件中的设定。有效值：`baseline`、`core`、`adaptive`、`full`、`custom`。无效值会产生警告并回退到 `full`。

```bash
RNIX_FEATURE_PROFILE=baseline rnix "analyze this code"
```

**Custom 模式：**

当 `profile: custom` 时，仅应用 `custom:` 下显式列出的 flag。未列出的 flag 默认为 `true`——custom 模式用于精准消融，而非全面禁用。

**查看当前活跃档案：**

使用 `rnix config show` 显示活跃的特性档案和各项 flag。详见 [CLI 参考](/zh/reference/cli#rnix-config)。

参见[特性档案与消融](/zh/guide/emergence#特性档案与消融)了解档案如何映射到涌现堆栈。

### 垃圾回收（GC）

```yaml
gc:
  retention_days: 30      # 删除 N 天前的 dead_at 条目；0 = 禁用
  max_entries: 500        # 最多保留 N 条历史；0 = 禁用
  interval_seconds: 3600  # 后台扫描周期（最小 60，默认 1h）
```

- `retention_days` 和 `max_entries` 取并集——命中任一即触发清理
- 两者均设为 0 可完全关闭 GC daemon
- Running 和 Suspended 进程永久豁免

CLI 操作：

```bash
rnix gc --dry-run          # 预览候选（表格）
rnix gc --dry-run --json   # 预览候选（JSON，脚本友好）
rnix gc                    # 执行清理；> 100 条会提示 [y/N]
rnix gc --force            # 跳过确认
rnix gc --json             # JSON 输出（隐含 --force）
```

详见 [进程恢复](/zh/guide/process-resume#垃圾回收)。

---

## providers.yaml — LLM 提供商

定义可用的 LLM 提供商。位于 `~/.config/rnix/providers.yaml`（全局）和可选的 `.rnix/providers.yaml`（项目覆盖）。

```yaml
version: "1"
default_provider: deepseek

providers:
  - name: claude
    driver: claude-cli
    default_model: haiku

  - name: cursor
    driver: cursor-cli
    command: agent

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

### 字段

| 字段 | 类型 | 描述 |
|-------|------|------|
| `version` | `string` | 配置格式版本（`"1"`） |
| `default_provider` | `string` | 未指定时的默认提供商（默认：`deepseek`） |
| `providers[].name` | `string` | 提供商名称，映射到 `/dev/llm/<name>` |
| `providers[].driver` | `string` | 驱动类型：`claude-cli`、`cursor-cli` 或 `openai-compat` |
| `providers[].command` | `string` | CLI 驱动器的二进制名称覆盖 |
| `providers[].default_model` | `string` | 默认模型名称 |
| `providers[].base_url` | `string` | API 基础 URL（用于 `openai-compat` 驱动） |
| `providers[].api_key_env` | `string` | API 密钥的环境变量名 |

### 驱动类型

| 驱动 | 工作原理 | 示例 |
|--------|-------------|----------|
| `claude-cli` | 调用 Claude Code CLI（`claude -p`） | Anthropic Claude |
| `cursor-cli` | 调用 Cursor CLI（`agent --print`） | Cursor |
| `openai-compat` | 调用 OpenAI 兼容 HTTP API | Ollama、Groq、DeepSeek 等 |

### API 密钥管理

API 密钥通过环境变量引用——绝不直接存储在配置文件中。优先从项目 `.env` 文件解析，再回退到 daemon 进程环境。

---

## web-search.yaml — Web 搜索后端

配置 `/dev/web` 设备的搜索后端。位于 `~/.config/rnix/web-search.yaml`（全局）或 `.rnix/web-search.yaml`（项目，优先）。

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

项目文件完全覆盖全局文件（不合并）。详见 [Web 搜索](/zh/guide/web-search)。

---

## 环境文件（.env）

Rnix 支持项目级 `.env` 文件，用于管理 API 密钥等环境变量，而不会污染 daemon 的进程环境。

### 加载顺序

1. `.env` — 基础环境
2. `.env.local` — 本地覆盖（应加入 .gitignore）
3. `.env.{RNIX_ENV}` — 环境特定（如 `.env.production`）
4. `.env.{RNIX_ENV}.local` — 环境特定的本地覆盖

### RNIX_ENV

`RNIX_ENV` 环境变量选择要加载的环境文件集。默认：`development`。

### 项目隔离

每次 spawn 请求会从 `.env` 文件生成独立的环境快照。变量**不**写入 `os.Setenv`——不同项目的环境完全隔离，即使共享同一 daemon。

---

## init.yaml — 启动服务

定义 daemon 启动时自动运行的服务。位于 `.rnix/init.yaml`。

```yaml
version: "1.0"

services:
  health-monitor:
    intent: "Monitor system health and report anomalies"
    agent: "monitor"
    restart: always
    max_restarts: 3

  code-watcher:
    intent: "Watch for file changes and trigger analysis"
    agent: "watcher"
    restart: on-failure
    depends_on:
      - health-monitor
```

### 服务字段

| 字段 | 类型 | 默认值 | 描述 |
|-------|------|---------|------|
| `intent` | `string` | 必填 | 服务的 intent 字符串 |
| `agent` | `string` | `""` | 命名的 agent 定义（空 = 通用） |
| `restart` | `string` | `"no"` | 重启策略：`no`、`always`、`on-failure` |
| `max_restarts` | `int` | `3` | 最大重启次数 |
| `depends_on` | `[]string` | `[]` | 必须先启动的服务 |

---

## compose.yaml — 多 Agent 工作流

Compose 文件定义基于 DAG 的多 agent 工作流。位于 `.rnix/compose.yaml`。

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

### 运行 Compose 工作流

```bash
rnix compose up          # 运行工作流
rnix compose up --json   # JSON 输出
rnix compose down        # 停止所有 compose 进程
rnix compose resume --node <name>  # 恢复失败的 DAG 节点
```

---

## Agent 清单 — agent.yaml

每个 Agent 由 `agents/<name>/` 目录下的 `agent.yaml` 和 `instructions.md` 文件定义（全局：`~/.config/rnix/agents/`，项目：`.rnix/agents/`）。

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

### 字段

| 字段 | 类型 | 必填 | 描述 |
|-------|------|----------|------|
| `name` | `string` | 是 | 唯一 agent 标识 |
| `description` | `string` | 否 | 可读描述 |
| `models` | `object` | 否 | LLM 模型偏好 |
| `models.provider` | `string` | 否 | LLM 提供商名称 |
| `models.preferred` | `string` | 否 | 首选模型 |
| `models.fallback` | `string` | 否 | 回退模型 |
| `context_budget` | `int` | 否 | 单步上下文窗口守卫：单次 LLM 调用允许的最大输入 token 数。超限时进程自暂停（退出码 3, `context_full`），可通过 resume 恢复。`0` = 自动推导为 `context_window × 0.9`；显式设置的值会截断为 `min(budget, context_window)`。 |
| `max_steps` | `int` | 否 | 最大推理步数（0 = 默认 10） |
| `max_tokens` | `int` | 否 | 最大总 token 数（0 = 无限制） |
| `skills` | `[]string` | 否 | 引用的 skill 名称 |
| `mcp` | `object` | 否 | MCP 服务器配置 |

### MCP 服务器配置字段

| 字段 | 类型 | 必填 | 描述 |
|-------|------|----------|------|
| `command` | `string` | 是 | 启动 MCP 服务器的可执行文件 |
| `args` | `[]string` | 否 | 命令行参数 |
| `env` | `map[string]string` | 否 | 环境变量（支持 `${VAR}` 展开） |
| `timeout` | `duration` | 否 | 每服务器超时（默认：`30s`） |
| `max_output_tokens` | `int` | 否 | 每工具输出的最大 token 数 |

---

## Skill 定义 — SKILL.md

Skill 遵循 [agentskills.io](https://agentskills.io/) 标准，使用 YAML frontmatter + Markdown 正文。存储采用四路径模型（project/user × native/agents namespace）：

| 路径 | Scope | Namespace | 优先级 |
|------|-------|-----------|--------|
| `<project>/.rnix/skills/` | project | native | 1（最高） |
| `<project>/.agents/skills/` | project | agents | 2 |
| `~/.config/rnix/skills/` | user | native | 3 |
| `~/.agents/skills/` | user | agents | 4（最低） |

详见 [Skill 包管理](/zh/guide/skill-packages)。

```markdown
---
name: code-analysis
description: >
  分析代码质量，识别 bug、性能问题和安全漏洞。
allowed-tools: /dev/fs /dev/shell /dev/web
metadata:
  author: rnix
  version: "1.0"
  tags: "code, quality"
---

# 代码分析

## 使用场景
...

## 工作流程
1. 通过 /dev/fs 读取源文件
2. 通过 /dev/shell 运行分析
3. 生成报告
```

### allowed-tools 与安全

`allowed-tools` 字段是 Rnix 权限模型的核心。skill 只能访问此处列出的 VFS 设备：

| 设备 | 能力 |
|--------|------------|
| `/dev/fs` | 主机文件系统读写 |
| `/dev/shell` | Shell 命令执行 |
| `/dev/llm/<provider>` | LLM 推理 |
| `/dev/web` | Web 搜索和页面抓取 |
| `/mnt/mcp/*` | MCP 服务器工具 |

多个 skill 的 `allowed-tools` 取**并集**。空 `allowed-tools` 表示**无限制**（可访问所有设备）。

---

## 环境变量

| 变量 | 描述 |
|----------|-------------|
| `RNIX_ENV` | 选择 `.env` 文件加载环境（默认：`development`） |
| `RNIX_ASCII` | 设为 `1` 强制 ASCII 模式（禁用 Unicode） |
| `RNIX_FEATURE_PROFILE` | 特性档案覆盖：`baseline`、`core`、`adaptive`、`full`、`custom` |
| `XDG_CONFIG_HOME` | 覆盖全局配置目录（默认：`~/.config`） |
| `XDG_RUNTIME_DIR` | 用于确定 socket 路径 |
| `TAVILY_API_KEY` | Tavily 搜索 API 密钥（`/dev/web` 自动检测） |
| `EXA_API_KEY` | Exa 搜索 API 密钥（`/dev/web` 自动检测） |
| `RNIX_SEARCH_URL` | SearXNG 实例 URL（`/dev/web` 自动检测） |

## Socket 路径

Daemon socket 位置优先级：

1. `$XDG_RUNTIME_DIR/rnix/rnix.sock`
2. `/tmp/rnix-{uid}/rnix.sock`（回退）

目录权限：`0700`（仅当前用户）。

---

## 相关文档

- [快速上手](/zh/guide/quick-start) — 安装与首次运行
- [LLM 提供商](/zh/guide/llm-providers) — 提供商详情和 serve 网关
- [Web 搜索](/zh/guide/web-search) — 搜索后端配置
- [Skill 包管理](/zh/guide/skill-packages) — 多 scope skill 管理
- [进程恢复](/zh/guide/process-resume) — GC 配置和进程恢复
- [MCP 集成](/zh/guide/mcp-integration) — MCP 服务器配置
- [智能涌现](/zh/guide/emergence) — 涌现架构与特性档案映射
- [核心概念](/zh/guide/concepts) — 进程、VFS、Agent/Skill 模型
- [参考手册](/zh/reference/) — 完整 API 和 CLI 参考
