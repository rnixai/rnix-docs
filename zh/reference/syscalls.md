## 1. Syscall 参考

### 1.1 概述

Rnix 的内核接口按多个功能分类组织，共定义 46 个 syscall：

| 功能分类 | Syscall 数量 | 职责 |
|---------|-------------|------|
| 进程管理（ProcessManager） | 5 | 进程创建、终止、等待、查询 |
| 上下文管理（ContextManager） | 5 | 上下文空间分配、读写、释放、压缩 |
| 文件系统（FileSystem） | 5 | VFS 设备的打开、读写、关闭、元数据查询 |
| 调试（Debugger） | 1 | Syscall 事件的自动记录与追踪 |
| IPC（Send、Recv、Pipe 等） | 10 | 进程间消息传递与管道 |
| 信号与能力（Signal & Capability） | 10 | 信号处理、能力授予/撤销/检查 |
| 监督者与初始化（Supervisor & Init） | 10 | 监督者树、init 引导 |

所有 syscall 在出错时返回结构化的 `*SyscallError`（见 [6.2 SyscallError](#62-syscallerror)），包含 syscall 名称、PID、设备路径、底层错误和分类错误码。

所有 syscall 的入口和出口会自动记录 `SyscallEvent` 到进程的 `DebugChan`（见 [1.5 调试](#15-调试debugger)）。

### 1.2 进程管理（ProcessManager）

#### Spawn

创建并启动一个智能体进程，自动进入推理循环。

```
签名: Spawn(intent string, agent *agents.AgentInfo, opts SpawnOpts) (PID, error)
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `intent` | `string` | 用户意图字符串 |
| `agent` | `*agents.AgentInfo` | Agent 定义（可选，`nil` 表示通用模式） |
| `opts` | `SpawnOpts` | 配置选项（见下表） |

**SpawnOpts 字段：**

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `Model` | `string` | `""` | LLM 模型名称（优先级：CLI > Agent manifest > 驱动默认） |
| `SystemPrompt` | `string` | `""` | 系统提示词（非空时追加到 Agent instructions 之后） |
| `MaxTurns` | `int` | `0` | 最大推理步数（`0` = 使用默认值 `DefaultMaxSteps=10`） |
| `MaxTokens` | `int` | `0` | 最大总 token 数（`0` = 不限制） |
| `TimeoutMs` | `int64` | `0` | 超时毫秒数 |
| `ParentPID` | `PID` | `0` | 父进程 PID（`0` = 顶层 CLI 级 spawn） |

**返回值：** `(PID, error)`

**错误码：**

| 错误码 | 触发条件 |
|--------|---------|
| `NOT_FOUND` | 父进程不存在（`ParentPID > 0` 但查找失败） |
| `INTERNAL` | 上下文分配失败或系统提示词设置失败 |
| `DRIVER` | LLM 设备 `/dev/llm/claude` 打开失败 |

**行为：**

1. 创建 `Process`（分配 PID，记录 Skills、AllowedDevices）
2. 维护父子关系（`ParentPID > 0` 时注册到父进程 Children 列表）
3. 聚合 Agent 的 `SystemPrompt()` 和 `AllowedTools()`
4. `CtxAlloc(64)` → 分配上下文空间
5. `SetSystemPrompt` + `AppendMessage(user, intent)` → 初始化上下文
6. `Open("/dev/llm/claude", O_RDWR)` → 获取 LLM 设备 FD
7. 启动 goroutine → `Created → Running` → 进入 `reasonStep` 循环
8. 触发 `OnSpawn` 回调通知（包含解析后的 provider 和 model）

**示例：**

```go
pid, err := kern.Spawn("分析代码", agentInfo, kernel.SpawnOpts{
    Model:    "sonnet",
    MaxTurns: 5,
})
```

---

#### Kill

向目标进程发送终止信号。

```
签名: Kill(pid PID, signal Signal) error
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `pid` | `PID` | 目标进程 ID |
| `signal` | `Signal` | `SIGTERM(1)`、`SIGKILL(2)`、`SIGINT(3)`、`SIGPAUSE(4)` 或 `SIGRESUME(5)` |

**返回值：** `error`

**错误码：**

| 错误码 | 触发条件 |
|--------|---------|
| `NOT_FOUND` | 进程不存在 |
| `INVALID` | 无效信号值（非 SIGTERM 或 SIGKILL） |

**幂等性：** Kill 已处于 Zombie 或 Dead 状态的进程为 no-op，不返回错误。

**行为：** 调用进程的 `Cancel()` 取消 context，导致推理 goroutine 中的 LLM 调用被中断。

**示例：**

```go
err := kern.Kill(1, types.SIGTERM)
```

---

#### Wait

阻塞等待目标进程进入 Zombie 状态，然后执行完整的资源释放序列。

```
签名: Wait(pid PID) (ExitStatus, error)
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `pid` | `PID` | 目标进程 ID |

**返回值：** `(ExitStatus, error)`

`ExitStatus` 结构：

| 字段 | 类型 | 说明 |
|------|------|------|
| `Code` | `int` | 退出码（`0` = 正常，非零 = 异常） |
| `Reason` | `string` | 人类可读的退出原因 |
| `Err` | `error` | 底层错误（正常退出时为 `nil`） |

**错误码：**

| 错误码 | 触发条件 |
|--------|---------|
| `NOT_FOUND` | 进程不存在 |

**行为：** 阻塞读取 `proc.Done` 通道，收到退出状态后触发 `reapProcess`（资源释放序列，见 [7.4 资源释放顺序](#74-资源释放顺序)）。`reapProcess` 通过 `sync.Once` 保证幂等——即使 Wait 和后台 reaper 并发调用也只执行一次。

**示例：**

```go
exit, err := kern.Wait(1)
fmt.Printf("exit code: %d, reason: %s\n", exit.Code, exit.Reason)
```

---

#### ListProcs

返回所有进程的快照列表。

```
签名: ListProcs() []ProcInfo
```

**参数：** 无

**返回值：** `[]ProcInfo`

**ProcInfo 结构：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `PID` | `PID` | 进程 ID |
| `PPID` | `PID` | 父进程 ID |
| `State` | `ProcessState` | 进程状态 |
| `Intent` | `string` | 用户意图 |
| `Skills` | `[]string` | Skill 名称列表 |
| `TokensUsed` | `int` | 累计 token 消耗 |
| `CreatedAt` | `time.Time` | 创建时间 |
| `CtxID` | `CtxID` | 上下文 ID |
| `Result` | `string` | 最终输出结果 |
| `AllowedDevices` | `[]string` | 设备权限白名单 |
| `Provider` | `string` | 解析后的 LLM 提供商名称 |
| `Model` | `string` | 解析后的模型名称 |

**行为：** 遍历进程表，对每个进程加锁读取快照。返回值是值拷贝，不包含对进程对象的引用。

**示例：**

```go
procs := kern.ListProcs()
for _, p := range procs {
    fmt.Printf("PID %d: %s (%s)\n", p.PID, p.Intent, p.State)
}
```

---

#### GetPID

获取当前进程 PID，类似 Unix 的 `getpid(2)` 系统调用。

```
签名: Process.GetPID() PID
```

**返回值：** 调用者自身的进程 PID（`types.PID`）。

**行为：** 作为 `Process` 的方法实现（而非 `ProcessManager` 接口方法），因为 PID 是进程自身的不可变属性。PID 在创建后不会改变，因此无需加锁。

---

### 1.3 上下文管理（ContextManager）

#### CtxAlloc

分配一个新的上下文空间。

```
签名: CtxAlloc(size int) (CtxID, error)
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `size` | `int` | 最大消息数量 |

**返回值：** `(CtxID, error)`

**默认值：** `DefaultCtxSize = 64`

**错误码：**

| 错误码 | 触发条件 |
|--------|---------|
| `INTERNAL` | `size <= 0` |

**行为：** 分配全局递增的 `CtxID`，创建空的 `Context` 对象（`Messages` 为空切片，`MaxSize` 为指定值）。

**示例：**

```go
cid, err := ctxMgr.CtxAlloc(64)
```

---

#### CtxRead

读取上下文内容。

```
签名: CtxRead(cid CtxID, offset int, length int) ([]byte, error)
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `cid` | `CtxID` | 上下文 ID |
| `offset` | `int` | 消息起始索引（0-based） |
| `length` | `int` | 读取消息数量 |

**特殊用法：** `offset=0, length=0` 读取全部内容。

**返回值：** `([]byte, error)` — JSON 序列化的上下文

**返回格式：**

```json
{
  "system_prompt": "...",
  "messages": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ]
}
```

**错误码：**

| 错误码 | 触发条件 |
|--------|---------|
| `NOT_FOUND` | 上下文不存在 |
| `INTERNAL` | JSON 序列化失败 |

**示例：**

```go
data, err := ctxMgr.CtxRead(cid, 0, 0) // 读取全部
```

---

#### CtxWrite

向上下文写入消息。

```
签名: CtxWrite(cid CtxID, offset int, data []byte) error
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `cid` | `CtxID` | 上下文 ID |
| `offset` | `int` | `0` = 追加新消息；`1..N` = 覆写第 `offset` 个消息（1-based 索引，对应 `Messages[offset-1]`） |
| `data` | `[]byte` | JSON 序列化的 `Message` |

**Message 格式：**

```json
{"role": "system|user|assistant|tool", "content": "...", "tool_call_id": "..."}
```

**Role 枚举：** `system`、`user`、`assistant`、`tool`

**返回值：** `error`

**错误码：**

| 错误码 | 触发条件 |
|--------|---------|
| `NOT_FOUND` | 上下文不存在 |
| `INTERNAL` | JSON 解析失败、容量已满（`offset=0` 时）、offset 越界（`offset < 1` 或 `offset > len(Messages)`） |

**示例：**

```go
msg := `{"role": "user", "content": "分析代码"}`
err := ctxMgr.CtxWrite(cid, 0, []byte(msg)) // 追加消息
```

---

#### CtxFree

释放上下文空间。

```
签名: CtxFree(cid CtxID) error
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `cid` | `CtxID` | 上下文 ID |

**返回值：** `error`

**错误码：**

| 错误码 | 触发条件 |
|--------|---------|
| `NOT_FOUND` | 上下文不存在 |

**示例：**

```go
err := ctxMgr.CtxFree(cid)
```

---

#### CtxCompact

通过摘要历史消息来压缩上下文，释放 token 和消息槽容量。

```
签名: Compact(pid PID, instructions string) (CompactResponse, error)
```

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `pid` | `PID` | 目标进程 ID |
| `instructions` | `string` | 可选的自定义摘要 LLM 指令（空值 = 使用默认提示词） |

**返回值：** `(CompactResponse, error)`

**CompactResponse 结构：**

| 字段 | 类型 | 描述 |
|------|------|------|
| `PreTokens` | `int` | 压缩前的 token 数 |
| `PostTokens` | `int` | 压缩后的 token 数 |
| `Restored` | `[]string` | 压缩后恢复的上下文项列表（文件、Skill、计划） |

**触发方式：**

| 触发类型 | 条件 | 配置字段 |
|---------|-----------|-------------|
| `token_threshold` | Token 使用率超过阈值 | `CompactThreshold`（默认：`80.0`%） |
| `slot_threshold` | 消息槽使用率超过阈值 | `SlotCompactThreshold`（默认：`80.0`%） |
| `precompact` | 即将到来的工具调用结果没有足够的消息槽 | 自动 |
| `manual` | 通过 IPC `compact` 方法 | — |

**行为：**

1. 获取排他压缩锁（`TryLockCompact`）— 每个进程同一时间只能执行一次压缩
2. 在读锁下收集所有消息
3. 使用结构化的 9 段摘要提示词调用 LLM
4. 插入 `[compact_boundary]` 标记消息
5. 将 LLM 生成的摘要存储为新的对话基础
6. 恢复压缩后上下文：最近读取的文件（最多 5 个，总计 50K tokens）、活跃 Skill（最多 25K tokens）和当前计划

**配置：**

| 字段 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `CompactThreshold` | `float64` | `80.0` | 触发自动压缩的 token 使用率阈值 |
| `SlotCompactThreshold` | `float64` | `80.0` | 触发自动压缩的消息槽使用率阈值 |
| `CompactTimeout` | `duration` | `30s` | 压缩 LLM 调用的超时时间 |
| `BackpressureThreshold` | `float64` | `70.0` | 向上下文注入背压警告的消息槽使用率阈值 |

**特性标志：** Feature Profile 中的 `compaction: true` 启用自动压缩。

---

### 1.4 文件系统（FileSystem）

#### Open

打开 VFS 设备路径，返回文件描述符。

```
签名: Open(pid PID, path string, flags OpenFlag) (FD, error)
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `pid` | `PID` | 进程 ID |
| `path` | `string` | VFS 路径（如 `/dev/llm/claude`） |
| `flags` | `OpenFlag` | `O_RDONLY(0)`、`O_WRONLY(1)`、`O_RDWR(2)` |

**返回值：** `(FD, error)` — FD 从 3 开始递增

**路径匹配规则：**

1. **精确匹配** — 路径完全一致（如 `/dev/shell`）
2. **最长前缀匹配** — 选择最长前缀，剩余部分作为 subpath 传给设备工厂
   - 例：`/dev/fs/path/to/file` → 匹配 `/dev/fs`，subpath = `/path/to/file`

**错误码：**

| 错误码 | 触发条件 |
|--------|---------|
| `NOT_FOUND` | 设备不存在 |
| `DRIVER` | 设备工厂创建文件失败 |

**示例：**

```go
fd, err := v.Open(pid, "/dev/llm/claude", vfs.O_RDWR)
```

---

#### Read

从文件描述符读取数据。

```
签名: Read(pid PID, fd FD, length int) ([]byte, error)
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `pid` | `PID` | 进程 ID |
| `fd` | `FD` | 文件描述符 |
| `length` | `int` | 最大读取字节数 |

**返回值：** `([]byte, error)`

**错误码：**

| 错误码 | 触发条件 |
|--------|---------|
| `NOT_FOUND` | FD 无效（进程无 FDTable 或 FD 不存在） |
| `DRIVER` | 驱动读取失败 |

**示例：**

```go
data, err := v.Read(pid, fd, 65536)
```

---

#### Write

向文件描述符写入数据。

```
签名: Write(ctx context.Context, pid PID, fd FD, data []byte) error
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `ctx` | `context.Context` | 支持取消（Kill 信号中断 LLM 调用） |
| `pid` | `PID` | 进程 ID |
| `fd` | `FD` | 文件描述符 |
| `data` | `[]byte` | 写入数据 |

**返回值：** `error`

**错误码：**

| 错误码 | 触发条件 |
|--------|---------|
| `NOT_FOUND` | FD 无效 |
| `DRIVER` | 驱动写入失败 |

> `Write` 接受 `context.Context` 参数以支持 Kill 时中断正在进行的 LLM 调用。这是 VFS 中唯一需要 `ctx` 参数的操作。

**示例：**

```go
err := v.Write(ctx, pid, fd, []byte(`{"intent":"分析代码"}`))
```

---

#### Close

关闭文件描述符。

```
签名: Close(pid PID, fd FD) error
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `pid` | `PID` | 进程 ID |
| `fd` | `FD` | 文件描述符 |

**返回值：** `error`

**错误码：**

| 错误码 | 触发条件 |
|--------|---------|
| `NOT_FOUND` | FD 无效 |
| `DRIVER` | 驱动关闭失败 |

**行为：** 调用设备的 `Close()` 方法并从 FDTable 中原子移除 FD。

**示例：**

```go
err := v.Close(pid, fd)
```

---

#### Stat

查询路径元数据。

```
签名: Stat(path string) (FileStat, error)
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `path` | `string` | VFS 路径 |

**返回值：** `(FileStat, error)`

**FileStat 结构：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `Name` | `string` | 路径名称 |
| `Size` | `int64` | 文件大小 |
| `IsDevice` | `bool` | 是否为设备 |
| `DevicePath` | `string` | 匹配的设备注册路径 |

**错误码：**

| 错误码 | 触发条件 |
|--------|---------|
| `NOT_FOUND` | 设备不存在 |
| `DRIVER` | 元数据获取失败 |

**示例：**

```go
stat, err := v.Stat("/dev/llm/claude")
```

---

### 1.5 调试（Debugger）

#### SyscallEvent 自动记录

所有 syscall 的入口和出口会自动记录为 `SyscallEvent`，通过进程的 `DebugChan`（缓冲 256）传递。

**事件创建：**

```go
event := debug.NewEvent(pid, createdAt, syscall, args)
```

**事件完成：**

```go
debug.CompleteEvent(&event, result, err, duration)
```

**SyscallEvent 结构：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `Timestamp` | `time.Duration` | 相对于进程创建时间的偏移量 |
| `PID` | `PID` | 进程 ID |
| `Syscall` | `string` | 与接口方法名一致（`"Spawn"`、`"Open"`、`"CtxWrite"` 等） |
| `Args` | `map[string]any` | 调用参数快照 |
| `Result` | `any` | 返回值 |
| `Err` | `error` | 错误信息 |
| `Duration` | `time.Duration` | 执行耗时 |

**传递机制：**

- 通过 `debug.EmitEvent(ch, event)` 非阻塞写入 `DebugChan`
- 缓冲满时静默丢弃（不阻塞 syscall 执行）
- `DebugChan` 为 `nil` 时跳过（零开销）
- 关闭前先将 `proc.DebugChan` 置 `nil`（持锁操作），防止并发写入

**消费方式：** 通过 IPC `attach_debug` 方法流式获取（见 [5.8 AttachDebug 流式协议示例](#58-attachdebug-流式协议示例)）。

---


### 8.1 IPC 管理（IPCManager）

#### Send

向目标进程发送消息。

```
签名: Send(senderPID PID, targetPID PID, data []byte) error
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `senderPID` | `PID` | 发送者进程 ID |
| `targetPID` | `PID` | 目标进程 ID |
| `data` | `[]byte` | 消息数据 |

**错误码：** `NOT_FOUND`（目标进程不存在）

#### Recv

阻塞接收消息。

```
签名: Recv(pid PID) (*Message, error)
```

阻塞直到消息到达或队列关闭（进程退出时）。

#### Pipe

创建进程间管道。

```
签名: Pipe(writerPID PID, readerPID PID) (writeFD FD, readFD FD, error)
```

返回两个文件描述符：writer 端和 reader 端。AgentShell `|` 语法底层调用此 syscall。

### 8.2 信号管理（SignalManager）

#### Signal

投递信号到目标进程。

```
签名: Signal(pid PID, sig Signal) error
```

5 种信号：

| 信号 | 值 | 可阻塞 | 可自定义 Handler | 默认行为 |
|------|-----|--------|-----------------|---------|
| `SIGTERM` | `1` | ✓ | ✓ | Cancel context |
| `SIGKILL` | `2` | ✗ | ✗ | 强制 Cancel |
| `SIGINT` | `3` | ✓ | ✓ | Cancel context |
| `SIGPAUSE` | `4` | ✓ | ✓ | 暂停推理循环 |
| `SIGRESUME` | `5` | ✓ | ✓ | 恢复推理循环 |

#### SigBlock / SigUnblock

```
签名: SigBlock(pid PID, sig Signal) error
签名: SigUnblock(pid PID, sig Signal) error
```

阻塞信号时，该信号进入 pending 集合。解除阻塞时，pending 信号立即投递。

信号投递使用 `resolveSignalDisposition` 在单次锁持有中原子确定分发路径，避免 TOCTOU 竞态。

### 8.3 进程组管理（ProcGroupManager）

```
签名: JoinGroup(pid PID, groupID PGID) error
签名: LeaveGroup(pid PID, groupID PGID) error
签名: GetProcGroup(groupID PGID) ([]PID, error)
签名: SignalGroup(groupID PGID, signal Signal) error
```

`SignalGroup` 向组内所有成员广播信号，用于 Compose 编排的批量控制。

### 8.4 挂载管理（MountManager）

```
签名: Mount(path string, config MCPConfig) error
签名: Unmount(path string) error
签名: UnmountAll() error
```

MCP 服务器挂载到 `/mnt/mcp/{pid}-{serverName}` 路径。`UnmountAll` 在 Shutdown 时调用。

### 8.5 三级并发模型

#### SpawnThread

```
签名: proc.SpawnThread(intent string, fn func(*Thread)) (TID, error)
```

共享父进程上下文，独立 goroutine。父进程 Kill 时子 Thread context 也被取消。

#### SpawnCoroutine

```
签名: proc.SpawnCoroutine(intent string, fn func(*Coroutine)) (CoID, error)
签名: proc.ResumeCoroutine(coid CoID) (any, error)
```

协作式调度，通过 `yieldCh`/`resumeCh` 通道对实现值传递。

### 8.6 Supervisor 管理

```
签名: SpawnSupervisor(spec SupervisorSpec) (PID, error)
```

创建 Supervisor 树节点，支持 `one_for_one`、`one_for_all`、`rest_for_one` 三种重启策略。

---

