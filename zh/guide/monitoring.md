# 监控与 Supervisor

实时进程监控、分类推理日志、Token 预算管理、心跳监控器、Supervisor 树和 init 引导。

---

## rnix top — 实时监控器

```bash
$ rnix top
```

```
rnix top — 实时监控器                                    刷新间隔: 1s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PID  PPID  STATE     AGENT         TOKENS   ELAPSED  INTENT
1    0     running   code-analyst  2,340    4.5s     分析代码质量
2    1     running   default       890      2.1s     检查依赖
3    0     zombie    —             1,567    8.3s     安全扫描
4    0     paused    doc-writer    450      1.2s     生成文档（已暂停）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
进程: 4 | 运行中: 2 | 僵尸: 1 | 已暂停: 1
Token: 5,247 | 运行时间: 8.3s
```

**交互操作：**
- 使用方向键导航
- `k` — 杀死选中进程
- `d` — 查看进程详情（切换到 Dashboard）
- `s` — 附加 strace 跟踪
- `p` — 暂停/恢复选中进程
- `q` — 退出

已暂停的进程（`⏸`）显示时其运行计时器冻结在暂停时刻。心跳监控器会跳过已暂停的进程——它们有意停止发送心跳。

---

## 心跳监控器

心跳监控器通过心跳时间戳追踪进程活性。它以**被动（仅警告）模式**运行——检测卡死但不自动干预。

### 设计哲学

心跳监控是观察性的，而非干预性的。这是一个有意的架构决策：daemon 永远不会基于启发式规则执行破坏性操作。

- **仅警告**：发出 `ProcessStalled` 事件和日志警告，但**不会**自动暂停、取消步骤或终止进程
- **不自动恢复**：Supervisor 树负责崩溃恢复；心跳仅作为检测层
- **暂停进程豁免**：处于 SIGPAUSE 状态的进程被显式跳过——它们有意停止了推理循环
- **持续观察**：卡死记录持续存在直到进程退出或心跳恢复——连续卡死计数无限增长（5、6、7...），提供递增的严重性信号

### 卡死升级级别

监控器每 30 秒（可配置）检查每个进程。当心跳间隔超过进程的 `StepTimeout` 时：

| 级别 | 连续卡死次数 | 操作标签 | 实际行为 |
|------|------------|---------|---------|
| **警告** | 1–2 | `warn` | 记录警告日志，发出 `ProcessStalled` 事件 |
| **升级** | 3 | `cancel_step` | 记录 "（将取消步骤，被动模式，不执行操作）" |
| **严重** | 4+ | `suspend` | 记录 "（将暂停，被动模式，不执行操作）" |

所有级别都会发出包含操作标签的 `ProcessStalled` 事件，供 Dashboard 和可观测性消费。任何级别都不会执行破坏性操作。

### 卡死检测

| 状态 | 条件 | Dashboard 指示器 |
|------|------|------------------|
| **健康** | 最后一次心跳在步骤超时时间内 | 绿色脉冲 |
| **卡死警告** | 1–2 次连续卡死 | 黄色脉冲 |
| **卡死严重** | 3+ 次连续卡死 | 红色脉冲（带强度条） |

### Dashboard 卡死热力图

Dashboard 详情面板渲染视觉卡死强度指示器：

- **颜色映射**：`< 3` 次连续卡死 → 警告（黄色），`≥ 4` → 错误（红色）
- **强度条**：按 `min(consecutiveStalls, 4) / 4` 比例填充
- **实时状态**：通过 IPC `heartbeat_status` 方法查询，返回运行状态、检查间隔、总检测数和每进程卡死详情

### 配置

| 字段 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `checkInterval` | `duration` | `30s` | 检查所有进程的频率 |
| `StepTimeout` | `duration` | 每进程设置 | 卡死检测的心跳间隔阈值（`0` = 禁用） |

### Script-Runner 心跳

Script-runner 进程在其整个生命周期内维护心跳——而不仅仅是在活跃执行期间。这可以防止在脚本步骤之间的空闲期产生虚假的卡死检测。

---

## Daemon 状态

```bash
$ rnix daemon status
[daemon] status: running
[daemon] pid: 12345
[daemon] socket: /run/user/1000/rnix/rnix.sock
[daemon] version: rnix v0.10.0 (commit: abc1234, built: 2026-05-28)
[daemon] uptime: 3h 22m
[daemon] processes: 5 running, 2 suspended, 12 history
```

Daemon 报告内容：
- **版本**：三源回退（构建信息 → VERSION 文件 → git describe）
- **构建元数据**：提交哈希和构建时间戳
- **进程计数**：运行中、已暂停和历史（Dead/Zombie）进程数量

---

## rnix log — 推理日志

查看 Agent 的推理过程，输出按类别分类：

```bash
$ rnix log <pid>
[think] 正在分析 main.go 文件结构...
[tool]  Open(/dev/fs/./src/main.go) → 读取 2,048 字节
[think] 在错误处理中发现 3 个潜在问题...
[tool]  Open(/dev/shell) → 运行 "golangci-lint run ./..."
[output] ## 代码质量报告
          1. 第 45 行缺少错误包装...
```

**分类：**
- `[think]` — LLM 推理（内部思考）
- `[tool]` — 工具调用（VFS 操作）
- `[output]` — 最终用户输出

**过滤：**

```bash
rnix log <pid> --filter think    # 仅推理
rnix log <pid> --filter tool     # 仅工具调用
rnix log <pid> --filter output   # 仅输出
```

---

## Token 预算管理

为每个 Agent 或工作流设置 Token 限制：

**CLI 覆盖：**
```bash
rnix -i "分析代码" --max-tokens 10000
```

---

## Supervisor 树

Supervisor 树为关键 Agent 进程提供自动崩溃恢复：

### 重启策略

| 策略 | 行为 |
|------|------|
| `one_for_one` | 仅重启失败的进程 |
| `one_for_all` | 一个进程失败时重启组内所有进程 |
| `rest_for_one` | 重启失败的进程及其之后启动的所有进程 |

### 配置

在 `init.yaml` 中定义 Supervisor 树：

```yaml
services:
  critical-worker:
    intent: "处理传入任务"
    restart: always
    max_restarts: 5
    restart_strategy: one_for_one

  dependent-worker:
    intent: "后处理结果"
    restart: on-failure
    depends_on:
      - critical-worker
```

### Supervisor 行为

- **`always`**：任何退出（成功或失败）都重启
- **`on-failure`**：仅在非零退出码时重启
- **`no`**：永不重启（默认）
- **`max_restarts`**：daemon 会话内的重启尝试上限

Supervisor 与心跳监控器集成——重启的进程会自动重新注册其心跳。

---

## 相关文档

- [Dashboard](/zh/guide/dashboard) — 带心跳状态和卡死指示器的可视化监控
- [进程恢复](/zh/guide/process-resume) — 暂停/恢复与进程恢复
- [调试](/zh/guide/debugging) — strace 和 gdb 深度检查
- [配置](/zh/guide/configuration) — init.yaml Supervisor 配置
- [安全](/zh/guide/security) — 免疫系统异常检测
