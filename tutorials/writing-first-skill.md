# Tutorial 1: Writing Your First Skill

This tutorial walks you through creating a Rnix Skill and an Agent that references it from scratch, then running it to observe the complete execution flow.

---

## Prerequisites

- Rnix is installed and operational (see [Quick Start Guide](/guide/quick-start))
- An LLM provider is configured (this tutorial uses DeepSeek — see [LLM Providers](/guide/llm-providers))
- Basic familiarity with Rnix concepts such as processes, VFS, and Skills (see [Core Concepts](/guide/concepts))

---

## What You Will Learn

1. The file structure of a Skill and how to write a `SKILL.md`
2. How an Agent references a Skill to gain capabilities
3. How to run an Agent and observe the Skill execution process

---

## Step 0: Set Up the Example Project

All tutorials use a shared example project. Create it once and reuse across Tutorial 1–4.

```bash
mkdir rnix-tutorial && cd rnix-tutorial
rnix init
```

Configure the LLM provider in `.rnix/providers.yaml`:

```yaml
default_provider: deepseek

providers:
  deepseek:
    driver: openai-compat
    model: deepseek-v4-flash
    base_url: https://api.deepseek.com/v1
    api_key_env: DEEPSEEK_API_KEY
```

Create a sample source file for agents to analyze:

```bash
mkdir -p src
cat > src/server.go << 'EOF'
package main

import (
    "fmt"
    "net/http"
    "os/exec"
)

func handler(w http.ResponseWriter, r *http.Request) {
    name := r.URL.Query().Get("name")
    fmt.Fprintf(w, "Hello, %s!", name)
}

func runCommand(w http.ResponseWriter, r *http.Request) {
    cmd := r.URL.Query().Get("cmd")
    out, _ := exec.Command("sh", "-c", cmd).Output()
    w.Write(out)
}

func main() {
    http.HandleFunc("/hello", handler)
    http.HandleFunc("/run", runCommand)
    http.ListenAndServe(":8080", nil)
}
EOF
```

Make sure `DEEPSEEK_API_KEY` is set in your environment:

```bash
export DEEPSEEK_API_KEY="your-key-here"
```

---

## Step 1: Create a SKILL.md

A Skill represents "procedural knowledge" in Rnix -- it tells an agent **how to do something**. Each Skill is a directory whose core file is `SKILL.md`.

### Create the Skill Directory

Create a new Skill directory under your project's `.rnix/skills/` directory:

```bash
mkdir -p .rnix/skills/code-summarizer
```

### Write the SKILL.md

Create `.rnix/skills/code-summarizer/SKILL.md` with the following content:

```markdown
---
name: code-summarizer
description: >
  Reads source code files and generates concise summaries. Useful for quickly understanding the purpose and structure of a code file.
allowed-tools: /dev/fs
metadata:
  author: my-team
  version: "1.0"
  tags: "code, summary"
---

# Code Summarizer

## When to Use

Use this Skill when a user needs to quickly understand the purpose, structure, and key interfaces of a code file.

## Workflow

1. Read the user-specified source code file via /dev/fs
2. Analyze the code structure: package name, imports, exported types, function signatures
3. Generate a concise summary including file purpose, core types, and key functions

## Tool Usage Guide

### /dev/fs -- Filesystem Access

Used to read target source code files:
- Read the user-specified file to obtain the full source code
- If additional context is needed, read related files in the same directory

## Output Format

The summary should include the following sections:
- **File Purpose**: A one-sentence description of the file's core responsibility
- **Core Types**: List of primary structs/interfaces and their roles
- **Key Functions**: List of important exported functions with their signatures
- **Dependencies**: List of major external package dependencies
```

### Anatomy of a SKILL.md

A `SKILL.md` consists of two parts:

**Frontmatter (YAML Header)**:

| Field | Description |
|-------|-------------|
| `name` | Unique identifier for the Skill |
| `description` | Short description (used during the discovery phase, ~100 tokens) |
| `allowed-tools` | Space-separated whitelist of VFS device paths |
| `metadata.version` | Version number |
| `metadata.tags` | Comma-separated tags string (used for search and categorization) |

**Body (Markdown Content)**: Detailed instructions for the Skill, injected into the agent's system prompt during the activation phase.

### allowed-tools and VFS Path Mapping

The `allowed-tools` field determines which VFS devices the agent is permitted to access. This is Rnix's security mechanism -- a Skill can only use the tools it explicitly declares.

| Device Path | Capability |
|-------------|------------|
| `/dev/fs` | Read/write the host filesystem |
| `/dev/shell` | Execute shell commands |
| `/dev/llm/deepseek` | Invoke LLM inference |

