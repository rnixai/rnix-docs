import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Rnix',
  description: 'AI 智能体操作系统 — 用 Unix 哲学驱动智能体',
  lang: 'zh-CN',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: '指南', link: '/guide/quick-start', activeMatch: '/guide/' },
      { text: '教程', link: '/tutorials/', activeMatch: '/tutorials/' },
      { text: '参考', link: '/reference/', activeMatch: '/reference/' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '入门',
          items: [
            { text: '快速上手', link: '/guide/quick-start' },
            { text: '核心概念', link: '/guide/concepts' },
          ],
        },
        {
          text: '深入',
          items: [
            { text: '架构设计', link: '/guide/architecture' },
            { text: '系统监控', link: '/guide/monitoring' },
          ],
        },
      ],
      '/tutorials/': [
        {
          text: '实战教程',
          items: [
            { text: '概览', link: '/tutorials/' },
            { text: '编写第一个 Skill', link: '/tutorials/writing-first-skill' },
            { text: '调试第一个 Bug', link: '/tutorials/debugging-first-bug' },
            { text: '组合多智能体工作流', link: '/tutorials/composing-multi-agent-workflow' },
          ],
        },
      ],
      '/reference/': [
        {
          text: '参考手册',
          items: [
            { text: '概览', link: '/reference/' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/rnixai/rnix' },
    ],

    outline: {
      level: [2, 3],
      label: '本页目录',
    },

    docFooter: {
      prev: '上一页',
      next: '下一页',
    },

    lastUpdated: {
      text: '最后更新',
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档', buttonAriaLabel: '搜索' },
          modal: {
            noResultsText: '没有找到结果',
            resetButtonTitle: '清除搜索',
            footer: { selectText: '选择', navigateText: '导航', closeText: '关闭' },
          },
        },
      },
    },

    editLink: {
      pattern: 'https://github.com/rnixai/rnix/edit/main/docs/:path',
      text: '在 GitHub 上编辑此页',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright &copy; 2026 Rnix Contributors',
    },
  },
})
