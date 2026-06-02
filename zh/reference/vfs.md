## 2. VFS 路径规范

### 2.1 概述

VFS（虚拟文件系统）是 Rnix 的统一资源抽象层，遵循 Unix "一切皆文件"的哲学。所有外部资源通过 VFS 设备路径访问。

**设备模型：** 每个 VFS 路径映射到一个 `VFSFileFactory`，由 `DeviceRegistry` 管理注册和查找。

**路径匹配机制：**

1. **精确匹配** — 路径与注册路径完全一致
2. **最长前缀匹配** — 路径以注册路径开头，选择最长前缀；剩余部分作为 `subpath` 传递给设备工厂

**已注册设备路径：**

| VFS 路径 | 驱动模块 | 匹配方式 | 说明 |
|---------|---------|---------|------|
| `/dev/llm/claude` | `drivers/llm` | 精确匹配 | Claude Code CLI 调用 |
| `/dev/llm/cursor` | `drivers/llm` | 精确匹配 | Cursor CLI 调用 |
| `/dev/fs` | `drivers/fs` | 前缀匹配 | 宿主文件系统（subpath 作为文件路径） |
| `/dev/shell` | `drivers/shell` | 精确匹配 | Shell 命令执行 |
| `/proc` | `vfs/proc.go` | 前缀匹配 | 动态进程信息 |
| `/dev/memory/commit` | `drivers/memory` | 精确匹配 | 持久化知识提交（增删改） |
| `/dev/memory/recall` | `drivers/memory` | 精确匹配 | 跨进程知识搜索（只读） |
| `/dev/memory/profile` | `drivers/memory` | 精确匹配 | 用户画像管理 |
| `/dev/tasks` | `drivers/tasks` | 前缀匹配 | 动态任务管理（创建/更新/列表） |
| `/dev/tty` | `drivers/tty` | 精确匹配 | 交互式用户问答 |
| `/dev/skills/manage` | `drivers/skills` | 精确匹配 | 运行时技能管理（创建/修改/删除） |
| `/dev/web` | `drivers/web` | 前缀匹配 | Web 访问（抓取 + 搜索） |
| `/dev/lsp` | `drivers/lsp` | 前缀匹配 | LSP 代码智能 |
| `/dev/cron` | `drivers/cron` | 前缀匹配 | 定时任务调度 |

设备注册在 daemon 启动时通过依赖注入完成（`cmd/rnix/main.go`）。

### 2.2 /dev/llm/claude — LLM 驱动设备

**路径：** `/dev/llm/claude`
**驱动：** `drivers/llm.ClaudeCliDriver`
**匹配：** 精确匹配

**Write 请求格式（JSON）：**

```json
{
  "intent": "分析代码",
  "system_prompt": "...",
  "model": "deepseek-v4-flash",
  "max_turns": 1,
  "timeout_ms": 30000,
  "messages": [{"role": "user", "content": "..."}]
}
```

**Read 响应格式（JSON）：**

```json
{
  "content": "LLM 响应内容",
  "tokens_used": 1234
}
```

**底层实现：** 每次 Write 调用 = 一次 `exec.CommandContext` 执行 `claude -p` CLI。支持 context 取消（Kill 信号中断）。

### 2.3 /dev/llm/cursor — Cursor CLI 驱动设备

**路径：** `/dev/llm/cursor`
**驱动：** `drivers/llm.CursorCliDriver`
**匹配：** 精确匹配

**Write 请求格式（JSON）：** 与 `/dev/llm/claude` 相同。

**差异：**
- 底层调用 `agent --print` CLI（Cursor CLI）
- 无 `--system-prompt` 参数，系统提示词以 `[System Instructions]` 标记拼接到 prompt 中
- 无 `--max-turns` 参数（静默忽略）
- stream-json 事件格式包含 `system`（init）、`assistant`、`tool_call`、`result` 四种类型
- 需设置 `CURSOR_API_KEY` 环境变量

