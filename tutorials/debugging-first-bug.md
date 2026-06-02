# Tutorial 2: Debugging Your First Bug

This tutorial walks you through the Rnix debugging workflow: intentionally introducing a bug, using `rnix strace` to locate the problem, then fixing and verifying the fix.

---

## Prerequisites

- Completed [Tutorial 1: Writing Your First Skill](/tutorials/writing-first-skill) (familiar with creating Skills and Agents)
- Working in the `rnix-tutorial/` project from Tutorial 1 (with DeepSeek provider configured). Any process data left from Tutorial 1 does not affect this tutorial

---

## What You Will Learn

1. How to trace an agent's system calls in real time with `rnix strace`
2. How to read error information from a SyscallEvent to pinpoint problems
3. Common error codes and what they mean

---

## Step 1: Prepare a Buggy Skill

We will reuse the `code-summarizer` Skill from Tutorial 1, but intentionally introduce a permission bug: the Skill needs to run Shell commands (e.g., `wc -l` to count lines, `md5sum` to compute a checksum), yet `/dev/shell` is not declared in `allowed-tools`.

### Create the Buggy Skill

Create `.rnix/skills/line-counter/SKILL.md`:

```markdown
---
name: line-counter
description: >
  Count the number of lines in a code file and compute its checksum.
  Requires filesystem and Shell access.
allowed-tools: /dev/fs
metadata:
  author: my-team
  version: "1.0"
  tags: "code, metrics"
---

# Line Counter

## Important Constraints

- You MUST use /dev/shell to execute commands for all counting and checksum work
- Do NOT count lines manually by reading file content
- Do NOT compute checksums manually — all data must come from actual shell command output

## Workflow

1. Read the user-specified file via /dev/fs to confirm it exists
2. Run `wc -l` via /dev/shell to count the lines
3. Run `md5sum` via /dev/shell to compute the file checksum
4. Output the filename, line count, and MD5 checksum

## Tool Usage Guide

### /dev/fs — Filesystem Access
Used to verify that the target file exists.

### /dev/shell — Shell Command Execution
Used to run `wc -l` to count lines and `md5sum` to compute the checksum.
```

Notice where the bug is: the Skill body mentions that it needs `/dev/shell`, but the frontmatter's `allowed-tools` lists **only** `/dev/fs` — `/dev/shell` is missing. The agent cannot bypass this bug because computing an MD5 checksum requires actually executing the `md5sum` command.

### Create an Agent That Uses This Skill

Create `.rnix/agents/counter/agent.yaml`:

```yaml
name: counter
description: "An agent that counts lines of code"
models:
  provider: deepseek
  preferred: deepseek-v4-flash
skills:
  - line-counter
```

### Write instructions.md

Create `.rnix/agents/counter/instructions.md` — the Agent's system prompt:

```markdown
# Counter Agent

You are a file statistics expert. Your job is to count lines and compute checksums for user-specified code files using shell commands.

## Working Principles

- You must use the `wc -l` command to count lines
- You must use the `md5sum` command to compute the file checksum
- Do not count lines or compute checksums manually by reading file content
- Output results in English
```

### Run and Observe the Failure

```bash
rnix -i "Count the lines in src/server.go" --agent=counter
```

You will see the agent attempt to run but exit with an error:

```
PID 2 | counter | running
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Error: [PERMISSION] PID 2 Open /dev/shell: permission denied (device not in allowed-tools)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PID 2 | failed | 1 | 1.5s | 320 tokens
```

The agent failed due to insufficient permissions. But the error message may not be detailed enough — let's use `strace` to dig deeper.

---

## Step 2: Locate the Problem with rnix strace

`rnix strace` traces every system call made by a process, just like Unix `strace` traces system calls.

### Start strace

In one terminal, launch the agent:

```bash
rnix -i "Count the lines in src/server.go" --agent=counter
```

In another terminal, trace the process (assuming PID 3):

```bash
rnix strace 3
```

### Analyze the strace Output

```
[  0.001s] Spawn(agent="counter", intent="Count the lines in src/server.go") → 3    1ms
[  0.002s] CtxAlloc() → 2    0µs
[  0.003s] Open(flags=1, path="/lib/skills/line-counter/SKILL.md") → 3    0µs
[  0.003s] Read(fd=3, length=1048576) → 645    0µs
[  0.004s] Close(fd=3) → <nil>    0µs
[  0.005s] Open(flags=2, path="/dev/llm/deepseek") → 4    0µs  ← LLM call
[  0.005s] Write(fd=4, size=890) → <nil>    1.20s  ← slow operation
[  0.006s] Read(fd=4, length=1048576) → 512    2ms
[  0.006s] Close(fd=4) → <nil>    0µs
[  0.007s] Open(flags=1, path="/dev/fs") → 5    0µs
[  0.007s] Read(fd=5, length=1048576) → 2048    1ms
[  0.008s] Close(fd=5) → <nil>    0µs
[ERR] [  0.009s] Open(flags=2, path="/dev/shell") → err([PERMISSION] PID 3 Open /dev/shell: permission denied)    0µs
```

### Interpreting the Key Information

The last line is the critical one — the red error line prefixed with `[ERR]`:

```
[ERR] [  0.009s] Open(flags=2, path="/dev/shell") → err([PERMISSION] PID 3 Open /dev/shell: permission denied)    0µs
```

Here is what you can extract from this line:

