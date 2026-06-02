## 3. Agent 和 Skill 清单

### 3.1 agent.yaml 字段说明

`AgentManifest` 结构定义了 Agent 的配置清单：

| 字段 | 类型 | 是否必需 | 说明 |
|------|------|---------|------|
| `name` | `string` | 必需 | Agent 名称（唯一标识符） |
| `description` | `string` | 可选 | Agent 描述 |
| `models` | `AgentModels` | 可选 | LLM 模型偏好 |
| `context_budget` | `int` | 可选 | 上下文预算（token 数） |
| `skills` | `[]string` | 可选 | 引用的 Skill 名称列表 |

### 3.2 AgentModels 子结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `provider` | `string` | LLM 提供商（`claude`（默认）或 `cursor`） |
| `preferred` | `string` | 首选模型（如 `deepseek-v4-flash`） |
| `fallback` | `string` | 备用模型（如 `deepseek-v4-pro`） |

**模型选择优先级：** CLI `--model` flag > Agent manifest `preferred` > 驱动默认值

**Provider 选择优先级：** CLI `--provider` flag > Agent manifest `models.provider` > 默认 `claude`

### 3.3 instructions.md 格式

纯 Markdown 文件，包含 Agent 的角色定义和系统提示词。内容将作为 LLM 系统提示词的一部分。

**拼接规则：** `SystemPrompt() = Agent instructions.md + "\n\n" + Skill A body + "\n\n" + Skill B body + ...`

### 3.4 Agent 加载流程

`AgentLoader.Load(agentName)` 执行以下步骤：

1. **路径安全检查** — 防止目录遍历攻击（检查路径不逃逸出基目录）
2. **读取 agent.yaml** — 解析为 `AgentManifest`
3. **验证必需字段** — `name` 字段必须非空
4. **读取 instructions.md** — 作为系统提示词文本
5. **加载引用的 Skills** — 遍历 `manifest.Skills`，对每个调用 `skillLoader.LoadFull(skillName)`
6. **返回 AgentInfo** — 包含 `Manifest`、`Instructions`、`Skills` 三部分

### 3.5 SKILL.md 格式

SKILL.md 采用 Agent Skills 行业标准格式：YAML frontmatter + Markdown body。

```markdown
---
name: skill-name
description: >
  多行描述文本
allowed-tools: /dev/fs /dev/shell
metadata:
  key: value
---

# Markdown Body（程序性知识）

操作指南、工作流描述等内容...
```

**解析规则：**

1. 文件必须以 `---` 开头
2. 两个 `---` 之间为 YAML frontmatter
3. 第二个 `---` 之后为 Markdown body
4. 不以 `---` 开头 → 错误 `"SKILL.md must start with ---"`
5. 缺少结束 `---` → 错误 `"SKILL.md missing closing ---"`

### 3.6 SkillManifest 字段

| 字段 | YAML 键 | 类型 | 是否必需 | 说明 |
|------|---------|------|---------|------|
| `Name` | `name` | `string` | 必需 | Skill 名称 |
| `Description` | `description` | `string` | 可选 | Skill 描述 |
| `AllowedToolsRaw` | `allowed-tools` | `string` | 关键字段 | 空格分隔的 VFS 设备路径 |
| `Metadata` | `metadata` | `map[string]string` | 可选 | 任意键值对 |

**AllowedTools() 解析：**

- `"/dev/fs /dev/shell"` → `["/dev/fs", "/dev/shell"]`
- 空字符串 → `nil`（无限制，可访问所有设备）

### 3.7 渐进式加载策略

Rnix 对 Skill 提供两级加载粒度：

| 方法 | 加载内容 | 估算 Token | 用途 |
|------|---------|-----------|------|
| `LoadMetadata(skillName)` | 仅 YAML frontmatter | ~100 | 发现阶段（枚举名称、描述、权限） |
| `LoadFull(skillName)` | frontmatter + Markdown body | < 5000 | 激活阶段（注入系统提示词） |

### 3.8 完整示例

**agent.yaml 示例（`agents/code-analyst/agent.yaml`）：**

```yaml
name: code-analyst
description: "分析代码质量、识别潜在问题并提供改进建议的智能体"
models:
  provider: deepseek
  preferred: deepseek-v4-flash
  fallback: deepseek-v4-pro
skills:
  - code-analysis
```

**SKILL.md 示例（`skills/code-analysis/SKILL.md`）：**

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

