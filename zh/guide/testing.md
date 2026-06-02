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

## 相关文档

- [调试](/zh/guide/debugging) — 使用 gdb 进行交互式调试
- [智能体与 Skill](/zh/guide/agents-and-skills) — 智能体配置
- [配置](/zh/guide/configuration) — 测试配置选项
