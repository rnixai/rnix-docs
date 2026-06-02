# MCP 集成

Rnix 集成了 Model Context Protocol (MCP) 服务器，将其工具暴露为原生 VFS 路径，智能体通过标准的 Open/Read/Write/Close 操作即可访问。MCP 服务器工具注册为一等 `ToolDef`，使 LLM 能够基于完整元数据进行推理和决策。

---

## 概述

MCP（Model Context Protocol）是连接 AI 模型与外部工具和数据源的标准协议。在 Rnix 中，MCP 服务器被挂载为 VFS 设备，使 MCP 工具可通过与 LLM、文件系统、Shell 相同的文件抽象来访问。

```
Agent 进程
    │
    │  Open("/mnt/mcp/1-github/tools/search_repos")
    ▼
VFS DeviceRegistry
    │
    │  前缀匹配 → /mnt/mcp/1-github
    ▼
MCP Transport (stdio)
    │
    │  tools/call: search_repos
    ▼
MCP 服务器进程 (npx @anthropic/mcp-github)
```

### 原生 ToolDef 暴露（Route B）

MCP 服务器工具以原生 `ToolDef` 条目形式暴露——不仅仅是原始 VFS 路径。这意味着 LLM 能看到每个 MCP 工具的完整元数据（名称、描述、参数 schema），与内置工具的呈现方式完全一致。工具按挂载点注册，具有进程级作用域隔离。

---

## 配置 MCP 服务器

### 在 Agent 清单中声明

最常见的方式是在 `agent.yaml` 中声明 MCP 服务器：

```yaml
# agents/my-agent/agent.yaml
name: my-agent
description: "带有 GitHub 和文件系统 MCP 工具的智能体"
skills:
  - code-analysis
mcp:
  servers:
    github:
      command: "npx"
      args: ["-y", "@anthropic/mcp-github"]
      env:
        GITHUB_TOKEN: "${GITHUB_TOKEN}"
      timeout: 30s
      max_output_tokens: 4096

    filesystem:
      command: "npx"
      args: ["-y", "@anthropic/mcp-filesystem", "/home/user/projects"]
```

### MCPServerConfig 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `command` | `string` | 启动 MCP 服务器的可执行文件 |
| `args` | `[]string` | 命令行参数 |
| `env` | `map[string]string` | 环境变量（支持 `${VAR}` 展开） |
| `transport_type` | `string` | 传输类型：`"stdio"`（默认） |
| `timeout` | `duration` | 单服务器超时时间（默认：`30s`） |
| `max_output_tokens` | `int` | 单次工具调用输出最大 token 数（防止上下文溢出） |

### 单服务器超时与输出配置

每个 MCP 服务器可以独立设置超时和输出限制：

```yaml
mcp:
  servers:
    github:
      command: "npx"
      args: ["-y", "@anthropic/mcp-github"]
      timeout: 15s              # 快速 API，使用较短超时
      max_output_tokens: 2048

    large-dataset:
      command: "python"
      args: ["./mcp-servers/data-server.py"]
      timeout: 120s             # 慢查询，使用较长超时
      max_output_tokens: 16384  # 允许较大结果集
```

输出截断在 ToolDef 层面生效——超出 `max_output_tokens` 的结果将被截断并附带明确的截断标记，防止上下文窗口溢出。

---

## 挂载生命周期

当衍生（spawn）一个带 MCP 依赖的智能体时，Rnix 管理完整的挂载生命周期：

### 1. Spawn 时并发自动挂载

智能体 manifest 中声明的所有 MCP 服务器**并发挂载** — 每个服务器在独立 goroutine 中连接，使用单条目锁，消除多 MCP 服务器依赖时的串行瓶颈。

```
Spawn(intent, agent)
    │
    ├── 对 agent.mcp.servers 中的每个 MCP 服务器（并发）：
    │     │
    │     ├── 预留占位符（MCPStatusConnecting）并获取单条目锁
    │     ├── 建立 transport 连接（在跨路径锁之外，受 MountTimeout 约束）
    │     ├── 成功：列出工具 → 注册 ToolDef → 完成 → 释放锁
    │     └── 失败：删除占位符 → 关闭 transport → 释放锁
    │
    ├── 全部成功：继续执行
    └── 任一失败：回滚所有挂载，释放上下文，返回错误
```

