# 文档站内容审计报告（2026-06-20）

对照代码库 HEAD（daemon 0.10.0）全站内容审计，按区域 × 严重度归类。区别于 `docs-audit-report.md`（UI/无障碍质量审计）。英文为权威源，中文为其镜像翻译，修复需双语同步。

> 修复状态：⬜ 待修 / ✅ 已修。
>
> **2026-06-20 修复完成**：下列全部 High + Medium + 顺手 Low 项已中英双语同步修复，`npx vitepress build` 通过（7.14s，无死链/语法错误）。表中 ⬜ 标记保留为审计时快照，实际均已落地。两项**预存**问题不在本次范围、属站点历史遗留：`reference/cli.md` 中 daemon 与 ps 共用 `### 4.3` 编号，以及 daemon stop 段后一处孤立代码围栏（HEAD 既有，构建不受影响）。

## A. CLI 参考（reference/cli.md + zh）

| ID | 严重度 | 问题 | 代码真相 | 状态 |
|----|--------|------|----------|------|
| CLI-H1 | 高 | 根命令写成位置参数 `rnix [intent]` | `main.go:202` `rejectPositionalArgs` + `:323` `-i/--intent`；所有根级调用必须 `rnix -i "..."` | ⬜ |
| CLI-H2 | 高 | 全局 flag 表只列 `--json/-v/-q` | `main.go:313-320` PersistentFlags 另含 `--model/-m`、`--provider`、`--fallback-model`、`--fallback-provider`、`--reasoning-effort`；根私有 flag 为 `-i/--intent`、`--max-steps`、`--agent`、`--dashboard` | ⬜ |
| CLI-H3 | 高 | `rnix doctor` 完全缺失（§4.35 还引用了它） | `doctor.go:62` `rnix doctor [--probe] [--provider] [--json]` | ⬜ |
| CLI-H4 | 高 | `rnix gc` 完全缺失 | `gc.go:22` `rnix gc [--dry-run] [--force] [--json]` | ⬜ |
| CLI-H5 | 高 | `daemon start` 子命令缺失 | `main.go:260` `rnix daemon start` | ⬜ |
| CLI-M1 | 中 | `mcp reload` 缺失 | `mcp.go:78` | ⬜ |
| CLI-M2 | 中 | `init --with-mcp-examples` 缺失 | `init.go:83` | ⬜ |
| CLI-M3 | 中 | `skill install/list` 的 scope flag 缺失 | `skill.go:86` `--global/-g`、`--shared`、`--project/-p` | ⬜ |
| CLI-M4 | 中 | §9.6 `rnix record PID` 结构错 | 实际 `record start|stop PID`/`record list` | ⬜ |
| CLI-M5 | 中 | `strace --raw` 漏 `--uuid` | `main.go:334` | ⬜ |
| CLI-L* | 低 | daemon status 输出示例、version 版本号、--model 示例值陈旧；§9 速查表与 §4 多处自相矛盾（agtest/intent/record） | — | ⬜ |

## B. 配置/Provider（guide/configuration.md, guide/llm-providers.md + zh）

| ID | 严重度 | 问题 | 代码真相 | 状态 |
|----|--------|------|----------|------|
| CFG-H1 | 高 | init.yaml 整节 schema 错误（写成 compose 语义） | `kernel/init.go:21` `services` 是数组 `{name,type,required,config}`，type∈{skill_registry,mcp_manager,log_aggregator}；另有 `supervisors`；intent/agent/restart 实为 `children` 字段；**仅读全局 `~/.config/rnix/init.yaml`** | ⬜ |
| CFG-H2 | 高 | driver 列表不全 | `config.go:14` 共 8 种：claude-cli/cursor-cli/qwen-cli/codex-cli/openai-compat/openai/gemini/anthropic | ⬜ |
| CFG-H3 | 高 | `max_steps` 默认值写成 10 | `kernel.go:61` `DefaultMaxSteps = 0`（不设上限） | ⬜ |
| CFG-H4 | 高 | compose.yaml agent 字段错 | `compose/types.go:24` `timeout_ms`(非 timeout)；无 `max_retries`；缺 provider/reasoning_effort/skills/priority/candidates；顶层缺 provider/reasoning_effort/token_budget | ⬜ |
| CFG-M1 | 中 | agent.yaml manifest 字段大量缺失 | `agents/types.go:11` 缺 fallback_provider/reasoning_effort/ctx_size/tools/deferred_skills/planning/max_cost/step_timeout/project_doc/language 等 | ⬜ |
| CFG-M2 | 中 | providers.yaml 高级字段缺失 | 缺 timeout_sec/grace_sec/models（两文档均无） | ⬜ |
| CFG-M3 | 中 | qwen-cli 示例 `qwen --chat` 错 | 实际 `--output-format json` 等，无 `--chat` | ⬜ |
| CFG-M4 | 中 | extra_args 适用 driver 描述与 config.go 注释不一致 | 核实 codex-cli/qwen-cli | ⬜ |
| CFG-L* | 低 | init.yaml 不参与项目级 merge 需显式说明；`rnix init` 实际生成的项目目录与示意图不符 | — | ⬜ |

