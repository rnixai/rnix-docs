# IPC 与并发

Rnix 提供 Unix 风格的进程间通信（IPC）和三级并发模型，用于多智能体协作。

---

## 消息传递 — Send / Recv

智能体可以通过 PID 向其他进程发送类型化消息：

```go
// 向 PID 2 发送消息
kern.Send(senderPID, targetPID, data)

// 阻塞接收下一条消息
msg, err := kern.Recv(pid)
```

消息通过带缓冲的 channel 按进程排队。`Recv` 阻塞直到收到消息或队列关闭（进程退出时）。

---

## 管道

将一个智能体的输出直接连接到另一个智能体的输入：

```go
writeFD, readFD, err := kern.Pipe(writerPID, readerPID)
```

在 AgentShell 中，管道语法更加简洁：

```bash
spawn "Analyze code" --agent=analyst | spawn "Generate docs"
```

`|` 运算符创建一个管道，第一个智能体的输出成为第二个智能体的 `[PIPE_INPUT]` 上下文。

---

## 进程组

将多个进程分组以进行批量操作：

```go
kern.JoinGroup(pid, groupID)      // 加入组
kern.LeaveGroup(pid, groupID)     // 离开组
pids, _ := kern.GetProcGroup(gid) // 列出成员
kern.SignalGroup(groupID, signal)  // 向所有成员广播信号
```

进程组被 Compose 编排用于批量控制——例如通过一次 `SignalGroup` 调用终止工作流中的所有智能体。

---

## 信号系统

五种信号，支持可配置的处理方式：

| 信号 | 值 | 可阻塞 | 自定义处理器 | 默认行为 |
|------|-----|--------|-------------|---------|
| `SIGTERM` | 1 | 是 | 是 | 取消 context |
| `SIGKILL` | 2 | 否 | 否 | 强制取消 |
| `SIGINT` | 3 | 是 | 是 | 取消 context |
| `SIGPAUSE` | 4 | 是 | 是 | 暂停推理循环 |
| `SIGRESUME` | 5 | 是 | 是 | 恢复推理循环 |

```go
// 发送信号
kern.Signal(pid, types.SIGPAUSE)

// 阻塞/解除阻塞信号
kern.SigBlock(pid, types.SIGTERM)
kern.SigUnblock(pid, types.SIGTERM)  // 投递待处理的信号
```

**SIGPAUSE/SIGRESUME**：推理循环在每步开始时调用 `WaitIfPaused()`。暂停后，智能体阻塞直到收到 SIGRESUME。`pausedAt` 时间戳被记录，Dashboard 将 elapsed 计时器冻结在 `PausedAt - CreatedAt`。心跳监控器跳过暂停的进程，避免误判为卡死。

信号投递使用 `resolveSignalDisposition` 在单次锁持有内原子性地确定分发路径（阻塞 → 待处理 / 自定义处理器 / 默认），防止 TOCTOU 竞态。

### SignalTree

`SignalTree(pid, signal)` 递归地向目标进程及其所有存活后代发送信号，跳过 zombie/dead 进程。返回受影响的进程数。

```go
affected, err := kern.SignalTree(pid, types.SIGPAUSE)  // 暂停整个子树
affected, err := kern.SignalTree(pid, types.SIGRESUME)  // 恢复整个子树
```

Dashboard 的 `p` 键使用此功能实现树级暂停/恢复切换。IPC 方法 `signal_tree` 将此能力暴露为可供客户端调用的操作。

---

## 三级并发模型

| 级别 | 原语 | 调度方式 | 隔离性 | 使用场景 |
|------|------|---------|--------|---------|
| **Process** | `Spawn` | 抢占式（独立 goroutine + context） | 独立 PID、CtxID、FD 表 | 独立任务 |
| **Thread** | `SpawnThread` | 抢占式（独立 goroutine，共享父 context） | 共享父进程上下文 | 并行子任务 |
| **Coroutine** | `SpawnCoroutine` | 协作式（yield/resume） | 共享父进程上下文 | 流式处理、状态机 |

### Thread

Thread 共享父进程的上下文，但在自己的 goroutine 中运行：

```go
tid, err := proc.SpawnThread("Analyze security", func(t *Thread) {
    // 并行运行，共享父进程的 CtxID
    // 父进程 Kill 会取消子线程的 context
})
```

- 通过 `context.WithCancel(parentCtx)` 派生 context——父进程 Kill 级联传播
- 每个 Thread 有自己的 TID、状态和 Done channel
- `ClearThreads()` 在回收时取消所有 Thread 并等待完成

### Coroutine

Coroutine 使用协作式调度，通过显式的 yield/resume 切换：

```go
coid, err := proc.SpawnCoroutine("Stream processor", func(co *Coroutine) {
    for item := range items {
        result := process(item)
        co.Yield(result)  // yield 值并挂起
    }
})

// 恢复并获取 yield 的值
value, err := proc.ResumeCoroutine(coid)
```

- 使用 channel 对（`yieldCh`/`resumeCh`）传递值
- ClearCoroutines 处理两种阻塞状态（排空 yieldCh，关闭 resumeCh）

---

## 相关文档

- [核心概念](/zh/guide/concepts) — 进程模型与 VFS 基础
- [Compose 编排](/zh/guide/compose) — 多智能体 DAG 工作流
- [架构](/zh/guide/architecture) — 内核内部与进程模型
- [参考手册](/zh/reference/) — 完整的 IPC syscall 签名
