<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Opportunity, Brush, Top, Promotion, Grid, Loading, Link, User } from '@element-plus/icons-vue'
import LandCard from '@/components/LandCard.vue'
import { useAccountStore } from '@/stores/account'
import { useFarmStore } from '@/stores/farm'
import { useStatusStore } from '@/stores/status'

const farmStore = useFarmStore()
const accountStore = useAccountStore()
const statusStore = useStatusStore()
const { lands, summary, loading } = storeToRefs(farmStore)
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { status, loading: statusLoading, realtimeConnected } = storeToRefs(statusStore)

const operating = ref(false)

async function executeOperate(opType: string) {
  if (!currentAccountId.value || !opType)
    return
  operating.value = true
  try {
    await farmStore.operate(currentAccountId.value, opType)
  }
  finally {
    operating.value = false
  }
}

function handleOperate(opType: string) {
  if (!currentAccountId.value)
    return

  const confirmMap: Record<string, string> = {
    harvest: '确定要收获所有成熟作物吗？',
    clear: '确定要一键除草/除虫吗？',
    plant: '确定要一键种植吗？(根据策略配置)',
    upgrade: '确定要升级所有可升级的土地吗？(消耗金币)',
    all: '确定要一键全收吗？(包含收获、除草、种植等)',
  }

  ElMessageBox.confirm(
    confirmMap[opType] || '确定执行此操作吗？',
    '确认操作',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    },
  ).then(() => {
    executeOperate(opType)
  }).catch(() => {
    // cancelled
  })
}

const operations = [
  { type: 'harvest', label: '收获', icon: Opportunity, buttonType: 'primary' as const },
  { type: 'clear', label: '除草/虫', icon: Brush, buttonType: 'success' as const },
  { type: 'plant', label: '种植', icon: Opportunity, buttonType: 'primary' as const },
  { type: 'upgrade', label: '升级土地', icon: Top, buttonType: 'warning' as const },
  { type: 'all', label: '一键全收', icon: Promotion, buttonType: 'danger' as const },
]

async function refresh() {
  if (currentAccountId.value) {
    const acc = currentAccount.value
    if (!acc)
      return

    if (!realtimeConnected.value) {
      await statusStore.fetchStatus(currentAccountId.value)
    }

    if (acc.running && status.value?.connection?.connected) {
      farmStore.fetchLands(currentAccountId.value)
    }
  }
}

watch(currentAccountId, () => {
  refresh()
})

const { pause, resume } = useIntervalFn(() => {
  if (lands.value) {
    lands.value = lands.value.map((l: any) =>
      l.matureInSec > 0 ? { ...l, matureInSec: l.matureInSec - 1 } : l,
    )
  }
}, 1000)

const { pause: pauseRefresh, resume: resumeRefresh } = useIntervalFn(refresh, 60000)

onMounted(() => {
  refresh()
  resume()
  resumeRefresh()
})

onUnmounted(() => {
  pause()
  pauseRefresh()
})
</script>

<template>
  <div class="farm-panel">
    <el-card shadow="never" class="main-card">
      <template #header>
        <div class="card-header">
          <div class="title-block">
            <div class="title-icon">
              <el-icon><Grid /></el-icon>
            </div>
            <div>
              <h3 class="card-title">
                土地详情
              </h3>
              <p class="card-subtitle">
                {{ currentAccount?.name || currentAccount?.nick || currentAccount?.id || '当前账号' }}
              </p>
            </div>
          </div>

          <div class="op-buttons">
            <el-button
              v-for="op in operations"
              :key="op.type"
              :type="op.buttonType"
              :disabled="operating"
              :icon="op.icon"
              @click="handleOperate(op.type)"
            >
              {{ op.label }}
            </el-button>
          </div>
        </div>
      </template>

      <div class="summary-bar">
        <div class="summary-card summary-card--harvest">
          <span class="summary-label">可收</span>
          <strong>{{ summary?.harvestable || 0 }}</strong>
        </div>
        <div class="summary-card summary-card--growing">
          <span class="summary-label">生长</span>
          <strong>{{ summary?.growing || 0 }}</strong>
        </div>
        <div class="summary-card summary-card--empty">
          <span class="summary-label">空闲</span>
          <strong>{{ summary?.empty || 0 }}</strong>
        </div>
        <div class="summary-card summary-card--dead">
          <span class="summary-label">枯萎</span>
          <strong>{{ summary?.dead || 0 }}</strong>
        </div>
      </div>

      <div class="grid-container">
        <div v-if="loading || statusLoading" class="loading-wrapper">
          <el-icon class="is-loading" :size="40" color="#409eff">
            <Loading />
          </el-icon>
        </div>

        <el-empty
          v-else-if="!currentAccountId"
          :image-size="60"
          description="请先添加农场账号"
        >
          <template #image>
            <el-icon :size="40" color="#9ca3af"><User /></el-icon>
          </template>
        </el-empty>

        <el-empty
          v-else-if="!status?.connection?.connected"
          :image-size="60"
          description="请先运行账号或检查网络连接"
        >
          <template #image>
            <el-icon :size="40" color="#9ca3af"><Link /></el-icon>
          </template>
        </el-empty>

        <el-empty
          v-else-if="!lands || lands.length === 0"
          description="暂无土地数据"
        />

        <div v-else class="land-grid">
          <LandCard
            v-for="land in lands"
            :key="land.id"
            :land="land"
          />
        </div>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.farm-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
  color: var(--app-text);
}