## C. 核心指南（guide/architecture, concepts, agents-and-skills, security, process-resume + zh）

| ID | 严重度 | 问题 | 代码真相 | 状态 |
|----|--------|------|----------|------|
| CORE-H1 | 高 | `MaxSpawnDepth` 写成 8 | `kernel.go:73` `= 4`（两处 + 报错示例） | ⬜ |
| CORE-H2 | 高 | `rnix pause` 命令实为 `rnix suspend` | `suspend.go:15` `Use:"suspend PID"`；无 `--subtree` flag（subtree 仅 dashboard 内 IPC） | ⬜ |
| CORE-H3 | 高 | `rnix list-resumable` 顶层命令不存在 | 仅 IPC 方法；用 `rnix ps -a` | ⬜ |
| CORE-M1 | 中 | allowed-tools 用旧设备路径（Epic 54/Decision 45 已反转） | 实际用 PascalCase 工具名（Read/Write/Edit/Glob/Grep/Bash）；enforcement 单元为 `proc.AllowedTools`（process.go:94） | ⬜ |
| CORE-M2 | 中 | AGENTS.md 注入（Story 35.7/Decision 47）完全缺失 | `sections.go:46` project_doc cached section；`internal/config/agentsmd.go` nearest-wins/64KiB/只认 AGENTS.md；agent.yaml `project_doc:false` 禁用 | ⬜ |
| CORE-M3 | 中 | immune `deviation_threshold` 默认写成 2.0 | `immune.go:459` `= 3.0` | ⬜ |
| CORE-L* | 低 | resume 参数应为 `PID 或 UUID`；GC 默认值（30/500 非默认，默认 0=关闭）易误读；`--from-step` fork 标实验性 | — | ⬜ |

## D. 底层参考（reference/syscalls, vfs, ipc, errors, process-model, agents-skills + zh）

| ID | 严重度 | 问题 | 代码真相 | 状态 |
|----|--------|------|----------|------|
| REF-H1 | 高 | ProcessState 缺 `StateSuspended` | `types.go:116` `StateSuspended = 4`；Running↔Suspended 合法转换 | ⬜ |
| REF-H2 | 高 | ErrCode 枚举只列 6 个 | `types.go:38` 共 12 个，缺 IS_DIRECTORY/BROKEN_PIPE/SERVICE_UNAVAILABLE/ALREADY_MOUNTED/RESOURCE_EXHAUSTED/FORCE_KILLED/DEVICE_DISCONNECTED | ⬜ |
| REF-M1 | 中 | Kill INVALID 条件描述错 | `signal.Valid()` = SIGTERM(1)..SIGRESUME(5) 全合法 | ⬜ |
| REF-M2 | 中 | agents-skills provider 取值自相矛盾（§3.2 claude/cursor vs §3.8 deepseek） | provider 是 providers.yaml 实例名，非二选一 | ⬜ |
| REF-M3 | 中 | AgentManifest 字段表只列 5 个 | 18 个，缺 planning/tools/mcp/project_doc/language 等 | ⬜ |
| REF-M4 | 中 | AgentModels 缺 fallback_provider/reasoning_effort | — | ⬜ |
| REF-M5 | 中 | SpawnOpts 字段表过时（MaxTokens 语义：耗尽 suspend 非 unlimited） | `kernel.go:76` 30+ 字段 | ⬜ |
| REF-L1 | 低 | IPC method 表缺 get_raw_capture 等 | `protocol.go` 60+ 方法 | ⬜ |
| REF-L* | 低 | PingResponse 版本号示例 0.1.0；answer_user 方法未提 | — | ⬜ |
