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

## 相关文档

- [时间旅行调试](/zh/guide/time-travel) — 录制、回放与分叉继续
- [分布式追踪](/zh/guide/distributed-tracing) — 跨进程因果追踪
- [可视化仪表盘](/zh/guide/dashboard) — 多面板 TUI 调试
- [回归测试](/zh/guide/testing) — 自动化行为测试
- [参考手册](/zh/reference/) — 完整的 syscall 和 CLI 命令详情
