# Token Economy & Reputation

Rnix implements a token economy with budget pools, contract SLAs, agent reputation scoring, and Skill synergy emergence for optimized multi-agent resource allocation.

---

## Token Budget Pools

Each Compose workflow is assigned a total token budget pool. Agents request allocations from this shared pool.

### Configuration

```yaml
# compose.yaml
version: "1.0"
intent: "Code review workflow"
budget_pool:
  total: 50000        # Total tokens for the entire workflow
  allocation: priority # priority | equal | proportional

agents:
  analyzer:
    intent: "Analyze code quality"
    agent: "code-analyst"
    budget: 20000      # Agent-level budget (drawn from pool)
    priority: high     # Affects allocation during contention
  doc-gen:
    intent: "Generate docs"
    budget: 15000
    priority: normal
```

### Allocation Strategies

| Strategy | Behavior |
|----------|----------|
| `priority` | High-priority and critical-path agents get more tokens; low-priority tasks are queued or degraded |
| `equal` | Even split across all agents |
| `proportional` | Based on historical consumption patterns |

When agents compete for limited budget, the **price signal mechanism** schedules allocation — critical-path agents get priority, non-critical tasks wait.

### Budget Enforcement

```
Per LLM call:
  proc.TokensUsed += response.TokensUsed

  if budget > 0 && TokensUsed >= budget:
    finishProcess(ExitStatus{Code: 2, Reason: "budget_exceeded"})
```

Exit codes: 0 = normal, 1 = error, **2 = budget exceeded**.

---

## Contract SLA

Agents collaborate through explicit **contracts** that define quality expectations:

### Contract Fields

| Field | Description |
|-------|-------------|
| `input_format` | Expected input structure |
| `output_quality` | Quality criteria (pattern or LLM-evaluated) |
| `max_tokens` | Maximum token consumption |
| `timeout` | Maximum execution time |
| `sla_level` | bronze / silver / gold |

### SLA Evaluation

After contract execution completes, the system automatically evaluates:

1. **Output quality** — Does the result meet the defined criteria?
2. **Token efficiency** — Was the token budget used effectively?
3. **Response time** — Was the execution within timeout?

Evaluation results feed into the reputation system.

---

## Agent Reputation System

Every Agent template accumulates a reputation score based on historical performance:

```bash
$ rnix reputation code-analyst
Agent: code-analyst
  Executions:    47
  Success rate:  93.6%
  Avg tokens:    2,340
  SLA met:       89.4%
  Reputation:    ★★★★☆ (4.2/5.0)

$ rnix reputation            # List all agents by reputation
```

### Reputation Metrics

| Metric | Weight | Description |
|--------|--------|-------------|
| Success rate | 40% | Percentage of tasks completing without error |
| Token efficiency | 25% | Average tokens vs budget utilization |
| SLA compliance | 25% | Percentage of contracts meeting SLA |
| Speed | 10% | Average execution time vs timeout |

### Auto-Selection

When the Reconciler or Compose engine needs to select an Agent template (e.g., for intent decomposition), it **preferentially selects high-reputation templates** — a natural selection mechanism where better-performing agents are used more.

---

## Skill Synergy Emergence

When certain Skills are loaded together, they can produce emergent capabilities beyond their individual functions.

### Declaring Synergy

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

### Auto-Detection

When an agent loads both `security-scan` and `code-analysis`, Rnix automatically:
1. Detects the declared synergy
2. Appends synergy instructions to the system prompt
3. Records the combination's performance in the synergy matrix

### Synergy Matrix

```bash
$ rnix synergy list
Known effective Skill combinations:
  security-scan + code-analysis     → +23% quality  (47 observations)
  code-analysis + dependency-check  → +15% coverage (32 observations)
```

The matrix tracks which Skill combinations historically produce significantly better results than individual Skills, based on reputation system data.

---

## Related Documentation

- [Compose Orchestration](/guide/compose) — Multi-agent workflows with budgets
- [Autonomous Agents](/guide/autonomous-agents) — OODA and stem cell differentiation
- [Agents & Skills](/guide/agents-and-skills) — Agent and Skill definitions
- [Security](/guide/security) — Adaptive immune security
