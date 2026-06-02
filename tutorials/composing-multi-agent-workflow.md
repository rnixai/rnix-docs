# Tutorial 3: Composing Multi-Agent Workflows

This tutorial walks you through using Rnix Compose to orchestrate multiple agents collaborating on a complex task, and monitoring execution in real-time with `rnix top`.

---

## Prerequisites

- Completed [Tutorial 1: Writing Your First Skill](/tutorials/writing-first-skill) (familiar with Skill and Agent creation)
- Working in the `rnix-tutorial/` project from Tutorial 1 (with DeepSeek provider configured). Any process data left from earlier tutorials does not affect this tutorial
- Basic understanding of Rnix process and VFS concepts (see [Core Concepts](/guide/concepts))

---

## What You Will Learn

1. How to design multi-agent DAG workflows
2. How to write `compose.yaml` to define agent dependencies
3. How to launch workflows with `rnix compose up`
4. How to monitor execution in real-time with `rnix top`
5. How to use pipe syntax and AgentShell scripts for more flexible orchestration

---

## Step 1: Design the Multi-Agent Workflow

### Scenario

We will build a code review workflow with three stages:

1. **Analyzer** — reads code files and outputs a code quality analysis
2. **Doc Generator (doc-gen)** — generates improvement documentation based on the analysis
3. **Checker** — verifies the quality of the analysis and documentation

### DAG Dependencies

```
analyzer ──→ doc-gen ──→ checker
```

`doc-gen` depends on `analyzer` completing first, and `checker` depends on `doc-gen` completing first. This is a simple linear DAG.

The Rnix Compose DAG scheduling engine automatically resolves dependencies and determines execution order through topological sorting. If the dependency graph allows parallelism (e.g., both A and B depend on C, then A and B can execute in parallel), the engine schedules them concurrently.

### Preparing Agents

You can reuse the Agent from Tutorial 1 or use the existing `code-analyst`. This tutorial uses the built-in `code-analyst` Agent and the default Agent (no additional setup needed).

---

## Step 2: Write compose.yaml

Create `compose.yaml` in the project's `.rnix/` directory (i.e. `.rnix/compose.yaml`, the default path `rnix compose up` looks for):

```yaml
version: "1.0"
intent: "Code review workflow"
model: "deepseek-v4-flash"
agents:
  analyzer:
    intent: "Analyze code quality of src/server.go"
    agent: "code-analyst"
  doc-gen:
    intent: "Generate improvement documentation based on analysis results"
    depends_on:
      analyzer: completed
  checker:
    intent: "Verify the quality and completeness of analysis and recommendations"
    depends_on:
      doc-gen: completed
```

### Field Reference

| Field | Description |
|-------|-------------|
| `version` | Compose spec version (currently `"1.0"`) |
| `intent` | Overall workflow description |
| `model` | Global default model (individual agents can override) |
| `agents` | Agent definition map |
| `agents.<name>.intent` | Task description for this agent |
| `agents.<name>.agent` | Named agent definition to use (optional, defaults to generic agent) |
| `agents.<name>.depends_on` | Dependencies: `<upstream_agent>: completed` |

### How the DAG Scheduling Engine Works

After reading `compose.yaml`, the Compose engine:

1. **Parses the dependency graph** — builds a directed acyclic graph (DAG) from all agents and `depends_on` relationships
2. **Topological sort** — determines execution layers (agents with no dependencies go in layer 1, those depending on them in layer 2, etc.)
3. **Layer-level parallelism** — agents in the same layer execute concurrently
4. **Result passing** — upstream agent output is injected into downstream agent context

---

## Step 3: Run rnix compose up

```bash
rnix compose up
```

The Compose engine launches the workflow:

```
compose | Code review workflow | starting
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[layer 1/3] analyzer
  PID 5 | code-analyst | running...
  PID 5 | completed | 0 | 3.8s | 1,450 tokens ✓

[layer 2/3] doc-gen
  PID 6 | default | running...
  PID 6 | completed | 0 | 4.2s | 1,180 tokens ✓

[layer 3/3] checker
  PID 7 | default | running...
  PID 7 | completed | 0 | 2.5s | 890 tokens ✓

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
compose | completed | 3/3 agents | 10.5s | 3,520 tokens
```

Each agent executes in DAG order, with downstream agents automatically receiving upstream agent output as context.

---

## Step 4: Real-Time Monitoring with rnix top

