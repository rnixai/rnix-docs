# Regression Testing (agtest)

`rnix agtest` runs declarative behavior tests for AI agents — verifying that agents produce expected outputs, execute expected syscalls, and meet quality criteria.

---

## Overview

Agent behavior can be non-deterministic (LLM outputs vary). `agtest` provides a framework for **behavioral assertions** that verify agents perform correctly across runs.

```bash
$ rnix agtest tests/code-review.yaml
Running 3 test cases...
  ✓ basic-analysis          (2.3s, 1,234 tokens)
  ✓ security-focus          (3.1s, 1,567 tokens)
  ✗ multi-file-review       (4.5s, 2,100 tokens)
    Assertion failed: output must contain "recommendations"
    Actual output: "Analysis complete. No issues found."

Results: 2 passed, 1 failed, 0 skipped
```

---

## Test Case Definition

Tests are defined in declarative YAML:

```yaml
# tests/code-review.yaml
name: "Code review test suite"
agent: "code-analyst"
model: "deepseek-v4-flash"

cases:
  - name: "basic-analysis"
    intent: "Analyze ./src/main.go for code quality"
    assertions:
      - type: reasoning
        contains: ["code quality", "improvement"]
      - type: syscall
        sequence:
          - syscall: Open
            path_contains: "/dev/fs"
          - syscall: Open
            path_contains: "/dev/llm"

  - name: "security-focus"
    intent: "Check ./src/auth.go for security vulnerabilities"
    timeout: 30s
    assertions:
      - type: quality
        criteria: "Output must include specific vulnerability types (SQL injection, XSS, etc.)"
        evaluator: llm    # Use lightweight LLM to evaluate

  - name: "budget-limit"
    intent: "Analyze entire project"
    budget: 500           # Intentionally low budget
    assertions:
      - type: reasoning
        exit_code: 2      # Expect budget_exceeded exit
```

---

## Assertion Types

### Reasoning Assertions

Verify LLM output content:

```yaml
- type: reasoning
  contains: ["security", "vulnerability"]     # Must contain ALL
  not_contains: ["error", "failed"]           # Must not contain ANY
  exit_code: 0                                 # Expected exit code
  max_tokens: 5000                             # Token budget limit
```

### Syscall Assertions

Verify the agent executed (or did not execute) specific syscall sequences:

```yaml
- type: syscall
  sequence:                    # Ordered sequence (subset match)
    - syscall: Open
      path_contains: "/dev/fs"
    - syscall: Write
      fd: 3
  must_not_contain:            # These syscalls must NOT appear
    - syscall: Open
      path_contains: "/dev/shell"   # Agent shouldn't use shell
```

### Quality Assertions

Use a lightweight LLM to evaluate output quality against natural language criteria:

```yaml
- type: quality
  criteria: "Output must include at least 3 specific, actionable recommendations"
  evaluator: llm               # haiku evaluates the output
  # OR
  evaluator: pattern           # Regex/keyword matching
  pattern: "\\d+\\. .*"       # Must contain numbered items
```

---

## Running Tests

```bash
# Run all tests in a file
rnix agtest tests/code-review.yaml

# Run specific test case
rnix agtest tests/code-review.yaml --case basic-analysis

# JSON output for CI integration
rnix agtest tests/code-review.yaml --json

# Verbose output (show full LLM responses)
rnix agtest tests/code-review.yaml --verbose
```

### JSON Report

```json
{
  "ok": true,
  "data": {
    "suite": "Code review test suite",
    "cases": [
      {"name": "basic-analysis", "status": "passed", "elapsed_ms": 2300, "tokens": 1234},
      {"name": "security-focus", "status": "passed", "elapsed_ms": 3100, "tokens": 1567},
      {"name": "budget-limit", "status": "failed", "elapsed_ms": 4500, "tokens": 2100,
       "failure": "Assertion failed: output must contain 'recommendations'"}
    ],
    "summary": {"passed": 2, "failed": 1, "skipped": 0}
  }
}
```

---

## Related Documentation

- [Debugging](/guide/debugging) — Interactive debugging with gdb
- [Agents & Skills](/guide/agents-and-skills) — Agent configuration
- [Configuration](/guide/configuration) — Test configuration options
