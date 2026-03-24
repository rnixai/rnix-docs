# Token 经济与声誉

Rnix 实现了 token 经济体系，包含预算池、合约 SLA、智能体声誉评分和 Skill 协同涌现，用于优化多智能体资源分配。

---

## Token 预算池

每个 Compose 工作流被分配一个总 token 预算池。智能体从这个共享池中请求分配额度。

### 配置

```yaml
# compose.yaml
version: "1.0"
intent: "Code review workflow"
budget_pool:
  total: 50000        # 整个工作流的总 token 数
  allocation: priority # priority | equal | proportional

agents:
  analyzer:
    intent: "Analyze code quality"
    agent: "code-analyst"
    budget: 20000      # 智能体级别的预算（从池中分配）
    priority: high     # 影响竞争时的分配
  doc-gen:
    intent: "Generate docs"
    budget: 15000
    priority: normal
```

### 分配策略

| 策略 | 行为 |
|------|------|
| `priority` | 高优先级和关键路径上的智能体获得更多 token；低优先级任务排队或降级 |
| `equal` | 所有智能体均分 |
| `proportional` | 基于历史消耗模式分配 |

当多个智能体竞争有限预算时，**价格信号机制**调度分配——关键路径智能体优先，非关键任务等待。

### 预算强制执行

```
每次 LLM 调用：
  proc.TokensUsed += response.TokensUsed

  if budget > 0 && TokensUsed >= budget:
    finishProcess(ExitStatus{Code: 2, Reason: "budget_exceeded"})
```

退出码：0 = 正常，1 = 错误，**2 = 预算超限**。

---

## 合约 SLA

智能体通过显式**合约**协作，定义质量期望：

### 合约字段

| 字段 | 说明 |
|------|------|
| `input_format` | 预期输入结构 |
| `output_quality` | 质量标准（模式匹配或 LLM 评估） |
| `max_tokens` | 最大 token 消耗量 |
| `timeout` | 最大执行时间 |
| `sla_level` | bronze / silver / gold |

### SLA 评估

合约执行完成后，系统自动评估：

1. **输出质量** — 结果是否满足定义的标准？
2. **Token 效率** — Token 预算是否被有效利用？
3. **响应时间** — 执行是否在超时范围内完成？

评估结果反馈到声誉系统。

---

## 智能体声誉系统

每个 Agent 模板基于历史表现累积声誉分数：

```bash
$ rnix reputation code-analyst
Agent: code-analyst
  Executions:    47
  Success rate:  93.6%
  Avg tokens:    2,340
  SLA met:       89.4%
  Reputation:    ★★★★☆ (4.2/5.0)

$ rnix reputation            # 按声誉列出所有智能体
```

### 声誉指标

| 指标 | 权重 | 说明 |
|------|------|------|
| 成功率 | 40% | 无错误完成任务的百分比 |
| Token 效率 | 25% | 平均 token 使用量与预算利用率 |
| SLA 达标率 | 25% | 满足合约 SLA 的百分比 |
| 速度 | 10% | 平均执行时间与超时的比值 |

### 自动选择

当 Reconciler 或 Compose 引擎需要选择 Agent 模板时（例如用于意图分解），会**优先选择高声誉模板**——这是一种自然选择机制，表现更好的智能体会被更多使用。

---

## Skill 协同涌现

当某些 Skill 被同时加载时，它们可以产生超越各自功能的涌现能力。

### 声明协同

```yaml
# skills/security-scan/SKILL.md frontmatter
---
name: security-scan
description: "Scan for security vulnerabilities"
allowed-tools: /dev/fs /dev/shell
synergy:
  code-analysis:
    description: "When combined with code-analysis, enables deep security-aware code review"
    instructions: |
      With both security-scan and code-analysis active, you can:
      - Correlate code quality issues with security implications
      - Identify security anti-patterns in code structure
      - Generate security-annotated code review reports
---
```

### 自动检测

当智能体同时加载 `security-scan` 和 `code-analysis` 时，Rnix 自动：
1. 检测声明的协同关系
2. 将协同指令追加到系统提示词
3. 在协同矩阵中记录该组合的表现

### 协同矩阵

```bash
$ rnix synergy list
Known effective Skill combinations:
  security-scan + code-analysis     → +23% quality  (47 observations)
  code-analysis + dependency-check  → +15% coverage (32 observations)
```

协同矩阵追踪哪些 Skill 组合在历史上产生了显著优于单个 Skill 的效果，数据基于声誉系统。

---

## 相关文档

- [Compose 编排](/zh/guide/compose) — 带预算的多智能体工作流
- [自主智能体](/zh/guide/autonomous-agents) — 统一推理与干细胞分化
- [Agent 与 Skill](/zh/guide/agents-and-skills) — Agent 与 Skill 定义
- [安全](/zh/guide/security) — 自适应免疫安全
