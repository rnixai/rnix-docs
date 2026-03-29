# Rnix Reference Manual

This manual is the authoritative technical reference for Rnix, intended for developers who write Agents/Skills using Rnix or debug issues. All signatures, parameters, return values, paths, and protocols in this document precisely match the current code implementation.

> For an introduction to Rnix's design philosophy and core concepts, see the [Core Concepts documentation](/guide/concepts).
> For quick installation and first-run guidance, see the [Quick Start Guide](/guide/quick-start).

---

## Sections

| # | Section | Description |
|---|---------|-------------|
| 1 | [Syscall Reference](/reference/syscalls) | All 45 kernel syscalls — ProcessManager, ContextManager, FileSystem, Debugger, IPC, Signal, Supervisor |
| 2 | [VFS Path Specification](/reference/vfs) | Device paths, VFSFile interface, FD allocation, /dev/llm, /dev/fs, /dev/shell, /proc |
| 3 | [Agent & Skill Manifests](/reference/agents-skills) | agent.yaml, SKILL.md format, progressive loading, field definitions |
| 4 | [CLI Command Reference](/reference/cli) | All CLI commands — spawn, ps, kill, strace, gdb, dashboard, compose, intent, skill, serve |
| 5 | [IPC Architecture](/reference/ipc) | Daemon lifecycle, NDJSON protocol, method enum, streaming, connection reuse |
| 6 | [Error Handling](/reference/errors) | ErrCode enum, SyscallError, VFSError, DriverError, ContextError, basic types |
| 7 | [Process Model](/reference/process-model) | State machine, transitions, ExitStatus, resource release, signal definitions |

---

## Quick Reference

### Process Lifecycle

```
Created ──Start()──→ Running ──Terminate()──→ Zombie ──Reap()──→ Dead
```

### VFS Device Paths

| Path | Purpose |
|------|---------|
| `/dev/llm/claude` | Claude Code CLI |
| `/dev/llm/cursor` | Cursor CLI |
| `/dev/llm/<provider>` | OpenAI-compatible API |
| `/dev/fs` | Host filesystem |
| `/dev/shell` | Shell execution |
| `/proc/{pid}/` | Process runtime info |

### Common CLI Commands

```bash
rnix -i "intent"                  # Run an agent
rnix -i "intent" --agent=name     # Run with named agent
rnix ps                           # List processes
rnix strace <pid>                 # Trace syscalls
rnix gdb <pid>                    # Interactive debugger
rnix top                          # Real-time monitor
```
