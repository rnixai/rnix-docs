# Tutorial 4: Observing Intelligence Emergence

This tutorial walks you through a hands-on session where you observe Rnix's emergent intelligence in action — from stem cell differentiation to reputation-driven natural selection. By the end, you will see that emergence is not magic: it is observable, measurable feedback loops.

---

## Prerequisites

- Completed [Tutorial 1: Writing Your First Skill](/tutorials/writing-first-skill) (familiar with Skills and Agents)
- Rnix installed with a working LLM provider configured (see [LLM Providers](/guide/llm-providers))
- Basic understanding of Rnix processes (see [Core Concepts](/guide/concepts))

---

## What You Will Learn

1. How stem cell agents automatically differentiate based on intent
2. How to observe differentiation with `rnix lineage`
3. How DiffMemory accelerates repeated intents
4. How reputation accumulates and influences skill selection
5. How the immune system passively monitors agent behavior
6. How collaboration topology records agent interactions

---

## Step 0: Clean Emergence Data

This tutorial uses the same `rnix-tutorial/` project from Tutorial 1. If you haven't created it yet, follow [Tutorial 1 Step 0](/tutorials/writing-first-skill#step-0-set-up-the-example-project) first.

> **Important:** This tutorial observes emergence effects (reputation, DiffMemory, immune profiles) building up from scratch. Data left from earlier tutorials will skew the results. Clean the emergence-related data before starting:

```bash
cd rnix-tutorial
rnix daemon stop
rm -rf .rnix/data/ .rnix/reputation/ .rnix/diffmemory/ .rnix/immune/
```

If you skipped Tutorials 1–3, also create the `src/utils.go` sample file (in addition to `src/server.go` from Tutorial 1):

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

These files contain deliberate security issues (command injection, XSS, weak hashing, SQL injection) — perfect for testing code analysis and security scanning.

### Create a Security Scan Skill

This tutorial demonstrates synergy between multiple Skills. Rnix ships with a built-in `code-analysis` Skill. Create a complementary `security-scan` Skill so the StemMatcher can load both together:

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

You now have two analysis Skills — `code-analysis` (built-in) and `security-scan` (just created). Step 4 will show how they produce synergy when loaded together.

---

## Step 1: Observe Stem Cell Differentiation

### What Happens

When you spawn a process without specifying an agent, Rnix uses a **stem cell agent** — a generic agent with no bound Skills. The StemMatcher analyzes your intent and automatically loads the best-matching Skills.

### Try It

```bash
rnix -i "Analyze the code quality of src/server.go"
```

Watch the spawn output — it shows which Skills were auto-matched:

```
[kernel] spawning PID 1 (deepseek/deepseek-v4-flash)...
[stem]   intent match: code-analysis (0.92), security-scan (0.45)
[stem]   selected: [code-analysis]
[agent]  step 1/10
...
[kernel] PID 1 exited(0) | deepseek/deepseek-v4-flash | tokens: 2,340 | elapsed: 4.2s
```

The stem agent analyzed the intent "Analyze the code quality..." and matched it to the `code-analysis` Skill with 92% relevance.

### View the Differentiation Lineage

```bash
rnix lineage 1
```

```
PID 1: (stem)
  Differentiation path:
    1. [auto] code-analysis  (intent match, initial)
  Events: 1 total (1 initial, 0 progressive)
```

The lineage is **observability telemetry** — it records what happened but does not influence future decisions. Think of it as an audit trail.

---

## Step 2: Watch DiffMemory Accelerate Repeated Intents

### First Run — Full Matching

The first time you run an intent, StemMatcher does a full keyword scan across all available Skills. This result is recorded in DiffMemory.

### Second Run — Memory Recall

Run the same intent again:

```bash
rnix -i "Analyze the code quality of src/server.go"
```

This time, DiffMemory recognizes the intent signature (normalized: lowercase + sorted words) and recalls the previous skill mapping instantly — no keyword scan needed.

### Verify DiffMemory is Working

DiffMemory persists to disk as JSON Lines files. Check the file:

```bash
cat .rnix/diffmemory/*.json 2>/dev/null | head -5
```

You should see entries like:

```json
{"intent":"Analyze the code quality of src/server.go","skills":["code-analysis"],"timestamp":"2026-06-01T10:30:00Z","hit_count":2}
```

The `hit_count` field increments each time the same intent pattern is recalled.

---

## Step 3: Build Reputation Through Repeated Execution

### Run Multiple Tasks

Execute several tasks to build up reputation data:

```bash
rnix -i "Analyze code quality of src/server.go"
rnix -i "Analyze code quality of src/utils.go"
rnix -i "Check security vulnerabilities in src/server.go"
```

Each successful execution feeds into the reputation system via `RecordResult`.

### View Reputation Scores

```bash
rnix reputation
```

```
Agent Reputation Summary:
  AGENT           RUNS  SUCCESS  AVG TOKENS  SCORE
  code-analyst      3    100.0%       2,150   95.2
  default           1    100.0%       1,890   90.0
```

Agents with more runs and higher success rates build higher reputation scores.

### View a Specific Agent

```bash
rnix reputation code-analyst
```

