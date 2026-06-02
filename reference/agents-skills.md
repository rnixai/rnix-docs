## 3. Agent and Skill Manifests

### 3.1 agent.yaml Field Descriptions

The `AgentManifest` structure defines the Agent's configuration manifest:

| Field | Type | Required | Description |
|------|------|---------|------|
| `name` | `string` | Required | Agent name (unique identifier) |
| `description` | `string` | Optional | Agent description |
| `models` | `AgentModels` | Optional | LLM model preferences |
| `context_budget` | `int` | Optional | Context budget (token count) |
| `skills` | `[]string` | Optional | Referenced Skill name list |

### 3.2 AgentModels Sub-structure

| Field | Type | Description |
|------|------|------|
| `provider` | `string` | LLM provider (`claude` (default) or `cursor`) |
| `preferred` | `string` | Preferred model (e.g., `deepseek-v4-flash`) |
| `fallback` | `string` | Fallback model (e.g., `deepseek-v4-pro`) |

**Model Selection Priority:** CLI `--model` flag > Agent manifest `preferred` > driver default

**Provider Selection Priority:** CLI `--provider` flag > Agent manifest `models.provider` > default `claude`

### 3.3 instructions.md Format

A plain Markdown file containing the Agent's role definition and system prompt. The content becomes part of the LLM system prompt.

**Concatenation Rule:** `SystemPrompt() = Agent instructions.md + "\n\n" + Skill A body + "\n\n" + Skill B body + ...`

### 3.4 Agent Loading Process

`AgentLoader.Load(agentName)` performs the following steps:

1. **Path safety check** — Prevents directory traversal attacks (verifies the path does not escape the base directory)
2. **Read agent.yaml** — Parses into `AgentManifest`
3. **Validate required fields** — `name` field must be non-empty
4. **Read instructions.md** — Used as system prompt text
5. **Load referenced Skills** — Iterates `manifest.Skills`, calling `skillLoader.LoadFull(skillName)` for each
6. **Return AgentInfo** — Contains three parts: `Manifest`, `Instructions`, `Skills`

### 3.5 SKILL.md Format

SKILL.md follows the Agent Skills industry standard format: YAML frontmatter + Markdown body.

```markdown
---
name: skill-name
description: >
  Multi-line description text
allowed-tools: /dev/fs /dev/shell
metadata:
  key: value
---

# Markdown Body (Procedural Knowledge)

Operation guides, workflow descriptions, etc.
```

**Parsing Rules:**

1. File must start with `---`
2. Content between the two `---` markers is the YAML frontmatter
3. Content after the second `---` is the Markdown body
4. Not starting with `---` -> error `"SKILL.md must start with ---"`
5. Missing closing `---` -> error `"SKILL.md missing closing ---"`

### 3.6 SkillManifest Fields

| Field | YAML Key | Type | Required | Description |
|------|---------|------|---------|------|
| `Name` | `name` | `string` | Required | Skill name |
| `Description` | `description` | `string` | Optional | Skill description |
| `AllowedToolsRaw` | `allowed-tools` | `string` | Key field | Space-separated VFS device paths |
| `Metadata` | `metadata` | `map[string]string` | Optional | Arbitrary key-value pairs |

**AllowedTools() Parsing:**

- `"/dev/fs /dev/shell"` -> `["/dev/fs", "/dev/shell"]`
- Empty string -> `nil` (no restriction, can access all devices)

### 3.7 Progressive Loading Strategy

Rnix provides two levels of loading granularity for Skills:

| Method | Loaded Content | Estimated Tokens | Use Case |
|------|---------|-----------|------|
| `LoadMetadata(skillName)` | YAML frontmatter only | ~100 | Discovery phase (enumerate names, descriptions, permissions) |
| `LoadFull(skillName)` | frontmatter + Markdown body | < 5000 | Activation phase (inject into system prompt) |

### 3.8 Complete Example

**agent.yaml Example (`agents/code-analyst/agent.yaml`):**

```yaml
name: code-analyst
description: "Agent that analyzes code quality, identifies issues, and provides improvement suggestions"
models:
  provider: deepseek
  preferred: deepseek-v4-flash
  fallback: deepseek-v4-pro
skills:
  - code-analysis
```

**SKILL.md Example (`skills/code-analysis/SKILL.md`):**

```markdown
---
name: code-analysis
description: >
  Analyze code quality, identify bugs, performance issues and security
  vulnerabilities.
allowed-tools: /dev/fs /dev/shell
metadata:
  author: rnix
  version: "1.0"
---

# Code Analysis

## When to use this skill
...
```

---