**Provider 选择：** 通过 `--provider` CLI flag 或 agent.yaml `models.provider` 字段指定。详见 §4.2。

### 2.3 /dev/fs — 宿主文件系统设备

**路径：** `/dev/fs`
**驱动：** `drivers/fs.HostFSDriver`
**匹配：** 前缀匹配

**路径解析：** `/dev/fs/path/to/file` → subpath = `/path/to/file` → 映射到宿主文件系统路径

**操作：**

- **Write** — 写入操作参数（文件路径、读取请求等）
- **Read** — 读取文件内容
- **Close** — 释放资源

### 2.4 /dev/shell — Shell 执行设备

**路径：** `/dev/shell`
**驱动：** `drivers/shell.ShellDriver`
**匹配：** 精确匹配

**操作：**

- **Write** — 写入 Shell 命令
- **Read** — 读取命令执行结果
- **Close** — 释放资源

**底层实现：** 通过 `exec.CommandContext` 执行 Shell 命令，继承当前用户权限。

### 2.5 /proc/{pid}/ — 动态进程信息

**路径：** `/proc`
**驱动：** `vfs.ProcFS`
**匹配：** 前缀匹配

**只读文件系统** — Write 操作返回 `PERMISSION` 错误。

**子路径：**

| 子路径 | 格式 | 内容 |
|--------|------|------|
| `/proc/{pid}/status` | JSON | 进程状态快照 |
| `/proc/{pid}/intent` | 纯文本 | 原始意图字符串 |
| `/proc/{pid}/context` | 纯文本 | 上下文摘要 |

**`/proc/{pid}/status` JSON 格式：**

```json
{
    "pid": 1,
    "ppid": 0,
    "state": "running",
    "intent": "分析代码",
    "skills": ["code-analysis"],
    "tokens_used": 456,
    "elapsed_ms": 3200,
    "allowed_devices": ["/dev/fs", "/dev/shell"]
}
```

**路径解析规则：** subpath 格式为 `/{pid}/{file}`，其中 `{file}` 必须是 `status`、`intent` 或 `context` 之一。

**快照语义：** 内容在 Open 时生成快照，后续 Read 读取快照数据。

### 2.6 /dev/memory/commit — 持久化记忆设备

**路径：** `/dev/memory/commit`
**驱动：** `drivers/memory.MemoryCommitDriver`
**匹配：** 精确匹配

为智能体提供持久化知识管理。支持双作用域存储：`memory`（项目级）和 `global_memory`（全局级）。所有写入经安全扫描。

**写请求格式 (JSON):**

```json
{
  "action": "add|replace|remove|snapshot|capacity",
  "target": "memory|global_memory",
  "content": "知识条目文本",
  "old": "待替换/删除的现有条目",
  "new": "替换后的新文本"
}
```

**操作：** `add` — 追加知识条目；`replace` — 替换旧→新；`remove` — 删除匹配条目；`snapshot` — 读取所有条目；`capacity` — 检查剩余容量。

### 2.7 /dev/memory/recall — 知识搜索设备

**路径：** `/dev/memory/recall`
**驱动：** `drivers/memory.MemoryRecallDriver`
**匹配：** 精确匹配

只读设备，用于搜索历史进程对话和提取的知识。支持可选的 LLM 摘要。

**写请求格式 (JSON):**

```json
{
  "query": "搜索关键词",
  "max_results": 20,
  "summarize": false
}
```

**读响应：** 返回按相关性排序的匹配知识条目。若 `summarize: true`，辅助 LLM 会将结果精简以便注入上下文。

### 2.8 /dev/memory/profile — 用户画像设备

**路径：** `/dev/memory/profile`
**驱动：** `drivers/memory.MemoryProfileDriver`
**匹配：** 精确匹配

管理用户画像信息（角色、偏好、专业领域）。固定为 `user` 目标作用域。操作语义与 `/dev/memory/commit` 相同。

