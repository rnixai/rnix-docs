## 7. 进程模型参考

### 7.1 ProcessState 状态机

```
Created ──→ Running ──→ Zombie ──→ Dead
   │           │           │
   │  Start()  │ Terminate │  Reap()
   │  开始推理  │ 完成/错误  │  Wait 回收
   │           │ /超时/Kill │  资源释放
```

| 常量 | 值 | 字符串表示 | 说明 |
|------|-----|---------|------|
| `StateCreated` | `0` | `"created"` | 进程对象已分配，推理未开始 |
| `StateRunning` | `1` | `"running"` | 推理循环执行中 |
| `StateZombie` | `2` | `"zombie"` | 推理已结束，等待资源回收 |
| `StateDead` | `3` | `"dead"` | 所有资源已释放 |

### 7.2 状态转移规则

**合法转移：**

| 起始状态 | 目标状态 | 触发条件 |
|---------|---------|---------|
| Created | Running | `Start()` — 推理 goroutine 启动 |
| Running | Zombie | `Terminate()` — 完成/错误/超时/Kill |
| Zombie | Dead | `Reap()` — Wait 回收 |

**非法转移：** 所有其他组合均为非法。尝试非法转移返回 `*SyscallError`（`INTERNAL`）。

`StateDead` 没有合法的后续状态。

### 7.3 ExitStatus 结构

```go
type ExitStatus struct {
    Code   int    // 0 = 正常退出，非零 = 异常
    Reason string // 人类可读的退出原因
    Err    error  // 底层错误（正常退出时为 nil）
}
```

**常见退出原因：**

| Code | Reason | 说明 |
|------|--------|------|
| `0` | `"completed"` | 正常完成 |
| `1` | `"unexpected exit"` | 意外退出 |
| `1` | `"max steps exceeded"` | 超过最大推理步数 |
| `1` | 错误描述 | 推理过程中出错 |
| `2` | `"budget_exceeded"` | Token 预算超限 |

### 7.4 资源释放顺序

`reapProcess` 按以下严格顺序执行资源释放（通过 `sync.Once` 保证幂等）：

| 步骤 | 操作 | 说明 |
|------|------|------|
| 0 | `handleOrphanChildren` | 处理孤儿子进程：Running 子进程 reparent 到 PID 0；Zombie 子进程推入 reapCh |
| 1 | `Cancel()` | 取消进程 context（幂等） |
| 2 | `wg.Wait()` | 等待推理 goroutine 完成（goroutine 内部 defer 执行 `CloseAll` 关闭所有 FD） |
| 3 | `close(DebugChan)` | 先将 `proc.DebugChan` 置 `nil`（持锁），然后关闭 channel |
| 4 | `CtxFree(CtxID)` | 释放上下文空间 |
| 5 | `Reap()` | 状态转移 Zombie → Dead |
| 6 | `RemoveProcess(pid)` | 从进程表中移除 |

### 7.5 Signal 定义

| 常量 | 值 | 说明 |
|------|-----|------|
| `SIGTERM` | `1` | 终止信号（优雅关闭） |
| `SIGKILL` | `2` | 强制杀死 |

**有效性检查：** `Signal.Valid()` 方法检查信号值是否为 SIGTERM 或 SIGKILL。

**Kill 行为：** 调用 `proc.Cancel()` 取消 context，导致推理 goroutine 中的 LLM 调用被中断。`SIGPAUSE` 暂停推理循环；`SIGRESUME` 恢复已暂停的循环。

---

