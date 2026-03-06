---
layout: home

hero:
  name: Rnix
  text: AI 智能体操作系统
  tagline: 用 Unix 哲学驱动智能体 — 进程、文件系统、系统调用
  actions:
    - theme: brand
      text: 快速上手
      link: /guide/quick-start
    - theme: alt
      text: 核心概念
      link: /guide/concepts
    - theme: alt
      text: GitHub
      link: https://github.com/rnixai/rnix

features:
  - icon: "\u2699\uFE0F"
    title: 一切皆进程
    details: 每次智能体执行都是一个进程，拥有独立的 PID、状态机和文件描述符表。支持 Spawn、Kill、Wait 等 Unix 风格操作。
  - icon: "\uD83D\uDCC1"
    title: 一切皆文件
    details: LLM、文件系统、Shell 统一表现为 VFS 设备。通过 Open/Read/Write/Close 与所有资源交互。
  - icon: "\uD83D\uDD27"
    title: Agent & Skill 分离
    details: Agent 定义"我是谁"，Skill 定义"如何做 X"。四层能力模型让智能体的身份与知识解耦。
  - icon: "\uD83D\uDD0D"
    title: strace 调试
    details: 类似 Unix strace，实时追踪智能体的每一个系统调用。跨终端 attach 任意进程。
  - icon: "\uD83D\uDCE6"
    title: Compose 编排
    details: 用 YAML 定义多智能体 DAG 工作流，自动解析依赖并行调度。管道语法支持快速串联。
  - icon: "\uD83C\uDFDB\uFE0F"
    title: 微内核架构
    details: 接口组合模式实现 6 个功能子接口，扩展新 syscall 零侵入。Daemon 架构支持多终端共享。
---
