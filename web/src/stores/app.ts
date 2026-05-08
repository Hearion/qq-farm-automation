import type { Component } from 'vue'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  Sunny,
  Moon,
  StarFilled,
  ChromeFilled,
  Trophy,
  CircleCloseFilled,
} from '@element-plus/icons-vue'
import api from '@/api'

const THEME_KEY = 'ui_theme'

export type Theme = 'light-blue' | 'light-green' | 'light-pink' | 'dark-blue' | 'dark-purple' | 'dark-teal' | 'dark-orange' | 'dark-red'

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    Number.parseInt(h.substring(0, 2), 16),
    Number.parseInt(h.substring(2, 4), 16),
    Number.parseInt(h.substring(4, 6), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('')}`
}

function mixColors(color1: string, color2: string, weight: number): string {
  const [r1, g1, b1] = hexToRgb(color1)
  const [r2, g2, b2] = hexToRgb(color2)
  const w = weight / 100
  return rgbToHex(
    r1 * (1 - w) + r2 * w,
    g1 * (1 - w) + g2 * w,
    b1 * (1 - w) + b2 * w,
  )
}

export const useAppStore = defineStore('app', () => {
  const sidebarOpen = ref(false)
  const currentTheme = ref<Theme>((localStorage.getItem(THEME_KEY) as Theme) || 'light-pink')
  const showThemePanel = ref(false)

  const themes: Record<Theme, {
    name: string
    isDark: boolean
    bg: string
    text: string
    primary: string
    secondary: string
    gradient: string
    icon: Component
  }> = {
    'light-blue': {
      name: '雾白',
      isDark: false,
      bg: '#f4f7f2',
      text: '#263026',
      primary: '#5f8f63',
      secondary: '#456d4b',
      gradient: 'linear-gradient(135deg, #7da57a 0%, #5f8f63 100%)',
      icon: Sunny,
    },
    'dark-blue': {
      name: '夜田',
      isDark: true,
      bg: '#111812',
      text: '#eaf3e5',
      primary: '#86a982',
      secondary: '#5f8f63',
      gradient: 'linear-gradient(135deg, #86a982 0%, #5f8f63 100%)',
      icon: Moon,
    },
    'light-pink': {
      name: '麦穗',
      isDark: false,
      bg: '#faf6ef',
      text: '#342f29',
      primary: '#bd8a4b',
      secondary: '#8f6d3f',
      gradient: 'linear-gradient(135deg, #c8a16f 0%, #bd8a4b 100%)',
      icon: StarFilled,
    },
    'light-green': {
      name: '新芽',
      isDark: false,
      bg: '#eef6ed',
      text: '#253225',
      primary: '#5f8f63',
      secondary: '#456d4b',
      gradient: 'linear-gradient(135deg, #7da57a 0%, #5f8f63 100%)',
      icon: ChromeFilled,
    },
    'dark-purple': {
      name: '墨松',
      isDark: true,
      bg: '#101715',
      text: '#e1eee6',
      primary: '#7ba88a',
      secondary: '#4f7d61',
      gradient: 'linear-gradient(135deg, #7ba88a 0%, #4f7d61 100%)',
      icon: Trophy,
    },
    'dark-orange': {
      name: '谷仓',
      isDark: true,
      bg: '#221d16',
      text: '#f4ead9',
      primary: '#c58b3d',
      secondary: '#a56724',
      gradient: 'linear-gradient(135deg, #c58b3d 0%, #7f4b1b 100%)',
      icon: Sunny,
    },
    'dark-teal': {
      name: '雨林',
      isDark: true,
      bg: '#0f2421',
      text: '#d9f0e8',
      primary: '#3aa486',
      secondary: '#2a7464',
      gradient: 'linear-gradient(135deg, #3aa486 0%, #2a7464 100%)',
      icon: ChromeFilled,
    },
    'dark-red': {
      name: '赤土',
      isDark: true,
      bg: '#241716',
      text: '#f7e7e3',
      primary: '#bd6658',
      secondary: '#8f3f35',
      gradient: 'linear-gradient(135deg, #bd6658 0%, #8f3f35 100%)',
      icon: CircleCloseFilled,
    },
  }

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
  }

  function closeSidebar() {
    sidebarOpen.value = false
  }

  function openSidebar() {
    sidebarOpen.value = true
  }

  async function fetchTheme() {
    try {
      const res = await api.get('/api/settings')
      if (res.data.ok && res.data.data.ui?.theme) {
        // Server theme available, but prefer local
      }
    }
    catch {
      // Silent fail when not logged in
    }
  }

  function applyTheme(theme: Theme) {
    if (!themes[theme])
      theme = 'light-pink'

    const t = themes[theme]
    currentTheme.value = theme
    localStorage.setItem(THEME_KEY, theme)

    if (typeof document !== 'undefined' && document.documentElement) {
      const root = document.documentElement

      // Custom theme variables
      root.style.setProperty('--theme-bg', t.bg)
      root.style.setProperty('--theme-text', t.text)
      root.style.setProperty('--theme-primary', t.primary)
      root.style.setProperty('--theme-secondary', t.secondary)
      root.style.setProperty('--theme-gradient', t.gradient)
      root.style.setProperty('--app-bg', t.bg)
      root.style.setProperty('--app-text', t.text)
      root.style.setProperty('--app-accent', t.primary)
      root.style.setProperty('--app-accent-strong', t.secondary)
      root.style.setProperty('--app-bg-elevated', t.isDark ? '#182019' : '#ffffff')
      root.style.setProperty('--app-surface', t.isDark ? 'rgba(24, 32, 25, 0.88)' : 'rgba(255, 255, 255, 0.86)')
      root.style.setProperty('--app-surface-muted', t.isDark ? '#202a21' : '#edf3e9')
      root.style.setProperty('--app-border', t.isDark ? 'rgba(231,241,225,0.1)' : 'rgba(77,94,71,0.12)')

      // Element Plus CSS variable bridges
      root.style.setProperty('--el-color-primary', t.primary)
      root.style.setProperty('--el-color-primary-light-3', mixColors(t.primary, t.isDark ? '#1d1e1f' : '#ffffff', 30))
      root.style.setProperty('--el-color-primary-light-5', mixColors(t.primary, t.isDark ? '#1d1e1f' : '#ffffff', 50))
      root.style.setProperty('--el-color-primary-light-7', mixColors(t.primary, t.isDark ? '#1d1e1f' : '#ffffff', 70))
      root.style.setProperty('--el-color-primary-light-8', mixColors(t.primary, t.isDark ? '#1d1e1f' : '#ffffff', 80))
      root.style.setProperty('--el-color-primary-light-9', mixColors(t.primary, t.isDark ? '#1d1e1f' : '#ffffff', 90))
      root.style.setProperty('--el-color-primary-dark-2', mixColors(t.primary, '#000000', 20))
      root.style.setProperty('--el-bg-color', t.bg)
      root.style.setProperty('--el-bg-color-page', t.bg)
      root.style.setProperty('--el-bg-color-overlay', t.isDark ? '#1d1e1f' : '#ffffff')
      root.style.setProperty('--el-text-color-primary', t.text)
      root.style.setProperty('--el-text-color-regular', t.text)
      root.style.setProperty('--el-fill-color-blank', t.isDark ? '#1d1e1f' : '#ffffff')
      root.style.setProperty('--el-border-color', t.isDark ? 'rgba(255,255,255,0.1)' : '#dcdfe6')
      root.style.setProperty('--el-border-color-light', t.isDark ? 'rgba(255,255,255,0.06)' : '#e4e7ed')
      root.style.setProperty('--el-border-color-lighter', t.isDark ? 'rgba(255,255,255,0.04)' : '#ebeef5')

      // Toggle dark class
      if (t.isDark) {
        root.classList.add('dark')
      }
      else {
        root.classList.remove('dark')
      }
    }
  }

  function toggleThemePanel() {
    showThemePanel.value = !showThemePanel.value
  }

  function toggleDark() {
    const current = currentTheme.value
    if (themes[current]?.isDark) {
      applyTheme('light-green')
    }
    else {
      applyTheme('light-pink')
    }
  }

  const isDark = computed(() => themes[currentTheme.value]?.isDark ?? false)

  watch(currentTheme, (val) => {
    applyTheme(val)
  })

  applyTheme(currentTheme.value)

  return {
    sidebarOpen,
    isDark,
    currentTheme,
    showThemePanel,
    themes,
    applyTheme,
    toggleThemePanel,
    toggleDark,
    toggleSidebar,
    closeSidebar,
    openSidebar,
    fetchTheme,
  }
})
