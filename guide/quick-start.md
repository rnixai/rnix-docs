# Quick Start Guide

Get Rnix installed and running your first AI agent in under 15 minutes.

---

## Prerequisites

### Go

Go 1.26 or later:

```bash
$ go version
go version go1.26.0 linux/amd64
```

If not installed, visit [go.dev/dl](https://go.dev/dl/).

### LLM Provider

Rnix supports multiple LLM providers. You need at least one:

- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`
- **Cursor CLI** — requires `CURSOR_API_KEY` environment variable
- **OpenAI-compatible API** (Ollama, Groq, DeepSeek, etc.) — configure in `~/.config/rnix/providers.yaml` after `rnix init`

---

## Install

```bash
go install github.com/rnixai/rnix/cmd/rnix@latest
```

Verify:

```bash
$ rnix version
rnix v0.1.0
commit:  cd9c568
built:   2026-03-15T07:23:57Z
```

### Build from Source

```bash
git clone https://github.com/rnixai/rnix.git
cd rnix
make build    # → ./rnix
```

---

## Run Your First Agent

```bash
$ rnix -i "Analyze the code quality of ./cmd/rnix/main.go"
[kernel] spawning PID 1 (claude/haiku)...
[agent/1] reasoning step 1...
[agent/1] reasoning step 2...
══ Result ══════════════════════════════════════════════════════════════════════
  ## Code Quality Analysis
  1. Error handling: consistent use of structured errors
  2. Import organization: clean and grouped
  ...
════════════════════════════════════════════════════════════════════════════════
[kernel] PID 1 exited(0) | claude/haiku | tokens: 1,234 | elapsed: 6.2s
```

The daemon starts automatically on first use and exits after 60s idle.

---

## Use a Named Agent

```bash
$ rnix -i "Check for security vulnerabilities" --agent=code-analyst
```

Agents are defined in `lib/agents/<name>/agent.yaml` with role instructions and skill references.

---

## Trace Syscalls (strace)

See exactly what your agent is doing:

```bash
# Terminal A: run an agent
$ rnix -i "Analyze project structure"

# Terminal B: attach strace
$ rnix strace 1
[strace] attached to PID 1 (state: running)
[  0.013s] Open(path="/dev/llm/claude") → 3    1ms
[  0.014s] Write(fd=3, size=1234) → <nil>    5.20s  ← LLM call
[  5.214s] Read(fd=3, length=65536) → 892B    2ms
...
```

---

## Interactive Debugging (gdb)

Attach to a running agent for breakpoints, stepping, and inspection:

```bash
$ rnix gdb 1
[gdb] attached to PID 1 (state: running, step 3/10)
(rnix-gdb) break syscall Write
Breakpoint 1 set: syscall Write
(rnix-gdb) continue
[breakpoint 1] Write(fd=3, size=2048) at step 4
(rnix-gdb) inspect context
Messages: 6 entries | Tokens: 2,340 / 8,192
(rnix-gdb) step reason
[step] Reasoning step 5/10 complete
(rnix-gdb) detach
```

---

## Manage Processes

```bash
$ rnix ps                    # List all processes
$ rnix kill 1                # Send SIGTERM to PID 1
$ rnix top                   # Real-time TUI process monitor
$ rnix log 1                 # View reasoning logs
$ rnix daemon status         # Check daemon status
$ rnix daemon stop           # Stop daemon
```

---

## Multi-Agent Orchestration

### Compose (YAML workflow)

```yaml
# rnix-compose.yaml
version: "1.0"
intent: "Code review workflow"
agents:
  analyzer:
    intent: "Analyze code quality"
    agent: "code-analyst"
  docs:
    intent: "Generate improvement docs"
    depends_on:
      analyzer: completed
```

```bash
$ rnix compose up
```

### AgentShell (pipe syntax)

```bash
$ rnix -i 'spawn "Analyze code" --agent=analyst | spawn "Generate docs"'
```

### Declarative Intent

```bash
$ rnix intent apply "Refactor auth module to use JWT"
$ rnix intent status
```

---

## LLM Serve Gateway

Expose your LLM providers as an OpenAI-compatible API:

```bash
$ rnix serve
[serve] listening on http://localhost:8080
[serve] endpoints: /v1/chat/completions, /v1/models

$ curl http://localhost:8080/v1/chat/completions \
  -d '{"model": "claude", "messages": [{"role": "user", "content": "Hello"}]}'
```

---

## What's Next

| Goal | Guide |
|------|-------|
| Understand the OS model | [Core Concepts](/guide/concepts) |
| Create agents and skills | [Agents & Skills](/guide/agents-and-skills) |
| Write agent scripts | [AgentShell](/guide/agentshell) |
| Deep debugging | [Debugging](/guide/debugging) |
| Multi-agent workflows | [Compose](/guide/compose) |
| Configure LLM providers | [LLM Providers](/guide/llm-providers) |
| Full API reference | [Reference Manual](/reference/) |
