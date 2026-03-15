# 自主智能体（OODA + 干细胞）

Rnix 通过 OODA 决策循环和干细胞分化机制支持自主智能体推理——智能体能够观察环境、独立做出决策，并根据任务需求自动特化。

---

## OODA 推理循环

传统 Rnix 智能体遵循线性推理循环：接收意图 → 调用 LLM → 执行工具 → 返回结果。OODA（Observe-Orient-Decide-Act）循环将其替换为自主驱动的决策循环。

### 四个阶段

```
┌──────────────────────────────────────┐
│                                      │
│   ┌─────────┐     ┌─────────┐       │
│   │ Observe │────→│ Orient  │       │
│   └─────────┘     └────┬────┘       │
│        ▲                │            │
│        │                ▼            │
│   ┌────┴────┐     ┌─────────┐       │
│   │   Act   │←────│ Decide  │       │
│   └─────────┘     └─────────┘       │
│                                      │
└──────────────────────────────────────┘
```

| 阶段 | 行为 | VFS 操作 |
|------|------|---------|
| **Observe（观察）** | 读取环境状态 | 读取 `/proc/*/status`、其他进程输出、文件系统变更 |
| **Orient（定向）** | 评估态势与目标的偏差 | 通过 LLM 内部评估当前上下文 |
| **Decide（决策）** | 选择下一步行动策略 | 选择：调用工具、派生子进程、请求协作、调整计划 |
| **Act（行动）** | 执行决策 | 向 VFS 设备写入、派生进程、发送 IPC 消息 |

### 启用 OODA 模式

在 `agent.yaml` 中声明 OODA 推理：

```yaml
name: autonomous-analyst
description: "Self-directed code analysis agent"
reasoning: ooda          # Enable OODA loop (default: linear)
models:
  preferred: sonnet
skills:
  - code-analysis
  - security-scan
```

### 使命式指挥

在 OODA 模式下，智能体可以通过**使命式指挥（Mission Command）** 自主派生子智能体——只指定意图，不规定执行细节：

```
Parent (OODA) → Spawn "Analyze authentication module"
                  → Child decides HOW to analyze
                  → Child may spawn its own children
                  → Results flow back to parent's Observe phase
```

子智能体运行各自的 OODA 循环，独立决定执行策略。

---

## 干细胞分化

Rnix 提供一个通用基础智能体（干细胞智能体），可根据接收到的任务自动特化。

### 工作原理

```
Generic Stem Agent (no Skills)
         │
         │  Receives intent: "Analyze security vulnerabilities"
         ▼
    Auto-match Skills
         │  → code-analysis (relevance: 0.9)
         │  → security-scan (relevance: 0.95)
         ▼
    Differentiated Agent
    Skills: [security-scan, code-analysis]
    Capabilities: /dev/fs, /dev/shell
```

1. **基础智能体**仅具备核心推理能力和 OODA 循环，不绑定任何 Skill
2. **自动匹配**根据所有可用 Skill 的元数据分析意图，找到最佳匹配
3. **渐进特化**先加载核心 Skill，执行过程中按需动态加载更多 Skill
4. **表观遗传记忆**记录每个项目的分化路径（哪些 Skill、何种顺序）——下次类似意图到来时，智能体可以快速重新分化

### 分化谱系

查看完整的分化路径：

```bash
$ rnix lineage <pid>
PID 5: autonomous-analyst
  Base: stem-agent
  Differentiation path:
    1. [auto] security-scan       (intent match: 0.95)
    2. [auto] code-analysis       (intent match: 0.90)
    3. [runtime] dependency-check  (loaded at step 4, tool need)
  Project memory: ~/.rnix/lineage/project-abc/security-analyst.json
```

---

## 意图驱动分解

意图系统（参见 [意图系统](/zh/guide/intent-system)）与 OODA 智能体天然协作——Reconciler 将高层意图分解为子任务 DAG，每个节点可由一个 OODA 智能体自主决定其执行方式。

```
User Intent: "Refactor authentication to use JWT"
    │
    ├── [Reconciler decomposes]
    │
    ├── analyze (OODA agent) → observes code, decides what to examine
    ├── design (OODA agent)  → orients on patterns, decides architecture
    ├── implement (OODA agent) → acts on design, spawns sub-agents as needed
    └── test (OODA agent)    → observes implementation, decides test strategy
```

---

## 相关文档

- [意图系统](/zh/guide/intent-system) — 声明式意图分解与协调
- [Token 经济](/zh/guide/token-economy) — 预算池和信誉用于智能体选择
- [智能体与 Skill](/zh/guide/agents-and-skills) — 智能体和 Skill 定义
- [Compose 编排](/zh/guide/compose) — 静态多智能体 DAG 工作流
