## 5. IPC 架构

### 5.1 Daemon 生命周期

Rnix 采用 daemon 架构：一个后台 daemon 持有唯一的内核实例和进程表，所有 CLI 命令作为客户端通过 Unix domain socket 通信。

**自动启动（`EnsureDaemon`）：**

1. CLI 命令调用 `EnsureDaemon()`
2. 尝试连接现有 daemon 并发送 `ping`
3. 连接失败 → 清除 stale socket 文件
4. 启动新 daemon 进程（`rnix daemon --internal`，`setsid` 独立进程组）
5. 轮询等待就绪（每 100ms 重试，最多 3 秒超时）
6. 返回已连接的 `*Client`

**自动停止（空闲超时）：**

- 默认超时：60 秒（`DefaultIdleTimeout`）
- 停止条件：无活跃进程 AND 无活跃连接
- 检查周期：每 5 秒（`idleCheckEvery`）
- 有进程运行或有连接时，暂停超时计时器

**手动停止：**

```bash
rnix daemon stop
```

**Stale socket 清理：**

- ping 现有 socket 超时 → 删除旧 socket 文件 → 启动新 daemon
- daemon 启动时将 PID 写入 `rnix.pid` 文件（诊断用途）

### 5.2 Socket 路径规则

Socket 路径按以下优先级确定：

1. **`$XDG_RUNTIME_DIR/rnix/rnix.sock`** — 如 `/run/user/1000/rnix/rnix.sock`
2. **`/tmp/rnix-{uid}/rnix.sock`** — 降级方案（`$XDG_RUNTIME_DIR` 未设置时）

目录权限：`0700`（仅当前用户可访问）。

测试可通过 `SocketPathOverride` 变量注入自定义路径。

### 5.3 NDJSON 协议

IPC 通信使用 NDJSON（Newline Delimited JSON）格式，每行一个 JSON 对象。

**Request 格式：**

```json
{"method": "ping|spawn|list_procs|kill|attach_debug|shutdown", "payload": {...}}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `method` | `string` | 请求方法（见 [5.4 Method 枚举](#54-method-枚举)） |
| `payload` | `object` | 方法特定的请求参数（可选） |

**Response 格式：**

```json
{"ok": true, "payload": {...}}
{"ok": false, "error": {"code": "...", "message": "..."}}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `ok` | `bool` | 是否成功 |
| `payload` | `object` | 方法特定的响应数据（成功时） |
| `error` | `object` | 结构化错误信息（失败时） |

### 5.4 Method 枚举

| Method | 类型 | Payload 类型 | 说明 |
|--------|------|-------------|------|
| `ping` | 请求-响应 | — | 活性检查，返回版本号 |
| `spawn` | 流式 | `SpawnRequest` | 创建进程，流式返回进度事件 |
| `list_procs` | 请求-响应 | — | 获取所有活跃进程列表 |
| `list_all_procs` | 请求-响应 | — | 获取所有进程列表（含历史记录） |
| `kill` | 请求-响应 | `KillRequest` | 发送信号到进程 |
| `signal_tree` | 请求-响应 | `SignalTreeRequest` | 向进程及其所有后代发送信号 |
| `resume` | 请求-响应 | `ResumeRequest` | 从检查点恢复挂起的进程 |
| `list_events` | 请求-响应 | `ListEventsRequest` | 列出进程事件（已结束进程从磁盘加载） |
| `attach_debug` | 流式 | `AttachDebugRequest` | 订阅 SyscallEvent 流 |
| `get_step_detail` | 请求-响应 | `StepDetailRequest` | 检索单个步骤记录 |
| `list_steps` | 请求-响应 | `ListStepsRequest` | 列出进程的所有步骤摘要 |
| `get_proc_detail` | 请求-响应 | `ProcDetailRequest` | 获取进程详细信息 |
| `shutdown` | 请求-响应 | — | 优雅关闭 daemon |

**SpawnRequest：**

```json
{"intent": "分析代码", "agent": "code-analyst", "model": "sonnet", "max_steps": 10}
```

**KillRequest：**

```json
{"pid": 1, "signal": 1}
```

**SignalTreeRequest：**

```json
{"pid": 1, "signal": 4}
```

`signal` 省略时默认为 SIGPAUSE(4)。若提供 `uuid` 字段则从 UUID 解析 PID。响应：`{"affected": 3}` — 收到信号的进程数。

**ResumeRequest：**

```json
{"uuid": "01912345-6789-7abc-..."}
```

从检查点恢复挂起的进程。响应：`{"pid": 5, "uuid": "...", "resumed_from_step": 3}`。

**AttachDebugRequest：**

```json
{"pid": 1}
```

**PingResponse：**

```json
{"version": "0.1.0"}
```

### 5.5 StreamEvent 流式协议

流式方法（`spawn`、`attach_debug`）使用 `StreamEvent` 逐行推送事件：

