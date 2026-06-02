# 安全与自愈

Rnix 实现了一套自适应免疫安全系统，持续监控智能体行为、检测异常、维护威胁记忆，并通过能力迁移实现自愈。

---

## 免疫系统配置

免疫系统**默认启用，以 warn-only（观测）模式运行**。它监控智能体行为并记录异常，但不挂起进程。这提供了零干扰的被动安全感知。

要切换到**执行模式**（检测到异常时自动挂起进程）或完全禁用：

```yaml
# .rnix/config.yaml
immune:
  enabled: true               # 默认: true
  warn_only: false            # 默认: true — 设为 false 启用自动挂起
  deviation_threshold: 2.0    # 距离基线的标准差（默认：2.0）
  min_samples: 5              # 异常检测激活前的最小样本数
```

### 配置字段

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | `bool` | `true` | 启用或禁用免疫系统 |
| `warn_only` | `bool` | `true` | 观测模式：检测并记录异常，但不挂起进程 |
| `deviation_threshold` | `float` | `2.0` | 触发异常的标准差阈值 |
| `min_samples` | `int` | `5` | 检测开始前的最小行为样本数 |
| `min_migration_similarity` | `float` | `0.5` | 能力迁移的最小相似度阈值 |

### 运行模式

| 模式 | `enabled` | `warn_only` | 行为 |
|------|-----------|-------------|------|
| **观测模式**（默认） | `true` | `true` | 监控、记录异常、持久化威胁签名——不挂起进程 |
| **执行模式** | `true` | `false` | 监控 + 自动挂起异常进程（SIGPAUSE） |
| **禁用** | `false` | — | 不监控，IPC 方法返回空状态 |

在观测模式下，`rnix immune status` 显示 `Mode: warn-only`，异常被记录但进程继续运行。

---

## 免疫守护进程

**免疫守护进程（Immune Daemon）** 持续监视所有智能体的行为模式。由于默认启用，每个智能体进程从首次运行起即被监控。

### 行为基线

系统根据历史执行数据，为每个 Agent 模板构建**正常行为画像（Normal Profile）**：

| 指标 | 基线示例 |
|------|---------|
| Syscall 频率 | Open: 5-15/step，Write: 3-10/step |
| 资源访问模式 | /dev/fs: 80%，/dev/shell: 20% |
| Token 消耗速率 | 200-500 tokens/step |
| 执行时长 | 每个推理步骤 2-8 秒 |

### 异常检测

当智能体的行为偏离基线超过阈值时：

- 异常高频的文件写入
- 非预期的 shell 命令模式
- Token 消耗激增
- 访问异常的 VFS 路径

在**观测模式**（默认）下，免疫守护进程记录 `AnomalyAlert` 并持久化 `ThreatSignature`，但进程继续运行。在**执行模式**下，告警触发 `SIGPAUSE` 挂起进程。

### 威胁记忆（抗体记忆）

已识别的异常行为模式会被记录到威胁记忆库中。当相同模式再次出现时，将被**立即识别**——在执行模式下意味着即时挂起；在观测模式下，立即发出告警。

```bash
$ rnix immune status
Mode: warn-only
  Monitoring: 5 processes
  Alerts: 1 active
    PID 7: unusual /dev/shell frequency (23/step, baseline: 5-10)
  Suspended: 0 processes
  Threat memory: 3 entries
    #1: rapid-file-enumeration (detected 2026-03-10)
    #2: shell-injection-pattern (detected 2026-03-12)
    #3: excessive-token-drain   (detected 2026-03-13)
```

---

## Spawn 安全

当智能体使用 `spawn` 工具创建子进程时，两道内核级守卫保障进程树的安全：

**权限继承是单调的。** 子进程的 `AllowedDevices` 始终是父进程的子集——spawn 一个子进程永远无法**获得**父进程所不具备的能力。这堵死了「派生一个助手去获取被拒设备」的提权路径。

**递归有深度上界。** 既然子进程无法通过被 spawn 而获得新权限，那么一个不断派生子进程去「获取」缺失设备的 LLM 本会无限递归下去。内核将 LLM 可达的进程树深度上限设为 **`MaxSpawnDepth`（8）**。超过该上限的 `spawn` 会被确定性地拒绝：

```
spawn rejected: maximum spawn depth 8 reached (current depth 8).
Child processes inherit your device restrictions and cannot gain new
permissions by spawning deeper. Use complete to report your results
with the devices you have.
```

只有 LLM 发起的 `spawn` 调用才累积深度——`rnix resume`、`compose`、Supervisor 重启以及 CLI 启动的进程都从深度 0 开始，不受影响。在上限处的反复拒绝会喂给熔断器（fingerprint `INTERNAL|spawn`），因此失控的智能体会解开自己的调用链，而非空转。

---

## 能力迁移

当智能体失败且 Supervisor 重启也失败时，系统可以将**未完成的任务迁移**给相似的智能体。

### 相似度矩阵

系统基于 Skill 重叠度和协作历史，维护一个**能力相似度矩阵**：

```
              code-analyst  security-scanner  doc-writer
code-analyst      1.00          0.72            0.35
security-scan     0.72          1.00            0.20
doc-writer        0.35          0.20            1.00
```

当 `security-scanner` 超出重试上限时，其剩余任务可以迁移给 `code-analyst`（相似度：0.72），通过部分上下文传输继续执行。迁移受门控约束——只有当替代智能体在相似度矩阵中展现出可测量的净提升时才会触发，防止盲目切换导致质量退化。

---

## 协作拓扑

系统自动识别和记录**强化路径**——频繁使用的协作模式：

```bash
$ rnix topology
Agent Collaboration Topology:
  code-analyst ──(spawn: 47)──→ security-scanner
  code-analyst ──(pipe: 23)──→ doc-writer
  security-scanner ──(msg: 12)──→ code-analyst

  Reinforced paths (auto-optimized):
    ★ code-analyst → security-scanner → doc-writer (review pipeline)

  Capability overlap:
    code-analyst ↔ security-scanner: 72% (high substitutability)
```

协作数据从生产级 syscall 自动采集——`spawn` 事件记录父→子边，IPC `msg` 事件记录对等通信边——以真实使用遥测数据填充拓扑。高频协作路径**可用于运维洞察**——拓扑作为可观测性工具，展示哪些智能体组合使用最多。

---

## 神经可塑性

当 Compose 工作流中的智能体失败时，系统表现出**神经可塑性**——通过替代路径重新路由任务：

1. **检测** — Supervisor 识别出持续性失败
2. **评估** — 查询相似度矩阵寻找替代者
3. **迁移** — 将任务上下文转移给替代智能体
4. **强化** — 如果迁移成功，则加强该替代路径

这模拟了生物神经可塑性：当一条通路失效时，系统会加强替代通路。

---

## 相关文档

- [智能涌现](/zh/guide/emergence) — 免疫学习与神经可塑性如何产生涌现智能
- [监控与 Supervisor](/zh/guide/monitoring) — 进程监控和重启策略
- [Token 经济](/zh/guide/token-economy) — 预算池和声誉
- [自主智能体](/zh/guide/autonomous-agents) — 统一推理循环
- [Compose 编排](/zh/guide/compose) — 多智能体 DAG 工作流
