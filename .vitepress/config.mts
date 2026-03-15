import { defineConfig } from 'vitepress'

const guideSidebar = [
  {
    text: 'Getting Started',
    items: [
      { text: 'Quick Start', link: '/guide/quick-start' },
      { text: 'Core Concepts', link: '/guide/concepts' },
    ],
  },
  {
    text: 'Agent Development',
    items: [
      { text: 'Agents & Skills', link: '/guide/agents-and-skills' },
      { text: 'AgentShell Scripting', link: '/guide/agentshell' },
      { text: 'Compose Orchestration', link: '/guide/compose' },
      { text: 'Intent System', link: '/guide/intent-system' },
      { text: 'Autonomous Agents (OODA)', link: '/guide/autonomous-agents' },
    ],
  },
  {
    text: 'Debugging & Testing',
    items: [
      { text: 'Debugging (strace & gdb)', link: '/guide/debugging' },
      { text: 'Time-Travel Debugging', link: '/guide/time-travel' },
      { text: 'Distributed Tracing', link: '/guide/distributed-tracing' },
      { text: 'Visual Dashboard', link: '/guide/dashboard' },
      { text: 'Regression Testing (agtest)', link: '/guide/testing' },
    ],
  },
  {
    text: 'Platform',
    items: [
      { text: 'Architecture', link: '/guide/architecture' },
      { text: 'IPC & Concurrency', link: '/guide/ipc-and-concurrency' },
      { text: 'LLM Providers & Serve', link: '/guide/llm-providers' },
      { text: 'MCP Integration', link: '/guide/mcp-integration' },
      { text: 'Skill Packages', link: '/guide/skill-packages' },
      { text: 'Monitoring & Supervisor', link: '/guide/monitoring' },
      { text: 'Token Economy & Reputation', link: '/guide/token-economy' },
      { text: 'Security & Self-Healing', link: '/guide/security' },
      { text: 'Configuration', link: '/guide/configuration' },
    ],
  },
]

const zhGuideSidebar = [
  {
    text: '入门',
    items: [
      { text: '快速上手', link: '/zh/guide/quick-start' },
      { text: '核心概念', link: '/zh/guide/concepts' },
    ],
  },
  {
    text: '深入',
    items: [
      { text: '架构设计', link: '/zh/guide/architecture' },
      { text: '意图系统', link: '/zh/guide/intent-system' },
      { text: 'MCP 集成', link: '/zh/guide/mcp-integration' },
      { text: '系统监控', link: '/zh/guide/monitoring' },
      { text: '配置指南', link: '/zh/guide/configuration' },
    ],
  },
]

export default defineConfig({
  title: 'Rnix',
  description: 'AI Agent Operating System — Power agents with Unix philosophy',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
  ],

  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/guide/quick-start', activeMatch: '/guide/' },
          { text: 'Tutorials', link: '/tutorials/', activeMatch: '/tutorials/' },
          { text: 'Reference', link: '/reference/', activeMatch: '/reference/' },
        ],
        sidebar: {
          '/guide/': guideSidebar,
          '/tutorials/': [
            {
              text: 'Tutorials',
              items: [
                { text: 'Overview', link: '/tutorials/' },
                { text: 'Writing Your First Skill', link: '/tutorials/writing-first-skill' },
                { text: 'Debugging Your First Bug', link: '/tutorials/debugging-first-bug' },
                { text: 'Composing Multi-Agent Workflows', link: '/tutorials/composing-multi-agent-workflow' },
              ],
            },
          ],
          '/reference/': [
            {
              text: 'Reference Manual',
              items: [
                { text: 'Overview', link: '/reference/' },
              ],
            },
          ],
        },
        outline: { level: [2, 3], label: 'On this page' },
        docFooter: { prev: 'Previous', next: 'Next' },
        lastUpdated: { text: 'Last updated' },
        editLink: {
          pattern: 'https://github.com/rnixai/rnix/edit/main/docs/:path',
          text: 'Edit this page on GitHub',
        },
      },
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh/',
      themeConfig: {
        nav: [
          { text: '指南', link: '/zh/guide/quick-start', activeMatch: '/zh/guide/' },
          { text: '教程', link: '/zh/tutorials/', activeMatch: '/zh/tutorials/' },
          { text: '参考', link: '/zh/reference/', activeMatch: '/zh/reference/' },
        ],
        sidebar: {
          '/zh/guide/': zhGuideSidebar,
          '/zh/tutorials/': [
            {
              text: '实战教程',
              items: [
                { text: '概览', link: '/zh/tutorials/' },
                { text: '编写第一个 Skill', link: '/zh/tutorials/writing-first-skill' },
                { text: '调试第一个 Bug', link: '/zh/tutorials/debugging-first-bug' },
                { text: '组合多智能体工作流', link: '/zh/tutorials/composing-multi-agent-workflow' },
              ],
            },
          ],
          '/zh/reference/': [
            {
              text: '参考手册',
              items: [
                { text: '概览', link: '/zh/reference/' },
              ],
            },
          ],
        },
        outline: { level: [2, 3], label: '本页目录' },
        docFooter: { prev: '上一页', next: '下一页' },
        lastUpdated: { text: '最后更新' },
        editLink: {
          pattern: 'https://github.com/rnixai/rnix/edit/main/docs/:path',
          text: '在 GitHub 上编辑此页',
        },
      },
    },
  },

  themeConfig: {
    logo: '/logo.svg',
    socialLinks: [
      { icon: 'github', link: 'https://github.com/rnixai/rnix' },
    ],
    search: { provider: 'local' },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright &copy; 2026 Rnix Contributors',
    },
  },
})
