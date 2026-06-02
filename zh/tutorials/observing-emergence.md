# 教程 4：观察智能涌现

本教程带你亲手体验 Rnix 的智能涌现——从干细胞分化到声誉驱动的自然选择。完成后你将看到，涌现不是玄学：它是可观测的、可测量的反馈闭环。

---

## 前置条件

- 完成 [教程 1：编写第一个 Skill](/zh/tutorials/writing-first-skill)（熟悉 Skill 和 Agent 创建）
- Rnix 已安装且配置了可用的 LLM 提供商（参见 [LLM 提供商](/zh/guide/llm-providers)）
- 了解 Rnix 进程基础概念（参见 [核心概念](/zh/guide/concepts)）

---

## 你将学到

1. 干细胞智能体如何根据意图自动分化
2. 如何用 `rnix lineage` 观察分化过程
3. DiffMemory 如何加速重复意图
4. 声誉如何累积并影响技能选择
5. 免疫系统如何被动监控智能体行为
6. 协作拓扑如何记录智能体交互

---

## 步骤 0：清理涌现数据

本教程使用教程 1 的 `rnix-tutorial/` 项目。如果尚未创建，请先完成 [教程 1 步骤零](/zh/tutorials/writing-first-skill#步骤零-搭建示例项目)。

> **重要提示：** 本教程观察涌现效应（声誉、DiffMemory、免疫画像）从零开始积累的过程。之前教程留下的数据会干扰结果。开始前请清理涌现相关数据：

```bash
cd rnix-tutorial
rnix daemon stop
# 涌现数据存储在全局数据目录下（默认 ~/.local/share/rnix/）
rm -rf "${RNIX_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/rnix}"/{reputation,diffmemory,immune}
```

如果你跳过了教程 1–3，还需要创建 `src/utils.go` 示例文件（`src/server.go` 在教程 1 中已创建）：

```bash
cat > src/utils.go << 'EOF'
package main

import (
    "crypto/md5"
    "fmt"
    "strings"
)

func HashPassword(password string) string {
    h := md5.Sum([]byte(password))
    return fmt.Sprintf("%x", h)
}

func SanitizeInput(input string) string {
    return strings.ReplaceAll(input, "'", "")
}

func BuildQuery(table, where string) string {
    return fmt.Sprintf("SELECT * FROM %s WHERE %s", table, where)
}
EOF
```

这些文件包含故意的安全问题（命令注入、XSS、弱哈希、SQL 注入）——非常适合测试代码分析和安全扫描。

### 创建 Security Scan 技能

本教程将演示多个 Skill 之间的协同效应。Rnix 自带一个内置的 `code-analysis` Skill。创建一个互补的 `security-scan` Skill，这样 StemMatcher 就能同时加载两者：

```bash
mkdir -p .rnix/skills/security-scan
cat > .rnix/skills/security-scan/SKILL.md << 'EOF'
---
name: security-scan
description: >
  Scan source code for security vulnerabilities including injection attacks,
  authentication flaws, cryptographic weaknesses, and unsafe data handling.
allowed-tools: /dev/fs
metadata:
  author: tutorial
  version: "1.0"
---

# Security Scan

Scan source code for security vulnerabilities.

## Vulnerability categories

- **Injection**: SQL injection, command injection, path traversal
- **Authentication**: Missing auth checks, hardcoded credentials, weak hashing
- **Cryptographic**: MD5/SHA1 for passwords, weak random, hardcoded keys
- **Cross-site scripting**: Unescaped user input in HTML output
- **Input validation**: Missing sanitization, length limits, or type checks

## Workflow

1. Read the target file(s) via /dev/fs
2. Check each vulnerability category systematically
3. Classify findings as Critical / High / Medium
4. Report with file location, issue description, and fix suggestion
EOF
```

现在你有了两个分析类 Skill——`code-analysis`（内置）和 `security-scan`（刚创建）。步骤 4 将展示它们同时加载时如何产生协同效应。

---

## 步骤 1：观察干细胞分化

### 发生了什么

当你 spawn 一个进程而不指定 `--agent` 时，Rnix 默认使用**干细胞智能体**（stem agent）——一个不绑定任何 Skill 的通用智能体。StemMatcher 分析你的意图关键词，自动加载最匹配的 Skill。

### 试试看

```bash
rnix -i "Analyze the code quality of src/server.go"
```

观察 spawn 输出——`[stem]` 前缀行显示了自动匹配过程：

```
[kernel] spawning PID 1 (uuid: a1b2c3d4e5f6..., <provider>/<model>)...
[stem]   intent match: code-analysis (0.29)
[stem]   selected: [code-analysis]
[agent/1] step 1: /dev/fs → package main  import ( ...
[agent/1] step 2: /dev/fs → {"matches":[ ...
...
[kernel] PID 1 exited(0) | <provider>/<model> | tokens: 2,340 | elapsed: 4.2s
```

StemMatcher 使用**关键词重叠率**对意图和可用 Skill 做匹配。分数范围是 0.0–1.0，反映了意图关键词与 Skill 名称/描述关键词的交集比例。分数取决于你项目中安装的 Skill 及其描述文本。

> **注意：** 如果你的项目没有安装任何 Skill，`[stem]` 行不会出现——StemMatcher 找不到匹配时静默跳过。请确保至少有一个 Skill（教程 1 中创建了 `code-analysis`）。

### 查看分化谱系

```bash
rnix lineage 1
```

```
Lineage for PID 1

[1] 2026-06-02 10:30:00  initial differentiation
    Skills: code-analysis
    Trigger: "Analyze the code quality of src/server.go"
    Source: keyword-match
```

谱系是**观测性遥测**——记录发生了什么，但不影响未来的决策。把它当作审计追踪。

---

## 步骤 2：观察 DiffMemory 加速重复意图

### 首次运行——完整匹配

第一次运行某个意图时，StemMatcher 对所有可用 Skill 做完整的关键词扫描。匹配结果被记录到 DiffMemory。

### 再次运行——记忆召回

再运行同样的意图：

```bash
rnix -i "Analyze the code quality of src/server.go"
```

这次 DiffMemory 识别出意图签名（标准化：小写 + 单词排序），即时召回之前的技能映射——无需关键词扫描。你会看到 `[stem]` 输出变为 `memory recall`：

```
[stem]   memory recall: [code-analysis]
```

### 验证 DiffMemory 正在工作

DiffMemory 以 JSON Lines 文件持久化到磁盘。检查文件：

```bash
cat ~/.local/share/rnix/diffmemory/diffmemory.json 2>/dev/null | head -5
```

你应该看到类似这样的条目：

```json
{"intent":"Analyze the code quality of src/server.go","skills":["code-analysis"],"timestamp":"2026-06-01T10:30:00Z","hit_count":2}
```

`hit_count` 字段在每次相同意图模式被召回时递增。

---

## 步骤 3：通过多次执行积累声誉

### 运行多个任务

执行几个任务来积累声誉数据：

```bash
rnix -i "Analyze code quality of src/server.go"
rnix -i "Analyze code quality of src/utils.go"
rnix -i "Check security vulnerabilities in src/server.go"
```

每次成功执行都通过 `RecordResult` 反馈到声誉系统。

### 查看声誉分数

```bash
rnix reputation
```

```
AGENT                SCORE  SUCCESS  AVG TOKENS  AVG DURATION  RECORDS  TREND
stem                  0.85  100.0%       2,150      4200ms        3  stable
```

声誉分数由成功率（70% 权重）和 Token 效率（30% 权重）综合计算。运行次数更多、成功率更高的智能体积累更高的分数。

### 查看特定智能体

```bash
rnix reputation stem
```

```
Agent: stem
Score: 0.85
Success Rate: 100.0%
Avg Token Usage: 2,150
Avg Duration: 4200ms
Total Records: 3
Trend: stable
```

---

## 步骤 4：观察协同效应

### 什么是协同

当某些 Skill 被同时加载时，它们可以产生超越各自功能的涌现能力。协同矩阵追踪哪些组合历史上表现更好。

Rnix 内置了两个分析类 Skill：`code-analysis`（通用代码质量）和 `security-scan`（安全漏洞扫描）。当两者同时匹配同一个 intent 时，它们会被一起加载，组合使用记录会被写入协同矩阵。

### 触发多技能任务

运行一个受益于多个 Skill 的任务——示例文件有大量安全问题可供发现：

```bash
rnix -i "Perform a security-aware code review of src/server.go"
```

观察 stem 输出——你应该看到两个 Skill 同时被匹配：

```
[stem]   intent match: code-analysis (0.30), security-scan (0.10)
[stem]   selected: [code-analysis, security-scan]
```

StemMatcher 发现了关键词重叠："code" 和 "review" 匹配 `code-analysis`，"security" 匹配 `security-scan`。两者都被加载，进程完成后它们的协同关系会被记录。

### 查看协同矩阵

```bash
rnix synergy list
```

```
SKILLS                    SUCCESS  AVG TOKENS  EXECUTIONS   VS SOLO  TOKEN GAIN  STATUS
code-analysis,security-sc  100.0%       3,200           1        -           -  -
```

随着更多任务成功使用这个组合，协同分数会增加——VS SOLO 和 TOKEN GAIN 列会显示组合与单独使用相比的表现差异。当组合成功率显著高于单独使用时，STATUS 列会显示 `recommended`，未来的干细胞匹配会优先选择经过验证的组合。

---

## 步骤 5：检查免疫系统

### 默认行为：观测模式

免疫系统**默认启用，以 warn-only 模式运行**。它静默监控每个进程，不干预运行。

### 查看免疫状态

```bash
rnix immune status
```

```
Immune Daemon: running (uptime: 5m30s)
Mode: warn-only
Security: OK
Profiles: 0
Active Monitors: 0
Threat Memory: 0 signatures

No behavior profiles established.
```

运行几个进程后，免疫系统开始构建行为基线。当某个 agent 模板积累至少 5 个样本后，异常检测才会激活。

### 理解学习期

用同一个 agent 模板运行更多任务来构建行为画像：

```bash
for i in 1 2 3 4 5; do
  rnix -i "Analyze code quality of src/server.go"
done
```

然后再次检查状态：

```bash
rnix immune status
```

```
Immune Daemon: running (uptime: 10m15s)
Mode: warn-only
Security: OK
Profiles: 1
Active Monitors: 0
Threat Memory: 0 signatures

AGENT TEMPLATE       SAMPLES  TOKEN RATE (avg)  DURATION (avg)  LAST UPDATED
stem                       5        320.5 tok/s           4.2s  2026-06-02
```

免疫系统现在拥有了 `stem` 的正常行为画像——它知道典型的 token 消耗速率和执行时长范围。任何显著偏离（超过 3σ）的未来执行都会触发 warn-only 模式下的告警。

---

## 步骤 6：查看协作拓扑

### 运行多智能体任务

使用管道语法创建智能体协作。第一阶段使用教程 1 中创建的 `summarizer` 智能体，第二阶段使用默认的 stem 智能体：

```bash
rnix -i 'spawn "Analyze src/server.go" --agent=summarizer | spawn "Summarize the analysis"'
```

这在协作拓扑中创建了一条两个不同智能体之间的协作边。

### 查看拓扑

```bash
rnix topology
```

```
Collaboration Topology (2 agents, 1 edges)

NODES:
AGENT                REPUTATION  CONNECTIONS
stem                       0.00            1
summarizer                 0.00            1

EDGES:
FROM                 TO                   SPAWN  MSG  TOTAL  REINFORCED
summarizer           stem                     1    0      1
```

随着更多协作事件积累，拓扑会揭示哪些智能体组合使用最频繁——有价值的运维洞察。当同一对智能体的交互次数超过阈值（默认 5 次），该路径会在 REINFORCED 列标记。

---

## 汇总

你现在已经观察了 [智能涌现](/zh/guide/emergence) 中描述的全部五种涌现效应：

| 效应 | 你观察到的 | CLI 命令 |
|------|-----------|----------|
| **自然选择** | 声誉分数区分智能体表现 | `rnix reputation` |
| **记忆加速** | DiffMemory 在第二次运行时召回技能映射 | `cat ~/.local/share/rnix/diffmemory/diffmemory.json` |
| **神经可塑性** | 相似度矩阵支持能力迁移 | `rnix immune similarity <agent>` |
| **被动免疫学习** | 5+ 样本后构建行为画像 | `rnix immune status` |
| **协作发现** | 拓扑记录 spawn 边 | `rnix topology` |

### 实践中的反馈闭环

```
你运行了任务 → 声誉积累 → 协同被记录
                                    ↓
下次干细胞匹配使用声誉 + 协同来重新排序技能
                                    ↓
更好的技能选择 → 更好的结果 → 更高的声誉
                                    ↓
                            闭环持续运转...
```

你运行的每个任务都让系统在将技能匹配到意图方面变得更好一点。这就是智能涌现——不是一个巧妙的算法，而是许多简单的反馈闭环随时间复合。

---

## 清理

实验完成后，停止 daemon 并可选地删除示例项目：

```bash
rnix daemon stop
cd .. && rm -rf rnix-tutorial
```

---

## 下一步

- [智能涌现](/zh/guide/emergence) — 涌现堆栈的完整概念解释
- [自主智能体](/zh/guide/autonomous-agents) — 干细胞分化与统一推理
- [Token 经济与声誉](/zh/guide/token-economy) — 预算池、SLA 与协同详情
- [安全与自愈](/zh/guide/security) — 免疫系统配置与神经可塑性
