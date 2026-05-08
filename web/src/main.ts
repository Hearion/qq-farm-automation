import { createPinia } from 'pinia'
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import { ElMessage } from 'element-plus'
import { useAppStore } from '@/stores/app'
import App from './App.vue'
import router from './router'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })

// Apply theme immediately before app mounts
const THEME_KEY = 'ui_theme'
const savedTheme = localStorage.getItem(THEME_KEY) || 'light-pink'

const themes: Record<string, { isDark: boolean, bg: string, text: string, primary: string, secondary: string, gradient: string }> = {
  'light-blue': { isDark: false, bg: '#f4f7f2', text: '#263026', primary: '#5f8f63', secondary: '#456d4b', gradient: 'linear-gradient(135deg, #7da57a 0%, #5f8f63 100%)' },
  'dark-blue': { isDark: true, bg: '#111812', text: '#eaf3e5', primary: '#86a982', secondary: '#5f8f63', gradient: 'linear-gradient(135deg, #86a982 0%, #5f8f63 100%)' },
  'light-pink': { isDark: false, bg: '#faf6ef', text: '#342f29', primary: '#bd8a4b', secondary: '#8f6d3f', gradient: 'linear-gradient(135deg, #c8a16f 0%, #bd8a4b 100%)' },
  'light-green': { isDark: false, bg: '#eef6ed', text: '#253225', primary: '#5f8f63', secondary: '#456d4b', gradient: 'linear-gradient(135deg, #7da57a 0%, #5f8f63 100%)' },
  'dark-purple': { isDark: true, bg: '#101715', text: '#e1eee6', primary: '#7ba88a', secondary: '#4f7d61', gradient: 'linear-gradient(135deg, #7ba88a 0%, #4f7d61 100%)' },
  'dark-orange': { isDark: true, bg: '#221d16', text: '#f4ead9', primary: '#c58b3d', secondary: '#a56724', gradient: 'linear-gradient(135deg, #c58b3d 0%, #7f4b1b 100%)' },
  'dark-teal': { isDark: true, bg: '#0f2421', text: '#d9f0e8', primary: '#3aa486', secondary: '#2a7464', gradient: 'linear-gradient(135deg, #3aa486 0%, #2a7464 100%)' },
  'dark-red': { isDark: true, bg: '#241716', text: '#f7e7e3', primary: '#bd6658', secondary: '#8f3f35', gradient: 'linear-gradient(135deg, #bd6658 0%, #8f3f35 100%)' },
}

const theme = themes[savedTheme] || themes['light-pink']
if (theme) {
  const root = document.documentElement
  root.style.setProperty('--theme-bg', theme.bg)
  root.style.setProperty('--theme-text', theme.text)
  root.style.setProperty('--theme-primary', theme.primary)
  root.style.setProperty('--theme-secondary', theme.secondary)
  root.style.setProperty('--theme-gradient', theme.gradient)
  root.style.setProperty('--app-bg', theme.bg)
  root.style.setProperty('--app-text', theme.text)
  root.style.setProperty('--app-accent', theme.primary)
  root.style.setProperty('--app-accent-strong', theme.secondary)
  // Element Plus CSS variable bridges
  root.style.setProperty('--el-color-primary', theme.primary)
  root.style.setProperty('--el-bg-color', theme.bg)
  root.style.setProperty('--el-bg-color-page', theme.bg)
  root.style.setProperty('--el-text-color-primary', theme.text)
  root.style.setProperty('--el-fill-color-blank', theme.isDark ? '#1d1e1f' : '#ffffff')
  if (theme.isDark) {
    root.classList.add('dark')
  }
  else {
    root.classList.remove('dark')
  }
}

// Global Error Handling
app.config.errorHandler = (err: any, _instance, info) => {
  console.error('全局 Vue 错误:', err, info)
  const message = err.message || String(err)
  if (message.includes('ResizeObserver loop'))
    return
  ElMessage.error(`应用错误: ${message}`)
}

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  if (reason && typeof reason === 'object' && 'isAxiosError' in reason)
    return

  console.error('Unhandled Rejection:', reason)
  const message = reason?.message || String(reason)
  ElMessage.error(`异步错误: ${message}`)
})

window.onerror = (message, _source, _lineno, _colno, error) => {
  console.error('Global Error:', message, error)
  if (String(message).includes('Script error'))
    return
  ElMessage.error(`系统错误: ${message}`)
}

// Apply theme from localStorage immediately, then sync from server if authed
const appStore = useAppStore()
appStore.fetchTheme()

app.mount('#app')
