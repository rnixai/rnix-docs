# Skill Packages

Install, search, update, and manage Skills from the community registry. Rnix follows the [agentskills.io](https://agentskills.io/) four-path model for cross-tool skill interoperability.

---

## Directory Layout & Priority

Rnix uses a **dual-scope × dual-namespace** four-path model per the agentskills.io specification:

| Path | Scope | Namespace | Purpose | Priority | Install Trigger |
|------|-------|-----------|---------|----------|----------------|
| `<projectDir>/.rnix/skills/` | project | native | Project-local Rnix skills | 1 (highest) | `skill install <name>` (in `.rnix/` project, no flag) |
| `<projectDir>/.agents/skills/` | project | agents | Project-local cross-tool shared skills | 2 | `skill install <name> --shared` (in `.rnix/` project) |
| `~/.config/rnix/skills/` | user | native | User-global Rnix skills | 3 | `skill install <name> -g`; or no project + no flag |
| `~/.agents/skills/` | user | agents | User-global cross-tool shared skills | 4 (lowest) | `skill install <name> -g --shared` |

> **Legacy note**: `lib/skills/` is no longer scanned at runtime. Built-in skills shipped via `embed.FS` are extracted once by `rnix init` to `~/.config/rnix/skills/`.

### Priority Rules

- **Cross-scope**: `project > user` — agentskills.io spec mandates this. A project skill with the same name **completely replaces** the user skill. No field-level merging.
- **Same-scope**: `native > agents` — Rnix-native path (`~/.config/rnix/skills/`) takes precedence over cross-tool agents path (`~/.agents/skills/`).
- **Shadow replace**: The winning copy fully replaces the shadowed copy. The shadowed copy is **not** shown in `skill list`; it appears only as a stderr warning.

### Skill Resolution (ResolveSkillScopes)

At runtime, `ResolveSkillScopes(cwd)` returns the ordered list of existing skill root directories. The default scan order is exactly the priority order above — four `os.Stat` calls on cwd and home. Non-existent paths are silently skipped.

### Ancestor Traversal (Monorepo Support)

By default, `rnix skill` only scans the current directory. In monorepo setups where you work in a subdirectory (e.g., `~/monorepo/packages/my-pkg/`) but skills live at the repo root (`~/monorepo/.rnix/skills/`), ancestor traversal is needed:

```
~/monorepo/
  .rnix/skills/
    code-analysis/SKILL.md
  .git/
  packages/
    my-pkg/         ← user runs rnix skill list here
```

- **Default behavior**: only scans `my-pkg/.rnix/skills/` + `my-pkg/.agents/skills/` — **won't find** code-analysis.
- **With ancestor traversal**: walks up to `~/monorepo/`, finds `.rnix/skills/code-analysis/`, stops at `.git/` boundary.

Ancestor traversal is currently available via Go API (no CLI flag yet):

```go
scopes := config.ResolveSkillScopes(cwd, config.WithAncestorTraversal(true))
```

**Walker behavior** (when enabled):

| Property | Value |
|----------|-------|
| Max ancestor depth | 6 layers above cwd |
| Max total stat calls | 2000 |
| Stop conditions | `.git/` boundary, `$HOME` boundary, filesystem root |
| Skipped directories | `.git/`, `node_modules/` (extensible via `WithSkipDirs`) |
| Truncation | Warns on stderr, returns partial results |

---

## CLI Commands

The skill subcommand family: `install`, `update`, `list`, `search`. The first three operate on the local four-path model; `search` only queries the remote registry.

### skill install

`rnix skill install <name> [name...]` fetches from the community registry (default `https://registry.rnix.ai`) and extracts to writeScope. The writeScope is determined by `(global, shared)` flag combination:

| Condition | Target Path | Scope · Namespace |
|-----------|-------------|-------------------|
| In `.rnix/` project, no flag | `<projectDir>/.rnix/skills/<name>/` | project · native |
| Not in `.rnix/` project, no flag | `~/.config/rnix/skills/<name>/` | user · native |
| `-g` / `--global` (any cwd) | `~/.config/rnix/skills/<name>/` | user · native |
| In `.rnix/` project, `--shared` | `<projectDir>/.agents/skills/<name>/` | project · agents |
| Not in `.rnix/` project, `--shared` | `~/.agents/skills/<name>/` | user · agents |
| `-g --shared` (any cwd) | `~/.agents/skills/<name>/` | user · agents |

The two flags are orthogonal: `-g` switches scope (project ↔ user), `--shared` switches namespace (native ↔ agents). Multiple args write to the **same** writeScope:

```bash
rnix skill install code-analysis                     # project/native or user/native
rnix skill install code-analysis -g                  # force user/native
rnix skill install code-analysis --shared            # agents namespace
rnix skill install code-analysis pr-reviewer --force # overwrite existing
rnix skill install code-analysis --json              # JSON output
```

Install validation: strict `LoadMetadata` after extraction — if SKILL.md triggers lenient-warning conditions (e.g., name mismatch), the install rolls back even though the skill would be listable from disk.

### skill update

`rnix skill update [name...]` upgrades installed community skills. Update writes back to the **same scope** where the skill was found:

```bash
rnix skill update code-analysis              # single skill (writes to origin scope)
rnix skill update code-analysis pr-reviewer  # multiple skills
rnix skill update                            # all community skills across all scopes
rnix skill update code-analysis --json       # JSON output
```

- `rnix skill update foo` resolves foo's current scope via shadow resolution, updates, writes back to that scope.
- `rnix skill update` (no args) traverses **all** scopes, updating each community skill in place.
- Builtin-source skills are excluded from bulk update (no registry version to check against).

### skill list

`rnix skill list` shows the deduplicated view across all four paths. Output is a 6-column table:

| Column | Source | Description |
|--------|--------|-------------|
| `NAME` | SKILL.md frontmatter `name` | Skill identifier |
| `VERSION` | `.registry.yaml` (semver or empty) | From winning scope |
| `SOURCE` | `builtin` / `community` / empty | `builtin` = shipped with Rnix; `community` = installed from registry |
| `SCOPE` | `project` / `user` | From winning `ScopePath.Scope` |
| `NAMESPACE` | `native` / `agents` | From winning `ScopePath.Namespace` |
| `DESCRIPTION` | SKILL.md frontmatter `description` | Truncated to 40 chars |

```bash
rnix skill list           # all scopes
rnix skill list -p        # project scope only (.rnix/skills + .agents/skills)
rnix skill list -g        # user scope only (~/.config/rnix/skills + ~/.agents/skills)
rnix skill list --json    # JSON output (includes diagnostics node)
rnix skill list --quiet   # names only, one per line (for shell piping)
```

`-g` and `-p` are mutually exclusive. Shadowed copies do **not** appear in the table — each name shows only its winning copy.

**Empty list diagnostics**: when all four paths are empty or absent, the table header is rendered followed by a diagnostic block:

```text
[skill] NAME  VERSION  SOURCE  SCOPE  NAMESPACE  DESCRIPTION
[skill] No skills found. Scanned paths:
[skill]   - /home/decker/project/.rnix/skills (not-found)
[skill]   - /home/decker/project/.agents/skills (existed-but-empty)
[skill]   - /home/decker/.config/rnix/skills (existed-but-empty)
[skill]   - /home/decker/.agents/skills (not-found)
[skill] Tip: skill search <keyword> to discover more skills.
```

Path statuses: `not-found` (stat failed or not a directory), `existed-but-empty` (directory exists but contains no skill subdirectories).

### skill search

`rnix skill search [keyword]` queries the remote community registry only — no local four-path scanning:

```bash
rnix skill search code           # search keyword "code"
rnix skill search                # browse all available skills
rnix skill search code --json    # JSON output
```

---

## Conflict Resolution & Shadow Warnings

When the same skill name exists in multiple paths, shadow resolution applies:

### Resolution Order

`project/native > project/agents > user/native > user/agents`

A winning copy **completely replaces** shadowed copies — no field merging. The shadowed copy is not shown in `skill list`; instead, a warning is emitted to stderr:

```text
[skill] warning: shadowed skill "code-analysis": winner=/home/decker/project/.rnix/skills/code-analysis (project/native); shadowed=/home/decker/.config/rnix/skills/code-analysis (user/native)
```

### Multiple Shadow

If a name exists in 3 or 4 paths, each shadow event gets its **own warning line** — not merged. This ensures users can identify each shadowed source individually.

JSON mode places shadow warnings in `diagnostics.warnings[]`:

```json
{
  "skill_name": "code-analysis",
  "winning_path": "/home/decker/project/.rnix/skills/code-analysis",
  "winning_scope": "project",
  "winning_ns": "native",
  "shadowed_path": "/home/decker/.config/rnix/skills/code-analysis",
  "shadowed_scope": "user",
  "shadowed_ns": "native"
}
```

---

## Lenient Validation

Rnix loads SKILL.md with lenient validation per the agentskills.io spec. Two tiers of tolerance:

| Condition | Behavior | Diagnostic Channel |
|-----------|----------|-------------------|
| `name` mismatch with parent directory | **Warn but load** — cosmetic, content is usable | `diagnostics.lenient[]` |
| `name` exceeds 64 chars | **Warn but load** (truncated display) | `diagnostics.lenient[]` |
| `name` missing or empty | **Skip + log** — cannot identify skill | `diagnostics.skipped[]` |
| `description` missing or empty | **Skip + log** — description is critical for LLM matching | `diagnostics.skipped[]` |
| YAML frontmatter unparseable | **Skip + log** — no metadata available | `diagnostics.skipped[]` |

**Warn-but-load**: skill appears in `skill list` and can be loaded by agents; only advisory in stderr/JSON.  
**Skip**: skill is completely hidden — not in list, not loadable by agents.

---

## Trust Check

Project-scope skills (`.rnix/skills/` + `.agents/skills/`) come from the repository — a malicious repo could inject agent instructions via SKILL.md. Rnix implements a **warn-only** trust check:

| Scenario | Behavior |
|----------|----------|
| `<projectDir>/.rnix/state/trusted` exists (regular file) | No trust warning; project skills load normally |
| Trust marker absent | Trust warning on stderr (list/install/update); **skills still load** (warn-only, not blocking) |
| CWD not in a `.rnix/` project (user scope only) | No trust check (user scope is always trusted) |

The trust marker is a regular file at `<projectDir>/.rnix/state/trusted`. **Symlinks are rejected** — only `Mode().IsRegular()` files are accepted, preventing symlink-based bypass attacks.

### Trust Warning Format

```
[skill] warning: untrusted project "/home/decker/EchoMatrix": 2 skill root(s) will load — untrusted repo can inject agent instructions. Policy: warn-only (not blocking). To dismiss this warning, run: touch /home/decker/EchoMatrix/.rnix/state/trusted
```

### Dismiss Options

- **Ad-hoc**: `touch <projectDir>/.rnix/state/trusted` — suppress warning locally
- **Commit to git**: add `.rnix/state/trusted` to the repo so all cloners are trusted
- **Per-developer opt-in**: add `.rnix/state/trusted` to `.gitignore` so each developer must `touch` it themselves

### Agents-Only Project Limitation

The trust marker path is anchored to `.rnix/state/trusted`. Pure agents-only projects (only `.agents/skills/`, no `.rnix/`) must manually create `.rnix/state/` + `touch trusted` to dismiss. A future `rnix trust <dir>` command will handle this uniformly.

---

## Cross-Tool Compatibility (agentskills.io)

Skills in the `agents` namespace (`.agents/skills/` or `~/.agents/skills/`) follow the [agentskills.io](https://agentskills.io/) standard and are shared with the broader ecosystem:

- **vercel-labs/skills** — the reference registry
- **Cursor** — `.agents/skills/` namespace
- **OpenCode** — `.agents/skills/` namespace
- **Windsurf** — `.agents/skills/` namespace

This means a skill installed to `.agents/skills/` via `rnix skill install --shared` is also visible to Cursor and other compatible tools — one install, multiple clients.

---

## Creating Custom Skills

Create skills locally without publishing to the registry:

```bash
mkdir -p .rnix/skills/my-custom-skill

cat > .rnix/skills/my-custom-skill/SKILL.md << 'EOF'
---
name: my-custom-skill
description: "My custom analysis workflow"
allowed-tools: /dev/fs /dev/shell
metadata:
  version: "0.1.0"
---

# My Custom Skill

## When to Use
When you need to perform custom analysis on Go source files.

## Workflow
1. Read target files via /dev/fs
2. Run go vet via /dev/shell
3. Compile findings into a report
EOF
```

The skill appears in `rnix skill list` with `SOURCE` empty (no registry metadata).

---

## Skill Loading During Spawn

When an agent is spawned, skills are loaded through the four-path resolution:

1. Agent's `skills: [...]` list is read from `agent.yaml`
2. `SkillLoader` resolves each name via `ResolveSkillScopes` → shadow priority order
3. Winning copies are loaded (shadow warnings to stderr if applicable)
4. `allowed-tools` from all loaded skills are **unioned** into the process's `AllowedDevices`
5. Skill bodies are concatenated into the system prompt
6. Trust check runs for project-scope skills (warns if untrusted, does not block)

---

## Related Documentation

- [Agents & Skills](/guide/agents-and-skills) — Agent and SKILL.md definition format
- [Configuration](/guide/configuration) — Skill directory paths and config
- [Core Concepts](/guide/concepts) — Progressive loading strategy
- [Web Search](/guide/web-search) — `/dev/web` device for web-capable skills
