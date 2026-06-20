# Security & Self-Healing

Rnix implements an adaptive immune security system that monitors agent behavior, detects anomalies, maintains threat memory, and enables capability migration for self-healing.

---

## Immune System Configuration

The Immune System is **enabled by default in warn-only (observation) mode**. It monitors agent behavior and records anomalies, but does not suspend processes. This provides passive security awareness with zero interference.

To switch to **enforce mode** (auto-suspend on anomaly) or to disable entirely:

```yaml
# .rnix/config.yaml
immune:
  enabled: true               # default: true
  warn_only: false            # default: true — set false to enable auto-suspend
  deviation_threshold: 3.0    # Standard deviations from baseline (default: 3.0)
  min_samples: 5              # Minimum samples before anomaly detection activates
```

### Configuration Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `bool` | `true` | Enable or disable the immune system |
| `warn_only` | `bool` | `true` | Warn-only mode: detect and log anomalies without suspending processes |
| `deviation_threshold` | `float` | `3.0` | Number of standard deviations to trigger anomaly |
| `min_samples` | `int` | `5` | Minimum behavior samples before detection begins |
| `min_migration_similarity` | `float` | `0.5` | Minimum similarity score for capability migration |

### Operating Modes

| Mode | `enabled` | `warn_only` | Behavior |
|------|-----------|-------------|----------|
| **Observation** (default) | `true` | `true` | Monitor, log anomalies, persist threat signatures — never suspend |
| **Enforce** | `true` | `false` | Monitor + auto-suspend anomalous processes (SIGPAUSE) |
| **Disabled** | `false` | — | No monitoring, IPC methods return empty status |

When in observation mode, `rnix immune status` shows `Mode: warn-only` and alerts are recorded but processes continue running.

---

## Immune Daemon

The **Immune Daemon** continuously watches all agent behavior patterns. Since it is enabled by default, every agent process is monitored from the first run.

### Behavior Baseline

For each Agent template, the system builds a **Normal Profile** from historical execution data:

| Metric | Baseline Example |
|--------|-----------------|
| Syscall frequency | Open: 5-15/step, Write: 3-10/step |
| Resource access pattern | /dev/fs: 80%, /dev/shell: 20% |
| Token consumption rate | 200-500 tokens/step |
| Execution duration | 2-8s per reasoning step |

### Anomaly Detection

When an agent's behavior deviates from its baseline beyond a threshold:

- Abnormally high-frequency file writes
- Unexpected shell command patterns
- Token consumption spike
- Access to unusual VFS paths

In **warn-only mode** (default), the Immune Daemon logs an `AnomalyAlert` and persists a `ThreatSignature`, but the process continues running. In **enforce mode**, the alert triggers `SIGPAUSE` to suspend the process.

### Threat Memory (Antibody Memory)

Identified anomalous behavior patterns are recorded in a threat memory library. When the same pattern appears again, it is recognized **immediately** — in enforce mode this means instant suspension; in warn-only mode, an immediate alert.

```bash
$ rnix immune status
Mode: warn-only
  Monitoring: 5 processes
  Alerts: 1 active
    PID 7: unusual /dev/shell frequency (23/step, baseline: 5-10)
  Suspended: 0 processes
  Threat memory: 3 entries
    #1: rapid-file-enumeration (detected 2026-03-10)
    #2: shell-injection-pattern (detected 2026-03-12)
    #3: excessive-token-drain   (detected 2026-03-13)
```

---

## Spawn Safety

When an agent uses the `spawn` tool to create a child process, two kernel-level guards keep the process tree safe:

**Permission inheritance is monotonic.** A child's `AllowedDevices` are always a subset of its parent's — spawning a child can never *gain* a capability the parent lacks. This closes the privilege-escalation path where an agent spawns a helper to reach a device it was denied.

**Recursion is depth-bounded.** Because a child can never acquire new permissions by being spawned, an LLM that keeps spawning children to "acquire" a missing device would otherwise recurse forever. The kernel caps the LLM-reachable process-tree depth at **`MaxSpawnDepth` (4)**. A `spawn` that would exceed it is rejected deterministically:

```
spawn rejected: maximum spawn depth 4 reached (current depth 4).
Child processes inherit your device restrictions and cannot gain new
permissions by spawning deeper. Use complete to report your results
with the devices you have.
```

Only LLM-initiated `spawn` calls accumulate depth — `rnix resume`, `compose`, supervisor restarts, and CLI-launched processes all start at depth 0 and are unaffected. Repeated rejections at the limit feed the circuit breaker (fingerprint `INTERNAL|spawn`), so a runaway agent unwinds its chain instead of spinning.

---

## Capability Migration

When an agent fails and Supervisor restart also fails, the system can **migrate the unfinished task** to a similar agent.

### Similarity Matrix

The system maintains a **capability similarity matrix** based on Skill overlap and collaboration history:

```
              code-analyst  security-scanner  doc-writer
code-analyst      1.00          0.72            0.35
security-scan     0.72          1.00            0.20
doc-writer        0.35          0.20            1.00
```

When `security-scanner` fails beyond retry limits, its remaining task can be migrated to `code-analyst` (similarity: 0.72) for continued execution with partial context transfer. Migration is gated — it only triggers when the substitute agent demonstrates a measurable net improvement in the similarity matrix, preventing degradation through blind handoffs.

---

## Collaboration Topology

The system automatically identifies and records **reinforcement paths** — frequently used collaboration patterns:

```bash
$ rnix topology
Agent Collaboration Topology:
  code-analyst ──(spawn: 47)──→ security-scanner
  code-analyst ──(pipe: 23)──→ doc-writer
  security-scanner ──(msg: 12)──→ code-analyst

  Reinforced paths (auto-optimized):
    ★ code-analyst → security-scanner → doc-writer (review pipeline)

  Capability overlap:
    code-analyst ↔ security-scanner: 72% (high substitutability)
```

Collaboration data is collected automatically from production syscalls — `spawn` events record parent→child edges, and IPC `msg` events record peer-to-peer edges — feeding the topology with real usage telemetry. High-frequency collaboration paths are **visible for operational insight** — the topology serves as an observability tool showing which agent combinations are used most.

---

## Neuroplasticity

When agents in a Compose workflow fail, the system exhibits **neuroplasticity** — rerouting tasks through alternative paths:

1. **Detection** — Supervisor identifies persistent failure
2. **Assessment** — Check similarity matrix for substitutes
3. **Migration** — Transfer task context to substitute agent
4. **Reinforcement** — If migration succeeds, strengthen the alternative path

This mirrors biological neural plasticity: when one pathway fails, the system strengthens alternative pathways.

---

## Related Documentation

- [Intelligence Emergence](/guide/emergence) — How immune learning and neuroplasticity produce emergent intelligence
- [Monitoring & Supervisor](/guide/monitoring) — Process monitoring and restart strategies
- [Token Economy](/guide/token-economy) — Budget pools and reputation
- [Autonomous Agents](/guide/autonomous-agents) — Unified reasoning loop
- [Compose Orchestration](/guide/compose) — Multi-agent DAG workflows
