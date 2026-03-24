# Autonomous Agents (Unified Reasoning + Stem Cell)

Rnix supports autonomous agent reasoning through the unified reasoning loop and stem cell differentiation — agents that autonomously decide their actions each step, and automatically specialize based on task requirements.

---

## Unified Reasoning Loop

Every Rnix agent runs a single `reasonStep` loop. Each step, the LLM autonomously selects one of seven action types:

```
┌─────────────────────────────────────────┐
│           reasonStep Loop               │
│                                         │
│   LLM ──→ ActionType ──→ Execute        │
│    ▲                        │           │
│    └────── context ◄────────┘           │
│                                         │
└─────────────────────────────────────────┘
```

| ActionType | Description |
|------------|-------------|
| `tool_call` | Execute a VFS tool call directly |
| `plan` | Output an execution plan, written to context as RoleAssistant |
| `spawn` | Create a child process (mission command) |
| `complete` | Output final result and exit (code=0) |
| `specialize` | Dynamically load a Skill (stem cell progressive specialization) |
| `replan` | Revise the current plan |
| `text` | Plain text output (final answer) |

### Planning Configuration

Planning is a configurable capability, not a separate mode:

```yaml
name: autonomous-analyst
description: "Self-directed code analysis agent"
planning: true              # default: true — LLM can choose to plan
models:
  preferred: sonnet
skills:
  - code-analysis
  - security-scan
```

- `planning: true` (default) — plan/replan guidance injected into prompt, LLM can choose to plan before executing
- `planning: false` — no plan guidance in prompt, LLM executes tools directly

### Built-in Safety Mechanisms

- **VFS flags auto-downgrade**: empty payload → `O_RDONLY`, non-empty → `O_RDWR`
- **Error injection**: tool errors are injected as tool messages into LLM context, so the LLM can perceive and adjust strategy
- **Circuit breaker**: 3 consecutive tool_call/spawn failures triggers automatic process termination (exit code=1)
- **Recoverable errors**: specialize/plan/replan failures do not count toward circuit breaker (recoverable logic errors)

### Mission Command

Agents can autonomously spawn child agents using **mission command** — specifying intent without dictating execution details:

```
Parent → Spawn "Analyze authentication module"
           → Child decides HOW to analyze
           → Child may spawn its own children
           → Results flow back to parent context
```

Child agents run their own reasonStep loops, making independent decisions about execution strategy.

---

## Stem Cell Differentiation

Rnix provides a universal base agent (Stem Agent) that automatically specializes based on the task it receives.

### How It Works

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

1. **Base agent** starts with only core reasoning capability and unified reasoning loop, no bound Skills
2. **Auto-matching** analyzes the intent against all available Skill metadata to find the best matches
3. **Progressive specialization** loads core Skills first, then dynamically loads additional Skills via `specialize` action as needed during execution
4. **Epigenetic memory** records differentiation paths (which Skills, in what order) for each project — next time a similar intent arrives, the agent can rapidly re-differentiate

### Differentiation Lineage

View the complete differentiation path:

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

## Intent-Driven Decomposition

The Intent System (see [Intent System](/guide/intent-system)) works naturally with autonomous agents — the Reconciler decomposes high-level intents into sub-task DAGs, and each node can be executed by an agent that autonomously decides its approach through the unified reasoning loop.

```
User Intent: "Refactor authentication to use JWT"
    │
    ├── [Reconciler decomposes]
    │
    ├── analyze → autonomously decides what to examine
    ├── design  → plans architecture approach, spawns sub-agents if needed
    ├── implement → executes tools, spawns sub-agents as needed
    └── test    → decides test strategy, runs verification
```

---

## Related Documentation

- [Intent System](/guide/intent-system) — Declarative intent decomposition and reconciliation
- [Token Economy](/guide/token-economy) — Budget pools and reputation for agent selection
- [Agents & Skills](/guide/agents-and-skills) — Agent and Skill definitions
- [Compose Orchestration](/guide/compose) — Static multi-agent DAG workflows
