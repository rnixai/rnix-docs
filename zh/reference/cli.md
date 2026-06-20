## 4. CLI 命令参考

### 4.1 全局 Flags

| Flag | 短选项 | 类型 | 说明 |
|------|--------|------|------|
| `--json` | — | `bool` | JSON 格式输出 |
| `--verbose` | `-v` | `bool` | 详细输出 |
| `--quiet` | `-q` | `bool` | 静默输出 |
| `--model` | `-m` | `string` | 使用的 LLM 模型（如 `sonnet`/`opus`/`haiku`） |
| `--provider` | — | `string` | LLM 提供商覆盖（参见 `providers.yaml`） |
| `--fallback-model` | — | `string` | 覆盖 agent 降级模型（为空 = 使用 agent manifest） |
| `--fallback-provider` | — | `string` | 覆盖 agent 降级提供商（为空 = 与主提供商相同） |
| `--reasoning-effort` | — | `string` | 透传给提供商的推理强度（如 `low`/`medium`/`high`）；为空时使用提供商默认。详见 [LLM 提供商 › 推理强度](/zh/guide/llm-providers#reasoning-effort) |

**输出模式优先级：** `--json` > `--quiet` > `--verbose` > 默认

这些 flag 通过 `PersistentFlags` 注册，对所有子命令生效。

### 4.2 rnix -i \<intent\> — 根命令

```
用法: rnix -i <intent> [flags]
```

意图通过 `-i`/`--intent` flag 传入，**而非**位置参数——根命令拒绝位置参数。不带 `-i` 时，`rnix` 打印帮助。

**私有 Flags：**

| Flag | 短选项 | 类型 | 默认值 | 说明 |
|------|--------|------|--------|------|
| `--intent` | `-i` | `string` | `""` | 用于 spawn 智能体的意图字符串 |
| `--max-steps` | — | `int` | `0` | 最大推理步数（`0` = 默认 10） |
| `--agent` | — | `string` | `""` | Agent 定义名称 |
| `--dashboard` | — | `bool` | `false` | spawn 智能体后打开 dashboard |

全局 `--model`/`--provider`/`--reasoning-effort` flag（见 §4.1）同样适用于根命令。

**默认输出示例：**

```
[kernel] spawning PID 1 (claude/sonnet)...
[agent/1] reasoning step 1...
[agent/1] reasoning step 2...
══ Result ══════════════════════════════════════════════════════════════════════
  分析结果内容...
════════════════════════════════════════════════════════════════════════════════
[kernel] PID 1 exited(0) | claude/sonnet | tokens: 1234 | elapsed: 6.2s
```

**示例：**

```bash
rnix -i "analyze ./README.md"
rnix -i "refactor error handling in main.go"
rnix -i "analyze project structure" --json
```

**JSON 成功响应：**

```json
{"ok": true, "data": {"pid": 1, "result": "...", "tokens_used": 1234, "elapsed_ms": 6200, "exit_code": 0}}
```

**JSON 错误响应：**

```json
{"ok": false, "error": {"code": "TIMEOUT", "message": "...", "syscall": "Write", "device": "/dev/llm"}}
```

### 4.3 rnix daemon — Daemon 管理

```
用法: rnix daemon [command]
子命令:
  start     若 daemon 未运行则启动它
  status    显示 daemon 状态（运行状态、版本、socket 路径、进程数）
  stop      停止运行中的 daemon
```

**`rnix daemon status` 输出示例：**

```
status:  running
version: 0.1.0
socket:  /run/user/1000/rnix/rnix.sock
procs:   1 active / 3 total
```

**`rnix daemon start` 输出示例：**

```
daemon started
status:  running
...
```

daemon 已在运行时，`start` 打印 `daemon is already running` 并报告当前状态。

**`rnix daemon stop` 输出示例：**

```
daemon stopped
```

daemon 未运行时：

```
daemon is not running
```
```

### 4.3 rnix ps — 进程列表

```
用法: rnix ps [flags]
参数: 无 (cobra.NoArgs)
```

**可用标志：**

| 标志 | 说明 |
|------|------|
| `-a`, `--all` | 显示所有进程，包括已完成/已终止的进程（活跃 + 历史） |
| `-v`, `--verbose` | 显示额外列（PPID、Intent） |
| `-q`, `--quiet` | 每行输出一个 PID |
| `-j`, `--json` | 输出结构化 JSON |
| `--uuid` | 显示 UUID 列（使用 `-a` 时自动启用） |

**默认模式 — 表格格式：**

```
  PID   STATE     SKILL              TOKENS   ELAPSED
─────   ─────────   ───────────────   ────────   ────────
    1   running   code-analysis        456      3.2s
    2   zombie    —                    123      1.1s

1 active, 1 zombie, 2 total
```

**--all — 包含历史进程：**

```bash
$ rnix ps -a
  PID   UUID                                  STATE      SKILL              TOKENS   ELAPSED
─────   ────────────────────────────────────   ────────   ───────────────   ────────   ────────
    1   019746a0-1234-7000-8000-000000000001   running    code-analysis        456      3.2s
    2   019746a0-1234-7000-8000-000000000002   dead       security-scan       1200      8.5s

1 active, 1 dead, 2 total
```

使用 `-a` 时 UUID 列会自动显示，因为 UUID 是识别历史进程的关键标识（例如用于 `rnix resume`）。

**--verbose — 含额外字段：**

含 PPID、Intent 列。

**--quiet — 逐行 PID：**

```
1
2
```

**--json — 结构化 JSON：**

```json
{
  "ok": true,
  "data": {
    "processes": [
      {
        "pid": 1,
        "ppid": 0,
        "state": "running",
        "intent": "分析代码",
        "skills": ["code-analysis"],
        "tokens_used": 456,
        "elapsed_ms": 3200
      }
    ]
  }
}
```

**无活跃进程时：** `No active processes.`

### 4.4 rnix kill \<pid\> — 进程终止

```
用法: rnix kill <pid>
参数: <pid> — 进程 ID（十进制数字，恰好 1 个参数）
信号: 固定发送 SIGTERM(1)
```

**成功输出：**

```
[kernel] PID 1: signal sent (SIGTERM)
```

### 4.5 rnix strace \<pid\> — Syscall 追踪

```
用法: rnix strace <pid>
参数: <pid> — 进程 ID（恰好 1 个参数）
```

**三种输出模式：**

**默认模式 — 格式化追踪行：**

```
[strace] attached to PID 1 (state: running)
[  0.013s] Open(flags=2, path="/dev/llm/claude") → 3    1ms
[  0.014s] Write(fd=3, size=1234) → <nil>    5.20s  ← LLM 调用
[  5.214s] Read(fd=3, length=65536) → 892B      2ms
[  5.216s] Open(flags=2, path="/dev/fs/./src/main.go") → 4    1ms
[  5.217s] Write(fd=4, size=56) → <nil>    0µs
[  5.217s] Read(fd=4, length=1048576) → 2048    1ms
[  5.218s] Close(fd=4) → <nil>    0µs
[strace] detached from PID 1 (process exited)
```

**注解标记：**

- `← LLM 调用` — 涉及 `/dev/llm/` 设备的操作
- `← 慢操作` — 耗时超过 1 秒的操作

**--verbose — 完整参数和结果**

**--json — 逐行 JSON（SyscallEventWire 结构）：**

```json
{"timestamp_ms": 13, "pid": 1, "syscall": "Open", "args": {"flags": 2, "path": "/dev/llm/claude"}, "result": 3, "duration_ms": 1.0}
```

**--raw — 原始 LLM 请求/响应捕获：**

回放为进程的每次 LLM 调用所记录的原始请求与响应——API 类提供商为 HTTP 请求/响应，CLI 类提供商为完整的命令调用与输出。可用于确认究竟向模型发送了什么（prompt、参数、推理强度）。附加步骤号可检视单次调用。捕获中的凭证已脱敏。

```bash
rnix strace <pid> --raw                  # 所有已捕获的 LLM 调用
rnix strace <pid> --raw --step 3         # 单个推理步骤
rnix strace <pid> --raw --uuid <uuid>    # 定位已被 reap 的进程
```

`--uuid <uuid>` flag 用显式进程 UUID 覆盖 PID 解析，使 `--raw` 能定位已被 reap（PID 已不在进程表中）的进程。

对运行中和已结束的进程均适用（捕获随进程历史持久化）。详见 [调试 › 原始 LLM I/O](/zh/guide/debugging#raw-llm-io)。

**SIGINT 行为：** 仅 detach 追踪，不影响被追踪进程。

### 4.6 rnix version — 版本信息

```
用法: rnix version
```

**默认输出：**

```
rnix v0.1.0
commit:  cd9c568
built:   2026-03-15T07:23:57Z
```

**开发构建（无 ldflags）：**

```
rnix v0.1.0-dev
```

**JSON 输出：**

```json
{"ok": true, "data": {"version": "0.1.0", "git_commit": "cd9c568", "build_date": "2026-03-15T07:23:57Z"}}
```

### 4.7 JSON 响应格式

所有支持 `--json` 的命令使用统一的 `JSONResponse` 包装：

```go
type JSONResponse struct {
    OK    bool `json:"ok"`
    Data  any  `json:"data,omitempty"`
    Error any  `json:"error,omitempty"`
}
```

**成功时：** `ok=true`，`data` 包含命令特定数据

**失败时：** `ok=false`，`error` 包含结构化错误信息：

```go
type jsonErrorData struct {
    Code    string `json:"code"`
    Message string `json:"message"`
    Syscall string `json:"syscall,omitempty"`
    Device  string `json:"device,omitempty"`
}
```

### 4.8 rnix init — 配置初始化

初始化全局配置（`~/.config/rnix/`）和项目配置（`.rnix/`）目录。

```
用法: rnix init
参数: 无
```

| Flag | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--with-mcp-examples` | `bool` | `false` | 生成包含 Playwright MCP 示例服务器的 `mcp.yaml` |

**行为：**

1. **全局初始化** — 创建 `~/.config/rnix/` 及子目录 `agents/`、`skills/`，解压内嵌的智能体和技能，生成默认 `providers.yaml` 和 `config.yaml`
2. **项目初始化** — 在当前工作目录创建 `.rnix/` 及子目录 `agents/`、`skills/`、`data/`，以及初始 `config.yaml`

如果目录已存在，则跳过对应步骤并输出提示信息。

**示例：**

```
$ rnix init
initialized global config: /home/user/.config/rnix
initialized project config: /path/to/project/.rnix
```

### 4.9 rnix top — 实时进程监控

交互式 TUI，实时显示进程树、状态和资源消耗。

```
用法: rnix top
参数: 无 (cobra.NoArgs)
```

**显示内容：** 全屏交替屏 TUI，包含摘要栏（活跃数量、总 token、运行时间）和进程表，显示 PID、PPID、STATE、AGENT、TOKENS、ELAPSED 列。进程根据父子关系以树形层级展示。

**快捷键：**

| 按键 | 操作 |
|-----|------|
| `q` / `Ctrl+C` | 退出 |
| `j` / `Down` | 光标下移 |
| `k` / `Up` | 光标上移 |
| `Enter` | 显示进程详情面板 |
| `K` | 终止选中进程 (SIGTERM) |
| `Esc` | 返回列表视图（从详情视图） |

**刷新频率：** 500ms 轮询间隔。

### 4.10 rnix log \<pid\> — 推理日志查看器

流式查看运行中智能体的推理日志，按类别分为 `[think]`、`[tool]` 和 `[output]`。

```
用法: rnix log <pid>
参数: <pid> — 进程 ID（恰好 1 个参数）
```

**标志：**

| 标志 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `--filter` | `string` | `""` | 按日志类别过滤（`think`、`tool`、`output`） |

**示例：**

```
$ rnix log 5
[rnix log] attached to PID 5

[  0.123] [think]  Analyzing the project structure...
[  1.456] [tool]   /dev/fs/./src/main.go → reading file
[  3.789] [output] The project has 3 modules...
```

按 `Ctrl+C` 可断开连接，不影响被追踪的进程。

### 4.11 rnix gdb \<pid\> — 交互式调试器

附加到运行中的智能体进程，进入交互式调试会话。实时接收系统调用事件和推理日志。

```
用法: rnix gdb <pid>
参数: <pid> — 进程 ID（恰好 1 个参数）
```

**交互命令：**

| 命令 | 描述 |
|------|------|
| `break syscall <name>` | 在特定系统调用处设置断点 |
| `break reasoning` | 在每次推理步骤前中断 |
| `break quality --pattern <pat>` | 当 LLM 输出匹配模式时中断 |
| `break budget <tokens>` | 当 token 用量达到阈值时中断 |
| `delete <bp_id>` | 按 ID 删除断点 |
| `info breakpoints` | 列出所有断点 |
| `continue` / `c` | 断点后继续执行 |
| `step [syscall\|reasoning]` | 执行下一步 |
| `inspect context` | 显示上下文信息及 token 估计 |
| `set model <name>` | 覆盖 LLM 模型 |
| `set context append <text>` | 向上下文追加文本 |
| `set skills add <name>` | 为智能体添加技能 |
| `record start` / `record stop` | 在会话中开始/停止录制 |
| `detach` / `quit` / `q` | 断开调试会话 |

**示例：**

```
$ rnix gdb 1
[gdb] attached to PID 1 (state=running, intent="Analyze code")
gdb> break syscall Write
[gdb] breakpoint 1 set: syscall Write
gdb> continue
```

### 4.12 rnix dashboard — 可视化调试仪表盘

交互式 TUI 仪表盘，在多窗格布局中显示智能体树、时间线和热力图。

```
用法: rnix dashboard
参数: 无 (cobra.NoArgs)
```

**窗格：**

- **树形窗格** — 带有状态和 token 用量的进程树
- **时间线窗格** — 可滚动的事件时间线，按系统调用事件分类（LLM、Tool、IPC、VFS、Error）
- **热力图窗格** — 上下文预算可视化，含段分类（system、skill、tool、user、assistant、leaked）

**导航：** 使用 Tab 切换窗格，方向键在窗格内滚动，`p` 暂停/恢复选中的进程树，`q` 退出。

### 4.13 rnix record — 执行录制

录制执行事件（系统调用、LLM 响应、上下文变更、状态转换），用于离线分析和时间旅行调试。

```
用法: rnix record <start|stop|list> [pid]
子命令:
  start <pid>   开始录制指定进程的事件
  stop <pid>    停止录制并持久化到磁盘
  list          列出所有录制会话
```

**示例：**

```
$ rnix record start 1
Recording started for PID 1 (record-id: 1-1709856000)

$ rnix record stop 1
Recording stopped for PID 1 (42 events captured)

$ rnix record list
RECORD-ID            PID    STATUS       EVENTS   START                INTENT
1-1709856000         1      completed    42       2026-03-15 10:00:00  Analyze code
```

### 4.14 rnix replay \<record-id\> — 录制回放

加载已录制的执行轨迹并进入交互式回放会话。读取本地录制文件，无需运行中的 daemon。

```
用法: rnix replay <record-id>
参数: <record-id> — 录制标识符（恰好 1 个参数）
```

**交互命令：**

| 命令 | 描述 |
|------|------|
| `next` / `n` | 前进一个事件 |
| `prev` / `p` | 后退一个事件 |
| `goto <seq_num>` | 按序列号跳转到事件 |
| `list` / `l` | 显示当前位置附近的事件 |
| `diff <seq1> <seq2>` | 比较两个时间点的上下文 |
| `fork` | 从当前位置分叉以重新执行 |
| `info` / `i` | 显示录制摘要 |
| `quit` / `q` | 退出回放 |

**示例：**

```
$ rnix replay 42-1709856000
[replay] Loading record 42-1709856000...
[replay] PID: 42 | Intent: "Analyze code" | Events: 15 | Status: completed
replay> next
```

### 4.15 rnix trace — 分布式追踪查看器

查看已完成 Compose 编排的分布式追踪数据。追踪数据从本地 `.rnix/traces/` 目录读取（无需 daemon）。

```
用法: rnix trace [trace-id]
参数: [trace-id] — 可选的追踪标识符（0 或 1 个参数）
```

不带参数时列出所有可用追踪。带 trace-id 时显示完整的 span 树及时间和 token 用量。

**子命令：`rnix trace blame <trace-id>`**

分析分布式追踪以识别性能瓶颈和错误根因。显示关键路径分析、耗时/token 热点和错误传播链。

```
用法: rnix trace blame <trace-id>
参数: <trace-id> — 追踪标识符（恰好 1 个参数）
```

**示例：**

```
$ rnix trace
TRACE-ID             SPANS  DURATION  STATUS
abcdef1234567890     5      12.3s     completed

$ rnix trace abcdef1234567890 --verbose
$ rnix trace blame abcdef1234567890
```

### 4.16 rnix ctx-profile \<pid\> — 上下文用量分析器

分析运行中或僵尸态智能体进程的上下文。显示上下文分类（活跃/温热/冷/泄漏）、识别 token 消耗大户，并提供优化建议。

```
用法: rnix ctx-profile <pid>
参数: <pid> — 进程 ID（恰好 1 个参数）
```

需要运行中的 daemon（上下文数据存储在 daemon 内存中）。

**示例：**

```
$ rnix ctx-profile 1
$ rnix ctx-profile 1 --json
```

### 4.17 rnix ctx-growth \<pid\> — 上下文增长预测器

预测运行中智能体进程的 token 增长趋势。显示历史增长率、预测预算耗尽时间，并在剩余预算低于 20% 时显示告警状态。

```
用法: rnix ctx-growth <pid>
参数: <pid> — 进程 ID（恰好 1 个参数）
```

需要运行中的 daemon（token 历史记录存储在 daemon 内存中）。

**示例：**

```
$ rnix ctx-growth 1
$ rnix ctx-growth 1 --json
```

### 4.18 rnix compose — 多智能体编排

管理在 `compose.yaml` 中定义的多智能体工作流。

**子命令：`rnix compose up`**

解析 `compose.yaml`，解析依赖关系，按 DAG 顺序启动所有智能体。

```
用法: rnix compose up
```

| 标志 | 简写 | 类型 | 默认值 | 描述 |
|------|------|------|--------|------|
| `--file` | `-f` | `string` | `compose.yaml` | Compose 文件路径 |

**子命令：`rnix compose down`**

停止 Compose 编排中所有运行中的智能体并释放资源。

```
用法: rnix compose down
```

| 标志 | 简写 | 类型 | 默认值 | 描述 |
|------|------|------|--------|------|
| `--file` | `-f` | `string` | `compose.yaml` | Compose 文件路径 |

**示例：**

```
$ rnix compose up
$ rnix compose up -f my-workflow.yaml
$ rnix compose down
$ rnix compose down -f my-workflow.yaml --json
```

### 4.19 rnix suspend \<pid\> — 挂起智能体进程

通过发送 SIGPAUSE 信号暂停运行中的智能体进程。推理循环在下一步开始时暂停并阻塞，直到收到 SIGRESUME。进程在暂停期间仍保持 `StateRunning` 状态——这与基于检查点的挂起不同。

```
用法：rnix suspend <pid>
参数：<pid> — 进程 ID（恰好 1 个参数）
```

**成功输出：**

```
[kernel] PID 1: signal sent (SIGPAUSE)
```

**注意：** 要暂停/恢复整个进程树（包括后代进程），请使用 Dashboard 的 `p` 键，它会调用 `SignalTree`。

### 4.20 rnix resume \<pid|uuid\> — 恢复进程

从检查点（`Suspended`）**或**历史（`Dead` / `Zombie` / `context_full` / 熔断）恢复一个进程。这是基于检查点/历史的恢复——与恢复 SIGPAUSE 暂停的进程**不同**；后者请使用 SIGRESUME（通过 Dashboard `p` 键或 `rnix kill <pid>` 发送信号 5）。

```
用法：rnix resume [--fork] [--from-step N] <pid|uuid>
参数：<pid|uuid> — 进程 ID 或 UUID（恰好 1 个参数）
```

| 标志 | 说明 |
|------|------|
| `--fork` | 恢复为一个**新** UUID，而非继承原 UUID。分叉进程会记录 `origin_uuid` 血缘链接，因此原 UUID 仍可独立恢复（Git 式探索）。 |
| `--from-step N` | 在恢复前将历史回放截断到第 `N` 步（*截断分叉*）。需要历史路径，且与检查点互斥——两者同时满足时返回 `ErrInvalid`。`0` 表示不截断。 |

同时支持 PID（运行中的 daemon 进程）和 UUID（从持久化的检查点或历史恢复）。完整的恢复/分叉模型与 Dashboard 血缘视图详见[进程恢复](/zh/guide/process-resume)。

### 4.21 rnix heartbeat — 心跳监控

心跳监控管理。监控器通过检查心跳时间戳来追踪运行中进程的活性。暂停的进程（SIGPAUSE 生效）会被显式跳过——它们在推理循环阻塞期间有意停止发送心跳。

**子命令：`rnix heartbeat status`**

显示所有活跃进程的心跳监控状态。

```
用法：rnix heartbeat status
参数：无 (cobra.NoArgs)
```

### 4.22 rnix apply \<intent\> — 声明式意图分解

声明一个高层意图。系统将其分解为子意图树（Intent Tree），每个子意图映射到一个或多个智能体进程。

```
用法: rnix apply <intent>
参数: <intent> — 意图字符串（恰好 1 个参数）
```

**标志：**

| 标志 | 简写 | 类型 | 默认值 | 描述 |
|------|------|------|--------|------|
| `--yes` | `-y` | `bool` | `false` | 跳过确认，立即开始执行 |
| `--update` | `-u` | `string` | `""` | 增量更新现有意图 |

使用 `--update` 时，将新子意图增量合并到现有意图树中，不会重新分解已完成的节点。

**示例：**

```
$ rnix apply "build a REST API for user management"
$ rnix apply "build a REST API" --yes
$ rnix apply "add comments feature" --update intent-1
```

### 4.23 rnix intent — 意图管理

用于管理声明式意图树的命令。

**子命令：`rnix intent status [intent-id]`**

显示意图树的当前状态：总体进度、每个节点的完成情况和活跃的智能体。不带参数时显示所有活跃意图。

```
用法: rnix intent status [intent-id]
参数: [intent-id] — 可选的意图标识符（0 或 1 个参数）
```

**子命令：`rnix intent list`**

以表格形式显示所有意图（活跃 + 已完成）。

```
用法: rnix intent list
参数: 无
```

**示例：**

```
$ rnix intent status
$ rnix intent status intent-1
$ rnix intent list --json
```

### 4.24 rnix skill — 技能包管理

从社区注册中心安装、更新和管理技能。

**子命令：`rnix skill install <name> [name...]`**

从社区技能注册中心下载并安装一个或多个技能。

```
用法: rnix skill install <name> [name...]
参数: 一个或多个技能名称（至少 1 个）
```

| 标志 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `--force` | `bool` | `false` | 即使已安装也强制安装 |
| `--global` / `-g` | `bool` | `false` | 无视 cwd，安装到用户作用域（`~/.config/rnix/skills/` 或 `~/.agents/skills/`） |
| `--shared` | `bool` | `false` | 安装到 agents 命名空间（`.agents/skills/`），与 agentskills.io 生态跨工具互通 |

**子命令：`rnix skill search [keyword]`**

在社区注册中心中按关键词搜索技能。不带参数时浏览所有可用技能。

```
用法: rnix skill search [keyword]
参数: [keyword] — 可选的搜索关键词（0 或 1 个参数）
```

**子命令：`rnix skill update [name...]`**

检查更新并从社区注册中心更新已安装的技能。不带参数时更新所有已安装的社区技能。

```
用法: rnix skill update [name...]
参数: 零个或多个技能名称
```

**子命令：`rnix skill list`**

列出所有本地可用的技能，包括系统内置技能和社区安装的技能。

```
用法: rnix skill list
参数: 无 (cobra.NoArgs)
```

| 标志 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `--global` / `-g` | `bool` | `false` | 仅显示用户作用域下的技能（`~/.config/rnix/skills/` + `~/.agents/skills/`） |
| `--project` / `-p` | `bool` | `false` | 仅显示项目作用域下的技能（`<projectDir>/.rnix/skills/` + `<projectDir>/.agents/skills/`） |

`--global` 与 `--project` 互斥。

**示例：**

```
$ rnix skill install code-analysis
$ rnix skill search code
$ rnix skill update
$ rnix skill list
```

### 4.25 rnix run \<script.ash\> — AgentShell 脚本运行器

读取并执行 AgentShell 脚本文件。支持 shebang（`#!/usr/bin/env rnix run`）直接执行。

```
用法: rnix run <script.ash> [args...]
参数: <script.ash> — 脚本文件路径（至少 1 个参数）；额外参数传递给脚本
```

**设置的环境变量：**

| 变量 | 描述 |
|------|------|
| `RNIX_SCRIPT_FILE` | 脚本文件的绝对路径 |
| `RNIX_SCRIPT_DIR` | 包含脚本的目录 |
| `RNIX_ARGS` | 所有脚本参数以空格连接 |
| `RNIX_ARG_N` | 按索引获取单个参数（从 0 开始） |

**示例：**

```
$ rnix run deploy.ash
$ rnix run deploy.ash --env staging
$ ./deploy.ash  # 配合 shebang 和 chmod +x
```

### 4.26 rnix serve — OpenAI 兼容 HTTP 网关

启动 OpenAI 兼容的 HTTP 服务器，将已注册的 LLM 提供商公开为标准 API 端点。

```
用法: rnix serve
参数: 无
```

**标志：**

| 标志 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `--port` | `int` | `8080` | HTTP 监听端口 |

服务器绑定到 `127.0.0.1`（仅本地访问）。从全局 `providers.yaml` 配置加载提供商，执行健康检查，并在收到 SIGINT/SIGTERM 时进行 5 秒优雅关闭。

**示例：**

```
$ rnix serve --port 3000
Serving 2 providers on http://127.0.0.1:3000
```

### 4.27 rnix agtest \[file-or-dir\] — 智能体行为测试

运行以 YAML 文件定义的声明式智能体行为回归测试。

```
用法: rnix agtest [file-or-dir]
参数: <file-or-dir> — 单个 YAML 文件或包含 *.yaml 文件的目录（恰好 1 个参数）
```

**标志：**

| 标志 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `--dry-run` | `bool` | `false` | 仅解析和验证，不执行测试 |
| `--timeout` | `int64` | `60000` | 每个测试用例的全局超时时间（毫秒） |

**输出（文本模式）：**

```
[agtest] running 3 test case(s)...

  + test-greeting (1.2s)
  x test-analysis (3.5s)
    exit_code: expected 0, got 1
  - test-skip (skipped)

[agtest] 3 total, 1 passed, 1 failed, 1 skipped, 0 errors (4.7s)
```

**示例：**

```
$ rnix agtest tests/
$ rnix agtest test.yaml --dry-run
$ rnix agtest tests/ --timeout 120000 --json
```

### 4.28 rnix reputation \[agent\] — 智能体信誉评分

显示基于历史 SLA 评估结果的信誉评分。不带参数时以表格列出所有智能体。带智能体名称时显示详细信息。

```
用法: rnix reputation [agent]
参数: [agent] — 可选的智能体名称（0 或 1 个参数）
```

**表格输出（列表模式）：**

```
AGENT                SCORE  SUCCESS  AVG TOKENS  AVG DURATION  RECORDS  TREND
code-reviewer         0.85   92.0%       1,234        3200ms       15  improving
```

**详情输出（单个智能体）：**

```
Agent: code-reviewer
Score: 0.85
Success Rate: 92.0%
Avg Token Usage: 1,234
Avg Duration: 3200ms
Total Records: 15
Trend: improving
```

### 4.29 rnix lineage \<pid\> — 干细胞智能体分化谱系

显示从干细胞智能体到当前特化形态的完整分化路径。显示每个技能加载步骤的时间戳和触发原因。

```
用法: rnix lineage <pid>
参数: <pid> — 进程 ID（恰好 1 个参数）
```

**示例：**

```
$ rnix lineage 42
Lineage for PID 42

[1] 2026-03-15 10:00:00  initial differentiation
    Skills: code-analysis
    Trigger: "Analyze the code"
    Source: keyword-match

[2] 2026-03-15 10:01:30  progressive specialization
    Skills: code-analysis, testing
    Trigger: "Also write tests"
    Source: specialize
```

### 4.30 rnix topology — 协作拓扑

显示智能体协作拓扑和强化路径。

```
用法: rnix topology
参数: 无 (cobra.NoArgs)
```

**输出部分：**

- **NODES** — 智能体名称、信誉评分、连接数
- **EDGES** — 源/目标智能体、spawn 次数、消息数、总交互次数、强化标记
- **REINFORCED PATHS** — 系统识别的高频协作路径

**示例：**

```
$ rnix topology
Collaboration Topology (3 agents, 4 edges)

NODES:
AGENT                REPUTATION  CONNECTIONS
code-analyst               0.85            3

EDGES:
FROM                 TO                   SPAWN  MSG  TOTAL  REINFORCED
code-analyst         test-writer              5    2      7  *
```

### 4.31 rnix synergy — 技能协同组合

技能协同组合管理。

**子命令：`rnix synergy list`**

显示技能组合的历史性能数据。显示成功率、token 用量和推荐信息。

```
用法: rnix synergy list
参数: 无
```

**输出列：**

| 列名 | 描述 |
|------|------|
| SKILLS | 逗号分隔的技能组合 |
| SUCCESS | 成功率百分比 |
| AVG TOKENS | 平均 token 用量 |
| EXECUTIONS | 总执行次数 |
| VS SOLO | 与单独技能相比的成功率差异 |
| TOKEN GAIN | token 用量改进百分比 |
| STATUS | 如果推荐该组合则显示 `recommended` |

**示例：**

```
$ rnix synergy list
$ rnix synergy list --json
```

### 4.32 rnix immune — 自适应免疫安全

自适应免疫安全管理。

**子命令：`rnix immune status`**

显示免疫守护进程状态、行为档案、告警和被挂起的进程。

```
用法: rnix immune status
参数: 无 (cobra.NoArgs)
```

**输出内容：** 运行状态、档案数量、活跃监控器、威胁记忆、行为档案表（智能体模板、样本数、token 速率、持续时间、最后更新时间）、告警及修复操作、被挂起的进程列表。

**子命令：`rnix immune resume <pid>`**

恢复之前被挂起的进程。

```
用法: rnix immune resume <pid>
参数: <pid> — 进程 ID（恰好 1 个参数）
```

**子命令：`rnix immune similarity [agent-name]`**

显示智能体的能力相似度，列出具有相似技能档案的其他智能体。

```
用法: rnix immune similarity [agent-name]
参数: [agent-name] — 可选的智能体名称（0 或 1 个参数）
```

**示例：**

```
$ rnix immune status
Immune Daemon: running (uptime: 5m30s)
Security: OK
Profiles: 3
Active Monitors: 2
Threat Memory: 0 signatures

$ rnix immune resume 42
$ rnix immune similarity code-analyst
```

### 4.33 rnix config — 配置管理

查看活跃的 daemon 配置。

```
用法: rnix config [command]
子命令:
  show    显示活跃的 daemon 配置
```

**子命令：`rnix config show`**

显示活跃的特性档案和各项特性 flag。优先连接运行中的 daemon；daemon 未运行时回退读取本地配置文件。

```
用法: rnix config show
参数: 无 (cobra.NoArgs)
```

**Daemon 运行时输出示例：**

```
Feature Profile: adaptive
  compaction:      true
  diff_memory:     true
  discover_skill:  true
  immune:          false
  planning:        true
  replan:          true
  spawn:           true
  specialize:      true
  stem_matcher:    true
```

**Daemon 未运行时回退输出示例：**

```
Feature Profile: full (from config, daemon not running)
  compaction:      true
  diff_memory:     true
  discover_skill:  true
  immune:          true
  planning:        true
  replan:          true
  spawn:           true
  specialize:      true
  stem_matcher:    true
```

Feature flag 始终按字母序列出。

> **注意**：特性档案可通过 `RNIX_FEATURE_PROFILE` 环境变量覆盖。详见[特性档案](/zh/guide/configuration#特性档案-feature-profile-)。

---

### 4.34 rnix mcp — MCP 服务器检查 {#rnix-mcp}

检查并验证运行中 daemon 上的 [Model Context Protocol](/zh/guide/mcp-integration)（MCP）服务器挂载。

```
用法：rnix mcp [command]
子命令：
  list           列出 daemon 上活动的 MCP 服务器挂载
  test <name>    探测某个已配置的服务器（connect → tools/list → resources/list → prompts/list）
  logs <name>    显示某个已挂载 MCP 服务器捕获的 stderr
  reload         重新读取 mcp.yaml 并刷新 daemon 的 MCP 注册表
```

**子命令：`rnix mcp list`**

列出 daemon 当前持有的 MCP 挂载。这是纯读操作：daemon 未运行时打印友好的空列表并以 `0` 退出（与 `rnix ps` 一致）。

```
用法：rnix mcp list
参数：无（cobra.NoArgs）
```

**子命令：`rnix mcp test <name>`**

对 `mcp.yaml` 中声明的服务器执行一次性探测。探测会在 daemon 上启动一个全新 transport，依次走完四个阶段——`connect` / `tools_list` / `resources_list` / `prompts_list`——随后拆除，不在注册表中留下挂载。该命令**要求 daemon 处于运行状态**（transport 必须位于 daemon 的进程树中，以避免孤儿子进程），因此 daemon 未运行时以 `1` 退出。

```
用法：rnix mcp test <name>
参数：<name> — mcp.yaml 中的 MCP 服务器名（恰好 1 个参数）
```

**子命令：`rnix mcp logs <name>`**

打印某个已挂载 MCP 服务器子进程捕获的最近 256 行 stderr——当 MCP 工具开始失败时（例如 `npx error: ENOENT`、`chromium not found`）首先该查这里。与 `mcp list` 一样，这是纯读操作：daemon 未运行时打印提示并以 `0` 退出；未知/未挂载的服务器名以 `1` 退出，并附上可用服务器列表。

```
用法：rnix mcp logs <name>
参数：<name> — 已挂载的 MCP 服务器名（恰好 1 个参数）
```

**子命令：`rnix mcp reload`**

重新解析 `mcp.yaml` 并在不重启的情况下替换 daemon 的 MCP 服务器注册表。编辑 `mcp.yaml`（新增/删除/重新配置服务器）后运行此命令，让 `mcp test` 和后续挂载立即看到变更。它仅刷新查找表——已挂载的服务器不受影响。与 `mcp test` 一样，该命令**要求 daemon 处于运行状态**，因此 daemon 未运行时以 `1` 退出。损坏的 `mcp.yaml` 会保留原有注册表不变并报告解析错误。

```
用法：rnix mcp reload
参数：无（cobra.NoArgs）
```

---

### 4.35 rnix check — 子系统诊断 {#rnix-check}

针对单个 rnix 子系统运行有针对性的环境/配置检查（目前为 `mcp`）。这与聚焦 LLM provider 健康的 `rnix doctor` 不同。

```
用法：rnix check [command]
子命令：
  mcp    验证 MCP 运行时前置条件（node、npx、可选 Chromium）
```

**子命令：`rnix check mcp`**

检查主机是否具备运行 `mcp.yaml` 中声明的 MCP 服务器所需的二进制。默认探测 `node` + `npx`；若任一服务器引用了 `playwright`，则额外探测 Chromium 安装（`npx playwright install chromium`）。报告 `pass` / `warn` / `fail` 状态——`fail` 以 `1` 退出。

```
用法：rnix check mcp
参数：无（cobra.NoArgs）
```

---

### 4.36 rnix doctor — LLM Provider 健康诊断 {#rnix-doctor}

对 rnix 配置和每个已配置的 LLM provider 运行环境健康检查。这是 [`rnix check`](#rnix-check)（聚焦 MCP 等子系统前置条件）的 LLM provider 对应物。它报告 cwd、命令可达性、认证模式，并在带 `--probe` 时对每个 provider 触发一次 live `"Respond with hello."` 探测。报告 `pass` / `warn` / `fail` 状态。

```
用法：rnix doctor [--probe] [--provider <name>] [--json]
```

| 标志 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `--probe` | `bool` | `false` | 对每个 provider 运行 live hello 探测（少量 token 用量；计费） |
| `--provider` | `string` | `""` | 仅检查指定名称的 provider（匹配 `providers.yaml`） |
| `--json` | `bool` | `false` | 机器可读输出 |

**示例：**

```bash
rnix doctor                    # 仅静态检查
rnix doctor --probe            # 包含 live hello 探测（计费）
rnix doctor --provider claude  # 检查单个 provider
rnix doctor --json             # 机器可读输出
```

---

### 4.37 rnix gc — 回收进程数据 {#rnix-gc}

删除 `.rnix/data/steps/<uuid>/` 下超出当前保留策略（`~/.config/rnix/config.yaml` 中的 `gc.retention_days` / `gc.max_entries`）的已终止进程数据。Running 和 Suspended 进程**永不**参与回收——gc 不会杀掉运行中的工作。批量操作（候选超过 100）会提示确认，除非提供 `--force` 或 `--json`。

```
用法：rnix gc [--dry-run] [--force] [--json]
```

| 标志 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `--dry-run` | `bool` | `false` | 预览候选而不删除 |
| `--force` | `bool` | `false` | 跳过批量删除（>100 条）的确认 |
| `--json` | `bool` | `false` | 输出 JSON（隐含 `--force`） |

**示例：**

```bash
rnix gc --dry-run        # 预览候选而不删除
rnix gc                  # 交互式清理
rnix gc --force          # 跳过确认
rnix gc --json           # 机器可读输出（隐含 --force）
```

---


### 9.1 rnix top — 实时进程监控

```
用法: rnix top
```

TUI 实时显示进程树状关系、状态、token 消耗和执行进度。支持交互操作（kill、strace、详情查看）。

### 9.2 rnix log — 推理日志

```
用法: rnix log <pid> [--filter <category>]
类别: think | tool | output
```

按 `[think]`/`[tool]`/`[output]` 三段式分类显示推理日志。

### 9.3 rnix compose — 多智能体编排

```
用法: rnix compose up [--json]
      rnix compose down
```

`up` 按 `compose.yaml` 启动 DAG 工作流。`down` 终止所有进程并清理资源。

### 9.4 rnix skill — Skill 包管理

```
用法: rnix skill install <name>
      rnix skill search <keyword>
      rnix skill update [name]
      rnix skill list
```

### 9.5 rnix gdb — 交互式调试

```
用法: rnix gdb <pid>
```

GDB 风格交互式调试器，支持断点（syscall/reasoning/quality/budget）、单步执行、状态检查和运行时参数热修改。

子命令：`break`、`continue`、`step`、`inspect`、`set`、`detach`

### 9.6 rnix record / replay — 时间旅行调试

```
用法: rnix record start|stop <pid>
      rnix record list
      rnix replay <record-id>
```

完整执行录制（syscall + LLM 调用 + 上下文快照）。回放支持正向/反向导航、上下文 diff、fork-continue 分支探索。

### 9.7 rnix trace / blame — 分布式追踪

```
用法: rnix trace <trace-id>
      rnix trace blame <trace-id>
```

跨进程因果链追踪。`blame` 自动分析耗时最长、token 最高或出错的关键路径。

### 9.8 rnix ctx-profile — 上下文分析

```
用法: rnix ctx-profile <pid>
```

分析上下文使用情况：活跃/温/冷/泄漏分类、最大消费者识别、增长趋势预测。

### 9.9 rnix agtest — 推理回归测试

```
用法: rnix agtest <file-or-dir> [--dry-run] [--timeout <ms>] [--json] [--verbose]
```

声明式 YAML 测试用例，三种断言类型（reasoning/syscall/quality），支持批量运行和 CI 集成。

### 9.10 rnix dashboard — 可视化调试面板

```
用法: rnix dashboard [--replay <record-id>]
```

多窗格 TUI：智能体树、追踪时间线、上下文热力图。支持离线回放。

### 9.11 rnix intent — 声明式意图

```
用法: rnix intent status
      rnix intent list
```

LLM 驱动的意图分解 + Reconciler 持续调和。`status` / `list` 查看意图状态。声明新意图请使用顶层 `rnix apply "<description>"`（见 §4.22）。

### 9.12 rnix serve — LLM 网关

```
用法: rnix serve [--port <port>]
默认: localhost:8080
```

OpenAI 兼容 HTTP 服务器。端点：`/v1/chat/completions`（同步 + SSE 流式）、`/v1/models`。model 参数支持 `provider:model` 复合格式路由。

### 9.14 rnix immune — 安全监控

```
用法: rnix immune status
```

显示 Immune Daemon 状态：监控进程数、活跃告警、已挂起进程、威胁记忆库条目。

### 9.15 rnix reputation — 声誉系统

```
用法: rnix reputation [agent-name]
```

查看 Agent 模板的历史表现：成功率、token 效率、SLA 达标率、声誉评分。

### 9.16 rnix lineage — 分化谱系

```
用法: rnix lineage <pid>
```

查看干细胞智能体的完整分化路径：基底 → 自动匹配的 Skill → 运行时加载的 Skill。

### 9.17 rnix topology — 协作拓扑

```
用法: rnix topology
```

显示智能体协作拓扑图：协作频率、能力重叠度、强化路径。

### 9.18 rnix synergy — Skill 协同

```
用法: rnix synergy list
```

显示已知有效的 Skill 组合及其历史表现提升数据。

### 9.19 rnix run — AgentShell 脚本

```
用法: rnix run <script.ash>
```

执行 AgentShell 脚本文件。支持 shebang `#!/usr/bin/env rnix run`。

### 9.20 rnix config — 配置管理

```
用法: rnix config show
```

显示活跃的特性档案和各项 flag。连接 daemon 获取实时状态；daemon 未运行时回退读取配置文件。

---

### 9.21 rnix mcp — MCP 服务器检查

```
用法：rnix mcp list | test <name> | logs <name>
```

检查 daemon 上的 MCP 挂载：`list` 列出活动挂载、`test` 对已配置服务器做 4 阶段探测、或 `logs` 查看服务器捕获的 stderr。详见 [§4.34](#rnix-mcp)。

---

### 9.22 rnix check — 子系统诊断

```
用法：rnix check mcp
```

验证某子系统的主机前置条件（`mcp`：node、npx、可选 Chromium）。报告 `pass` / `warn` / `fail`。详见 [§4.35](#rnix-check)。

---

## 10. VFS 路径扩展

### 10.1 /dev/llm/* — 多 Provider 设备

通过 `providers.yaml` 动态注册。每个 provider 一个 VFS 路径：

| 路径 | 驱动类型 | 说明 |
|------|---------|------|
| `/dev/llm/claude` | CLI | Claude Code CLI |
| `/dev/llm/cursor` | CLI | Cursor CLI |
| `/dev/llm/qwen` | CLI | Qwen Code CLI |
| `/dev/llm/ollama` | HTTP API | Ollama (本地) |
| `/dev/llm/groq` | HTTP API | Groq Cloud |
| `/dev/llm/deepseek` | HTTP API | DeepSeek API |
| `/dev/llm/gemini` | 原生 API | Google Gemini |
| `/dev/llm/openai` | 官方 SDK | OpenAI GPT-4/GPT-4o |
| `/dev/llm/anthropic-api` | 官方 SDK | Anthropic Claude (API) |
| `/dev/llm/<custom>` | HTTP API | 任意 OpenAI 兼容 API |

### 10.2 /mnt/mcp/* — MCP 挂载点

Spawn 时自动挂载，格式 `/mnt/mcp/{pid}-{serverName}`。子路径映射到 MCP 协议操作（详见 §2 VFS 路径规范中的 MCP 子路径表）。

---

## 11. 扩展类型参考

### 11.1 Signal 完整定义（Phase 2 更新）

| 常量 | 值 | 说明 |
|------|-----|------|
| `SIGTERM` | `1` | 终止信号（优雅关闭） |
| `SIGKILL` | `2` | 强制杀死 |
| `SIGINT` | `3` | 中断信号 |
| `SIGPAUSE` | `4` | 暂停推理循环 |
| `SIGRESUME` | `5` | 恢复推理循环 |

### 11.2 统一推理循环

单一 `reasonStep` 循环，LLM 每步自主选择 ActionType：tool_call、plan、spawn、complete、specialize、replan、text。`planning: true/false`（默认 true）配置是否注入 plan 指引。内置熔断机制：连续 3 次 tool_call/spawn 失败自动终止。

### 11.3 ExitStatus 退出码约定（完整）

| Code | Reason | 说明 |
|------|--------|------|
| `0` | `"completed"` | 正常完成 |
| `1` | `"unexpected exit"` | 意外退出 |
| `1` | `"max steps exceeded"` | 超过最大推理步数 |
| `1` | 错误描述 | 推理过程中出错 |
| `2` | `"budget_exhausted"` | 累计 token 预算超限（`max_tokens`），自暂停 |
| `2` | `"max_turns_reached"` | 超过最大推理轮次，自暂停 |
| `2` | `"loop_detected"` | 检测到重复动作循环，自暂停 |
| `2` | `"user_suspended"` | 用户发起的暂停（SIGPAUSE） |
| `3` | `"context_full"` | 单步输入 token 超过 `context_budget`，自暂停（可通过 resume 恢复） |
