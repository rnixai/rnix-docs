# Monitoring & Supervisor

Real-time process monitoring, categorized reasoning logs, token budget management, supervisor trees, and init bootstrap.

---

## rnix top — Real-Time Monitor

```bash
$ rnix top
```

```
rnix top — Real-time Monitor                        Refresh: 1s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PID  PPID  STATE    AGENT         TOKENS   ELAPSED  INTENT
1    0     running  code-analyst  2,340    4.5s     Analyze code quality
2    1     running  default       890      2.1s     Check dependencies
3    0     zombie   —             1,567    8.3s     Security scan
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Processes: 3 | Running: 2 | Zombie: 1 | Dead: 0
Tokens: 4,797 | Elapsed: 8.3s
```

**Interactive operations:**
- Navigate with arrow keys
- `k` — kill selected process
- `d` — view process details
- `s` — attach strace
- `q` — quit

---

## rnix log — Reasoning Logs

View an agent's reasoning process with categorized output:

```bash
$ rnix log <pid>
[think] Analyzing the main.go file structure...
[tool]  Open(/dev/fs/./src/main.go) → read 2,048 bytes
[think] Found 3 potential issues in error handling...
[tool]  Open(/dev/shell) → ran "golangci-lint run ./..."
[output] ## Code Quality Report
         1. Missing error wrapping on line 45...
```

**Categories:**
- `[think]` — LLM reasoning (internal thoughts)
- `[tool]` — Tool calls (VFS operations)
- `[output]` — Final output to user

**Filtering:**

```bash
rnix log <pid> --filter think    # Only reasoning
rnix log <pid> --filter tool     # Only tool calls
rnix log <pid> --filter output   # Only output
```

---

## Token Budget Management

Set per-agent or per-workflow token limits:

**Agent level** (`agent.yaml`):
```yaml
context_budget: 8192
```

**Compose level** (`compose.yaml`):
```yaml
budget_pool:
  total: 50000
  allocation: priority
```

**CLI override:**
```bash
rnix -i "Analyze code" --budget 5000
```

When budget is exceeded, the process exits with code 2 (`budget_exceeded`). See [Token Economy](/guide/token-economy) for budget pools, SLA, and reputation.

---

## Supervisor Trees

Supervisor processes monitor child agents and automatically restart them on failure.

### Restart Strategies

| Strategy | Behavior |
|----------|----------|
| `one_for_one` | Only restart the crashed child |
| `one_for_all` | Restart all children |
| `rest_for_one` | Restart the crashed child and all started after it |

### Configuration

```yaml
# init.yaml
version: "1.0"
services:
  monitor:
    intent: "Monitor system health"
    agent: "health-monitor"
    restart: always
    max_restarts: 3

  analyzer:
    intent: "Continuous code analysis"
    agent: "code-analyst"
    restart: on-failure
    depends_on:
      - monitor
```

### Restart Policies

| Policy | When to Restart |
|--------|-----------------|
| `no` | Never (default) |
| `always` | On any exit |
| `on-failure` | Only on non-zero exit code |

---

## Init Bootstrap

The daemon bootstrap sequence on startup:

1. Parse `providers.yaml` → register LLM providers to VFS
2. Parse `init.yaml` → start system services and supervisor trees
3. Initialize Skill registry
4. Start MCP service management
5. Begin idle timeout monitoring

Services defined in `init.yaml` start in dependency order, with supervisors monitoring their children.

---

## Daemon Management

```bash
$ rnix daemon status
status:  running
version: 0.5.0
socket:  /run/user/1000/rnix/rnix.sock
procs:   2 active / 5 total
providers: claude (healthy), ollama (healthy)

$ rnix daemon stop
daemon stopped
```

**Auto-start:** daemon starts on first `rnix` command.
**Auto-stop:** exits after 60s with no active processes or connections.

---

## Related Documentation

- [Token Economy](/guide/token-economy) — Budget pools, SLA, reputation
- [Security](/guide/security) — Immune daemon and anomaly detection
- [Configuration](/guide/configuration) — init.yaml reference
- [Debugging](/guide/debugging) — strace and gdb
