# Skill Packages

Install, search, update, and manage Skills from the community registry.

---

## Commands

### skill install

Download and install a Skill from the community registry:

```bash
$ rnix skill install code-analysis
Installing code-analysis@1.2.0...
  ✓ Downloaded from registry
  ✓ Installed to lib/skills/code-analysis/
  ✓ Registry updated
```

Skills are installed to the local `lib/skills/` directory with their `SKILL.md` file and any associated resources.

### skill search

Search the community registry for available Skills:

```bash
$ rnix skill search "security"
Name                  Version  Downloads  Description
security-scan         2.0.1    1,234      Scan for security vulnerabilities
dependency-audit      1.3.0      567      Audit dependency security
auth-review           1.0.0      234      Review authentication implementations
```

### skill update

Update installed Skills to the latest compatible version:

```bash
$ rnix skill update code-analysis
Updating code-analysis: 1.2.0 → 1.3.0...
  ✓ Downloaded
  ✓ Updated

$ rnix skill update          # Update all installed skills
```

### skill list

View all locally installed Skills:

```bash
$ rnix skill list
Name              Version  Allowed Tools          Source
code-analysis     1.3.0    /dev/fs /dev/shell      registry
security-scan     2.0.1    /dev/fs                 registry
my-custom-skill   0.1.0    /dev/fs /dev/shell      local
```

---

## Local Registry

The system maintains a local registry tracking installed Skills:

| Field | Description |
|-------|-------------|
| Name | Skill identifier |
| Version | Installed version |
| Source | `registry` or `local` |
| Path | Filesystem location |
| Installed | Installation timestamp |

---

## Creating Custom Skills

You can create Skills locally without publishing to the registry:

```bash
mkdir -p lib/skills/my-skill
```

Create `lib/skills/my-skill/SKILL.md`:

```markdown
---
name: my-skill
description: "My custom skill"
allowed-tools: /dev/fs
---

# My Skill

Instructions for the agent...
```

The skill is immediately available to reference from `agent.yaml`.

---

## Related Documentation

- [Agents & Skills](/guide/agents-and-skills) — Skill definition format
- [Token Economy](/guide/token-economy) — Skill synergy emergence
- [Reference Manual](/reference/) — SKILL.md field reference
