# 进程暂停、恢复与故障恢复

Rnix 通过一等暂停/恢复原语和"Dead 即冻结"的恢复哲学重新定义了进程生命周期。进程可以在执行中途被挂起、跨 daemon 重启持久化、以及从磁盘恢复——包括历史（Dead/Zombie）进程。

---

## 设计哲学

传统 Unix 将"死亡"视为终态——进程一旦退出就不复存在。Rnix 将 **Dead 视为冻结状态**：进程数据持久化存储在磁盘上，直到垃圾回收清理为止。任何 Dead、Zombie 或 Suspended 状态的进程都可以通过 `rnix resume` 复活。

这一设计解决了一个反复出现的痛点：daemon 崩溃、手动 kill 或自然完成都会在磁盘上留下完整的观测轨迹（步骤、事件、上下文画像、检查点数据），但却无法继续运行。

**核心原则**：恢复**不是状态转移**——它是"基于历史构建一个新进程"。状态机（Created → Running → Zombie → Dead）保持不变。恢复操作会衍生出一个以先前执行数据为种子的新进程。

---

## 进程状态

| 状态 | 含义 | 可恢复？ | 是否持久化？ |
|------|------|---------|------------|
| **Created** | 已分配，尚未启动 | — | 否 |
| **Running** | 推理循环执行中 | — | 存活于 procTable |
| **Suspended** | SIGPAUSE 生效，循环阻塞 | `rnix resume` | `.rnix/data/steps/<uuid>/` |
| **Zombie** | 推理结束，等待 reaper | `rnix resume` | `.rnix/data/steps/<uuid>/` |
| **Dead** | 已回收，从 procTable 移除 | `rnix resume` | `.rnix/data/steps/<uuid>/` |

### SIGPAUSE / SIGRESUME

用于进程暂停和恢复的信号：

```bash
# 暂停运行中的进程（以及可选的子树）
rnix pause <pid>              # 单进程
rnix pause --subtree <pid>    # 进程 + 所有后代

# 恢复已暂停的进程
rnix resume <uuid>            # 从持久化状态恢复
rnix resume --fork <uuid>     # 新 UUID，链接到原进程
```

暂停时，推理循环在下一个 I/O 边界处阻塞——进程保持 `Running` 状态且 `IsPaused = true`。耗时计时器冻结。心跳监控跳过已暂停的进程（它们有意停止发送心跳）。

### 子树操作

`SubtreeManager` 提供跨进程树的统一暂停/恢复：

```
PID 1 orchestrator (Running)
├── PID 2 coder (Running)
├── PID 3 reviewer (Running)
└── PID 4 researcher (Suspended)

$ rnix pause --subtree 1
# 暂停 PID 1、2、3。PID 4 已经处于暂停状态。
# 树状态：所有成员已暂停，祖先节点知晓暂停原因。
```

恢复向上传播：恢复一个后代进程会唤醒其祖先链，以便 orchestrator 可以继续管理其子树。

---

## 恢复模式

| 模式 | 命令 | UUID | 使用场景 |
|------|------|------|----------|
| **接续** | `rnix resume <uuid>` | 保持不变 | daemon 崩溃后的恢复 |
| **分叉** | `rnix resume --fork <uuid>` | 新 UUID + `origin_uuid` | Git 式探索 |
| **截断分叉** | `rnix resume --fork --from-step N <uuid>` | 新 UUID | 从历史中途重试 |
| **Compose 节点** | `rnix compose resume --node <name>` | 复用上述模式 | DAG 节点恢复 |

### 接续模式

保留原始 UUID。最适合透明恢复场景：

```bash
# Daemon 在第 12/20 步时崩溃
$ rnix daemon status
# ... daemon 已重启 ...

$ rnix resume abc123-def456
[kernel] 正在从检查点恢复 UUID abc123（第 10/20 步）...
[kernel] PID 5 已启动 (claude/sonnet) | 从 abc123 恢复
```

对于 Suspended 进程：使用 `checkpoint.json` 进行完整上下文恢复（最快路径）。  
对于 Dead/Zombie 进程：回放 `steps.jsonl` 历史。无检查点时会退回到此方式。

### 分叉模式

创建新 UUID，并通过 `origin_uuid` 链接回原进程。原始进程数据永远不被修改：

