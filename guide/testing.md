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

## Agent Behavior Regression (agtest) {#agent-behavior-regression-agtest}

_Added in 0.11.0._ Beyond ad-hoc suites, Rnix ships a two-tier regression framework whose goal is a closed feedback loop: **every time an agent misbehaves, the test suite grows**. The two tiers trade determinism against fidelity.

### Tier1 — offline replay gate (`make agtest`)

Tier1 cases (`tests/agtest/tier1/`) are **deterministic, offline, and fast (< 5 min)** — the PR-level gate. They never touch a real provider or API key: LLM responses are scripted by a **replay driver**, so the same input always produces the same run. Each case is a `NN-slug.yaml` paired with a `scripts/NN-slug.responses.yaml` response script.

```bash
make agtest        # Tier1, isolated daemon, seconds to tens of seconds
```

`make agtest` runs the suite against a **fully isolated daemon**: it provisions temporary `XDG_RUNTIME_DIR` / `RNIX_DATA_DIR` / `XDG_CONFIG_HOME` directories, declares the `replay` provider into that isolated config, starts a throwaway daemon, runs `rnix agtest tests/agtest/tier1/ --tier1`, and tears everything down on exit (success or failure) — so it never collides with your ambient daemon. It is **not part of `make all`**: it exercises the real spawn/daemon/VFS path, a different failure surface from `go test`, and runs as an independent CI job. The `--tier1` flag enforces the Tier1 discipline (non-empty assertions, only `output` / `syscalls` assertions — no `quality` — and the `replay` provider).

### Tier2 — advisory live suite (`make agtest-live`)

Tier2 cases (`tests/agtest/tier2/`) run against a **real LLM** and are **advisory** — they block no CI gate. Because they depend on genuinely non-deterministic model behavior, they may use `quality` (LLM-judge) assertions, and a failure may just mean model drift, rate limiting, or a network hiccup rather than a code regression.

```bash
make agtest-live   # Tier2, your ambient daemon + real providers.yaml / API key
```

**Rule of thumb**: if a behavior can be reproduced with a scripted response, it belongs in Tier1. Reserve Tier2 for the essentially non-deterministic question of "does the real model usually do the right thing under this prompt?"

### Failure → case workflow

The core of the closed loop: turn a production failure into a permanent regression case with `rnix agtest import`.

```
1. rnix ps -a --uuid          Find the UUID (or ~xxxxxx short id) of the offending process
2. rnix agtest import <uuid>  Generate case skeleton + response script into tests/agtest/imported/
3. Human review              Fill in real assert:, check the warning comments
4. Move into tests/agtest/tier1/   Rename to the next NN-slug (case + scripts/)
5. make agtest               Verify the new case passes and breaks nothing
```

`rnix agtest import` reads the process's persisted `steps.jsonl` / `proc-info.json` / `events.jsonl` **directly from disk** — no daemon required — and writes a case-file plus a replay response-script skeleton. The skeleton is **intentionally not runnable**: it carries only commented-out assertion suggestions, so `agtest.ValidateTier1` rejects it until a human reads the run and writes real assertions. Every "best-effort reconstruction" (unparseable tool input, guessed tool name, legacy-field fallback) is flagged in a warning comment at the top of the file. The output lands in `tests/agtest/imported/` (git-ignored) so nothing is committed by accident.

See [CLI Reference › rnix agtest](/reference/cli#rnix-agtest) for the full flag/subcommand reference.

---

## Related Documentation

- [Debugging](/guide/debugging) — Interactive debugging with gdb
- [Agents & Skills](/guide/agents-and-skills) — Agent configuration
- [Configuration](/guide/configuration) — Test configuration options
