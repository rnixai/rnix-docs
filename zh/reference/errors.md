## 6. 错误处理与类型参考

### 6.1 ErrCode 枚举

所有错误类型共享统一的 `ErrCode` 分类码：

| 错误码 | 值 | 含义 |
|--------|-----|------|
| `ErrTimeout` | `"TIMEOUT"` | 操作超时 |
| `ErrNotFound` | `"NOT_FOUND"` | 资源不存在（进程、上下文、FD、设备） |
| `ErrPermission` | `"PERMISSION"` | 权限拒绝（如写入只读 /proc） |
| `ErrInternal` | `"INTERNAL"` | 内部错误（状态异常、序列化失败等） |
| `ErrDriver` | `"DRIVER"` | 设备驱动错误（LLM 调用失败、文件读写失败等） |
| `ErrInvalid` | `"INVALID"` | 无效参数（如无效信号值） |
| `ErrIsDirectory` | `"IS_DIRECTORY"` | 期望文件处目标路径为目录 |
| `ErrBrokenPipe` | `"BROKEN_PIPE"` | 向无存活读端的管道写入 |
| `ErrServiceUnavailable` | `"SERVICE_UNAVAILABLE"` | 调用进行中发生的瞬时驱动/服务故障 |
| `ErrAlreadyMounted` | `"ALREADY_MOUNTED"` | 挂载路径已被占用 |
| `ErrResourceExhausted` | `"RESOURCE_EXHAUSTED"` | 触达资源上限（预算、容量、配额） |
| `ErrForceKilled` | `"FORCE_KILLED"` | 优雅 SIGTERM 超时，驱动/传输层升级为 SIGKILL |
| `ErrDeviceDisconnected` | `"DEVICE_DISCONNECTED"` | 设备（如 MCP 子进程）已知断连，调用快速失败 |

### 6.2 SyscallError

内核层错误，所有 syscall 出错时返回此类型。

```go
type SyscallError struct {
    Syscall string        // 出错的 syscall 名称
    PID     types.PID     // 发起 syscall 的进程 PID
    Device  string        // 涉及的 VFS 路径
    Err     error         // 底层错误
    Code    types.ErrCode // 分类错误码
}
```

**格式化输出：** `[TIMEOUT] PID 1 Spawn: /dev/llm/claude (context deadline exceeded)`

**`Unwrap()` 支持：** 实现 `errors.Unwrap` 接口，支持 `errors.Is` 和 `errors.As` 链式错误检查。

### 6.3 VFSError

VFS 层错误，VFS 操作出错时返回此类型。

```go
type VFSError struct {
    Op     string        // 操作名称（"Open"、"Read"、"Write"、"Close"、"Stat"）
    PID    types.PID     // 进程 PID
    Device string        // VFS 路径
    Err    error         // 底层错误
    Code   types.ErrCode // 分类错误码
}
```

**格式化输出：** `[NOT_FOUND] PID 1 Open: /dev/unknown (device not found: /dev/unknown)`

**`Unwrap()` 支持：** 是

### 6.4 DriverError

驱动层错误，设备驱动内部使用，避免 `drivers/` → `kernel/` 的循环依赖。

```go
type DriverError struct {
    Op     string        // 操作名称
    Device string        // 设备路径
    Err    error         // 底层错误
    Code   types.ErrCode // 分类错误码
}
```

**格式化输出：** `[DRIVER] Write: /dev/llm/claude (exec: command not found)`

**`Unwrap()` 支持：** 是

**错误码传播：** VFS 层通过 `errors.As` 提取 `DriverError` 中的 `Code`，传播到 `VFSError`。

### 6.5 ContextError

上下文层错误。

```go
type ContextError struct {
    Op   string        // 操作名称（"CtxAlloc"、"CtxRead"、"CtxWrite"、"CtxFree"）
    CID  types.CtxID   // 上下文 ID
    Err  error         // 底层错误
    Code types.ErrCode // 分类错误码
}
```

**格式化输出：** `[NOT_FOUND] CtxID 1 CtxFree: context not found`

**`Unwrap()` 支持：** 是

### 6.6 基础类型

| 类型 | Go 定义 | 说明 |
|------|---------|------|
| `PID` | `uint64` | 进程 ID（从 1 递增，不回收） |
| `FD` | `int` | 文件描述符（从 3 递增） |
| `CtxID` | `uint64` | 上下文 ID（从 1 递增） |
| `ErrCode` | `string` | 错误分类码 |
| `Signal` | `int` | 进程信号 |
| `ProcessState` | `int` | 进程状态 |
| `UUID` | `uuid.UUID` | UUID v7——跨 daemon 重启的全局唯一进程标识符 |
| `TraceID` | `string` | 分布式追踪标识符 |
| `SpanID` | `string` | 分布式追踪 Span 标识符 |
| `PGID` | `uint64` | 进程组标识符 |
| `TID` | `uint64` | 线程标识符 |
| `CoID` | `uint64` | 协程标识符 |

---

