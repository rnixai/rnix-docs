# 记忆系统

Rnix 提供持久化记忆子系统，允许智能体跨会话积累知识。灵感来自人类记忆的工作方式 — 提交重要事实、后续召回、并逐步构建用户画像。

---

## 架构

记忆子系统在两个作用域运行：

- **项目级** (`memory`) — 当前项目的专属知识，存储在 `.rnix/memory/`
- **全局级** (`global_memory`) — 跨项目知识，存储在 `~/.config/rnix/memory/`

每个作用域由 `FileMemoryProvider` 支撑，以纯文本文件形式持久化。

### 内核组件

| 组件 | 位置 | 职责 |
|------|------|------|
| `MemoryStore` | `kernel/memory/store.go` | 双作用域 API 层，含安全扫描 |
| `FileMemoryProvider` | `kernel/memory/provider.go` | 基于文件的作用域存储 |
| `RecallIndex` | `kernel/memory/recall.go` | 基于 TF-IDF 的历史对话搜索索引 |
| `Writeback` | `kernel/memory/writeback.go` | 异步知识抽取（进程完成后触发） |
| `SecurityScanner` | `kernel/memory/scanner.go` | 写入前内容安全扫描 |

---

## VFS 设备

记忆子系统暴露三个 VFS 设备：

### /dev/memory/commit

写入持久化知识条目。支持五种操作：

| 操作 | 说明 |
|------|------|
| `add` | 追加新知识条目 |
| `replace` | 替换现有条目（精确匹配）为新内容 |
| `remove` | 删除条目（精确匹配） |
| `snapshot` | 读取所有当前条目 |
| `capacity` | 检查剩余容量（字符数限制） |

**双作用域：** `target` 设为 `"memory"`（项目级，默认）或 `"global_memory"`（全局级）。

**请求示例：**

```json
{
  "action": "add",
  "target": "memory",
  "content": "API 使用 JWT 认证，RS256 签名"
}
```

### /dev/memory/recall

搜索历史进程对话和提取的知识。只读。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `query` | `string` | — | 搜索关键词 |
| `max_results` | `int` | `20` | 最大结果数 |
| `summarize` | `bool` | `false` | LLM 摘要结果，用于精简上下文注入 |

**请求示例：**

```json
{
  "query": "认证实现细节",
  "max_results": 10,
  "summarize": true
}
```

### /dev/memory/profile

管理用户画像（角色、偏好、专业领域）。操作语义与 `/dev/memory/commit` 相同，但固定为 `user` 目标作用域。

**请求示例：**

```json
{
  "action": "add",
  "content": "用户偏好简洁的英文代码注释"
}
```

---

## 安全扫描

所有对记忆设备的写入都经过 `ScanContent()` 安全扫描。扫描器会拒绝包含以下内容的写入：

- API 密钥和密钥凭证
- 凭据模式
- 潜在危险代码模式

被拒绝的写入会返回包含原因的错误。

---

## Writeback

当进程完成后，`Writeback` 组件会异步从对话中提取有用知识并提交到项目记忆。这在后台执行，不阻塞进程生命周期。

---

## MEMORY.md 作为 Recall 数据源

每个作用域的条目都持久化到一个 `MEMORY.md` 文件（项目：`.rnix/memory/MEMORY.md`，全局：`~/.config/rnix/memory/MEMORY.md`）。该文件不只是存储——它是 **`/dev/memory/recall` 的一等数据源**，与历史对话一并被索引：

- **commit 时实时注入** — 每次经 `/dev/memory/commit`（或 `/dev/memory/profile`）写入都会立即把该作用域的条目重新索引进共享的 `RecallIndex`（`IndexMemorySource`），因此某进程提交的事实无需重启即可被后续进程 recall 到。
- **daemon 重启时重建** — daemon 启动时会从磁盘读取每个 `MEMORY.md` 并重建索引（`IndexMemoryFile`），因此已提交的知识能跨 daemon 重启存活，冷启动后依然可检索。
- **recall 覆盖范围** — 一次 `recall` 查询同时匹配对话中提取的知识与 `MEMORY.md` 中的条目，人工策划的记忆与自动提取的记忆一同排序。

::: tip
执行 commit 的进程在当前步骤剩余部分使用冻结的 prompt 快照，因此它要到后续步骤或后续进程才能看到自己刚提交的条目。但该条目会立即注入共享索引，供**其他**进程使用。
:::

---

## 配置

记忆设置在 `memory.yaml` 中配置：

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `store.memory_char_limit` | `50000` | 项目记忆条目最大字符数 |
| `store.user_char_limit` | `10000` | 用户画像条目最大字符数 |

---

## 相关文档

- [VFS 路径规范](/zh/reference/vfs) — 设备路径详情
- [配置指南](/zh/guide/configuration) — 记忆配置文件
- [自主智能体](/zh/guide/autonomous-agents) — 智能体如何使用记忆
