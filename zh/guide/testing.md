# 回归测试（agtest）

`rnix agtest` 运行声明式 AI 智能体行为测试——验证智能体产出预期输出、执行预期 syscall，并满足质量标准。

---

## 概览

智能体行为可能是非确定性的（LLM 输出每次不同）。`agtest` 提供了一个**行为断言**框架，验证智能体在多次运行中表现正确。

```bash
$ rnix agtest tests/code-review.yaml
Running 3 test cases...
  ✓ basic-analysis          (2.3s, 1,234 tokens)
  ✓ security-focus          (3.1s, 1,567 tokens)
  ✗ multi-file-review       (4.5s, 2,100 tokens)
    Assertion failed: output must contain "recommendations"
    Actual output: "Analysis complete. No issues found."

Results: 2 passed, 1 failed, 0 skipped
```

---

## 测试用例定义

测试以声明式 YAML 定义：

```yaml
# tests/code-review.yaml
name: "Code review test suite"
agent: "code-analyst"
model: "deepseek-v4-flash"

cases:
  - name: "basic-analysis"
    intent: "Analyze ./src/main.go for code quality"
    assertions:
      - type: reasoning
        contains: ["code quality", "improvement"]
      - type: syscall
        sequence:
          - syscall: Open
            path_contains: "/dev/fs"
          - syscall: Open
            path_contains: "/dev/llm"

  - name: "security-focus"
    intent: "Check ./src/auth.go for security vulnerabilities"
    timeout: 30s
    assertions:
      - type: quality
        criteria: "Output must include specific vulnerability types (SQL injection, XSS, etc.)"
        evaluator: llm    # Use lightweight LLM to evaluate

  - name: "budget-limit"
    intent: "Analyze entire project"
    budget: 500           # Intentionally low budget
    assertions:
      - type: reasoning
        exit_code: 2      # Expect budget_exceeded exit
```

---

## 断言类型

### Reasoning 断言

验证 LLM 输出内容：

```yaml
- type: reasoning
  contains: ["security", "vulnerability"]     # 必须包含全部
  not_contains: ["error", "failed"]           # 不得包含任何一个
  exit_code: 0                                 # 预期退出码
  max_tokens: 5000                             # Token 预算上限
```

### Syscall 断言

验证智能体执行（或未执行）特定的 syscall 序列：

```yaml
- type: syscall
  sequence:                    # 有序序列（子集匹配）
    - syscall: Open
      path_contains: "/dev/fs"
    - syscall: Write
      fd: 3
  must_not_contain:            # 这些 syscall 不得出现
    - syscall: Open
      path_contains: "/dev/shell"   # 智能体不应使用 shell
```

### Quality 断言

使用轻量 LLM 根据自然语言标准评估输出质量：

```yaml
- type: quality
  criteria: "Output must include at least 3 specific, actionable recommendations"
  evaluator: llm               # haiku 评估输出
  # 或者
  evaluator: pattern           # 正则/关键词匹配
  pattern: "\\d+\\. .*"       # 必须包含编号列表
```

---

## 运行测试

```bash
# 运行文件中的所有测试
rnix agtest tests/code-review.yaml

# 运行特定测试用例
rnix agtest tests/code-review.yaml --case basic-analysis

# JSON 输出用于 CI 集成
rnix agtest tests/code-review.yaml --json

# 详细输出（显示完整 LLM 响应）
rnix agtest tests/code-review.yaml --verbose
```

### JSON 报告

```json
{
  "ok": true,
  "data": {
    "suite": "Code review test suite",
    "cases": [
      {"name": "basic-analysis", "status": "passed", "elapsed_ms": 2300, "tokens": 1234},
      {"name": "security-focus", "status": "passed", "elapsed_ms": 3100, "tokens": 1567},
      {"name": "budget-limit", "status": "failed", "elapsed_ms": 4500, "tokens": 2100,
       "failure": "Assertion failed: output must contain 'recommendations'"}
    ],
    "summary": {"passed": 2, "failed": 1, "skipped": 0}
  }
}
```

