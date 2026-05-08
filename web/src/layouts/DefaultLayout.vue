<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { Menu } from '@element-plus/icons-vue'
import Sidebar from '@/components/Sidebar.vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const { sidebarOpen } = storeToRefs(appStore)
</script>

<template>
  <el-container style="height: 100dvh;" class="app-layout">
    <!-- Mobile Sidebar Overlay -->
    <Transition name="fade">
      <div
        v-if="sidebarOpen"
        class="sidebar-overlay lg:hidden"
        @click="appStore.closeSidebar"
      />
    </Transition>

    <Sidebar />

    <el-container>
      <!-- Mobile Header -->
      <el-header v-if="sidebarOpen === false" class="mobile-header lg:hidden">
        <span class="mobile-header-title">QQ农场助手</span>
        <el-button text @click="appStore.toggleSidebar">
          <el-icon :size="20"><Menu /></el-icon>
        </el-button>
      </el-header>

      <!-- Main Content Area -->
      <el-main class="app-main">
        <RouterView v-slot="{ Component, route }">
          <Transition name="slide-fade" mode="out-in">
            <component :is="Component" :key="route.path" />
          </Transition>
        </RouterView>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.app-layout {
  width: 100vw;
  overflow: hidden;
  background:
    radial-gradient(circle at 8% 6%, rgba(95, 143, 99, 0.12), transparent 28%),
    radial-gradient(circle at 90% 8%, rgba(189, 138, 75, 0.1), transparent 26%),
    linear-gradient(135deg, #f7faf5 0%, #eef4ec 48%, #f7f1e8 100%);
}

.sidebar-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
}

.mobile-header {
  display: flex;
  height: 56px;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface);
  backdrop-filter: blur(16px);
}

.mobile-header-title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.app-main {
  overflow-y: auto;
  overflow-x: hidden;
  padding: 18px;
  position: relative;
}

.app-main::before {
  content: "";
  position: fixed;
  left: 292px;
  right: 0;
  bottom: 0;
  height: 42vh;
  pointer-events: none;
  background:
    radial-gradient(circle at 74% 88%, rgba(95, 143, 99, 0.1), transparent 28%),
    linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.36));
  opacity: 1;
}

@media (min-width: 768px) {
  .app-main {
    padding: 26px;
  }
}

@media (max-width: 1023px) {
  .app-main::before {
    left: 0;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