```json
{"type": "progress|complete|error|syscall_event|eof", "payload": {...}}
```

**StreamEventType 枚举：**

| 类型 | 说明 | 使用场景 |
|------|------|---------|
| `progress` | 推理步骤进度 | spawn 流 |
| `complete` | 进程完成 | spawn 流 |
| `error` | 错误 | spawn 流 |
| `syscall_event` | SyscallEvent | attach_debug 流 |
| `eof` | 流结束标记 | attach_debug 流 |

**ProgressPayload 结构（spawn 流）：**

| 字段 | 类型 | 事件 | 说明 |
|------|------|------|------|
| `event` | `string` | 所有 | `"spawn"`、`"step"`、`"complete"`、`"error"` |
| `pid` | `PID` | 所有 | 进程 ID |
| `intent` | `string` | spawn | 用户意图 |
| `provider` | `string` | spawn | 解析后的 LLM 提供商名称 |
| `model` | `string` | spawn | 解析后的模型名称 |
| `step` | `int` | step | 当前步数 |
| `total` | `int` | step | 最大步数 |
| `result` | `string` | complete | 最终结果 |
| `exit_code` | `int` | complete | 退出码 |
| `exit_reason` | `string` | complete | 退出原因 |
| `tokens_used` | `int` | complete | token 消耗 |
| `error_message` | `string` | error | 错误信息 |

**SyscallEventWire 结构（attach_debug 流）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `timestamp_ms` | `int64` | 相对进程创建时间（毫秒） |
| `pid` | `PID` | 进程 ID |
| `syscall` | `string` | Syscall 名称 |
| `args` | `map[string]any` | 调用参数 |
| `result` | `any` | 返回值 |
| `error` | `string` | 错误信息 |
| `duration_ms` | `float64` | 执行耗时（毫秒） |

### 5.6 连接复用语义

IPC Server 采用请求循环连接模型：

**非流式方法（`ping`、`list_procs`、`kill`）：**

- 发送 Response 后，继续在同一连接上等待下一个 Request
- 客户端可在单个连接上发送多次请求
- 用途：`EnsureDaemon()` 的 `ping` 探活与后续操作共用连接

**流式方法（`spawn`、`attach_debug`）：**

- handler 接管连接进行流式传输
- 流结束后 handler 返回，连接关闭
- 同一连接不再接受新请求

**`shutdown` 方法：**

- 发送 Response 后，异步触发 `Shutdown()`，handler 返回并关闭连接

### 5.7 Spawn 流式协议示例

```
Client → Server:  {"method":"spawn","payload":{"intent":"分析代码","agent":"code-analyst"}}

Server → Client:  {"ok":true,"payload":{"pid":1}}
Server → Client:  {"type":"progress","payload":{"event":"spawn","pid":1,"intent":"分析代码"}}
Server → Client:  {"type":"progress","payload":{"event":"step","pid":1,"step":1,"total":10}}
Server → Client:  {"type":"progress","payload":{"event":"step","pid":1,"step":2,"total":10}}
Server → Client:  {"type":"complete","payload":{"event":"complete","pid":1,"result":"分析结果...","exit_code":0,"tokens_used":1234}}

（连接关闭，IPC Server 自动调用 kern.Reap(pid) 清理 Zombie 进程）
```

### 5.8 AttachDebug 流式协议示例

```
Client → Server:  {"method":"attach_debug","payload":{"pid":1}}

Server → Client:  {"ok":true}
Server → Client:  {"type":"syscall_event","payload":{"timestamp_ms":13,"pid":1,"syscall":"Open","args":{"flags":2,"path":"/dev/llm/claude"},"result":3,"duration_ms":1.0}}
Server → Client:  {"type":"syscall_event","payload":{"timestamp_ms":14,"pid":1,"syscall":"Write","args":{"fd":3,"size":1234},"duration_ms":5200.0}}
Server → Client:  {"type":"syscall_event","payload":{"timestamp_ms":5214,"pid":1,"syscall":"Read","args":{"fd":3,"length":65536},"result":892,"duration_ms":2.0}}
...
Server → Client:  {"type":"eof"}

（进程退出 → DebugChan 关闭 → range 循环结束 → 发送 eof → 连接关闭）
```

### 5.9 ProcInfoWire 暂停字段

`ProcInfoWire` 结构体（用于 `list_procs` 和 `list_all_procs` 中进程信息的 IPC 序列化）包含暂停状态字段：

| 字段 | 类型 | JSON | 说明 |
|------|------|------|------|
| `is_paused` | `bool` | `"is_paused,omitempty"` | 进程是否当前处于暂停状态 |
| `paused_at_ms` | `int64` | `"paused_at_ms,omitempty"` | 暂停开始的 Unix 毫秒时间戳（未暂停时为 0） |

这些字段使客户端（CLI、Dashboard）能够显示暂停状态并计算冻结的 elapsed 时间，无需额外通信往返。

---

