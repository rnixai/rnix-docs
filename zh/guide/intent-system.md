# 意图系统

意图系统（Intent System）提供声明式的、基于 LLM 的高层意图分解，将复杂目标自动拆解为可执行的子任务 DAG，并支持协调执行、重试和漂移检测。

---

## 概述

传统的智能体编排需要手动定义每个步骤。意图系统采用不同的方法：你声明**想要什么**，Rnix 使用 LLM 将其分解为子任务 DAG，然后自动执行和监控。

```
高层意图
   │
   ▼
分解器 (LLM)
   │
   ▼
意图树 (DAG)
   │
   ▼
协调器 (执行 + 监控)
   │
   ▼
结果
```

### 适用场景

| 方式 | 适用场景 |
|------|---------|
| `rnix -i "..."` | 简单的单智能体任务 |
| `rnix compose up` | 预定义的多智能体工作流（静态 DAG） |
| 意图系统 | 复杂目标的动态分解（LLM 生成 DAG） |

---

## 核心概念

### 意图树（IntentTree）

`IntentTree` 是 `IntentNode` 组成的 DAG，表示高层意图的分解结果：

```
IntentTree {
  ID: "intent-abc123"
  RootIntent: "重构认证模块"
  Nodes: {
    "analyze":    { intent: "分析当前认证代码", state: completed }
    "design":     { intent: "设计新的认证架构", depends_on: [analyze], state: executing }
    "implement":  { intent: "实现新的认证流程", depends_on: [design], state: pending }
    "test":       { intent: "编写认证测试", depends_on: [implement], state: pending }
  }
}
```

### 意图状态

每个节点经历以下生命周期：

```
pending → decomposing → await_confirm → executing → completed
                                            │
                                            └──→ failed → retrying → executing
```

| 状态 | 说明 |
|------|------|
| `pending` | 等待依赖完成 |
| `decomposing` | LLM 正在生成子任务 |
| `await_confirm` | 等待用户确认（如启用） |
| `executing` | 智能体进程运行中 |
| `completed` | 成功完成 |
| `failed` | 执行失败 |
| `retrying` | 正在重试 |

### 漂移检测

协调器持续比较**期望状态**（所有节点完成）与**当前状态**。当两者偏离时，记录漂移：

| 漂移类型 | 说明 |
|---------|------|
| `node_failed` | 节点失败 |
| `node_timeout` | 节点超时 |
| `new_requirement` | 识别到新的子任务 |
| `node_modified` | 节点意图被修改 |

---

## 重试与失败处理

### 重试策略

每个节点可指定 `max_retries`。节点失败时：

1. 如果 `retry_count < max_retries`：重置为 `retrying`，递增计数器，重新执行
2. 如果重试耗尽：标记为 `failed`，级联失败到所有下游依赖节点

### 失败级联

当一个节点永久失败时，所有直接或间接依赖它的节点也被标记为失败：

```
A (failed) → B (failed: 上游依赖失败) → C (failed: 上游依赖失败)
                                       → D (failed: 上游依赖失败)
```

---

## 与 Compose 的关系

| 特性 | Compose | 意图系统 |
|------|---------|---------|
| DAG 定义 | 手动（YAML） | LLM 生成 |
| 灵活性 | 静态工作流 | 动态分解 |
| 控制度 | 用户完全控制 | LLM 决定子任务 |
| 确认步骤 | 无 | 可选（`await_confirm`） |
| 漂移检测 | 无 | 有 |

两者共用内核 `Spawn` 创建进程，共享进程表。

---

## 相关文档

- [组合多智能体工作流](/tutorials/composing-multi-agent-workflow) — 静态多智能体工作流
- [核心概念](/guide/concepts) — 进程模型和 VFS
- [架构设计](/guide/architecture) — 内核内部实现
- [配置指南](/guide/configuration) — rnix-compose.yaml 参考
