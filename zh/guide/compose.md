# Compose 编排

通过 YAML 定义多智能体 DAG 工作流。Compose 引擎处理依赖解析、并行调度、结果传递、token 预算池和 SLA 合约。

---

## 快速开始

```yaml
# compose.yaml
version: "1.0"
intent: "Code review workflow"
model: "haiku"

agents:
  analyzer:
    intent: "Analyze code quality of kernel/kernel.go"
    agent: "code-analyst"
  doc-gen:
    intent: "Generate improvement documentation"
    depends_on:
      analyzer: completed
  checker:
    intent: "Verify analysis quality"
    depends_on:
      doc-gen: completed
```

```bash
$ rnix compose up
compose | Code review workflow | starting
[layer 1/3] analyzer   PID 5 | completed | 3.8s | 1,450 tokens ✓
[layer 2/3] doc-gen    PID 6 | completed | 4.2s | 1,180 tokens ✓
[layer 3/3] checker    PID 7 | completed | 2.5s | 890 tokens ✓
compose | completed | 3/3 agents | 10.5s | 3,520 tokens
```

---

## DAG 调度

引擎自动完成：

1. **解析依赖图** — 从 `depends_on` 构建 DAG
2. **拓扑排序** — 确定执行层次
3. **并行执行** — 同一层的智能体并发运行
4. **结果注入** — 上游输出注入到下游上下文中

```
analyzer ──→ doc-gen ──→ checker      # 线性
    A ←─ C ─→ B                       # C 阻塞两者；C 完成后 A、B 并行
```

---

## Agent 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `intent` | string | 任务描述 |
| `agent` | string | 命名的 Agent 定义（可选） |
| `model` | string | 模型覆盖 |
| `provider` | string | 提供商覆盖 |
| `depends_on` | map | `<上游>: completed` |
| `timeout` | duration | 执行超时 |
| `max_retries` | int | 失败重试次数 |
| `budget` | int | Token 预算（从池中分配） |
| `priority` | string | `high` / `normal` / `low` |

---

## Token 预算池

为工作流分配共享的 token 预算：

```yaml
budget_pool:
  total: 50000
  allocation: priority    # priority | equal | proportional

agents:
  critical-agent:
    budget: 20000
    priority: high
  helper-agent:
    budget: 5000
    priority: low
```

当多个智能体竞争有限预算时，高优先级智能体优先获得分配。详见 [Token 经济](/zh/guide/token-economy)。

---

## SLA 合约

定义智能体之间的质量期望：

```yaml
agents:
  analyzer:
    intent: "Analyze code"
    contract:
      output_quality: "Must contain at least 3 actionable items"
      max_tokens: 3000
      timeout: 30s
      sla_level: gold
```

执行完成后的 SLA 评估结果会反馈到[声誉系统](/zh/guide/token-economy)。

---

## 命令

```bash
rnix compose up              # 启动工作流
rnix compose up --json       # JSON 输出
rnix compose down            # 停止所有智能体并清理
```

---

## 相关文档

- [AgentShell](/zh/guide/agentshell) — 基于脚本的编排
- [Intent 系统](/zh/guide/intent-system) — 声明式意图分解
- [Token 经济](/zh/guide/token-economy) — 预算池与声誉
- [监控](/zh/guide/monitoring) — rnix top 实时进程视图
