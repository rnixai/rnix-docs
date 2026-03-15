# Autonomous Agents (OODA + Stem Cell)

Rnix supports autonomous agent reasoning through the OODA decision loop and stem cell differentiation — agents that observe their environment, make independent decisions, and automatically specialize based on task requirements.

---

## OODA Reasoning Loop

Traditional Rnix agents follow a linear reasoning loop: receive intent → call LLM → execute tools → return result. The OODA (Observe-Orient-Decide-Act) loop replaces this with a self-directed decision cycle.

### The Four Phases

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

| Phase | Action | VFS Operations |
|-------|--------|----------------|
| **Observe** | Read environment state | Read `/proc/*/status`, other process outputs, filesystem changes |
| **Orient** | Assess situation vs objectives | Internal LLM evaluation of current context |
| **Decide** | Choose next action strategy | Select: invoke tool, spawn child, request collaboration, adjust plan |
| **Act** | Execute decision | Write to VFS devices, spawn processes, send IPC messages |

### Enabling OODA Mode

Declare OODA reasoning in `agent.yaml`:

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

### Mission Command

In OODA mode, agents can autonomously spawn child agents using **mission command** — specifying intent without dictating execution details:

```
Parent (OODA) → Spawn "Analyze authentication module"
                  → Child decides HOW to analyze
                  → Child may spawn its own children
                  → Results flow back to parent's Observe phase
```

Child agents run their own OODA loops, making independent decisions about execution strategy.

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

1. **Base agent** starts with only core reasoning capability and OODA loop, no bound Skills
2. **Auto-matching** analyzes the intent against all available Skill metadata to find the best matches
3. **Progressive specialization** loads core Skills first, then dynamically loads additional Skills as needed during execution
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

The Intent System (see [Intent System](/guide/intent-system)) works naturally with OODA agents — the Reconciler decomposes high-level intents into sub-task DAGs, and each node can be executed by an OODA agent that autonomously decides its approach.

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

## Related Documentation

- [Intent System](/guide/intent-system) — Declarative intent decomposition and reconciliation
- [Token Economy](/guide/token-economy) — Budget pools and reputation for agent selection
- [Agents & Skills](/guide/agents-and-skills) — Agent and Skill definitions
- [Compose Orchestration](/guide/compose) — Static multi-agent DAG workflows