While the workflow is running, open another terminal and run:

```bash
rnix top
```

You will see a TUI (Terminal User Interface) displaying real-time status of all processes:

```
rnix top — Real-time Monitor                      Refresh: 1s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PID  STATE    AGENT         TOKENS   ELAPSED  INTENT
5    running  code-analyst  1,200    2.3s     Analyze src/server.go…
6    created  default       0        -        Generate improvement docs…
7    created  default       0        -        Verify analysis quality…
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Processes: 3 | Running: 1 | Waiting: 2 | Completed: 0
Total tokens: 1,200 | Elapsed: 2.3s
```

`rnix top` refreshes continuously. You can observe in real-time:
- Which agents are running (`running`)
- Which are waiting for dependencies (`created`)
- Token consumption and execution time

Press `q` to exit `rnix top`.

---

## Step 5: View Results

### View Compose Output

After `rnix compose up` completes, it outputs an execution summary for each agent. For more detailed results, use JSON output:

```bash
rnix compose up --json
```

The JSON output contains complete results for each agent:

```json
{
  "ok": true,
  "data": {
    "intent": "Code review workflow",
    "agents": [
      {"name": "analyzer", "pid": 5, "exit_code": 0, "elapsed_ms": 3800, "tokens": 1450},
      {"name": "doc-gen", "pid": 6, "exit_code": 0, "elapsed_ms": 4200, "tokens": 1180},
      {"name": "checker", "pid": 7, "exit_code": 0, "elapsed_ms": 2500, "tokens": 890}
    ],
    "total_elapsed_ms": 10500,
    "total_tokens": 3520
  }
}
```

### View Reasoning Logs

Use `rnix log` to view each agent's reasoning process:

```bash
rnix log
```

Logs are grouped by time and process, showing each agent's reasoning steps and decisions.

---

## Step 6: Cleanup

If the workflow fails midway or needs to be stopped, use:

```bash
rnix compose down
```

This terminates all compose-spawned processes and cleans up resources.

---

## Advanced Scenarios

### Pipe Syntax Alternative

For simple linear workflows, you can use pipe syntax instead of a compose file:

```bash
rnix -i 'spawn "Analyze src/server.go" --agent=code-analyst | spawn "Generate improvement docs" | spawn "Quality check"'
```

The pipe operator `|` automatically injects the previous agent's output as the next agent's `[PIPE_INPUT]` context.

### Using Variables and Environment Passing

Combine with AgentShell environment variables for more flexible workflows:

```bash
rnix -i '
export TARGET=./src/server.go
spawn "Analyze $TARGET code quality" --agent=code-analyst | spawn "Generate improvement docs"
'
```

Or use environment in `compose.yaml`:

```yaml
agents:
  analyzer:
    intent: "Analyze code quality"
    agent: "code-analyst"
```

### Using if/else Conditional Branching

Generate a fix plan when issues are found, otherwise output a passing report:

```
result = spawn "Analyze src/server.go" --agent=code-analyst
if $result.exitcode == 0
  spawn "Generate passing report"
else
  spawn "Generate fix plan" on-error spawn "Log analysis failure"
end
```

AgentShell supports full control structures:
- **`if/else/end`** — conditional branching based on upstream results
- **`on-error`** — inline error handling (automatically executes fallback on failure)
- **Variable assignment** — `result = spawn "..."` captures execution results
- **Property access** — `$result.exitcode` accesses the exit code

### rnix compose down

If a workflow has lingering processes (e.g., a hung agent), use `compose down` to force cleanup:

```bash
rnix compose down
```

---

## Next Steps

Congratulations! You have mastered multi-agent orchestration. Continue to the next tutorial to explore how Rnix's emergent intelligence works.

### Further Learning

- [Tutorial 4: Observing Intelligence Emergence](/tutorials/observing-emergence) — watch stem cell differentiation, reputation, and synergy in action
- [Core Concepts](/guide/concepts) — deep understanding of Rnix's OS design philosophy
- [Reference Manual](/reference/) — complete definitions for all Syscalls, VFS paths, and CLI commands

## Related Documentation

- [Core Concepts](/guide/concepts) — mental model for processes, VFS, and Skills
- [Reference Manual: CLI Commands](/reference/) — complete parameters for compose up/down, top, and log
- [Reference Manual: IPC Architecture](/reference/) — Compose engine's internal communication mechanism
