---
layout: home

hero:
  name: Rnix
  text: The AI-Era Unix
  tagline: Power AI agents with Unix philosophy — processes, filesystems, syscalls, debugging, and autonomous reasoning
  actions:
    - theme: brand
      text: Quick Start
      link: /guide/quick-start
    - theme: alt
      text: Core Concepts
      link: /guide/concepts
    - theme: alt
      text: GitHub
      link: https://github.com/rnixai/rnix?utm_source=docs&utm_medium=cta&utm_campaign=rnix_homepage&utm_content=github_hero

features:
  - icon: "\u2699\uFE0F"
    title: Everything is a Process
    details: Each agent execution is a process with its own PID, state machine, FD table, threads, and coroutines. IPC messaging, pipes, signals, and process groups for multi-agent collaboration.
  - icon: "\uD83D\uDCC1"
    title: Everything is a File
    details: LLMs, filesystem, shell, and MCP tools are unified as VFS devices. Open/Read/Write/Close for all resources. Multi-provider LLM support with rnix serve OpenAI-compatible gateway.
  - icon: "\uD83E\uDDEC"
    title: Autonomous Agents
    details: Unified reasoning loop where LLM autonomously selects actions each step. Stem cell differentiation lets generic agents auto-specialize based on intent. Declarative intent system with reconciler.
  - icon: "\uD83D\uDD0D"
    title: Deep Debugging Toolkit
    details: "strace, gdb-style interactive debugger (attach/breakpoint/step/inspect), time-travel replay with fork-continue, distributed causal tracing, visual TUI dashboard, and agtest regression testing."
  - icon: "\uD83D\uDECD\uFE0F"
    title: More in the Guide
    details: "Compose & AgentShell, Token Economy & Security, MCP integration, and the full platform — start with [Quick Start](/guide/quick-start) or [Core Concepts](/guide/concepts)."
    link: /guide/quick-start
---