```
Agent: code-analyst
  Executions:    3
  Success rate:  100.0%
  Avg tokens:    2,150
  Reputation:    ★★★★★ (95.2)
```

---

## Step 4: Observe Synergy in Action

### What is Synergy?

When certain Skills are loaded together, they can produce emergent capabilities beyond what each Skill provides alone. The synergy matrix tracks which combinations historically perform better.

Rnix ships with two built-in analysis Skills: `code-analysis` (general code quality) and `security-scan` (security vulnerabilities). When both match the same intent, they are loaded together and the combination is recorded.

### Trigger a Multi-Skill Task

Run a task that benefits from multiple Skills — the sample files have plenty of security issues to find:

```bash
rnix -i "Perform a security-aware code review of src/server.go"
```

Watch the stem output — you should see both Skills matched:

```
[stem]   intent match: code-analysis (0.30), security-scan (0.10)
[stem]   selected: [code-analysis, security-scan]
```

The StemMatcher found keyword overlap with both Skills: "code" and "review" match `code-analysis`, while "security" matches `security-scan`. Both are loaded, and their synergy is recorded when the process completes.

### View the Synergy Matrix

```bash
rnix synergy list
```

```
SKILLS                    SUCCESS  AVG TOKENS  EXECUTIONS   VS SOLO  TOKEN GAIN  STATUS
code-analysis,security-sc  100.0%       3,200           1        -           -  -
```

Over time, as more tasks use this combination successfully, the synergy score increases — the VS SOLO and TOKEN GAIN columns will show how the combination compares to using each Skill alone. When the combination's success rate is significantly higher, the STATUS column shows `recommended`, and future stem cell matching will prioritize this proven combination.

---

## Step 5: Check the Immune System

### Default Behavior: Warn-Only

The immune system is **enabled by default in warn-only mode**. It silently monitors every process without interfering.

### View Immune Status

```bash
rnix immune status
```

```
Mode: warn-only
  Monitoring: 0 processes
  Profiles: 1 templates
  Alerts: 0 active
  Threat memory: 0 entries
```

After running a few processes, the immune system builds behavioral baselines. Once it has at least 5 samples for a template, anomaly detection activates.

### Understanding the Learning Period

Run several more tasks with the same agent template to build the behavioral profile:

```bash
for i in 1 2 3 4 5; do
  rnix -i "Analyze code quality of src/server.go" --agent=code-analyst
done
```

Then check the status again:

```bash
rnix immune status
```

```
Mode: warn-only
  Monitoring: 0 processes
  Profiles: 1 templates (code-analyst: 5 samples)
  Alerts: 0 active
  Threat memory: 0 entries
```

The immune system now has a Normal Profile for `code-analyst` — it knows the typical range of syscall frequency, token consumption, and execution duration. Any future execution that deviates significantly will trigger a warn-only alert.

---

## Step 6: View Collaboration Topology

### Run a Multi-Agent Task

Use pipe syntax to create agent collaboration. The first stage uses the `summarizer` agent you created in Tutorial 1, while the second stage uses the default stem agent:

```bash
rnix -i 'spawn "Analyze src/server.go" --agent=summarizer | spawn "Summarize the analysis"'
```

This creates a collaboration edge between the two agents in the topology.

### View the Topology

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

As more collaboration events accumulate, the topology reveals which agent combinations are used most frequently — valuable operational insight. When the same agent pair interacts enough times (default threshold: 5), the REINFORCED column marks the path.

---

## Putting It All Together

You have now observed all five emergent effects described in [Intelligence Emergence](/guide/emergence):

| Effect | What You Observed | CLI Command |
|--------|-------------------|-------------|
| **Natural Selection** | Reputation scores differentiate agent performance | `rnix reputation` |
| **Memory Acceleration** | DiffMemory recalled skill mappings on second run | `cat .rnix/diffmemory/*.json` |
| **Neuroplasticity** | Similarity matrix enables capability migration | `rnix immune similarity <agent>` |
| **Passive Immune Learning** | Behavioral profiles built from 5+ samples | `rnix immune status` |
| **Collaboration Discovery** | Topology recorded spawn edges | `rnix topology` |

### The Feedback Loop in Practice

```
You ran tasks → reputation accumulated → synergy recorded
                                              ↓
Next stem cell match uses reputation + synergy to re-rank skills
                                              ↓
Better skill selection → better results → higher reputation
                                              ↓
                                    The loop continues...
```

Every task you run makes the system slightly better at matching skills to intents. This is intelligence emergence — not a single clever algorithm, but many simple feedback loops compounding over time.

---

## Cleanup

When you are done experimenting, stop the daemon and optionally remove the demo project:

```bash
rnix daemon stop
cd .. && rm -rf rnix-tutorial
```

---

## Next Steps

- [Intelligence Emergence](/guide/emergence) — the full conceptual explanation of the emergence stack
- [Autonomous Agents](/guide/autonomous-agents) — stem cell differentiation and unified reasoning
- [Token Economy & Reputation](/guide/token-economy) — budget pools, SLA, and synergy details
- [Security & Self-Healing](/guide/security) — immune system configuration and neuroplasticity
