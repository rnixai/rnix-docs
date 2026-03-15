# 时间旅行调试

录制完整的智能体执行轨迹并进行回放，支持全量导航、上下文差异对比，以及从历史任意点分叉继续执行的"假如"探索。

---

## 概览

时间旅行调试捕获执行过程中的每一次 syscall、LLM 调用、上下文变更和工具结果。随后你可以回放、回溯，并从历史中的任意点进行分支。

```
Record → Persist → Replay → Inspect → Fork → Re-execute
```

---

## 录制

为运行中的进程启用录制：

```bash
# 开始录制
rnix record <pid>

# 或在 spawn 时录制
rnix -i "Analyze code" --record
```

**捕获内容：**
- 每一次 SyscallEvent（入口 + 出口，包含参数、结果、耗时）
- 完整的 LLM 请求/响应对
- 每个推理步骤的上下文快照
- 工具执行的输入和输出

**存储格式：** JSON Lines，持久化到 `$PROJECT/.rnix/records/<pid>-<timestamp>/`

```
.rnix/records/1-20260314T120000/
├── events.jsonl       # 完整的 syscall 事件流
├── contexts/          # 每步的上下文快照
│   ├── step-001.json
│   ├── step-002.json
│   └── ...
└── metadata.json      # 录制元数据（PID、意图、智能体、时长）
```

---

## 回放

回放已录制的执行，支持全量导航：

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

**导航命令：**

| 命令 | 说明 |
|------|------|
| `next` / `n` | 前进一个事件 |
| `prev` / `p` | 后退一个事件 |
| `goto <N>` | 跳转到第 N 个事件 |
| `step-next` | 前进一个推理步骤 |
| `step-prev` | 后退一个推理步骤 |

---

## 上下文差异对比

比较任意两个时间点之间的上下文快照：

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

## 分叉继续

从历史任意点分支，修改上下文后重新执行真实的 LLM 调用：

```
(replay) goto 3
[step 3] at reasoning step 2, after initial LLM response

(replay) fork
[fork] creating branch from step 3...
[fork] spawning PID 12 with context snapshot from step 3

# 在重新执行之前修改上下文
(fork) set context.system_prompt "Focus only on security vulnerabilities"
(fork) continue
[fork/PID 12] reasoning step 3...
[fork/PID 12] reasoning step 4...
[fork/PID 12] completed — different result based on modified context
```

分叉继续回答的问题是：**"如果智能体在那个时间点收到了不同的指令，会怎样？"**

---

## 使用场景

| 场景 | 方法 |
|------|------|
| "智能体为什么选择了工具 X？" | 回放到该步骤，检视上下文 |
| "智能体的输出不正确" | 录制 → 回放 → 上下文差异对比 → 找到偏离点 |
| "不同的指令能否修复？" | 从偏离点分叉，修改提示词，重新执行 |
| "比较两种执行策略" | 从同一时间点分叉，应用不同修改 |
| 事后分析 | 离线加载录制，自由导航 |

---

## 相关文档

- [调试（strace 与 gdb）](/zh/guide/debugging) — 实时调试
- [分布式追踪](/zh/guide/distributed-tracing) — 跨进程追踪分析
- [可视化仪表盘](/zh/guide/dashboard) — 图形化时间线视图
