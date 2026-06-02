# Distributed Tracing

Rnix provides distributed causal tracing across multi-agent workflows, with root cause analysis and context memory profiling.

---

## Trace ID and Spans

Each Compose workflow generates a unique **Trace ID** that propagates automatically through IPC between agents, forming a cross-process causal chain.

```
Trace: abc-123
├── Span: analyzer (PID 5)     [0ms - 3800ms]  tokens: 1450
│   ├── Open /dev/llm/claude    [13ms - 14ms]
│   ├── Write /dev/llm/claude   [14ms - 5214ms]  ← LLM call
│   └── Read /dev/fs/main.go   [5216ms - 5218ms]
├── Span: doc-gen (PID 6)      [3800ms - 8000ms] tokens: 1180
│   └── ...
└── Span: checker (PID 7)      [8000ms - 10500ms] tokens: 890
```

Each agent records **Spans** (start/end time, syscall sequence, token consumption). Spans form a trace tree via parent-child relationships.

---

## Viewing Traces

```bash
$ rnix trace <trace-id>
Trace abc-123: Code review workflow (10.5s, 3520 tokens)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Timeline:
  [0.0s ─── 3.8s] analyzer (PID 5) ████████░░░░░░░
  [3.8s ─── 8.0s] doc-gen  (PID 6)          ████████░░░
  [8.0s ── 10.5s] checker  (PID 7)                   █████

Token distribution:
  analyzer: 1450 (41%)  doc-gen: 1180 (34%)  checker: 890 (25%)
```

---

## Blame Analysis

Automatically identify the critical path — the bottleneck nodes:

```bash
$ rnix trace blame <trace-id>
Root cause analysis for trace abc-123:
  Slowest path: analyzer → doc-gen → checker (10.5s)
  Bottleneck: analyzer (3.8s, 36% of total)
    └── LLM call at step 2 (5.2s) ← Primary bottleneck
  Highest token consumer: analyzer (1450 tokens, 41%)

Recommendations:
  - Consider using a faster model for analyzer (e.g., deepseek-v4-flash)
  - analyzer's context could be trimmed (cold segments: 23%)
```

---

## Context Memory Profiler

Analyze context usage for any agent to identify waste and predict exhaustion:

```bash
$ rnix ctx-profile <pid>
Context analysis for PID 5 (code-analyst):
  Total tokens: 4,567 / budget: 8,192 (56%)

  Breakdown by category:
    System prompt:  1,245 tokens (27%) ████████░░
    Skill bodies:     890 tokens (19%) ██████░░░░
    Dialog history:   980 tokens (21%) ███████░░░
    Tool results:   1,452 tokens (32%) █████████░

  Activity classification:
    Active (current step): 2,100 tokens
    Warm (recent):         1,200 tokens
    Cold (unreferenced):     800 tokens  ← optimization target
    Leaked:                  467 tokens  ← unused but not freed

  Growth prediction:
    Current rate: ~450 tokens/step
    Estimated exhaustion: step 8 of 10
    ⚠ Warning: may exceed budget before completion
```

---

## Related Documentation

- [Debugging](/guide/debugging) — strace and gdb interactive debugging
- [Time-Travel Debugging](/guide/time-travel) — Record and replay
- [Visual Dashboard](/guide/dashboard) — Graphical trace timeline
- [Token Economy](/guide/token-economy) — Budget management