**单服务器挂载超时**默认为 5 秒（可通过 MCPConfig 中的 `MountTimeout` 配置）。每个挂载独立运行 — 慢速服务器不会阻塞其他挂载完成。

### 2. 引用计数挂载管理

MCP 挂载使用引用计数来追踪跨进程子树的使用情况：

- **挂载（Mount）**：递增引用计数。物理服务器在首次引用时启动。
- **卸载（Unmount）**：递减引用计数。计数归零时停止物理服务器。
- **挂载恢复（Mount Restoration）**：进程恢复时，从持久化状态恢复挂载并正确设置引用计数。

这可以防止多个进程共享同一挂载（例如父子进程）时服务器被过早关闭。

### 3. 执行期间使用

智能体通过标准 VFS 操作与 MCP 工具交互：

```
Open("/mnt/mcp/1-github/tools/search_repos") → FD(5)
Write(FD(5), {"query": "rnix language:go"})   → ok
Read(FD(5))                                    → 搜索结果
Close(FD(5))                                   → ok
```

### 4. 进程组隔离与优雅关闭

MCP transport 进程在独立的进程组中启动，并具有平台特定的加固措施：

- **信号隔离**：发往 Rnix daemon 的 SIGINT/SIGTERM 不会传播到 MCP 子进程
- **Linux 加固**：`Setpgid` + `Pdeathsig=SIGKILL` 确保即使 daemon 崩溃也能清理子进程
- **两阶段优雅关闭**：卸载时，Rnix 先向整个进程组发送 `SIGTERM`，然后等待最多 5 秒让其干净退出。若服务器在宽限期内未终止，则发送 `SIGKILL` 强制回收
- **防止孤儿进程**：操作系统进程组机制提供最后的清理保障
- **幂等 Close**：`closed` 标志防止并发卸载时的重复 `Close()` 调用导致 panic

daemon 关闭（`rnix daemon stop`）期间，`UnmountAll()` 会在内核退出前干净地拆除所有活跃的 MCP 挂载。

### 5. 退出时自动卸载

进程结束时（进入 `finishProcess`）：

1. 按顺序卸载每个 MCP 挂载点（引用计数递减）
2. 引用计数归零时关闭 transport 连接
3. 移除 VFS 设备注册
4. 卸载失败不阻塞进程退出

### 6. 恢复时挂载重建

当进程被恢复时（参见 [进程暂停、恢复与故障恢复](/zh/guide/process-resume)），MCP 挂载会被重建：

- 已暂停进程：从持久化状态重建挂载
- 从 Dead/Zombie 恢复：从 agent 清单重新创建挂载
- 挂载路径以恢复后进程的新 PID 重新注册

---

## MCP 管理命令

### `rnix mcp logs`

捕获 MCP 服务器进程的 stderr 输出用于诊断：

```bash
$ rnix mcp logs <挂载名称>
[stderr] Starting GitHub MCP server v2.1.0...
[stderr] Connected to github.com API
[stderr] Tool "search_repos" registered
```

适用于调试服务器启动失败、工具注册问题和运行时错误。

### `rnix check mcp`

对 MCP 配置运行子系统诊断：

```bash
$ rnix check mcp
✓ MCP transport layer: OK
✓ Agent MCP configs found: 3 agents with MCP servers
  - my-agent: github, filesystem
  - pr-reviewer: github
  - data-analyzer: postgres
✓ Server binaries found:
  - npx: /usr/local/bin/npx
  - python: /usr/bin/python3
✗ Warning: agent 'data-analyzer' MCP server 'postgres' — command 'pg-mcp' not in PATH
```

检查项包括：transport 健康状态、agent 配置有效性、服务器二进制可用性以及环境变量解析。

### `rnix init --with-mcp-examples`

初始化新项目时带入示例 MCP 配置：

```bash
$ rnix init --with-mcp-examples
[init] created ~/.config/rnix/
[init] created .rnix/
[init] added agents/playwright-demo/ with MCP Playwright config
[init] added agents/github-assistant/ with MCP GitHub config
```

预检（preflight）确保必需的服务器二进制文件（如 `npx`）可用后，才会创建示例配置。

---

## VFS 路径映射

