import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import './style/custom.css'

let posthogInitialized = false

function initPostHog() {
  if (import.meta.env.SSR || posthogInitialized) return
  const key = import.meta.env.VITE_POSTHOG_KEY
  if (!key) return
  import('posthog-js').then(({ default: posthog }) => {
    posthog.init(key, {
      api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
      capture_pageview: true,
      respect_dnt: true,
    })
    posthogInitialized = true
  })
}

/** 标签页 favicon 仅随系统/浏览器主题（prefers-color-scheme），不随页面内亮暗切换 */
function syncFaviconWithSystemTheme() {
  if (import.meta.env.SSR || typeof document === 'undefined') return
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]')
  if (!link) return
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  link.href = dark ? '/logo-dark.svg' : '/logo.svg'
}

function initFaviconThemeSync() {
  if (import.meta.env.SSR || typeof document === 'undefined') return
  syncFaviconWithSystemTheme()
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncFaviconWithSystemTheme)
}

/** Harden a11y: aria-labels for theme switch & copy buttons, rel for external links */
function applyA11yHardening() {
  if (import.meta.env.SSR || typeof document === 'undefined') return
  const isZh = document.documentElement.lang?.startsWith('zh')
  document.querySelectorAll<HTMLButtonElement>('.VPSwitchAppearance').forEach((el) => {
    if (!el.hasAttribute('aria-label')) {
      el.setAttribute('aria-label', isZh ? '切换深色模式' : 'Toggle dark mode')
    }
  })
  document.querySelectorAll<HTMLButtonElement>('button.copy').forEach((el) => {
    if (!el.hasAttribute('aria-label')) {
      el.setAttribute('aria-label', isZh ? '复制代码' : 'Copy code')
    }
  })
  document.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]').forEach((a) => {
    const rel = a.getAttribute('rel') ?? ''
    if (!rel.includes('noopener')) {
      a.setAttribute('rel', rel ? `${rel} noopener noreferrer` : 'noopener noreferrer')
    }
  })
}

export default {
  extends: DefaultTheme,
  enhanceApp({ app, router }) {
    if (import.meta.env.SSR) return
    initPostHog()
    initFaviconThemeSync()
    setTimeout(applyA11yHardening, 0)
    if (router.onAfterRouteChanged) {
      router.onAfterRouteChanged(() => setTimeout(applyA11yHardening, 0))
    }
  },
} satisfies Theme
