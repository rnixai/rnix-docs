# 自主智能体（统一推理 + 干细胞）

Rnix 通过统一推理循环和干细胞分化机制支持自主智能体推理——智能体每步自主决策行为类型，并根据任务需求自动特化。

---

## 统一推理循环

每个 Rnix 智能体运行单一 `reasonStep` 循环。每步中，LLM 自主选择七种行为类型之一：

```
┌─────────────────────────────────────────┐
│           reasonStep 循环               │
│                                         │
│   LLM ──→ ActionType ──→ 执行          │
│    ▲                        │           │
│    └────── context ◄────────┘           │
│                                         │
└─────────────────────────────────────────┘
```

| ActionType | 说明 |
|------------|------|
| `tool_call` | 直接执行 VFS 工具调用 |
| `plan` | 输出执行计划，以 RoleAssistant 写入上下文 |
| `spawn` | 创建子进程（任务式指挥） |
| `complete` | 输出最终结果并退出（code=0） |
| `specialize` | 动态加载 Skill（干细胞渐进式特化） |
| `replan` | 修正当前计划 |
| `text` | 纯文本输出（最终答案） |

### Planning 配置

Planning 是可配置的能力，而非独立模式：

```yaml
name: autonomous-analyst
description: "Self-directed code analysis agent"
planning: true              # 默认: true — LLM 可选择规划
models:
  preferred: deepseek-v4-flash
skills:
  - code-analysis
  - security-scan
```

- `planning: true`（默认）— prompt 注入 plan/replan 指引，LLM 可选择先规划再执行
- `planning: false` — prompt 不含 plan 指引，LLM 直接执行工具调用

### 内置安全机制

- **VFS flags 自动降级**：空 payload 时 `O_RDONLY`，非空时 `O_RDWR`
- **错误注入**：工具错误以 tool message 注入 LLM 上下文，LLM 可感知并调整策略
- **熔断机制**：连续 3 次 tool_call/spawn 失败触发自动终止进程（exit code=1）
- **可恢复错误**：specialize/plan/replan 失败不计入熔断（可恢复逻辑错误）

### 使命式指挥

智能体可以通过**使命式指挥（Mission Command）** 自主派生子智能体——只指定意图，不规定执行细节：

```
Parent → Spawn "Analyze authentication module"
           → Child decides HOW to analyze
           → Child may spawn its own children
           → Results flow back to parent context
```

子智能体运行各自的 reasonStep 循环，独立决定执行策略。

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

1. **基础智能体**仅具备核心推理能力和统一推理循环，不绑定任何 Skill
2. **自动匹配**根据所有可用 Skill 的元数据分析意图，找到最佳匹配。匹配到的技能随后使用声誉分数和协同矩阵数据重新排序——高表现的技能组合被优先选择，同时 ε-探索参数防止"强者恒强"的锁定效应
3. **渐进特化**先加载核心 Skill，执行过程中通过 `specialize` action 按需动态加载更多 Skill
4. **分化记忆（DiffMemory）** 记录意图→技能的映射关系，并以 JSON Lines 文件持久化到 `$PROJECT/.rnix/diffmemory/`。daemon 重启时自动加载历史映射。当相似意图再次到来时，先前成功的技能组合被即时召回，跳过匹配计算

### 分化谱系

谱系系统提供分化过程的**观测性遥测**——记录发生了什么，但不影响未来的 spawn 或选择决策。查看完整的分化路径：

```bash
$ rnix lineage <pid>
PID 5: autonomous-analyst
  Base: stem-agent
  Differentiation path:
    1. [auto] security-scan       (intent match: 0.95)
    2. [auto] code-analysis       (intent match: 0.90)
    3. [runtime] dependency-check  (loaded at step 4, tool need)
```

### 反馈闭环：声誉 → 干细胞匹配

分化不是一次性过程——它通过闭环反馈持续改进：

```
意图 → StemMatcher（关键词匹配）
         → 声誉 + 协同重新排序
            → 使用选定技能 Spawn
               → 执行结果
                  → RecordResult（声誉更新）
                  → RecordCombo（协同矩阵更新）
                     → 下次匹配受益于累积数据
```

这意味着系统表现出**自然选择**：产生更好结果的技能组合逐渐被优先选择，同时 ε-探索参数确保新组合仍有被尝试的机会。

---

## 意图驱动分解

意图系统（参见 [意图系统](/zh/guide/intent-system)）与自主智能体天然协作——Reconciler 将高层意图分解为子任务 DAG，每个节点由智能体通过统一推理循环自主决定其执行方式。

```
User Intent: "Refactor authentication to use JWT"
    │
    ├── [Reconciler decomposes]
    │
    ├── analyze → 自主决定检查什么
    ├── design  → 规划架构方案，按需派生子智能体
    ├── implement → 执行工具，按需派生子智能体
    └── test    → 决定测试策略，运行验证
```

---

## 相关文档

- [智能涌现](/zh/guide/emergence) — 分化、声誉与协同如何产生涌现智能
- [意图系统](/zh/guide/intent-system) — 声明式意图分解与协调
- [Token 经济](/zh/guide/token-economy) — 预算池、声誉与协同反馈
- [安全与自愈](/zh/guide/security) — 免疫系统与神经可塑性
- [智能体与 Skill](/zh/guide/agents-and-skills) — 智能体和 Skill 定义
- [Compose 编排](/zh/guide/compose) — 静态多智能体 DAG 工作流