---

## 智能体行为回归（agtest） {#agent-behavior-regression-agtest}

_0.11.0 新增。_ 在临时用例集之外，Rnix 还内置了一套两层回归框架，其目标是闭合反馈回路：**每次 agent 出丑，测试集就增长**。两层之间在确定性与保真度上各有取舍。

### Tier1——离线回放门禁（`make agtest`）

Tier1 用例（`tests/agtest/tier1/`）是**确定性、离线、快速（< 5 分钟）**的 PR 级门禁。它们绝不碰真实 provider 或 API key：LLM 响应由**回放驱动（replay driver）**脚本化，因此相同输入总能得到相同的运行。每个用例是一份 `NN-slug.yaml`，配一份 `scripts/NN-slug.responses.yaml` 响应脚本。

```bash
make agtest        # Tier1，隔离 daemon，几秒到十几秒
```

`make agtest` 在**完全隔离的 daemon** 上运行套件：它临时开辟 `XDG_RUNTIME_DIR` / `RNIX_DATA_DIR` / `XDG_CONFIG_HOME` 三个目录，把 `replay` provider 声明写入这份隔离配置，启动一个用完即弃的 daemon，跑 `rnix agtest tests/agtest/tier1/ --tier1`，并在退出时（无论成败）全部清理——因此绝不会撞上你常驻的 daemon。它**不属于 `make all`**：它跑的是真实的 spawn/daemon/VFS 全链路，与 `go test` 是不同的失败面，在 CI 中作为独立 job 运行。`--tier1` 标志会强制执行 Tier1 纪律（断言非空、只允许 `output` / `syscalls` 断言——禁止 `quality`——且使用 `replay` provider）。

### Tier2——advisory 活体套件（`make agtest-live`）

Tier2 用例（`tests/agtest/tier2/`）打**真实 LLM**，属于 **advisory**——不阻塞任何 CI 门禁。由于它们依赖真正非确定性的模型行为，因此可以使用 `quality`（LLM 裁判）断言；它们失败可能只是模型漂移、限流或网络抖动，而非代码回归。

```bash
make agtest-live   # Tier2，你的常驻 daemon + 真实 providers.yaml / API key
```

**经验法则**：能用脚本化响应复现的行为，就归 Tier1。Tier2 只留给"真实模型在这个 prompt 下大概率会做对某件事"这类本质上非确定性的问题。

### 失败 → 用例工作流

回归回路闭环的核心：用 `rnix agtest import` 把一次生产失败转成永久回归用例。

```
1. rnix ps -a --uuid          找到出问题进程的 UUID（或 ~xxxxxx 短 ID）
2. rnix agtest import <uuid>  生成用例骨架 + 响应脚本到 tests/agtest/imported/
3. 人工 review               填入真实 assert:，核对 warning 注释
4. 移入 tests/agtest/tier1/    重命名为下一个 NN-slug（用例 + scripts/）
5. make agtest               验证新用例通过、且不破坏任何既有用例
```

`rnix agtest import` **直接从磁盘读取**进程的 `steps.jsonl` / `proc-info.json` / `events.jsonl`（无需 daemon），生成一份用例文件加一份回放响应脚本骨架。骨架**故意不可直接运行**：它只带注释形式的断言建议，因此 `agtest.ValidateTier1` 会一直拒绝它，直到人工读懂这次运行并写入真实断言。每一处"尽力重建"（无法解析的工具输入、猜测的工具名、legacy 字段回退）都会在文件顶部的 warning 注释里标出。输出落在 `tests/agtest/imported/`（已被 git 忽略），因此不会被误提交。

完整的标志/子命令参考见 [CLI 参考 › rnix agtest](/zh/reference/cli#rnix-agtest)。

---

## 相关文档

- [调试](/zh/guide/debugging) — 使用 gdb 进行交互式调试
- [智能体与 Skill](/zh/guide/agents-and-skills) — 智能体配置
- [配置](/zh/guide/configuration) — 测试配置选项