.main-card {
  flex: 1;
  overflow: hidden;
  border: 1px solid rgba(163, 184, 156, 0.32) !important;
  border-radius: 24px !important;
  background:
    radial-gradient(circle at 12% 0%, rgba(255, 255, 255, 0.9), transparent 28%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(246, 250, 244, 0.76)) !important;
  box-shadow: 0 24px 60px rgba(42, 58, 42, 0.1) !important;
  backdrop-filter: blur(18px);
}

.main-card :deep(.el-card__header) {
  border-bottom: 1px solid rgba(158, 180, 151, 0.24);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.74), rgba(239, 247, 235, 0.62));
  padding: 20px 22px;
}

.main-card :deep(.el-card__body) {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 20px 22px 24px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

.title-block {
  display: flex;
  min-width: 220px;
  align-items: center;
  gap: 12px;
}

.title-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid rgba(95, 143, 99, 0.2);
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(95, 143, 99, 0.16), rgba(194, 145, 75, 0.14));
  color: var(--app-accent-strong);
  box-shadow: 0 10px 24px rgba(95, 143, 99, 0.12);
}

.card-title {
  margin: 0;
  color: var(--app-text);
  font-size: 20px;
  font-weight: 850;
  letter-spacing: 0;
}

.card-subtitle {
  margin: 4px 0 0;
  max-width: 260px;
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.op-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.op-buttons :deep(.el-button) {
  margin-left: 0 !important;
  min-height: 34px;
  border-radius: 999px !important;
  font-weight: 750;
  box-shadow: 0 10px 22px rgba(38, 48, 38, 0.08);
}

.op-buttons :deep(.el-button.is-disabled) {
  box-shadow: none;
}

.summary-bar {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.summary-card {
  position: relative;
  overflow: hidden;
  display: flex;
  min-height: 72px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(163, 184, 156, 0.26);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.58);
  box-shadow: 0 14px 34px rgba(42, 58, 42, 0.06);
}

.summary-card::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: 5px;
  content: '';
}

.summary-label {
  color: var(--app-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.summary-card strong {
  margin-top: 4px;
  color: var(--app-text);
  font-size: 24px;
  font-weight: 860;
  line-height: 1;
}

.summary-card--harvest::before {
  background: #d69b43;
}

.summary-card--growing::before {
  background: #5f8f63;
}

.summary-card--empty::before {
  background: #8a9887;
}

.summary-card--dead::before {
  background: #d65745;
}

.grid-container {
  display: flex;
  flex: 1;
  min-height: 0;
  justify-content: center;
  border: 1px solid rgba(163, 184, 156, 0.18);
  border-radius: 22px;
  background:
    linear-gradient(90deg, rgba(163, 184, 156, 0.08) 1px, transparent 1px),
    linear-gradient(rgba(163, 184, 156, 0.08) 1px, transparent 1px),
    rgba(255, 255, 255, 0.34);
  background-size: 28px 28px;
  padding: 18px;
}

.loading-wrapper {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
}

.land-grid {
  display: grid;
  width: 100%;
  max-width: 1260px;
  grid-template-columns: repeat(auto-fill, minmax(172px, 1fr));
  justify-content: center;
  align-content: start;
  gap: 14px;
}

@media (max-width: 520px) {
  .main-card :deep(.el-card__header),
  .main-card :deep(.el-card__body) {
    padding: 16px;
  }

  .summary-bar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .grid-container {
    padding: 12px;
  }

  .land-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
}
</style>
