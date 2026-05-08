<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import { TrendCharts, User, Link } from '@element-plus/icons-vue'
import DailyOverview from '@/components/DailyOverview.vue'
import { useAccountStore } from '@/stores/account'
import { useStatusStore } from '@/stores/status'

const statusStore = useStatusStore()
const accountStore = useAccountStore()
const { status, dailyGifts, realtimeConnected } = storeToRefs(statusStore)
const { currentAccountId, currentAccount } = storeToRefs(accountStore)

const growth = computed(() => dailyGifts.value?.growth || null)

async function refresh() {
  if (currentAccountId.value) {
    const acc = currentAccount.value
    if (!acc)
      return

    if (!realtimeConnected.value) {
      await statusStore.fetchStatus(currentAccountId.value)
    }
    if (acc.running && status.value?.connection?.connected) {
      statusStore.fetchDailyGifts(currentAccountId.value)
    }
  }
}

onMounted(() => {
  refresh()
})

watch(currentAccountId, () => {
  refresh()
})

function formatTaskProgress(task: any) {
  if (!task)
    return '未开始'
  const rawCurrent = task.progress ?? task.current
  const rawTarget = task.totalProgress ?? task.target

  const current = Number.isFinite(rawCurrent)
    ? rawCurrent
    : (rawCurrent ? Number(rawCurrent) || 0 : 0)

  const target = Number.isFinite(rawTarget)
    ? rawTarget
    : (rawTarget ? Number(rawTarget) || 0 : 0)

  if (!current && !target)
    return '未开始'

  if (target && current >= target)
    return '已完成'

  return `进度：${current}/${target}`
}
</script>

<template>
  <div class="task-panel">
    <!-- Daily Overview (Daily Gifts & Tasks) -->
    <DailyOverview :daily-gifts="dailyGifts" />

    <!-- Growth Task -->
    <el-card shadow="never" class="growth-card">
      <template #header>
        <div class="growth-header">
          <h3 class="growth-title">
            <el-icon class="growth-icon"><TrendCharts /></el-icon>
            <span>成长任务</span>
          </h3>
          <el-tag
            v-if="growth"
            :type="growth.doneToday ? 'success' : 'primary'"
            size="small"
            effect="light"
          >
            {{ growth.doneToday ? '今日已完成' : `${growth.completedCount}/${growth.totalCount}` }}
          </el-tag>
        </div>
      </template>

      <el-empty
        v-if="!currentAccountId"
        :image-size="48"
        description="请先添加农场账号"
      >
        <template #image>
          <el-icon :size="32" color="#9ca3af"><User /></el-icon>
        </template>
      </el-empty>

      <el-empty
        v-else-if="!status?.connection?.connected"
        :image-size="48"
        description="请先运行账号或检查网络连接"
      >
        <template #image>
          <el-icon :size="32" color="#9ca3af"><Link /></el-icon>
        </template>
      </el-empty>

      <div
        v-else-if="growth && growth.tasks && growth.tasks.length"
        class="task-list"
      >
        <div
          v-for="(task, idx) in growth.tasks"
          :key="idx"
          class="task-item"
        >
          <span class="task-desc">{{ task.desc || task.name }}</span>
          <span class="task-progress">{{ formatTaskProgress(task) }}</span>
        </div>
      </div>

      <div v-else class="empty-tasks">
        暂无任务详情
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.task-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.growth-card {
  border-radius: 12px;
}

.growth-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.growth-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  margin: 0;
  font-size: 16px;
}

.growth-icon {
  color: #22c55e;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
}

.task-desc {
  color: #4b5563;
}

.task-progress {
  font-size: 12px;
  color: #6b7280;
}

.empty-tasks {
  text-align: center;
  font-size: 14px;
  color: #9ca3af;
}
</style>
