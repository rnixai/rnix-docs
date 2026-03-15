---
layout: home

hero:
  name: Rnix
  text: AI Agent Operating System
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
      link: https://github.com/rnixai/rnix

features:
  - icon: "\u2699\uFE0F"
    title: Everything is a Process
    details: Each agent execution is a process with its own PID, state machine, FD table, threads, and coroutines. IPC messaging, pipes, signals, and process groups for multi-agent collaboration.
  - icon: "\uD83D\uDCC1"
    title: Everything is a File
    details: LLMs, filesystem, shell, and MCP tools are unified as VFS devices. Open/Read/Write/Close for all resources. Multi-provider LLM support with rnix serve OpenAI-compatible gateway.
  - icon: "\uD83E\uDDEC"
    title: Autonomous Agents
    details: OODA reasoning loop for self-directed decision-making. Stem cell differentiation lets generic agents auto-specialize based on intent. Declarative intent system with reconciler.
  - icon: "\uD83D\uDD0D"
    title: Deep Debugging Toolkit
    details: "strace, gdb-style interactive debugger (attach/breakpoint/step/inspect), time-travel replay with fork-continue, distributed causal tracing, visual TUI dashboard, and agtest regression testing."
  - icon: "\uD83D\uDCE6"
    title: Compose & AgentShell
    details: "DAG orchestration via YAML with budget pools and SLA contracts. Full scripting language: pipes, variables, if/else, loops, functions, parallel blocks, and source imports."
  - icon: "\uD83D\uDEE1\uFE0F"
    title: Token Economy & Security
    details: Budget pools with priority allocation, contract SLA evaluation, agent reputation system, and Skill synergy emergence. Adaptive immune security with anomaly detection and self-healing.
---
