# Debugging (strace & gdb)

Rnix provides a comprehensive debugging toolkit inspired by Unix and GDB, enabling deep inspection of AI agent behavior at the syscall level.

---

## strace — Syscall Tracing

Trace every syscall an agent makes in real-time, from any terminal.

```bash
$ rnix strace <pid>
[strace] attached to PID 1 (state: running)
[  0.013s] Open(path="/dev/llm/claude") → 3    1ms
[  0.014s] Write(fd=3, size=1234) → <nil>    5.20s  ← LLM call
[  5.214s] Read(fd=3, length=65536) → 892B    2ms
[  5.216s] Open(path="/dev/fs/./src/main.go") → 4    1ms
[  5.217s] Write(fd=4, size=56) → <nil>    0µs
[  5.217s] Read(fd=4, length=1048576) → 2048    1ms
[  5.218s] Close(fd=4) → <nil>    0µs
[strace] detached from PID 1 (process exited)
```

**Key features:**
- Cross-terminal attach — trace any process from any terminal
- Automatic annotation — `← LLM call` for `/dev/llm/` ops, `← slow operation` for >1s ops
- Non-blocking — event buffer (256) silently drops when full, never blocking the agent
- Three output modes: default (formatted), `--verbose` (full args), `--json` (machine-readable)
- SIGINT only detaches tracing, does not affect the traced process

---

## gdb — Interactive Debugger

Attach to a running agent for interactive debugging with breakpoints, stepping, and runtime inspection.

### Attach / Detach

```bash
$ rnix gdb <pid>
[gdb] attached to PID 1 (state: running, step 3/10)
(rnix-gdb) help
  break <type> [args]  - Set breakpoint
  continue             - Resume execution
  step [syscall|reason] - Step forward
  inspect <target>     - Inspect state
  set <target> <value> - Modify runtime parameter
  detach               - Detach and resume
(rnix-gdb)
```

Detach lets the agent continue running normally.

### Breakpoint Types

Four breakpoint types cover different debugging scenarios:

| Type | Syntax | Trigger |
|------|--------|---------|
| **Syscall** | `break syscall Open` | When a specific syscall is invoked |
| **Reasoning** | `break reason` | Before each LLM call |
| **Quality** | `break quality "must contain code examples"` | When output fails quality check |
| **Budget** | `break budget 5000` | When token consumption reaches threshold |

**Quality breakpoints** support two evaluation modes:
- **Pattern matching** — keywords or regex that output must contain/not contain
- **LLM evaluation** — natural language quality criteria evaluated by a lightweight model (haiku), triggering when not satisfied

```
(rnix-gdb) break syscall Write
Breakpoint 1 set: syscall Write
(rnix-gdb) break quality "output must include error handling recommendations"
Breakpoint 2 set: quality (LLM-evaluated)
(rnix-gdb) continue
[breakpoint 1] Write(fd=3, size=2048) at step 4
(rnix-gdb)
```

### Step Execution

Step through agent execution one syscall or one reasoning step at a time:

```
(rnix-gdb) step syscall
[step] Open(path="/dev/fs/./main.go") → FD(4)    1ms
(rnix-gdb) step reason
[step] Reasoning step 5/10 complete (tokens: 342)
```

### State Inspection

Inspect any aspect of the agent's runtime state:

```
(rnix-gdb) inspect context
SystemPrompt: "You are a code analyst..."  (1,245 tokens)
Messages: 8 entries (user: 3, assistant: 3, tool: 2)
Total tokens: 4,567 / budget: 8,192

(rnix-gdb) inspect fds
FD  Path                  Flags
3   /dev/llm/claude       O_RDWR
4   /dev/fs/./src/main.go O_RDWR

(rnix-gdb) inspect skills
Skills: [code-analysis, security-scan]
AllowedDevices: [/dev/fs, /dev/shell, /dev/llm/claude]
```

### Hot Modification

Modify runtime parameters without restarting the agent:

```
(rnix-gdb) set model opus
Model changed: sonnet → opus (effective next LLM call)

(rnix-gdb) set context.system_prompt "Updated instructions..."
System prompt updated (effective next reasoning step)

(rnix-gdb) set budget 10000
Budget changed: 8192 → 10000
```

Modifiable parameters: model, system prompt, context messages, skill references, environment variables, token budget. Changes take effect on the next reasoning step.

---

## Related Documentation

- [Time-Travel Debugging](/guide/time-travel) — Record, replay, and fork-continue
- [Distributed Tracing](/guide/distributed-tracing) — Cross-process causal tracing
- [Visual Dashboard](/guide/dashboard) — Multi-pane TUI debugging
- [Regression Testing](/guide/testing) — Automated behavior testing
- [Reference Manual](/reference/) — Complete syscall and CLI command details
