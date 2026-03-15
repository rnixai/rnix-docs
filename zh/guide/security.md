# 安全与自愈

Rnix 实现了一套自适应免疫安全系统，持续监控智能体行为、检测异常、维护威胁记忆，并通过能力迁移实现自愈。

---

## 免疫守护进程

**免疫守护进程（Immune Daemon）** 是一个安全监控进程，持续监视所有智能体的行为模式。

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

免疫守护进程将触发告警，并可自动**挂起**该进程。

### 威胁记忆（抗体记忆）

已识别的异常行为模式会被记录到威胁记忆库中。当相同模式再次出现时，将被**立即阻断**，无需重新检测。

```bash
$ rnix immune status
Security Monitor: active
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

当 `security-scanner` 超出重试上限时，其剩余任务可以迁移给 `code-analyst`（相似度：0.72），通过部分上下文传输继续执行。

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

高频协作路径在后续编排中被**优先使用**——系统会学习哪些智能体组合协作效果最佳。

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

- [监控与 Supervisor](/zh/guide/monitoring) — 进程监控和重启策略
- [Token 经济](/zh/guide/token-economy) — 预算池和信誉
- [自主智能体](/zh/guide/autonomous-agents) — OODA 决策循环
- [Compose 编排](/zh/guide/compose) — 多智能体 DAG 工作流
