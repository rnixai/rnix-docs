# Rnix 参考手册

本手册是 Rnix 的权威技术参考，面向使用 Rnix 编写 Agent/Skill 或调试问题的开发者。文档中所有签名、参数、返回值、路径和协议均精确匹配当前代码实现。

> 如需了解 Rnix 的设计哲学和核心概念，请参阅 [核心概念文档](/zh/guide/concepts)。
> 如需快速安装和首次运行指引，请参阅 [快速上手指南](/zh/guide/quick-start)。

---

## 章节

| 编号 | 章节 | 说明 |
|------|------|------|
| 1 | [Syscall 参考](/zh/reference/syscalls) | 全部 45 个内核 syscall — ProcessManager、ContextManager、FileSystem、Debugger、IPC、Signal、Supervisor |
| 2 | [VFS 路径规范](/zh/reference/vfs) | 设备路径、VFSFile 接口、FD 分配、/dev/llm、/dev/fs、/dev/shell、/proc |
| 3 | [Agent 与 Skill 清单](/zh/reference/agents-skills) | agent.yaml、SKILL.md 格式、渐进式加载、字段定义 |
| 4 | [CLI 命令参考](/zh/reference/cli) | 全部 CLI 命令 — spawn、ps、kill、strace、gdb、dashboard、compose、intent、skill、serve |
| 5 | [IPC 架构](/zh/reference/ipc) | Daemon 生命周期、NDJSON 协议、Method 枚举、流式传输、连接复用 |
| 6 | [错误处理](/zh/reference/errors) | ErrCode 枚举、SyscallError、VFSError、DriverError、ContextError、基础类型 |
| 7 | [进程模型](/zh/reference/process-model) | 状态机、状态转移、ExitStatus、资源释放、Signal 定义 |

---

## 快速参考

### 进程生命周期

```
Created ──Start()──→ Running ──Terminate()──→ Zombie ──Reap()──→ Dead
```

### VFS 设备路径

| 路径 | 用途 |
|------|------|
| `/dev/llm/claude` | Claude Code CLI |
| `/dev/llm/cursor` | Cursor CLI |
| `/dev/llm/<provider>` | OpenAI 兼容 API |
| `/dev/fs` | 宿主文件系统 |
| `/dev/shell` | Shell 执行 |
| `/proc/{pid}/` | 进程运行时信息 |

### 常用 CLI 命令

```bash
rnix -i "意图"                    # 运行智能体
rnix -i "意图" --agent=名称       # 使用命名 Agent
rnix ps                           # 列出进程
rnix strace <pid>                 # 追踪 syscall
rnix gdb <pid>                    # 交互式调试器
rnix top                          # 实时进程监控
```
