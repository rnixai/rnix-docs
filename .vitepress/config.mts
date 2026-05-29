import { defineConfig } from 'vitepress'
import { withUtm } from '../utils/utm'

const LANDING_URL = 'https://rnix.ai'
const GITHUB_URL = 'https://github.com/rnixai/rnix'

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
      { text: 'Autonomous Agents', link: '/guide/autonomous-agents' },
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
      { text: 'Web Search & Fetch', link: '/guide/web-search' },
      { text: 'Skill Packages', link: '/guide/skill-packages' },
      { text: 'Memory System', link: '/guide/memory-system' },
      { text: 'Process Resume & Recovery', link: '/guide/process-resume' },
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
    text: '智能体开发',
    items: [
      { text: 'Agent 与 Skill', link: '/zh/guide/agents-and-skills' },
      { text: 'AgentShell 脚本', link: '/zh/guide/agentshell' },
      { text: 'Compose 编排', link: '/zh/guide/compose' },
      { text: '意图系统', link: '/zh/guide/intent-system' },
      { text: '自主智能体', link: '/zh/guide/autonomous-agents' },
    ],
  },
  {
    text: '调试与测试',
    items: [
      { text: '调试 (strace & gdb)', link: '/zh/guide/debugging' },
      { text: '时间旅行调试', link: '/zh/guide/time-travel' },
      { text: '分布式追踪', link: '/zh/guide/distributed-tracing' },
      { text: '可视化仪表盘', link: '/zh/guide/dashboard' },
      { text: '回归测试 (agtest)', link: '/zh/guide/testing' },
    ],
  },
  {
    text: '平台',
    items: [
      { text: '架构设计', link: '/zh/guide/architecture' },
      { text: 'IPC 与并发', link: '/zh/guide/ipc-and-concurrency' },
      { text: 'LLM 提供商与 Serve', link: '/zh/guide/llm-providers' },
      { text: 'MCP 集成', link: '/zh/guide/mcp-integration' },
      { text: 'Web 搜索与抓取', link: '/zh/guide/web-search' },
      { text: 'Skill 包管理', link: '/zh/guide/skill-packages' },
      { text: '记忆系统', link: '/zh/guide/memory-system' },
      { text: '进程暂停与恢复', link: '/zh/guide/process-resume' },
      { text: '监控与 Supervisor', link: '/zh/guide/monitoring' },
      { text: 'Token 经济与声誉', link: '/zh/guide/token-economy' },
      { text: '安全与自愈', link: '/zh/guide/security' },
      { text: '配置指南', link: '/zh/guide/configuration' },
    ],
  },
]

export default defineConfig({
  title: 'Rnix',
  description: 'The AI-Era Unix — Power agents with Unix philosophy',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16.png' }],
    ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
    ['meta', { property: 'og:image', content: '/og-image.png' }],
  ],

  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      themeConfig: {
        nav: [
          { text: 'Home', link: withUtm(LANDING_URL, 'nav_home', 'nav'), target: '_blank', rel: 'noopener noreferrer' },
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
                { text: 'Syscall Reference', link: '/reference/syscalls' },
                { text: 'VFS Path Specification', link: '/reference/vfs' },
                { text: 'Agent & Skill Manifests', link: '/reference/agents-skills' },
                { text: 'CLI Command Reference', link: '/reference/cli' },
                { text: 'IPC Architecture', link: '/reference/ipc' },
                { text: 'Error Handling', link: '/reference/errors' },
                { text: 'Process Model', link: '/reference/process-model' },
              ],
            },
          ],
        },
        outline: { level: [2, 3], label: 'On this page' },
        docFooter: { prev: 'Previous', next: 'Next' },
        lastUpdated: { text: 'Last updated' },
        editLink: {
          pattern: withUtm('https://github.com/rnixai/rnix/edit/main/docs/:path', 'edit_page', 'link'),
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
          { text: '首页', link: withUtm(LANDING_URL, 'nav_home_zh', 'nav'), target: '_blank', rel: 'noopener noreferrer' },
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
                { text: 'Syscall 参考', link: '/zh/reference/syscalls' },
                { text: 'VFS 路径规范', link: '/zh/reference/vfs' },
                { text: 'Agent 与 Skill 清单', link: '/zh/reference/agents-skills' },
                { text: 'CLI 命令参考', link: '/zh/reference/cli' },
                { text: 'IPC 架构', link: '/zh/reference/ipc' },
                { text: '错误处理', link: '/zh/reference/errors' },
                { text: '进程模型', link: '/zh/reference/process-model' },
              ],
            },
          ],
        },
        outline: { level: [2, 3], label: '本页目录' },
        docFooter: { prev: '上一页', next: '下一页' },
        lastUpdated: { text: '最后更新' },
        editLink: {
          pattern: withUtm('https://github.com/rnixai/rnix/edit/main/docs/:path', 'edit_page_zh', 'link'),
          text: '在 GitHub 上编辑此页',
        },
      },
    },
  },

  themeConfig: {
    logo: { light: '/logo.svg', dark: '/logo-dark.svg', alt: 'Rnix' },
    socialLinks: [
      { icon: 'github', link: withUtm(GITHUB_URL, 'github_footer', 'footer') },
    ],
    search: { provider: 'local' },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright &copy; 2026 Rnix Contributors',
    },
  },

  vite: {
    server: {
      watch: {
        usePolling: true,
        interval: 300,
      },
    },
  },
})
