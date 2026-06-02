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

心跳监控是观察性的，而非干预性的：

- **仅警告**：报告卡死状态，但不杀死、重启或以其他方式修改进程
- **不自动恢复**：Supervisor 树负责崩溃恢复；心跳是检测层
- **暂停进程豁免**：处于 SIGPAUSE 状态的进程被显式跳过——它们有意停止了推理循环

### 卡死检测

| 状态 | 条件 | Dashboard 指示器 |
|------|------|------------------|
| **健康** | 最后一次心跳在步骤超时时间内 | 绿色脉冲 |
| **卡死警告** | 心跳逾期，但在宽限期内 | 黄色脉冲 |
| **卡死严重** | 心跳严重逾期 | 红色脉冲（带强度） |

卡死强度在 Dashboard 详情面板中以颜色编码的视觉指示器呈现。

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
