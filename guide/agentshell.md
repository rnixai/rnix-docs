# AgentShell Scripting

AgentShell is Rnix's scripting language for orchestrating agent workflows. It provides pipes, variables, control structures, functions, parallel execution, and modular imports.

---

## Quick Examples

```bash
# Pipe: chain agents
spawn "Analyze code" --agent=analyst | spawn "Generate docs"

# Variables
export TARGET=./src/main.go
spawn "Analyze $TARGET" --agent=analyst

# Conditional
result = spawn "Check code quality" --agent=analyst
if $result.exitcode == 0
  spawn "Generate passing report"
else
  spawn "Generate fix plan"
end

# Parallel execution
parallel {
  spawn "Analyze frontend" --agent=analyst
  spawn "Analyze backend" --agent=analyst
  spawn "Check dependencies"
}
```

---

## Pipe Syntax

The `|` operator connects agent outputs to inputs:

```bash
spawn "Analyze code" | spawn "Generate docs" | spawn "Quality check"
```

Each `|` creates a pipe where the previous agent's output becomes `[PIPE_INPUT]` in the next agent's context. The pipe is a VFS pipe (`kern.Pipe`) underneath.

---

## Variables & Environment

```bash
# Define variables
export PROJECT_DIR=./src
export MODEL=haiku

# Use in intents (string interpolation)
spawn "Analyze ${PROJECT_DIR}/main.go with focus on security"

# Pass to spawned agents
spawn "Analyze code" --model=$MODEL
```

Variables are scoped to the current script. Child agents inherit the environment.

---

## Control Structures

### if / else / end

```bash
result = spawn "Check for vulnerabilities" --agent=security
if $result.exitcode == 0
  spawn "Generate security report: all clear"
else
  spawn "Generate vulnerability fix plan" on-error spawn "Log failure"
end
```

### on-error (inline error handling)

```bash
spawn "Risky operation" on-error spawn "Handle failure gracefully"
```

If the first spawn fails, the `on-error` handler executes automatically.

### for loop

```bash
files = ["main.go", "server.go", "handler.go"]
for file in $files
  spawn "Analyze ./src/${file}" --agent=analyst
end
```

### while loop

```bash
attempts = 0
while $attempts < 3
  result = spawn "Attempt fix" --agent=fixer
  if $result.exitcode == 0
    break
  end
  attempts = $attempts + 1
end
```

---

## Functions

Define reusable logic:

```bash
fn analyze(target, focus) {
  result = spawn "Analyze ${target} focusing on ${focus}" --agent=analyst
  return $result
}

# Call functions
report = analyze("./src/main.go", "security")
analyze("./src/server.go", "performance")
```

---

## Data Structures

### Arrays

```bash
targets = ["main.go", "server.go", "handler.go"]
count = len($targets)
first = $targets[0]

# Append
append($targets, "utils.go")

# Iterate
for t in $targets
  spawn "Process ${t}"
end
```

### Maps

```bash
config = {"model": "sonnet", "budget": 5000}
model = $config["model"]
```

---

## Spawn Return Capture

Capture agent output into variables:

```bash
result = spawn "Analyze code" --agent=analyst
echo $result.output       # Agent's text output
echo $result.exitcode     # Exit code (0/1/2)
echo $result.tokens       # Tokens consumed
echo $result.pid          # Process ID
```

---

## Parallel Execution

Run multiple agents concurrently:

```bash
parallel {
  spawn "Analyze frontend" --agent=analyst
  spawn "Analyze backend" --agent=analyst
  spawn "Check dependencies"
}
# Block continues after ALL spawns complete
```

---

## Built-in Commands

| Command | Description |
|---------|-------------|
| `wait <pid>` | Wait for a specific process |
| `sleep <duration>` | Delay (e.g., `sleep 5s`) |
| `exit <code>` | Exit script with code |
| `echo <text>` | Print text |
| `source <file>` | Import another script |

---

## Script Files

Save scripts as `.ash` files and execute them:

```bash
#!/usr/bin/env rnix run
# review-pipeline.ash

export TARGET=$1
result = spawn "Analyze ${TARGET}" --agent=analyst
if $result.exitcode == 0
  spawn "Generate improvement docs based on analysis" | spawn "Quality check"
else
  spawn "Log analysis failure for ${TARGET}"
end
```

```bash
$ rnix run review-pipeline.ash ./src/main.go
# Or with shebang:
$ chmod +x review-pipeline.ash
$ ./review-pipeline.ash ./src/main.go
```

---

## Module System

Import scripts for code reuse:

```bash
# lib/helpers.ash
fn analyze(target) {
  return spawn "Analyze ${target}" --agent=analyst
}

# main.ash
source "lib/helpers.ash"
result = analyze("./src/main.go")
```

---

## Related Documentation

- [Compose Orchestration](/guide/compose) — YAML-based DAG workflows
- [Intent System](/guide/intent-system) — Declarative intent decomposition
- [Agents & Skills](/guide/agents-and-skills) — Agent configuration
- [Reference Manual](/reference/) — Complete CLI command reference
