# Skill 包管理

从社区 Registry 安装、搜索、更新和管理 Skill。

---

## 命令

### skill install

从社区 Registry 下载并安装 Skill：

```bash
$ rnix skill install code-analysis
Installing code-analysis@1.2.0...
  ✓ Downloaded from registry
  ✓ Installed to ~/.config/rnix/skills/code-analysis/
  ✓ Registry updated
```

Skill 安装到 `~/.config/rnix/skills/`（全局），包含 `SKILL.md` 文件及相关资源。

### skill search

在社区 Registry 中搜索可用的 Skill：

```bash
$ rnix skill search "security"
Name                  Version  Downloads  Description
security-scan         2.0.1    1,234      Scan for security vulnerabilities
dependency-audit      1.3.0      567      Audit dependency security
auth-review           1.0.0      234      Review authentication implementations
```

### skill update

将已安装的 Skill 更新到最新兼容版本：

```bash
$ rnix skill update code-analysis
Updating code-analysis: 1.2.0 → 1.3.0...
  ✓ Downloaded
  ✓ Updated

$ rnix skill update          # 更新所有已安装的 Skill
```

### skill list

查看所有本地已安装的 Skill：

```bash
$ rnix skill list
Name              Version  Allowed Tools          Source
code-analysis     1.3.0    /dev/fs /dev/shell      registry
security-scan     2.0.1    /dev/fs                 registry
my-custom-skill   0.1.0    /dev/fs /dev/shell      local
```

---

## 本地 Registry

系统维护一个本地 Registry 跟踪已安装的 Skill：

| 字段 | 说明 |
|------|------|
| Name | Skill 标识符 |
| Version | 已安装版本 |
| Source | `registry` 或 `local` |
| Path | 文件系统路径 |
| Installed | 安装时间戳 |

---

## 创建自定义 Skill

你可以在本地创建 Skill，无需发布到 Registry：

```bash
mkdir -p .rnix/skills/my-skill
```

创建 `.rnix/skills/my-skill/SKILL.md`：

```markdown
---
name: my-skill
description: "My custom skill"
allowed-tools: /dev/fs
---

# My Skill

Instructions for the agent...
```

该 Skill 创建后即可在 `agent.yaml` 中引用。

---

## 相关文档

- [Agent 与 Skill](/zh/guide/agents-and-skills) — Skill 定义格式
- [Token 经济](/zh/guide/token-economy) — Skill 协同涌现
- [参考手册](/zh/reference/) — SKILL.md 字段参考
