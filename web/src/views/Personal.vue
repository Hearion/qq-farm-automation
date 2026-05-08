<script setup lang="ts">
import { ref } from 'vue'
import { Opportunity, Box, List } from '@element-plus/icons-vue'
import BagPanel from '@/components/BagPanel.vue'
import FarmPanel from '@/components/FarmPanel.vue'
import TaskPanel from '@/components/TaskPanel.vue'

const currentTab = ref<'farm' | 'bag' | 'task'>('farm')
</script>

<template>
  <div class="personal-page">
    <el-tabs v-model="currentTab" class="page-tabs">
      <el-tab-pane name="farm">
        <template #label>
          <el-icon><Opportunity /></el-icon>
          <span>我的农场</span>
        </template>
        <FarmPanel />
      </el-tab-pane>
      <el-tab-pane name="bag">
        <template #label>
          <el-icon><Box /></el-icon>
          <span>我的背包</span>
        </template>
        <BagPanel />
      </el-tab-pane>
      <el-tab-pane name="task">
        <template #label>
          <el-icon><List /></el-icon>
          <span>我的任务</span>
        </template>
        <TaskPanel />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.personal-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.page-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow-y: auto;
}

.page-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.page-tabs :deep(.el-tabs__label) {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