Our `code-summarizer` only needs to read files, so it declares only `/dev/fs`.

### Progressive Loading Strategy

Rnix loads Skills in two phases to optimize token consumption:

1. **Discovery Phase** -- Only the frontmatter is read (~100 tokens) to determine whether the Skill is a match
2. **Activation Phase** -- The full body is read (< 5000 tokens) and injected into the system prompt

This means the frontmatter's `description` field must be precise enough for Rnix to make correct matching decisions during the discovery phase.

---

## Step 2: Create an Agent That References the Skill

An Agent is an "identity definition" -- it defines the agent's role, preferred model, and referenced Skills.

### Create the Agent Directory

```bash
mkdir -p .rnix/agents/summarizer
```

### Write agent.yaml

Create `.rnix/agents/summarizer/agent.yaml`:

```yaml
name: summarizer
description: "An agent that reads code files and generates structured summaries"
models:
  provider: deepseek
  preferred: deepseek-v4-flash
skills:
  - code-summarizer
```

**Field Descriptions:**

| Field | Description |
|-------|-------------|
| `name` | Unique identifier for the Agent |
| `description` | Short description of the Agent |
| `models.provider` | LLM provider (matches a key in `providers.yaml`) |
| `models.preferred` | Preferred model |
| `models.fallback` | Fallback model (optional) |
| `skills` | List of referenced Skills (corresponding to the Skill's `name` field) |

### Write instructions.md

Create `.rnix/agents/summarizer/instructions.md` -- the Agent's system prompt:

```markdown
# Summarizer Agent

You are a code summarization expert. Your job is to read user-specified code files and generate structured summary reports.

## Working Principles

- Summaries should be concise -- no more than 200 words per file
- Focus on exported types and functions (the public API)
- If a file is too long (> 500 lines), provide an overview of the overall structure first, then detail the key sections
- Output summaries in English
```

### The Four-Layer Capability Model

At this point, you have built the Rnix capability hierarchy:

```
Process (runtime instance)
  └── Agent (identity: summarizer)
        └── Skill (capability: code-summarizer)
              └── Tools (device: /dev/fs)
```

- **Process** is a runtime instance -- each `rnix -i` invocation creates one
- **Agent** defines "who I am" -- the role and model preferences
- **Skill** defines "what I can do" -- knowledge and tool permissions
- **Tools** are VFS devices -- the actual execution capabilities

---

## Step 3: Run the Skill

### Launch the Agent

Use the `--agent` flag to specify the Agent you just created:

```bash
rnix -i "Summarize the code structure of src/server.go" --agent=summarizer
```

You should see output similar to the following:

```
PID 1 | summarizer | running
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Summary: src/server.go

**File Purpose:** HTTP server entry point with two endpoints: a greeting handler and a command runner.

**Core Types:**
- (none — this is a main package with standalone functions)

**Key Functions:**
- handler(w, r) — Handles /hello requests, reads "name" query parameter
- runCommand(w, r) — Handles /run requests, executes shell commands
- main() — Registers HTTP handlers and starts the server on :8080

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PID 1 | completed | 0 | 3.2s | 1,240 tokens
```

### View Process Status

While the agent is running, you can view the process list with `rnix ps`. After the agent finishes, processes are automatically reaped -- use `rnix ps -a` to show all processes including completed ones:

```bash
rnix ps -a
```

Example output:

```
  PID   UUID          STATE       SKILL                     TOKENS   ACTIVE        ELAPSED
─────   ───────────   ─────────   ───────────────   ──────────────   ──────────   ────────
    —   abcdef12...   dead        code-summarizer            1,240   —               3.2s
```

### Use strace to View Syscall Traces

`rnix strace` lets you trace every system call made by the agent in real time -- operations such as Open, Read, and Write are all recorded:

```bash
rnix strace 1
```

Example output:

```
[  0.001s] Spawn(agent="summarizer", intent="Summarize the code structure of src/server.go") → 1    1ms
[  0.002s] CtxAlloc() → 1    0µs
[  0.003s] Open(flags=1, path="/lib/skills/code-summarizer/SKILL.md") → 3    0µs
[  0.003s] Read(fd=3, length=1048576) → 892    0µs
[  0.004s] Close(fd=3) → <nil>    0µs
[  0.005s] Open(flags=2, path="/dev/llm/deepseek") → 4    0µs  ← LLM call
[  0.006s] Write(fd=4, size=1234) → <nil>    2.80s  ← slow operation
[  0.006s] Read(fd=4, length=1048576) → 1560    2ms
[  0.007s] Close(fd=4) → <nil>    0µs
[  0.008s] Open(flags=1, path="/dev/fs") → 5    0µs
[  0.008s] Read(fd=5, length=1048576) → 2048    1ms
[  0.009s] Close(fd=5) → <nil>    0µs
```

From the strace output, you can clearly see:
1. The kernel first loaded the `code-summarizer` Skill (reading `/lib/skills/code-summarizer/SKILL.md`, 892 bytes)
2. Then it invoked the LLM (`/dev/llm/deepseek`) for inference -- Write sends the request, Read retrieves the response
3. The LLM instructed reading the target file (`/dev/fs`, 2048 bytes)
4. All operations go through the VFS, and the `allowed-tools: /dev/fs` declaration in the Skill controls access permissions
5. The return value of Read is the **byte count** (e.g., `→ 2048`), not the file content itself

---

## Complete Runnable Example

### File Listing

Create the following file structure:

```
.rnix/
├── agents/
│   └── summarizer/
│       ├── agent.yaml
│       └── instructions.md
└── skills/
    └── code-summarizer/
        └── SKILL.md
```

**`.rnix/skills/code-summarizer/SKILL.md`**:

```markdown
---
name: code-summarizer
description: >
  Reads source code files and generates concise summaries. Useful for quickly understanding the purpose and structure of a code file.
allowed-tools: /dev/fs
metadata:
  author: my-team
  version: "1.0"
  tags: "code, summary"
---

# Code Summarizer

## When to Use

Use this Skill when a user needs to quickly understand the purpose, structure, and key interfaces of a code file.

## Workflow

1. Read the user-specified source code file via /dev/fs
2. Analyze the code structure: package name, imports, exported types, function signatures
3. Generate a concise summary

## Tool Usage Guide

### /dev/fs -- Filesystem Access

Used to read target source code files.

## Output Format

- **File Purpose**: One-sentence description
- **Core Types**: Primary structs/interfaces
- **Key Functions**: Important exported function signatures
```

**`.rnix/agents/summarizer/agent.yaml`**:

```yaml
name: summarizer
description: "An agent that reads code files and generates structured summaries"
models:
  provider: deepseek
  preferred: deepseek-v4-flash
skills:
  - code-summarizer
```

**`.rnix/agents/summarizer/instructions.md`**:

```markdown
# Summarizer Agent

You are a code summarization expert. Read user-specified code files and generate structured summary reports.

- Summaries should be concise -- no more than 200 words
- Focus on exported types and functions
- Output in English
```

### Run Command

```bash
rnix -i "Summarize the code structure of src/server.go" --agent=summarizer
```

### Expected Output

The agent reads `src/server.go` and outputs a structured code summary report. The output line will show `deepseek/deepseek-v4-flash` as the provider/model.

---

## Troubleshooting

### Skill Not Found

**Symptom:** Runtime error `skill not found: code-summarizer`

**Cause:** The Skill directory name or the `name` field in SKILL.md does not match the Agent's `skills` list.

**Solution:** Verify that the `name` field in `.rnix/skills/code-summarizer/SKILL.md` is set to `code-summarizer`, matching `skills: [code-summarizer]` in `agent.yaml`.

### Agent Loading Failure

**Symptom:** Error `agent not found: summarizer`

**Cause:** The Agent directory name does not match the `--agent=summarizer` parameter.

**Solution:** Verify that the directory is `.rnix/agents/summarizer/` and that it contains an `agent.yaml` file.

### Permission Error (PERMISSION)

**Symptom:** `[ERR]` lines in strace output with error code `PERMISSION`

**Cause:** The Skill's `allowed-tools` does not include a VFS device path that the agent actually accesses.

**Solution:** Check the `allowed-tools` field in `SKILL.md` and add the missing device paths. See [Tutorial 2: Debugging Your First Bug](debugging-first-bug.md) for details.

### SKILL.md Format Error

**Symptom:** Error indicating YAML parsing failure

**Cause:** Incorrect frontmatter format (missing `---` delimiters, indentation errors, etc.).

**Solution:** Ensure that SKILL.md begins and ends with `---` wrapping the YAML frontmatter, and that the YAML syntax is correct.

---

## Next Steps

- [Tutorial 2: Debugging Your First Bug](debugging-first-bug.md) -- Learn to use strace to locate and fix issues
- [Tutorial 3: Composing a Multi-Agent Workflow](composing-multi-agent-workflow.md) -- Learn to orchestrate multiple agents with Compose

## Related Documentation

- [Core Concepts: Skill](/guide/concepts) -- The Skill conceptual model and four-layer capability architecture
- [Reference: Agent and Skill Manifests](/reference/) -- Complete field descriptions for agent.yaml and SKILL.md
