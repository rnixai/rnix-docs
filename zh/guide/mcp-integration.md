# MCP 集成

Rnix 集成了 Model Context Protocol (MCP) 服务器，将其工具暴露为 VFS 路径，智能体通过标准的 Open/Read/Write/Close 操作访问。

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

---

## 挂载生命周期

### 1. Spawn 时自动挂载

```
Spawn(intent, agent)
    │
    ├── 对每个 MCP 服务器：
    │     ├── 创建 transport（stdio）
    │     ├── 建立连接（500ms 超时）
    │     ├── 注册 VFS 设备到 /mnt/mcp/{pid}-{serverName}
    │     └── 将挂载路径添加到进程 AllowedDevices
    │
    ├── 成功：继续执行
    └── 失败：回滚所有挂载，释放上下文，返回错误
```

### 2. 执行期间使用

```
Open("/mnt/mcp/1-github/tools/search_repos") → FD(5)
Write(FD(5), {"query": "rnix language:go"})   → ok
Read(FD(5))                                    → 搜索结果
Close(FD(5))                                   → ok
```

### 3. 退出时自动卸载

进程结束时，所有 MCP 挂载自动卸载，连接关闭。卸载失败不阻塞进程退出。

---

## VFS 路径映射

| VFS 路径 | MCP 操作 | Read 行为 | Write 行为 |
|----------|----------|----------|------------|
| `/mnt/mcp/{mount}/` | — | 返回 `["tools","resources"]` | — |
| `/mnt/mcp/{mount}/tools` | `tools/list` | 返回工具列表 | — |
| `/mnt/mcp/{mount}/tools/{name}` | `tools/call` | 返回上次调用结果 | 发起工具调用 |
| `/mnt/mcp/{mount}/resources` | `resources/list` | 返回资源列表 | — |
| `/mnt/mcp/{mount}/resources/{uri}` | `resources/read` | 读取资源内容 | — |

### 挂载路径格式

`/mnt/mcp/{pid}-{serverName}`：`{pid}` 确保进程间隔离，`{serverName}` 来自配置。

---

## 权限

MCP 挂载路径在 Spawn 时自动添加到进程 `AllowedDevices` 白名单。其他进程无法访问当前进程的 MCP 挂载（PID 隔离）。

---

## 错误处理

| 场景 | 行为 |
|------|------|
| MCP 服务器启动失败 | Spawn 失败，所有挂载回滚 |
| 连接超时（>500ms） | Spawn 失败，所有挂载回滚 |
| 执行期间工具调用失败 | VFS Read 返回错误（DRIVER 错误码） |
| MCP 服务器崩溃 | 后续 Read/Write 返回错误 |
| 进程退出时卸载失败 | 记录警告，进程正常退出 |

---

## 相关文档

- [配置指南](/guide/configuration) — Agent 清单 MCP 字段
- [架构设计](/guide/architecture) — MCP 挂载机制内部实现
- [核心概念](/guide/concepts) — VFS 设备模型
- [参考手册](/reference/) — VFS 路径规范
