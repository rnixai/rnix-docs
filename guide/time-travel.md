# Time-Travel Debugging

Record complete agent execution traces and replay them with full navigation, context diff, and fork-continue for "what-if" exploration.

---

## Overview

Time-travel debugging captures every syscall, LLM call, context change, and tool result during execution. You can then replay, rewind, and branch from any point in history.

```
Record → Persist → Replay → Inspect → Fork → Re-execute
```

---

## Recording

Enable recording for a running process:

```bash
# Start recording
rnix record <pid>

# Or record from spawn
rnix -i "Analyze code" --record
```

**What is captured:**
- Every SyscallEvent (entry + exit with args, result, duration)
- Full LLM request/response pairs
- Context snapshots at each reasoning step
- Tool execution inputs and outputs

**Storage format:** JSON Lines, persisted to `$PROJECT/.rnix/records/<pid>-<timestamp>/`

```
.rnix/records/1-20260314T120000/
├── events.jsonl       # Complete syscall event stream
├── contexts/          # Context snapshots per step
│   ├── step-001.json
│   ├── step-002.json
│   └── ...
└── metadata.json      # Recording metadata (PID, intent, agent, duration)
```

---

## Replay

Replay a recorded execution with full navigation:

```bash
$ rnix replay <record-id>
[replay] loading record 1-20260314T120000 (8 steps, 12.3s, 3,456 tokens)
[replay] use 'next'/'prev'/'goto N' to navigate, 'quit' to exit

(replay) next
[step 1] Open("/dev/llm/claude") → FD(3)    1ms

(replay) next
[step 2] Write(FD(3), 1234 bytes) → ok    5200ms  ← LLM call

(replay) goto 7
[step 7] Close(FD(4)) → ok    0µs
```

**Navigation commands:**

| Command | Description |
|---------|-------------|
| `next` / `n` | Forward one event |
| `prev` / `p` | Backward one event |
| `goto <N>` | Jump to event N |
| `step-next` | Forward one reasoning step |
| `step-prev` | Backward one reasoning step |

---

## Context Diff

Compare context snapshots between any two points:

```
(replay) diff 2 7
═══ Context Diff: step 2 → step 7 ══════════════
Messages:
  + [assistant] "I'll analyze the main.go file..."  (step 3)
  + [tool:4]    "package main\nimport (..."          (step 5)
  + [assistant] "The code has 3 issues: ..."         (step 7)
Tokens: 1,200 → 3,456 (+2,256)
═════════════════════════════════════════════════
```

---

## Fork-Continue

Branch from any historical point with modified context, then re-execute with real LLM calls:

```
(replay) goto 3
[step 3] at reasoning step 2, after initial LLM response

(replay) fork
[fork] creating branch from step 3...
[fork] spawning PID 12 with context snapshot from step 3

# Now modify context before re-executing
(fork) set context.system_prompt "Focus only on security vulnerabilities"
(fork) continue
[fork/PID 12] reasoning step 3...
[fork/PID 12] reasoning step 4...
[fork/PID 12] completed — different result based on modified context
```

Fork-continue answers the question: **"What if the agent had received different instructions at that point?"**

---

## Use Cases

| Scenario | Approach |
|----------|----------|
| "Why did the agent choose tool X?" | Replay to that step, inspect context |
| "The agent's output was wrong" | Record → replay → diff context → find where it went wrong |
| "Would different instructions fix it?" | Fork from the divergence point, modify prompt, re-execute |
| "Compare two execution strategies" | Fork from same point with different modifications |
| Post-mortem analysis | Load recording offline, navigate freely |

---

## Related Documentation

- [Debugging (strace & gdb)](/guide/debugging) — Real-time debugging
- [Distributed Tracing](/guide/distributed-tracing) — Cross-process trace analysis
- [Visual Dashboard](/guide/dashboard) — Graphical timeline view