MCP 挂载点暴露结构化的路径层级：

| VFS 路径 | MCP 操作 | Read 行为 | Write 行为 |
|----------|----------|----------|------------|
| `/mnt/mcp/{mount}/` | — | 返回 `["tools","resources"]` | — |
| `/mnt/mcp/{mount}/tools` | `tools/list` | 返回工具列表 | — |
| `/mnt/mcp/{mount}/tools/{name}` | `tools/call` | 返回上次调用结果 | 发起工具调用 |
| `/mnt/mcp/{mount}/resources` | `resources/list` | 返回资源列表 | — |
| `/mnt/mcp/{mount}/resources/{uri}` | `resources/read` | 读取资源内容 | — |

### 挂载路径格式

挂载路径遵循 `/mnt/mcp/{pid}-{serverName}` 模式：

- `{pid}` — 衍生（spawn）该进程的进程 ID（确保进程间隔离）
- `{serverName}` — MCP 配置中的服务器名称

示例：PID 为 3 的进程搭配 `github` MCP 服务器 → `/mnt/mcp/3-github`

### 空 MCP 挂载

Agent 可以声明 `mcp: {}`（空挂载）作为标记，表示已配置 MCP 支持但不需要任何服务器。该 agent 提示在诊断和 `rnix check mcp` 输出中保留。

---

## Transport 架构

### MCPTransport 接口

Transport 抽象定义在 `vfs` 包中（依赖反转——vfs 定义接口，`drivers/mcp` 提供实现）：

```go
type MCPTransport interface {
    Connect(ctx context.Context) error
    Call(ctx context.Context, method string, params json.RawMessage) (json.RawMessage, error)
    Close() error
    Ping(ctx context.Context) error
}
```

### Stdio Transport

当前实现使用 stdio 传输，并具备增强的可靠性：

1. 在隔离的进程组中启动 MCP 服务器作为子进程
2. 通过 stdin/stdout 使用 JSON-RPC 通信
3. 服务器 stderr 被捕获用于诊断（`rnix mcp logs`）
4. 连接超时：单服务器可配置（默认 30s）
5. 瞬时故障自动重连，带退避策略
6. 通过定期 `Ping` 调用进行健康检查

---

## 权限

MCP 挂载路径被视为**附加许可（additive permits）**——它们扩展进程的 `AllowedDevices` 白名单，而非作为基础设备限制。这意味着：

- 如果 agent 声明了 MCP 服务器，它将自动获得访问这些服务器的权限
- skill 中无需额外的 `allowed-tools` 配置
- 其他进程无法访问当前进程的 MCP 挂载（PID 作用域路径隔离）
- MCP 权限是附加的：它们扩展能力，从不限制能力

---

## 错误处理

| 场景 | 行为 |
|------|------|
| MCP 服务器启动失败 | Spawn 失败，所有挂载回滚 |
| 连接超时 | Spawn 失败，所有挂载回滚（超时时间单服务器可配置） |
| 执行期间工具调用失败 | VFS Read 返回错误（DRIVER 错误码） |
| MCP 服务器执行中崩溃 | 尝试自动重连；失败后后续 Read/Write 返回错误 |
| 进程退出时卸载失败 | 记录警告，进程正常退出 |
| MCP 服务器 stderr 输出 | 被捕获，可通过 `rnix mcp logs` 查看 |

---

## 示例：在 strace 中观察 MCP 使用

当智能体使用 MCP 工具时，`rnix strace` 会显示 VFS 操作：

```
[  1.234s] Open(path="/mnt/mcp/1-github/tools/search_repos") → 5    2ms
[  1.236s] Write(fd=5, size=45) → <nil>    350ms
[  1.586s] Read(fd=5, length=1048576) → 2048    1ms
[  1.587s] Close(fd=5) → <nil>    0μs
```

---

## 相关文档

- [配置指南](/zh/guide/configuration) — Agent 清单 MCP 字段与单服务器配置
- [进程暂停、恢复与故障恢复](/zh/guide/process-resume) — 恢复时 MCP 挂载重建
- [架构设计](/zh/guide/architecture) — MCP 挂载机制内部实现
- [核心概念](/zh/guide/concepts) — VFS 设备模型
- [参考手册](/zh/reference/) — VFS 路径规范
