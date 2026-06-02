# 调试（strace 与 gdb）

Rnix 提供了一套受 Unix 和 GDB 启发的全面调试工具包，支持在 syscall 级别深度检视 AI 智能体的行为。

---

## strace — 系统调用追踪

实时追踪智能体的每一次 syscall，可在任意终端执行。

```bash
$ rnix strace <pid>
[strace] attached to PID 1 (state: running)
[  0.013s] Open(path="/dev/llm/claude") → 3    1ms
[  0.014s] Write(fd=3, size=1234) → <nil>    5.20s  ← LLM call
[  5.214s] Read(fd=3, length=65536) → 892B    2ms
[  5.216s] Open(path="/dev/fs/./src/main.go") → 4    1ms
[  5.217s] Write(fd=4, size=56) → <nil>    0µs
[  5.217s] Read(fd=4, length=1048576) → 2048    1ms
[  5.218s] Close(fd=4) → <nil>    0µs
[strace] detached from PID 1 (process exited)
```

**主要特性：**
- 跨终端附加 — 在任意终端追踪任意进程
- 自动标注 — `/dev/llm/` 操作标注 `← LLM call`，超过 1 秒的操作标注 `← slow operation`
- 非阻塞 — 事件缓冲区（256）满时静默丢弃，不会阻塞智能体
- 三种输出模式：默认（格式化）、`--verbose`（完整参数）、`--json`（机器可读）
- SIGINT 仅分离追踪，不影响被追踪的进程

---

## gdb — 交互式调试器

附加到运行中的智能体，进行断点、单步执行和运行时状态检视的交互式调试。

### 附加 / 分离

```bash
$ rnix gdb <pid>
[gdb] attached to PID 1 (state: running, step 3/10)
(rnix-gdb) help
  break <type> [args]  - Set breakpoint
  continue             - Resume execution
  step [syscall|reason] - Step forward
  inspect <target>     - Inspect state
  set <target> <value> - Modify runtime parameter
  detach               - Detach and resume
(rnix-gdb)
```

分离后智能体将继续正常运行。

### 断点类型

四种断点类型覆盖不同的调试场景：

| 类型 | 语法 | 触发条件 |
|------|------|---------|
| **Syscall** | `break syscall Open` | 当特定 syscall 被调用时 |
| **Reasoning** | `break reason` | 在每次 LLM 调用之前 |
| **Quality** | `break quality "must contain code examples"` | 当输出未通过质量检查时 |
| **Budget** | `break budget 5000` | 当 token 消耗达到阈值时 |

**Quality 断点** 支持两种评估模式：
- **模式匹配** — 输出必须包含/不包含的关键词或正则表达式
- **LLM 评估** — 由轻量模型（haiku）评估自然语言质量标准，不满足时触发

```
(rnix-gdb) break syscall Write
Breakpoint 1 set: syscall Write
(rnix-gdb) break quality "output must include error handling recommendations"
Breakpoint 2 set: quality (LLM-evaluated)
(rnix-gdb) continue
[breakpoint 1] Write(fd=3, size=2048) at step 4
(rnix-gdb)
```

### 单步执行

逐个 syscall 或逐个推理步骤执行智能体：

```
(rnix-gdb) step syscall
[step] Open(path="/dev/fs/./main.go") → FD(4)    1ms
(rnix-gdb) step reason
[step] Reasoning step 5/10 complete (tokens: 342)
```

### 状态检视

检视智能体运行时状态的任何方面：

```
(rnix-gdb) inspect context
SystemPrompt: "You are a code analyst..."  (1,245 tokens)
Messages: 8 entries (user: 3, assistant: 3, tool: 2)
Total tokens: 4,567 / budget: 8,192

(rnix-gdb) inspect fds
FD  Path                  Flags
3   /dev/llm/claude       O_RDWR
4   /dev/fs/./src/main.go O_RDWR

(rnix-gdb) inspect skills
Skills: [code-analysis, security-scan]
AllowedDevices: [/dev/fs, /dev/shell, /dev/llm/claude]
```

### 热修改

无需重启智能体即可修改运行时参数：

```
(rnix-gdb) set model opus
Model changed: sonnet → opus (effective next LLM call)

(rnix-gdb) set context.system_prompt "Updated instructions..."
System prompt updated (effective next reasoning step)

(rnix-gdb) set budget 10000
Budget changed: 8192 → 10000
```

可修改的参数包括：model、系统提示词、上下文消息、Skill 引用、环境变量、token 预算。修改在下一个推理步骤生效。

---

## 脚本运行器可观测性

当智能体执行 AgentShell 脚本（`.ash` 文件）时，Rnix 会将结构化事件写入 `events.jsonl`，提供对脚本执行流程的完整可见性。

### 事件文件

脚本事件以 NDJSON（按行分隔的 JSON）格式写入：

```
.rnix/data/steps/<process-uuid>/events.jsonl
```

每行是一个自包含的 JSON 对象，写入后立即刷新以支持实时可用。

### 事件类型

| 事件 | 触发时机 | 用途 |
|------|---------|------|
| `ScriptStmtBegin` | 每个语句入口处 | 标记语句开始（while、spawn、if、pipeline、export 等） |
| `ScriptStmtEnd` | 每个语句退出处 | 标记完成状态（成功/错误/停止） |
| `ScriptSpawn` | `spawn` 执行前 | 捕获智能体生成意图 |
| `ScriptWhileIter` | 每次 while 循环迭代 | 追踪迭代次数（从 1 开始） |
| `ScriptCondition` | `if`/`while` 条件求值后 | 记录条件结果（true/false）和操作数值 |

### 事件结构

```json
{
  "ts_ms": 1050.5,
  "pid": 12345,
  "syscall": "ScriptWhileIter",
  "args": {
    "line": 12,
    "iteration": 1,
    "condition": "$N != 5"
  },
  "dur_ms": 0,
  "trace_id": "",
  "span_id": ""
}
```

| 字段 | 描述 |
|------|------|
| `ts_ms` | 从进程启动算起的毫秒数 |
| `pid` | 进程 ID |
| `syscall` | 事件类型（5 种 Script* 类型之一） |
| `args` | 事件特定的元数据 — 始终包含 `line`（基于 1 的源代码行号） |
| `dur_ms` | 脚本事件始终为 `0` |

### 仪表盘集成

仪表盘的 Timeline 面板实时渲染带格式化摘要的脚本事件：

```
L12 ▸ while                          (语句开始)
L12 ↻ while iter=1 ($N != 5)        (循环迭代)
L12 ? $N != 5 → T                   (条件求值为 true)
L47 ↳ spawn "build hello" → $r      (智能体生成)
L47 ✓ spawn                         (语句完成)
```

事件每约 500ms 通过 IPC 获取并使用每 UUID 水位线进行去重。三个或更多连续的同类型事件会被折叠为可展开的分组，保持时间线的可读性。

### 查看事件

可通过以下方式消费事件：

1. **仪表盘** — Timeline 面板的实时格式化显示与聚合
2. **IPC** — `list_events` 方法返回指定进程的所有事件（按 PID 或 UUID）
3. **直接文件访问** — 从 `.rnix/data/steps/<uuid>/` 读取 `events.jsonl`

---

## 相关文档

- [时间旅行调试](/zh/guide/time-travel) — 录制、回放与分叉继续
- [分布式追踪](/zh/guide/distributed-tracing) — 跨进程因果追踪
- [可视化仪表盘](/zh/guide/dashboard) — 多面板 TUI 调试
- [回归测试](/zh/guide/testing) — 自动化行为测试
- [参考手册](/zh/reference/) — 完整的 syscall 和 CLI 命令详情
