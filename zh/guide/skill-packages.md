# Skill 包管理

安装、搜索、更新和管理来自社区 Registry 的 Skill。Rnix 遵循 [agentskills.io](https://agentskills.io/) 的四路径模型，以实现跨工具 skill 互操作性。

---

## 目录布局与优先级

Rnix 采用 agentskills.io 规范定义的 **双 scope × 双 namespace** 四路径模型：

| 路径 | Scope | Namespace | 用途 | 优先级 | 安装触发器 |
|------|-------|-----------|------|--------|------------|
| `<projectDir>/.rnix/skills/` | project | native | 项目本地 Rnix skill | 1（最高） | `skill install <name>`（在 `.rnix/` 项目内，无 flag） |
| `<projectDir>/.agents/skills/` | project | agents | 项目本地跨工具共享 skill | 2 | `skill install <name> --shared`（在 `.rnix/` 项目内） |
| `~/.config/rnix/skills/` | user | native | 用户全局 Rnix skill | 3 | `skill install <name> -g`；或无项目 + 无 flag |
| `~/.agents/skills/` | user | agents | 用户全局跨工具共享 skill | 4（最低） | `skill install <name> -g --shared` |

> **旧版说明**：`lib/skills/` 不再在运行时扫描。通过 `embed.FS` 内置的 skill 由 `rnix init` 一次性提取到 `~/.config/rnix/skills/`。

### 优先级规则

- **跨 scope**：`project > user` —— agentskills.io 规范强制要求。同名 project skill **完全替代** user skill，不做字段级合并。
- **同 scope**：`native > agents` —— Rnix-native 路径（`~/.config/rnix/skills/`）优先于跨工具 agents 路径（`~/.agents/skills/`）。
- **Shadow 替代**：胜出副本完全替代被 shadow 的副本。被 shadow 的副本**不会**出现在 `skill list` 中；仅通过 stderr 警告提示。

### Skill 解析（ResolveSkillScopes）

运行时，`ResolveSkillScopes(cwd)` 返回有序的已存在 skill 根目录列表。默认扫描顺序即上述优先级顺序 —— 对 cwd 和 home 目录各执行一次 `os.Stat`。不存在的路径会被静默跳过。

### 祖先遍历（Monorepo 支持）

默认情况下，`rnix skill` 仅扫描当前目录。在 monorepo 设置中，如果你在子目录工作（如 `~/monorepo/packages/my-pkg/`）而 skill 存放在仓库根目录（`~/monorepo/.rnix/skills/`），则需要祖先遍历：

```
~/monorepo/
  .rnix/skills/
    code-analysis/SKILL.md
  .git/
  packages/
    my-pkg/         ← 用户在此执行 rnix skill list
```

- **默认行为**：仅扫描 `my-pkg/.rnix/skills/` + `my-pkg/.agents/skills/` —— **不会找到** code-analysis。
- **启用祖先遍历**：向上遍历至 `~/monorepo/`，找到 `.rnix/skills/code-analysis/`，在 `.git/` 边界处停止。

祖先遍历目前通过 Go API 可用（尚未提供 CLI flag）：

```go
scopes := config.ResolveSkillScopes(cwd, config.WithAncestorTraversal(true))
```

**遍历器行为**（启用时）：

| 属性 | 值 |
|------|-----|
| 最大祖先深度 | cwd 向上 6 层 |
| 最大 stat 调用总数 | 2000 |
| 停止条件 | `.git/` 边界、`$HOME` 边界、文件系统根 |
| 跳过目录 | `.git/`、`node_modules/`（可通过 `WithSkipDirs` 扩展） |
| 截断处理 | stderr 警告，返回部分结果 |

---

## CLI 命令

skill 子命令家族：`install`、`update`、`list`、`search`。前三个操作本地四路径模型；`search` 仅查询远程 Registry。

### skill install

`rnix skill install <name> [name...]` 从社区 Registry（默认 `https://registry.rnix.ai`）获取并提取到 writeScope。writeScope 由 `(global, shared)` flag 组合决定：

| 条件 | 目标路径 | Scope · Namespace |
|------|---------|-------------------|
| 在 `.rnix/` 项目内，无 flag | `<projectDir>/.rnix/skills/<name>/` | project · native |
| 不在 `.rnix/` 项目内，无 flag | `~/.config/rnix/skills/<name>/` | user · native |
| `-g` / `--global`（任意 cwd） | `~/.config/rnix/skills/<name>/` | user · native |
| 在 `.rnix/` 项目内，`--shared` | `<projectDir>/.agents/skills/<name>/` | project · agents |
| 不在 `.rnix/` 项目内，`--shared` | `~/.agents/skills/<name>/` | user · agents |
| `-g --shared`（任意 cwd） | `~/.agents/skills/<name>/` | user · agents |

两个 flag 是正交的：`-g` 切换 scope（project ↔ user），`--shared` 切换 namespace（native ↔ agents）。多个参数写入**同一个** writeScope：

```bash
rnix skill install code-analysis                     # project/native 或 user/native
rnix skill install code-analysis -g                  # 强制 user/native
rnix skill install code-analysis --shared            # agents namespace
rnix skill install code-analysis pr-reviewer --force # 覆盖已有安装
rnix skill install code-analysis --json              # JSON 输出
```

安装验证：提取后进行严格的 `LoadMetadata` —— 如果 SKILL.md 触发宽松警告条件（如 name 不匹配），即使该 skill 可以从磁盘列出，安装也会回滚。

### skill update

`rnix skill update [name...]` 升级已安装的社区 skill。更新写回到 skill 所在的**同一 scope**：

```bash
rnix skill update code-analysis              # 单个 skill（写入原始 scope）
rnix skill update code-analysis pr-reviewer  # 多个 skill
rnix skill update                            # 所有 scope 中的所有社区 skill
rnix skill update code-analysis --json       # JSON 输出
```

- `rnix skill update foo` 通过 shadow 解析确定 foo 的当前 scope，更新后写回该 scope。
- `rnix skill update`（无参数）遍历**所有** scope，原地更新每个社区 skill。
- 内置来源的 skill 不参与批量更新（没有对应 registry 版本可供检查）。

### skill list

`rnix skill list` 显示跨四路径的去重视图。输出为 6 列表格：

| 列 | 来源 | 说明 |
|----|------|------|
| `NAME` | SKILL.md frontmatter `name` | Skill 标识符 |
| `VERSION` | `.registry.yaml`（semver 或空） | 来自胜出 scope |
| `SOURCE` | `builtin` / `community` / 空 | `builtin` = Rnix 内置；`community` = 从 registry 安装 |
| `SCOPE` | `project` / `user` | 来自胜出 `ScopePath.Scope` |
| `NAMESPACE` | `native` / `agents` | 来自胜出 `ScopePath.Namespace` |
| `DESCRIPTION` | SKILL.md frontmatter `description` | 截断至 40 字符 |

```bash
rnix skill list           # 所有 scope
rnix skill list -p        # 仅 project scope（.rnix/skills + .agents/skills）
rnix skill list -g        # 仅 user scope（~/.config/rnix/skills + ~/.agents/skills）
rnix skill list --json    # JSON 输出（含 diagnostics 节点）
rnix skill list --quiet   # 仅名称，每行一个（用于 shell 管道）
```

`-g` 和 `-p` 互斥。被 shadow 的副本**不会**出现在表格中 —— 每个名称仅显示其胜出副本。

**空列表诊断**：当四路径全部为空或不存在时，渲染表格头后显示诊断块：

```text
[skill] NAME  VERSION  SOURCE  SCOPE  NAMESPACE  DESCRIPTION
[skill] No skills found. Scanned paths:
[skill]   - /home/decker/project/.rnix/skills (not-found)
[skill]   - /home/decker/project/.agents/skills (existed-but-empty)
[skill]   - /home/decker/.config/rnix/skills (existed-but-empty)
[skill]   - /home/decker/.agents/skills (not-found)
[skill] Tip: skill search <keyword> to discover more skills.
```

路径状态：`not-found`（stat 失败或非目录）、`existed-but-empty`（目录存在但不含 skill 子目录）。

### skill search

`rnix skill search [keyword]` 仅查询远程社区 Registry —— 不做本地四路径扫描：

```bash
rnix skill search code           # 搜索关键词 "code"
rnix skill search                # 浏览所有可用 skill
rnix skill search code --json    # JSON 输出
```

---

## 冲突解决与 Shadow 警告

当同一 skill 名称存在于多个路径时，应用 shadow 解析：

### 解析顺序

`project/native > project/agents > user/native > user/agents`

胜出副本**完全替代**被 shadow 的副本 —— 不做字段合并。被 shadow 的副本不在 `skill list` 中显示；而是向 stderr 发出警告：

```text
[skill] warning: shadowed skill "code-analysis": winner=/home/decker/project/.rnix/skills/code-analysis (project/native); shadowed=/home/decker/.config/rnix/skills/code-analysis (user/native)
```

### 多重 Shadow

如果一个名称存在于 3 或 4 个路径中，每个 shadow 事件各自产生**独立的警告行** —— 不合并。这确保用户可以单独识别每个被 shadow 的来源。

JSON 模式将 shadow 警告放在 `diagnostics.warnings[]` 中：

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

## 宽松验证

Rnix 按照 agentskills.io 规范以宽松验证方式加载 SKILL.md。两级容错：

| 条件 | 行为 | 诊断通道 |
|------|------|---------|
| `name` 与父目录不匹配 | **警告但仍加载** —— 表面问题，内容可用 | `diagnostics.lenient[]` |
| `name` 超过 64 字符 | **警告但仍加载**（显示截断） | `diagnostics.lenient[]` |
| `name` 缺失或为空 | **跳过并记录** —— 无法标识 skill | `diagnostics.skipped[]` |
| `description` 缺失或为空 | **跳过并记录** —— description 对 LLM 匹配至关重要 | `diagnostics.skipped[]` |
| YAML frontmatter 不可解析 | **跳过并记录** —— 无可用元数据 | `diagnostics.skipped[]` |

**警告但仍加载**：skill 出现在 `skill list` 中并可由 agent 加载；仅在 stderr/JSON 中给出建议。  
**跳过**：skill 完全隐藏 —— 不在列表中，不可由 agent 加载。

---

## 信任检查

Project-scope skill（`.rnix/skills/` + `.agents/skills/`）来自仓库 —— 恶意仓库可能通过 SKILL.md 注入 agent 指令。Rnix 实施**仅警告**的信任检查：

| 场景 | 行为 |
|------|------|
| `<projectDir>/.rnix/state/trusted` 存在（普通文件） | 无信任警告；project skill 正常加载 |
| 信任标记文件不存在 | stderr 信任警告（list/install/update）；**skill 仍然加载**（仅警告，不阻塞） |
| CWD 不在 `.rnix/` 项目内（仅 user scope） | 无信任检查（user scope 始终受信任） |

信任标记是 `<projectDir>/.rnix/state/trusted` 处的普通文件。**符号链接会被拒绝** —— 仅 `Mode().IsRegular()` 文件被接受，防止基于符号链接的绕过攻击。

### 信任警告格式

```
[skill] warning: untrusted project "/home/decker/EchoMatrix": 2 skill root(s) will load — untrusted repo can inject agent instructions. Policy: warn-only (not blocking). To dismiss this warning, run: touch /home/decker/EchoMatrix/.rnix/state/trusted
```

### 消除选项

- **临时**：`touch <projectDir>/.rnix/state/trusted` —— 本地抑制警告
- **提交到 git**：将 `.rnix/state/trusted` 加入仓库，使所有克隆者受信任
- **按开发者选择加入**：将 `.rnix/state/trusted` 加入 `.gitignore`，每个开发者需自行 `touch`

### 仅 Agents 项目的局限

信任标记路径锚定于 `.rnix/state/trusted`。纯 agents 项目（仅有 `.agents/skills/`，无 `.rnix/`）须手动创建 `.rnix/state/` + `touch trusted` 来消除警告。未来的 `rnix trust <dir>` 命令将统一处理此场景。

---

## 跨工具兼容性（agentskills.io）

`agents` namespace 中的 skill（`.agents/skills/` 或 `~/.agents/skills/`）遵循 [agentskills.io](https://agentskills.io/) 标准，可与更广泛的生态系统共享：

- **vercel-labs/skills** —— 参考 registry
- **Cursor** —— `.agents/skills/` namespace
- **OpenCode** —— `.agents/skills/` namespace
- **Windsurf** —— `.agents/skills/` namespace

这意味着通过 `rnix skill install --shared` 安装到 `.agents/skills/` 的 skill 对 Cursor 和其他兼容工具同样可见 —— 一次安装，多客户端使用。

---

## 创建自定义 Skill

在本地创建 skill，无需发布到 registry：

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

该 skill 会出现在 `rnix skill list` 中，`SOURCE` 为空（无 registry 元数据）。

---

## Spawn 时的 Skill 加载

当 agent 被 spawn 时，skill 通过四路径解析加载：

1. 从 `agent.yaml` 读取 agent 的 `skills: [...]` 列表
2. `SkillLoader` 通过 `ResolveSkillScopes` → shadow 优先级顺序解析每个名称
3. 加载胜出副本（如适用，向 stderr 发出 shadow 警告）
4. 所有已加载 skill 的 `allowed-tools` 被**合并**到进程的 `AllowedDevices` 中
5. Skill 正文被拼接到 system prompt 中
6. 对 project-scope skill 执行信任检查（不受信任则警告，不阻塞）

---

## 相关文档

- [Agent 与 Skill](/zh/guide/agents-and-skills) —— Agent 和 SKILL.md 定义格式
- [配置](/zh/guide/configuration) —— Skill 目录路径与配置
- [核心概念](/zh/guide/concepts) —— 渐进式加载策略
- [网络搜索](/zh/guide/web-search) —— 支持网络能力的 skill 使用的 `/dev/web` 设备
