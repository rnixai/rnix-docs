# AgentShell 脚本

AgentShell 是 Rnix 的脚本语言，用于编排智能体工作流。它提供管道、变量、控制结构、函数、并行执行和模块导入功能。

---

## 快速示例

```bash
# 管道：链式连接智能体
spawn "Analyze code" --agent=analyst | spawn "Generate docs"

# 变量
export TARGET=./src/main.go
spawn "Analyze $TARGET" --agent=analyst

# 条件判断
result = spawn "Check code quality" --agent=analyst
if $result.exitcode == 0
  spawn "Generate passing report"
else
  spawn "Generate fix plan"
end

# 并行执行
parallel {
  spawn "Analyze frontend" --agent=analyst
  spawn "Analyze backend" --agent=analyst
  spawn "Check dependencies"
}
```

---

## 管道语法

`|` 运算符将智能体的输出连接到下一个智能体的输入：

```bash
spawn "Analyze code" | spawn "Generate docs" | spawn "Quality check"
```

每个 `|` 创建一个管道，前一个智能体的输出作为 `[PIPE_INPUT]` 注入下一个智能体的上下文。底层实现为 VFS 管道（`kern.Pipe`）。

---

## 变量与环境

```bash
# 定义变量
export PROJECT_DIR=./src
export MODEL=haiku

# 在意图中使用（字符串插值）
spawn "Analyze ${PROJECT_DIR}/main.go with focus on security"

# 传递给 spawn 的智能体
spawn "Analyze code" --model=$MODEL
```

变量作用域限于当前脚本。子智能体会继承环境。

---

## 控制结构

### if / else / end

```bash
result = spawn "Check for vulnerabilities" --agent=security
if $result.exitcode == 0
  spawn "Generate security report: all clear"
else
  spawn "Generate vulnerability fix plan" on-error spawn "Log failure"
end
```

### on-error（内联错误处理）

```bash
spawn "Risky operation" on-error spawn "Handle failure gracefully"
```

如果第一个 spawn 失败，`on-error` 处理器会自动执行。

### for 循环

```bash
files = ["main.go", "server.go", "handler.go"]
for file in $files
  spawn "Analyze ./src/${file}" --agent=analyst
end
```

### while 循环

```bash
attempts = 0
while $attempts < 3
  result = spawn "Attempt fix" --agent=fixer
  if $result.exitcode == 0
    break
  end
  attempts = $attempts + 1
end
```

---

## 函数

定义可复用的逻辑：

```bash
fn analyze(target, focus) {
  result = spawn "Analyze ${target} focusing on ${focus}" --agent=analyst
  return $result
}

# 调用函数
report = analyze("./src/main.go", "security")
analyze("./src/server.go", "performance")
```

---

## 数据结构

### 数组

```bash
targets = ["main.go", "server.go", "handler.go"]
count = len($targets)
first = $targets[0]

# 追加
append($targets, "utils.go")

# 遍历
for t in $targets
  spawn "Process ${t}"
end
```

### Map

```bash
config = {"model": "deepseek-v4-flash", "budget": 5000}
model = $config["model"]
```

---

## Spawn 返回值捕获

将智能体输出捕获到变量中：

```bash
result = spawn "Analyze code" --agent=analyst
echo $result.output       # 智能体的文本输出
echo $result.exitcode     # 退出码（0/1/2）
echo $result.tokens       # 消耗的 token 数
echo $result.pid          # 进程 ID
```

---

## 并行执行

并发运行多个智能体：

```bash
parallel {
  spawn "Analyze frontend" --agent=analyst
  spawn "Analyze backend" --agent=analyst
  spawn "Check dependencies"
}
# 所有 spawn 完成后继续执行后续代码
```

---

## 内置命令

| 命令 | 说明 |
|------|------|
| `wait <pid>` | 等待指定进程 |
| `sleep <duration>` | 延迟（如 `sleep 5s`） |
| `exit <code>` | 以指定退出码退出脚本 |
| `echo <text>` | 输出文本 |
| `source <file>` | 导入另一个脚本 |

---

## 脚本文件

将脚本保存为 `.ash` 文件并执行：

```bash
#!/usr/bin/env rnix run
# review-pipeline.ash

export TARGET=$1
result = spawn "Analyze ${TARGET}" --agent=analyst
if $result.exitcode == 0
  spawn "Generate improvement docs based on analysis" | spawn "Quality check"
else
  spawn "Log analysis failure for ${TARGET}"
end
```

```bash
$ rnix run review-pipeline.ash ./src/main.go
# 或使用 shebang：
$ chmod +x review-pipeline.ash
$ ./review-pipeline.ash ./src/main.go
```

---

## 模块系统

通过导入脚本实现代码复用：

```bash
# lib/helpers.ash
fn analyze(target) {
  return spawn "Analyze ${target}" --agent=analyst
}

# main.ash
source "lib/helpers.ash"
result = analyze("./src/main.go")
```

---

## 相关文档

- [Compose 编排](/zh/guide/compose) — 基于 YAML 的 DAG 工作流
- [Intent 系统](/zh/guide/intent-system) — 声明式意图分解
- [Agent 与 Skill](/zh/guide/agents-and-skills) — Agent 配置
- [参考手册](/zh/reference/) — 完整的 CLI 命令参考
