---
layout: home

hero:
  name: Rnix
  text: AI 智能体操作系统
  tagline: 用 Unix 哲学驱动智能体 — 进程、文件系统、系统调用、调试与自主推理
  actions:
    - theme: brand
      text: 快速上手
      link: /zh/guide/quick-start
    - theme: alt
      text: 核心概念
      link: /zh/guide/concepts
    - theme: alt
      text: GitHub
      link: https://github.com/rnixai/rnix

features:
  - title: 一切皆进程
    details: 每次智能体执行都是进程，拥有独立 PID、状态机、FD 表、线程和协程。IPC 消息、管道、信号和进程组实现多智能体协作。
  - title: 一切皆文件
    details: LLM、文件系统、Shell、MCP 工具统一为 VFS 设备。多 Provider LLM 支持，rnix serve 提供 OpenAI 兼容网关。
  - title: 自主智能体
    details: OODA 推理循环实现自主决策。干细胞分化让通用智能体根据意图自动特化。声明式意图系统配合 Reconciler 持续调和。
  - title: 深度调试工具链
    details: strace、GDB 风格交互式调试器、时间旅行回放与 fork-continue、分布式因果追踪、可视化 TUI 面板、agtest 回归测试。
  - title: Compose 与 AgentShell
    details: YAML DAG 编排（含预算池和 SLA 合约）。完整脚本语言：管道、变量、if/else、循环、函数、并行块和模块导入。
  - title: Token 经济与安全
    details: 预算池优先级分配、合约 SLA 评估、智能体声誉系统、Skill 协同涌现。适应性免疫安全，异常检测与自愈。
---
