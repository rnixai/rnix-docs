# Security & Self-Healing

Rnix implements an adaptive immune security system that monitors agent behavior, detects anomalies, maintains threat memory, and enables capability migration for self-healing.

---

## Immune System Configuration

The Immune System is **disabled by default**. To enable it, add the following configuration:

```yaml
# config.yaml
immune:
  enabled: true
  deviation_threshold: 2.0    # Standard deviations from baseline (default: 2.0)
  min_samples: 10             # Minimum samples before anomaly detection activates
  auto_suspend: true          # Auto-suspend processes on anomaly detection
  threat_memory: true         # Enable threat signature persistence
```

### Configuration Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | `bool` | `false` | Enable or disable the immune system |
| `deviation_threshold` | `float` | `2.0` | Number of standard deviations to trigger anomaly |
| `min_samples` | `int` | `10` | Minimum behavior samples before detection begins |
| `auto_suspend` | `bool` | `true` | Automatically suspend anomalous processes |
| `threat_memory` | `bool` | `true` | Persist threat signatures across sessions |

When disabled, all immune-related IPC methods return empty status, and no behavior monitoring occurs.

---

## Immune Daemon

When enabled, the **Immune Daemon** is a security monitoring process that continuously watches all agent behavior patterns.

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

The Immune Daemon triggers an alert and can automatically **suspend** the process.

### Threat Memory (Antibody Memory)

Identified anomalous behavior patterns are recorded in a threat memory library. When the same pattern appears again, it is **immediately blocked** without re-detection.

```bash
$ rnix immune status
Security Monitor: active
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

When `security-scanner` fails beyond retry limits, its remaining task can be migrated to `code-analyst` (similarity: 0.72) for continued execution with partial context transfer.

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

High-frequency collaboration paths are **prioritized in subsequent orchestrations** — the system learns which agent combinations work best together.

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

- [Monitoring & Supervisor](/guide/monitoring) — Process monitoring and restart strategies
- [Token Economy](/guide/token-economy) — Budget pools and reputation
- [Autonomous Agents](/guide/autonomous-agents) — Unified reasoning loop
- [Compose Orchestration](/guide/compose) — Multi-agent DAG workflows
