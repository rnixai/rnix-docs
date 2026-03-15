# 分布式追踪

Rnix 提供跨多智能体工作流的分布式因果追踪，支持根因分析和上下文内存分析。

---

## Trace ID 与 Span

每个 Compose 工作流会生成一个唯一的 **Trace ID**，通过 IPC 在智能体间自动传播，形成跨进程的因果链。

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

每个智能体记录 **Span**（起止时间、syscall 序列、token 消耗）。Span 通过父子关系形成追踪树。

---

## 查看追踪

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

## 瓶颈分析

自动识别关键路径——即瓶颈节点：

```bash
$ rnix trace blame <trace-id>
Root cause analysis for trace abc-123:
  Slowest path: analyzer → doc-gen → checker (10.5s)
  Bottleneck: analyzer (3.8s, 36% of total)
    └── LLM call at step 2 (5.2s) ← Primary bottleneck
  Highest token consumer: analyzer (1450 tokens, 41%)

Recommendations:
  - Consider using a faster model for analyzer (e.g., haiku)
  - analyzer's context could be trimmed (cold segments: 23%)
```

---

## 上下文内存分析器

分析任意智能体的上下文使用情况，识别浪费并预测耗尽时间：

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

## 相关文档

- [调试](/zh/guide/debugging) — strace 和 gdb 交互式调试
- [时间旅行调试](/zh/guide/time-travel) — 录制与回放
- [可视化仪表盘](/zh/guide/dashboard) — 图形化追踪时间线
- [Token 经济](/zh/guide/token-economy) — 预算管理
