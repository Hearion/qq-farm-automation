<script setup lang="ts">
import type { Theme } from '@/stores/app'
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

const savedTheme = localStorage.getItem('ui_theme') as Theme
if (savedTheme && appStore.themes[savedTheme]) {
  appStore.applyTheme(savedTheme)
}

onMounted(() => {
  appStore.fetchTheme()
})
</script>

<template>
  <div class="app-root">
    <RouterView />
  </div>
</template>

<style>
.app-root {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--app-bg);
  color: var(--app-text);
}

:root {
  --theme-bg: var(--app-bg);
  --theme-text: var(--app-text);
  --theme-primary: var(--app-accent);
  --theme-secondary: var(--app-accent-strong);
  --theme-gradient: linear-gradient(135deg, var(--app-accent) 0%, var(--app-accent-strong) 100%);
  --theme-surface: var(--app-surface);
  --theme-surface-hover: var(--app-surface-muted);
  --theme-border: var(--app-border);
  --el-color-primary: var(--theme-primary);
  --el-bg-color: var(--theme-bg);
  --el-bg-color-page: var(--theme-bg);
  --el-text-color-primary: var(--theme-text);
}
</style>
