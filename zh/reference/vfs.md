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
  "model": "sonnet",
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

### 2.6 Agent 和 Skill 定义

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

### 2.7 VFSFile 接口和 OpenFlag 枚举

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

### 2.8 FD 分配规则

- **起始值：** 3（0/1/2 预留给 stdin/stdout/stderr）
- **分配方式：** 每进程独立 `fdTable`，内部 `nextFD` 计数器单调递增
- **作用域：** 每个 `Process` 拥有独立的 `FDTable`
- **释放：** `Close` 从 `fdTable` 中原子移除 FD；进程退出时 `CloseAll` 关闭所有打开的 FD

---