```bash
$ rnix resume --fork abc123-def456
[kernel] 正在从 abc123 分叉 → 新 UUID xyz789...
[kernel] PID 6 已启动 (claude/sonnet) | 从 abc123 分叉
```

Dashboard 显示其谱系：`xyz789（forked from abc123）`。

### 截断分叉

跳转到特定步骤，适用于修正执行中途的错误：

```bash
$ rnix resume --fork --from-step 5 abc123
# 回放历史至第 5 步，然后从第 6 步开始推理
```

> **注意**：`--from-step` 需要历史路径。与检查点存在冲突时——`ErrInvalid` 如果两者同时适用。

---

## 检查点系统

周期性最大努力检查点防止长时间运行的任务从零重启：

- **频率**：每 5 个推理步骤或每 30 秒（以先到者为准）
- **格式**：`.rnix/data/steps/<uuid>/` 目录下的 `checkpoint.json`
- **内容**：完整上下文快照、工具状态、进度标记
- **失败语义**：检查点写入失败不会阻塞推理循环

```
.rnix/data/steps/<uuid>/
├── steps.jsonl          # 推理步骤（LLM 请求/响应）
├── events.jsonl         # Syscall 事件（实时 EventWriter）
├── ctx-profile.json     # 上下文热力图快照（reap 时保存）
├── process-meta.json    # 系统提示词 + 工具定义
├── proc-info.json       # 进程元数据快照
└── checkpoint.json      # 周期性检查点（每 5 步 / 30 秒）
```

---

## Daemon 重启持久化

已暂停的进程及其数据在 daemon 重启后仍然存在：

- **关闭时**：已暂停进程通过 `LoadSuspendedFromDisk` 序列化到磁盘
- **启动时**：daemon 扫描 `.rnix/data/steps/` 并还原已暂停进程
- **PID 种子值**：PID 计数器从磁盘种子值开始（`max(已有 PID)`），防止 PID 复用
- **占位运行时状态**：已暂停进程获得一个还原后的占位对象，在显式恢复前持有状态

```bash
# 重启前
$ rnix ps
PID  STATE       AGENT
1    Running     orchestrator
2    Suspended   coder

# Daemon 重启后
$ rnix ps
PID  STATE       AGENT
3    Suspended   coder          # 从磁盘还原，PID 重新种子化

$ rnix resume <uuid>
# 从检查点恢复，继承还原后的 PID
```

---

## 垃圾回收

长期存留的数据需要清理。在 `~/.config/rnix/config.yaml` 中配置：

```yaml
gc:
  retention_days: 30      # 删除超过 30 天的条目；0 = 禁用
  max_entries: 500        # 最多保留 500 条历史记录；0 = 禁用
  interval_seconds: 3600  # 后台扫描间隔（最小 60，默认 1 小时）
```

### GC 规则

- `retention_days` 和 `max_entries` 组合生效——满足任一条件即触发清理
- 将两者都设为 0 可完全禁用 GC daemon
- **Running 和 Suspended 进程永久豁免**
- 损坏的 `proc-info.json` 或缺失 `dead_at` → 跳过并记录警告日志

### CLI

```bash
rnix gc --dry-run          # 预览候选条目（表格）
rnix gc --dry-run --json   # 预览候选条目（JSON，适合脚本）
rnix gc                    # 执行清理；超过 100 条时提示 [y/N]
rnix gc --force            # 跳过确认
rnix gc --json             # JSON 输出（隐含 --force）
```

---

## IPC 命令

| 命令 | 说明 |
|------|------|
| `rnix pause <pid>` | 暂停进程（SIGPAUSE） |
| `rnix pause --subtree <pid>` | 暂停进程及其后代 |
| `rnix resume <uuid>` | 从持久化状态恢复 |
| `rnix resume --fork <uuid>` | 以新 UUID 恢复 |
| `rnix resume --fork --from-step N <uuid>` | 从第 N 步恢复 |
| `rnix compose resume --node <name>` | 恢复 Compose DAG 节点 |
| `rnix list-resumable` | 列出所有可恢复的进程 |
| `rnix gc` | 垃圾回收旧进程数据 |

---

## 相关文档

- [核心概念](/zh/guide/concepts) — 进程生命周期和状态机
- [仪表盘](/zh/guide/dashboard) — 带暂停/恢复功能的可视化进程管理
- [配置](/zh/guide/configuration) — GC 设置
- [监控](/zh/guide/monitoring) — 心跳监控器和 supervisor 树