### 2.9 /dev/tasks — 任务管理设备

**路径：** `/dev/tasks`
**驱动：** `drivers/tasks.TasksDriver`
**匹配：** 前缀匹配

智能体的动态任务管理。任务在 daemon 会话期间存储于内存中。

**操作：** `task_create` — 创建新任务；`task_update` — 更新状态、添加依赖、变更所有者；`task_list` — 列出所有任务及状态。

### 2.10 /dev/tty — 交互式用户问答设备

**路径：** `/dev/tty`
**驱动：** `drivers/tty.TtyDriver`
**匹配：** 精确匹配

允许智能体在执行过程中向用户提问。问题通过 IPC 转发给用户，阻塞直到收到响应（5 分钟超时）。

### 2.11 /dev/skills/manage — 动态技能管理设备

**路径：** `/dev/skills/manage`
**驱动：** `drivers/skills.SkillManageDriver`
**匹配：** 精确匹配

运行时技能生命周期管理。智能体可以编程方式创建、修改或删除技能。

### 2.12 /dev/web — Web 访问设备

**路径：** `/dev/web`
**驱动：** `drivers/web.WebDriver`
**匹配：** 前缀匹配

提供 Web 访问能力：URL 抓取（HTML 转 Markdown）和 Web 搜索。内置 15 分钟页面缓存。

### 2.13 /dev/lsp — LSP 代码智能设备

**路径：** `/dev/lsp`
**驱动：** `drivers/lsp.LspDriver`
**匹配：** 前缀匹配

语言服务器协议集成，提供代码智能。默认服务端：`gopls`。

**操作：** `goToDefinition`、`findReferences`、`hover`、`documentSymbol`、`workspaceSymbol`、`goToImplementation`、`prepareCallHierarchy`、`incomingCalls`、`outgoingCalls`。

### 2.14 /dev/cron — 定时任务设备

**路径：** `/dev/cron`
**驱动：** `drivers/cron.CronDriver`
**匹配：** 前缀匹配

管理定时重复执行的任务。触发时自动 spawn 新智能体进程。任务持久化到磁盘，跨 daemon 重启保留。

### 2.15 Agent 和 Skill 定义

这两个路径是 Agent 和 Skill 的文件系统存储位置，由 `AgentLoader` 和 `SkillLoader` 直接读取（不通过 VFS 设备机制）。

**Agent 目录结构：**

```
agents/{agent-name}/
├── agent.yaml        # Agent 配置清单
└── instructions.md   # Agent 角色指令（系统提示词）
```

**Skill 目录结构：**

```
skills/{skill-name}/
└── SKILL.md          # Skill 定义（YAML frontmatter + Markdown body）
```

### 2.16 VFSFile 接口和 OpenFlag 枚举

所有设备驱动必须实现 `VFSFile` 接口：

```go
type VFSFile interface {
    Read(length int) ([]byte, error)
    Write(ctx context.Context, data []byte) error
    Close() error
    Stat() (FileStat, error)
}
```

**VFSFileFactory 签名：**

```go
type VFSFileFactory func(subpath string, flags OpenFlag) (VFSFile, error)
```

**OpenFlag 枚举：**

| 常量 | 值 | 说明 |
|------|-----|------|
| `O_RDONLY` | `0` | 只读 |
| `O_WRONLY` | `1` | 只写 |
| `O_RDWR` | `2` | 读写 |

### 2.17 FD 分配规则

- **起始值：** 3（0/1/2 预留给 stdin/stdout/stderr）
- **分配方式：** 每进程独立 `fdTable`，内部 `nextFD` 计数器单调递增
- **作用域：** 每个 `Process` 拥有独立的 `FDTable`
- **释放：** `Close` 从 `fdTable` 中原子移除 FD；进程退出时 `CloseAll` 关闭所有打开的 FD

---