| Field | Value | Meaning |
|-------|-------|---------|
| Syscall | `Open` | Attempted to open a device |
| path | `/dev/shell` | Target VFS device path |
| PID | `3` | The process that encountered the error |
| Error code | `PERMISSION` | Insufficient permissions |
| Error description | `permission denied` | The device is not declared in allowed-tools |

The diagnosis is now clear: **the agent tried to open the `/dev/shell` device, but the Skill's `allowed-tools` does not include that path, so the kernel denied access.**

### SyscallEvent Structure

Each line of strace output corresponds to a `SyscallEvent` containing:

- **Timestamp** — time elapsed since process start
- **Syscall** — system call name (Open/Read/Write/Close/Spawn, etc.)
- **PID** — process ID
- **Args** — call arguments (path, fd, flags, etc.)
- **Result** — return value
- **Err** — error information (nil means success)
- **Duration** — how long the call took

Error lines are additionally marked with an `[ERR]` prefix (displayed in red in the terminal) so you can spot problems at a glance.

---

## Step 3: Fix the Bug and Verify

### The Fix

The problem is clear: the `SKILL.md` frontmatter is missing `/dev/shell` in `allowed-tools`. Edit `.rnix/skills/line-counter/SKILL.md`:

Before:
```yaml
allowed-tools: /dev/fs
```

After:
```yaml
allowed-tools: /dev/fs /dev/shell
```

### Run Again

```bash
rnix -i "Count the lines in src/server.go" --agent=counter
```

This time it should complete successfully:

```
PID 4 | counter | running
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
src/server.go: 23 lines
MD5: d41d8cd98f00b204e9800998ecf8427e
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PID 4 | completed | 0 | 2.5s | 520 tokens
```

### Confirm the Fix with strace

Run strace again to verify that all syscalls succeed:

```bash
rnix strace 4
```

```
[  0.001s] Spawn(agent="counter", intent="Count the lines in src/server.go") → 4    1ms
[  0.002s] CtxAlloc() → 3    0µs
[  0.003s] Open(flags=1, path="/lib/skills/line-counter/SKILL.md") → 3    0µs
[  0.003s] Read(fd=3, length=1048576) → 820    0µs
[  0.004s] Close(fd=3) → <nil>    0µs
[  0.005s] Open(flags=2, path="/dev/llm/deepseek") → 4    0µs  ← LLM call
[  0.005s] Write(fd=4, size=980) → <nil>    1.80s  ← slow operation
[  0.006s] Read(fd=4, length=1048576) → 480    2ms
[  0.006s] Close(fd=4) → <nil>    0µs
[  0.007s] Open(flags=1, path="/dev/fs") → 5    0µs
[  0.007s] Read(fd=5, length=1048576) → 2048    1ms
[  0.008s] Close(fd=5) → <nil>    0µs
[  0.009s] Open(flags=2, path="/dev/shell") → 6    0µs      ← wc -l
[  0.009s] Write(fd=6, size=56) → <nil>    50ms
[  0.010s] Read(fd=6, length=1048576) → 24    0µs
[  0.010s] Close(fd=6) → <nil>    0µs
[  0.011s] Open(flags=2, path="/dev/shell") → 7    0µs      ← md5sum
[  0.011s] Write(fd=7, size=64) → <nil>    30ms
[  0.012s] Read(fd=7, length=1048576) → 48    0µs
[  0.012s] Close(fd=7) → <nil>    0µs
```

This time there are no `[ERR]` lines — all syscalls executed successfully, including two Open/Write/Read/Close sequences for `/dev/shell` (one for `wc -l`, one for `md5sum`).

---

## Additional Debugging Tips

### rnix ps — View Process Status

```bash
rnix ps
```

Quickly check the current state (running/zombie/dead) and basic information for all processes. Use this to confirm whether a process is still running or has already exited.

### rnix log — View Categorized Logs

```bash
rnix log
```

View the agent's reasoning logs, grouped by category. This is higher-level than strace — strace traces operations at the syscall level, while log shows logical records of the reasoning process.

### rnix top — Real-Time Monitoring

```bash
rnix top
```

A TUI interface for real-time monitoring of all processes' status, token consumption, and resource usage. See [Tutorial 3](/tutorials/composing-multi-agent-workflow) for details.

### Common Error Codes

| Error Code | Meaning | Common Causes |
|------------|---------|---------------|
| `PERMISSION` | Insufficient permissions | The Skill's allowed-tools does not include the target device |
| `NOT_FOUND` | Resource not found | Incorrect file path, process already exited, device not registered |
| `TIMEOUT` | Operation timed out | LLM response timeout, external command execution timeout |
| `DRIVER` | Driver error | LLM CLI returned an error, Shell command execution failed |
| `INTERNAL` | Internal error | Kernel bug, illegal state transition |

---

## Next Steps

- [Tutorial 3: Composing a Multi-Agent Workflow](/tutorials/composing-multi-agent-workflow) — Learn to orchestrate multiple agents with Compose and pipes
- [Tutorial 1: Writing Your First Skill](/tutorials/writing-first-skill) — Review the Skill and Agent creation workflow

## Related Documentation

- [Core Concepts: System Calls](/guide/concepts) — Conceptual model for Syscalls and SyscallEvents
- [Reference: rnix strace](/reference/) — Complete parameters and output format for the strace command
- [Reference: SyscallError](/reference/) — Error code enumeration and SyscallError structure
