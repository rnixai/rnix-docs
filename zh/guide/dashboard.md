# 可视化调试仪表盘

`rnix dashboard` 命令启动一个多面板 TUI 可视化调试界面，将智能体树视图、追踪时间线和上下文热力图整合在一个界面中。

---

## 概览

```bash
$ rnix dashboard
```

```
┌─ Agent Tree ──────────┬─ Tracing Timeline ─────────────────────┐
│                        │                                        │
│ ● PID 1 (running)      │ [0.0s]─────[3.8s]─────[8.0s]──[10.5s]│
│   ├─ PID 5 analyst ●   │  ██████    Open Read Write Close      │
│   ├─ PID 6 doc-gen ◐   │       ████████ LLM call (5.2s)        │
│   └─ PID 7 checker ○   │                    ██ tool call        │
│                        │                                        │
├────────────────────────┼────────────────────────────────────────┤
│ Context Heatmap        │ Details                                │
│ ████ System prompt 27% │ PID 5: code-analyst                   │
│ ███  Skill bodies  19% │ State: running, Step: 4/10            │
│ ████ Dialog        21% │ Tokens: 2,340 / 8,192                 │
│ █████ Tool results 32% │ Skills: code-analysis, security-scan  │
└────────────────────────┴────────────────────────────────────────┘
```

---

## 面板

### 智能体树面板

实时展示所有进程及其父子关系：

- 进程状态指示器：`●` 运行中、`◐` 僵尸、`○` 已终止
- 每个进程的 token 消耗量
- 当前执行阶段（step N/M）
- 使用方向键展开/折叠子树

### 追踪时间线面板

水平时间线展示选中智能体（或整个 Compose 工作流）的 syscall 事件：

- 使用 `+`/`-` 缩放
- 使用左右方向键滚动
- 按类别过滤：`f` → LLM / Tool / IPC / VFS
- LLM 调用以耗时标注高亮显示

### 上下文热力图面板

可视化展示选中智能体的上下文组成：

- 按来源颜色编码：系统提示词 / Skill 指令 / 工具结果 / 对话历史
- 面积与 token 数量成正比
- 颜色深浅表示活跃程度（活跃 / 温热 / 冷却）

---

## 交互操作

| 按键 | 操作 |
|------|------|
| `↑`/`↓` | 导航智能体树 |
| `Enter` | 选中智能体（联动所有面板） |
| `k` | 终止选中的进程 |
| `g` | 附加 gdb 到选中的进程 |
| `l` | 查看选中进程的日志 |
| `r` | 开始录制选中的进程 |
| `f` | 按类别过滤时间线 |
| `+`/`-` | 缩放时间线 |
| `q` | 退出仪表盘 |

在树中选中一个智能体后，时间线和热力图会**联动**显示该智能体的数据。

---

## 离线回放

加载持久化的录制文件进行离线分析：

```bash
$ rnix dashboard --replay <record-id>
```

提供与实时模式相同的多面板视图，支持完整的历史数据导航，无需运行中的 daemon。

---

## 相关文档

- [调试](/zh/guide/debugging) — strace 和 gdb
- [分布式追踪](/zh/guide/distributed-tracing) — Trace ID 和瓶颈分析
- [时间旅行调试](/zh/guide/time-travel) — 录制与回放
- [监控](/zh/guide/monitoring) — rnix top 进程监控器
