<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading, Search, TrendCharts, Plus, Delete, InfoFilled, Sunny } from '@element-plus/icons-vue'
import api from '@/api'
import { useAccountStore } from '@/stores/account'
import { usePlantBlacklistStore } from '@/stores/plant-blacklist'
import { useStatusStore } from '@/stores/status'

const accountStore = useAccountStore()
const plantBlacklistStore = usePlantBlacklistStore()
const statusStore = useStatusStore()
const { currentAccountId } = storeToRefs(accountStore)
const { blacklist } = storeToRefs(plantBlacklistStore)
const { status } = storeToRefs(statusStore)

const loading = ref(false)
const list = ref<any[]>([])
const sortKey = ref('exp')
const imageErrors = ref<Record<string | number, boolean>>({})
const searchKeyword = ref('')
const batchLoading = ref(false)

const activeTab = ref('crops')

const strategyLevel = ref(1)

watch(() => status.value?.status?.level, (newLevel) => {
  if (newLevel && Number(newLevel) > 0) {
    strategyLevel.value = Number(newLevel)
  }
}, { immediate: true })

const strategies = [
  {
    key: 'max_exp',
    label: '经验/时',
    metric: 'expPerHour',
    color: 'purple',
    icon: TrendCharts,
    unit: 'EXP',
    desc: '每小时经验收益最高',
  },
  {
    key: 'max_profit',
    label: '利润/时',
    metric: 'profitPerHour',
    color: 'amber',
    icon: TrendCharts,
    unit: '金币',
    desc: '每小时净利润最高',
  },
  {
    key: 'max_fert_exp',
    label: '普肥经验/时',
    metric: 'normalFertilizerExpPerHour',
    color: 'blue',
    icon: TrendCharts,
    unit: 'EXP',
    desc: '使用普通化肥后经验最高',
  },
  {
    key: 'max_fert_profit',
    label: '普肥利润/时',
    metric: 'normalFertilizerProfitPerHour',
    color: 'green',
    icon: TrendCharts,
    unit: '金币',
    desc: '使用普通化肥后利润最高',
  },
]

function getStrategyBestPlant(strategyKey: string) {
  const strategy = strategies.find(s => s.key === strategyKey)
  if (!strategy)
    return null

  const metric = strategy.metric
  const filtered = list.value.filter((item) => {
    const level = item.level
    if (level === null || level === undefined)
      return true
    return Number(level) <= strategyLevel.value
  })

  if (filtered.length === 0)
    return null

  if (strategyKey === 'level') {
    return [...filtered].sort((a, b) => {
      const av = a.level ?? -1
      const bv = b.level ?? -1
      return bv - av
    })[0]
  }

  return [...filtered].sort((a, b) => {
    const av = Number(a[metric])
    const bv = Number(b[metric])
    if (!Number.isFinite(av) && !Number.isFinite(bv))
      return 0
    if (!Number.isFinite(av))
      return 1
    if (!Number.isFinite(bv))
      return -1
    return bv - av
  })[0]
}

function getStrategyAvailableCount() {
  return list.value.filter((item) => {
    const level = item.level
    if (level === null || level === undefined)
      return true
    return Number(level) <= strategyLevel.value
  }).length
}

const colorClassMap: Record<string, { card: string; header: string; text: string; border: string; value: string }> = {
  purple: {
    card: 'strategy-card strategy-card--purple',
    header: 'strategy-header strategy-header--purple',
    text: 'strategy-text--purple',
    border: 'strategy-border--purple',
    value: 'strategy-value--purple',
  },
  blue: {
    card: 'strategy-card strategy-card--blue',
    header: 'strategy-header strategy-header--blue',
    text: 'strategy-text--blue',
    border: 'strategy-border--blue',
    value: 'strategy-value--blue',
  },
  amber: {
    card: 'strategy-card strategy-card--amber',
    header: 'strategy-header strategy-header--amber',
    text: 'strategy-text--amber',
    border: 'strategy-border--amber',
    value: 'strategy-value--amber',
  },
  green: {
    card: 'strategy-card strategy-card--green',
    header: 'strategy-header strategy-header--green',
    text: 'strategy-text--green',
    border: 'strategy-border--green',
    value: 'strategy-value--green',
  },
}

function getColorClasses(color: string) {
  return colorClassMap[color] || colorClassMap.purple
}

const filteredList = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword)
    return list.value

  return list.value.filter((item: any) => {
    const name = String(item?.name || '').toLowerCase()
    const seedId = String(item?.seedId || '')
    return name.includes(keyword) || seedId.includes(keyword)
  })
})

const sortOptions = [
  { value: 'exp', label: '经验/小时' },
  { value: 'fert', label: '普通肥经验/小时' },
  { value: 'profit', label: '利润/小时' },
  { value: 'fert_profit', label: '普通肥利润/小时' },
  { value: 'level', label: '等级' },
]

const sortOrder = ref<'desc' | 'asc'>('desc')

const sortOrderOptions = [
  { value: 'desc', label: '倒序' },
  { value: 'asc', label: '正序' },
]

const sortedList = computed(() => {
  const metricMap: Record<string, string> = {
    exp: 'expPerHour',
    fert: 'normalFertilizerExpPerHour',
    profit: 'profitPerHour',
    fert_profit: 'normalFertilizerProfitPerHour',
    level: 'level',
  }
  const metric = metricMap[sortKey.value]
  if (!metric)
    return filteredList.value

  const sorted = [...filteredList.value].sort((a, b) => {
    const av = Number(a[metric])
    const bv = Number(b[metric])
    if (!Number.isFinite(av) && !Number.isFinite(bv))
      return 0
    if (!Number.isFinite(av))
      return 1
    if (!Number.isFinite(bv))
      return -1
    return sortOrder.value === 'desc' ? bv - av : av - bv
  })
  return sorted
})

async function loadAnalytics() {
  if (!currentAccountId.value)
    return
  loading.value = true
  try {
    const res = await api.get(`/api/analytics`, {
      params: { sort: sortKey.value },
      headers: { 'x-account-id': currentAccountId.value },
    })
    const data = res.data.data
    if (Array.isArray(data)) {
      list.value = data
    }
    else {
      list.value = []
    }
  }
  catch (e) {
    console.error(e)
    list.value = []
  }
  finally {
    loading.value = false
  }
}

async function handleToggleBlacklist(item: any) {
  await plantBlacklistStore.toggleBlacklist(item.seedId)
  if (plantBlacklistStore.isBlacklisted(item.seedId)) {
    ElMessage.success(`${item.name} 已加入偷菜黑名单`)
  }
  else {
    ElMessage.success(`${item.name} 已移出偷菜黑名单`)
  }
}

async function handleAddAllToBlacklist() {
  if (batchLoading.value)
    return
  batchLoading.value = true
  try {
    const allSeedIds = list.value.map((item: any) => item.seedId)
    await plantBlacklistStore.addAllToBlacklist(allSeedIds)
    ElMessage.success(`已将 ${allSeedIds.length} 种作物加入偷菜黑名单`)
  }
  finally {
    batchLoading.value = false
  }
}

async function handleClearBlacklist() {
  if (batchLoading.value)
    return
  batchLoading.value = true
  try {
    await plantBlacklistStore.clearBlacklist()
    ElMessage.success('已清空偷菜黑名单')
  }
  finally {
    batchLoading.value = false
  }
}

onMounted(() => {
  loadAnalytics()
  plantBlacklistStore.fetchBlacklist()
})

watch([currentAccountId, sortKey], () => {
  loadAnalytics()
})

function formatLv(level: any) {
  if (level === null || level === undefined || level === '' || Number(level) < 0)
    return '未知'
  return String(level)
}

function getSeedNameById(seedId: number) {
  const item = list.value.find((i: any) => i.seedId === seedId)
  return item?.name || `蔬菜ID:${seedId}`
}

function formatGrowTime(seconds: any) {
  const s = Number(seconds)
  if (!Number.isFinite(s) || s <= 0)
    return '0秒'
  if (s < 60)
    return `${s}秒`
  if (s < 3600) {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return secs > 0 ? `${mins}分${secs}秒` : `${mins}分`
  }
  const hours = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  return mins > 0 ? `${hours}时${mins}分` : `${hours}时`
}
</script>

<template>
  <div class="analytics-page">
    <el-tabs v-model="activeTab">
      <el-tab-pane name="crops">
        <template #label>
          <span class="tab-label">
            <el-icon><Sunny /></el-icon>
            <span>全部作物</span>
            <el-tag v-if="list.length" size="small" type="success" round class="tab-badge">
              {{ list.length }}
            </el-tag>
          </span>
        </template>
      </el-tab-pane>
      <el-tab-pane name="blacklist">
        <template #label>
          <span class="tab-label">
            <el-icon><Delete /></el-icon>
            <span>黑名单</span>
            <el-tag v-if="blacklist.length" size="small" type="danger" round class="tab-badge">
              {{ blacklist.length }}
            </el-tag>
          </span>
        </template>
      </el-tab-pane>
      <el-tab-pane name="strategy">
        <template #label>
          <span class="tab-label">
            <el-icon><TrendCharts /></el-icon>
            <span>种植策略</span>
          </span>
        </template>
      </el-tab-pane>
    </el-tabs>

    <div class="tab-content">
      <!-- Loading state -->
      <div v-if="loading" class="loading-wrapper">
        <el-icon class="is-loading" :size="36" color="var(--el-color-primary)">
          <Loading />
        </el-icon>
      </div>

      <!-- No account selected -->
      <el-empty v-else-if="!currentAccountId" description="请选择账号后查看数据分析" />

      <!-- No data -->
      <el-empty v-else-if="list.length === 0" description="暂无数据" />

      <!-- Crops tab -->
      <div v-else-if="activeTab === 'crops'" class="crops-section">
        <div class="crops-toolbar">
          <div class="crops-title">
            <el-icon :size="20" color="var(--el-color-success)"><Sunny /></el-icon>
            <div>
              <div class="crops-title-text">全部作物信息</div>
              <div class="crops-title-sub">共 {{ list.length }} 种作物</div>
            </div>
          </div>
          <div class="crops-controls">
            <el-input
              v-model="searchKeyword"
              placeholder="搜索作物..."
              clearable
              class="search-input"
              :prefix-icon="Search"
            />
            <span v-if="list.length" class="filter-count">
              {{ sortedList.length }}/{{ list.length }}
            </span>
            <span class="sort-label">排序:</span>
            <el-select v-model="sortKey" class="sort-select">
              <el-option
                v-for="opt in sortOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-select v-model="sortOrder" class="order-select">
              <el-option
                v-for="opt in sortOrderOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
        </div>

        <!-- Desktop table -->
        <el-table :data="sortedList" stripe class="crops-table" table-layout="fixed">
          <el-table-column label="作物 (Lv)" min-width="200">
            <template #default="{ row: item }">
              <div class="crop-name-cell">
                <div class="crop-icon-box">
                  <img
                    v-if="item.image && !imageErrors[item.seedId]"
                    :src="item.image"
                    class="crop-img"
                    loading="lazy"
                    @error="imageErrors[item.seedId] = true"
                  >
                  <el-icon v-else :size="20" color="var(--el-text-color-placeholder)"><Sunny /></el-icon>
                </div>
                <div>
                  <div class="crop-name">
                    {{ item.name }}
                    <el-tag v-if="blacklist.includes(item.seedId)" type="danger" size="small" class="blacklist-tag">黑名单</el-tag>
                  </div>
                  <div class="crop-meta">
                    <el-tag size="small" type="info">Lv{{ formatLv(item.level) }}</el-tag>
                    <span class="crop-id">ID:{{ item.seedId }}</span>
                  </div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="120">
            <template #default="{ row: item }">
              <div class="time-cell">
                <div class="time-main">{{ formatGrowTime(item.growTime) }}</div>
                <div class="time-sub">{{ item.seasons }}季</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="经验/时" width="100" align="right">
            <template #default="{ row: item }">
              <span class="metric-purple">{{ item.expPerHour }}</span>
            </template>
          </el-table-column>
          <el-table-column label="普通肥经验/时" width="130" align="right">
            <template #default="{ row: item }">
              <span class="metric-blue">{{ item.normalFertilizerExpPerHour ?? '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="净利润/时" width="110" align="right">
            <template #default="{ row: item }">
              <span class="metric-amber">{{ item.profitPerHour ?? '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="普通肥净利润/时" width="140" align="right">
            <template #default="{ row: item }">
              <span class="metric-green">{{ item.normalFertilizerProfitPerHour ?? '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" align="center">
            <template #default="{ row: item }">
              <el-switch
                :model-value="blacklist.includes(item.seedId)"
                active-text="已拉黑"
                inactive-text="拉黑"
                inline-prompt
                @change="handleToggleBlacklist(item)"
              />
            </template>
          </el-table-column>
        </el-table>

        <!-- Mobile card list -->
        <div class="mobile-crops-list">
          <el-card
            v-for="(item, idx) in sortedList"
            :key="idx"
            shadow="hover"
            class="mobile-crop-card"
          >
            <div class="mobile-crop-header">
              <div class="crop-icon-box">
                <img
                  v-if="item.image && !imageErrors[item.seedId]"
                  :src="item.image"
                  class="crop-img"
                  loading="lazy"
                  @error="imageErrors[item.seedId] = true"
                >
                <el-icon v-else :size="20" color="var(--el-text-color-placeholder)"><Sunny /></el-icon>
              </div>
              <div class="mobile-crop-info">
                <div class="crop-name">
                  {{ item.name }}
                  <el-tag v-if="blacklist.includes(item.seedId)" type="danger" size="small" class="blacklist-tag">黑名单</el-tag>
                </div>
                <div class="crop-meta">
                  <el-tag size="small" type="info">Lv{{ formatLv(item.level) }}</el-tag>
                  <span class="crop-id">ID:{{ item.seedId }}</span>
                  <span class="crop-seasons">{{ item.seasons }}季</span>
                </div>
              </div>
            </div>

            <div class="mobile-crop-stats">
              <div class="mobile-stat">
                <span class="mobile-stat-label">时间</span>
                <span class="mobile-stat-value">{{ formatGrowTime(item.growTime) }}</span>
              </div>
              <div class="mobile-stat">
                <span class="mobile-stat-label">经验/时</span>
                <span class="mobile-stat-value metric-purple">{{ item.expPerHour }}</span>
              </div>
              <div class="mobile-stat">
                <span class="mobile-stat-label">净利润/时</span>
                <span class="mobile-stat-value metric-amber">{{ item.profitPerHour ?? '-' }}</span>
              </div>
              <div class="mobile-stat">
                <span class="mobile-stat-label">普肥经验/时</span>
                <span class="mobile-stat-value metric-blue">{{ item.normalFertilizerExpPerHour ?? '-' }}</span>
              </div>
              <div class="mobile-stat">
                <span class="mobile-stat-label">普肥利润/时</span>
                <span class="mobile-stat-value metric-green">{{ item.normalFertilizerProfitPerHour ?? '-' }}</span>
              </div>
            </div>

            <div class="mobile-crop-action">
              <el-switch
                :model-value="blacklist.includes(item.seedId)"
                active-text="已拉黑"
                inactive-text="加入黑名单"
                inline-prompt
                style="width: 100%"
                @change="handleToggleBlacklist(item)"
              />
            </div>
          </el-card>
        </div>
      </div>

      <!-- Blacklist tab -->
      <div v-if="activeTab === 'blacklist'">
        <el-card shadow="never" class="blacklist-card">
          <template #header>
            <div class="blacklist-header">
              <div class="blacklist-title">
                <el-icon :size="20" color="var(--el-color-danger)"><Delete /></el-icon>
                <div>
                  <div class="bl-title-text">偷菜黑名单</div>
                  <div class="bl-title-sub">加入黑名单的蔬菜在自动偷菜时会被跳过，但不会影响自己种植</div>
                </div>
              </div>
              <div class="blacklist-actions">
                <el-button
                  type="warning"
                  plain
                  :loading="batchLoading"
                  :disabled="list.length === 0"
                  @click="handleAddAllToBlacklist"
                >
                  <el-icon v-if="!batchLoading"><Plus /></el-icon>
                  一键全部加入黑名单
                </el-button>
                <el-button
                  v-if="blacklist.length > 0"
                  type="danger"
                  plain
                  :loading="batchLoading"
                  @click="handleClearBlacklist"
                >
                  <el-icon><Delete /></el-icon>
                  清空黑名单
                </el-button>
              </div>
            </div>
          </template>

          <el-empty v-if="blacklist.length === 0" description="暂无黑名单蔬菜" />

          <div v-else class="blacklist-list">
            <div
              v-for="seedId in blacklist"
              :key="seedId"
              class="blacklist-item"
            >
              <div class="blacklist-item-info">
                <div class="crop-icon-box">
                  <img
                    v-if="list.find(i => i.seedId === seedId)?.image"
                    :src="list.find(i => i.seedId === seedId)?.image"
                    class="crop-img"
                    loading="lazy"
                  >
                  <el-icon v-else :size="20" color="var(--el-text-color-placeholder)"><Sunny /></el-icon>
                </div>
                <div>
                  <div class="bl-item-name">{{ getSeedNameById(seedId) }}</div>
                  <div class="bl-item-id">ID: {{ seedId }}</div>
                </div>
              </div>
              <el-button
                type="danger"
                plain
                size="small"
                @click="plantBlacklistStore.removeFromBlacklist(seedId)"
              >
                移出黑名单
              </el-button>
            </div>
          </div>
        </el-card>
      </div>

      <!-- Strategy tab -->
      <div v-if="activeTab === 'strategy'">
        <el-card shadow="never" class="strategy-section-card">
          <template #header>
            <div class="strategy-section-header">
              <div class="strategy-section-title">
                <el-icon :size="20" color="var(--el-color-primary)"><TrendCharts /></el-icon>
                <div>
                  <div class="strat-title-text">策略推荐</div>
                  <div class="strat-title-sub">根据等级推荐最优种植策略</div>
                </div>
              </div>
              <div class="strategy-level-input">
                <span class="level-label">参考等级:</span>
                <el-input-number v-model="strategyLevel" :min="1" :max="100" :controls="false" size="small" style="width: 80px" />
              </div>
            </div>
          </template>

          <div class="strategy-grid">
            <el-card
              v-for="strategy in strategies"
              :key="strategy.key"
              shadow="hover"
              :class="getColorClasses(strategy.color).card"
              class="strategy-item-card"
            >
              <div class="strategy-card-inner">
                <div class="strategy-card-header" :class="getColorClasses(strategy.color).header">
                  <el-icon :size="16" color="#fff"><component :is="strategy.icon" /></el-icon>
                  <span class="strategy-label" :class="getColorClasses(strategy.color).text">{{ strategy.label }}</span>
                </div>

                <template v-if="getStrategyBestPlant(strategy.key)">
                  <div class="strategy-plant-info">
                    <div class="crop-icon-box strategy-icon-box" :class="getColorClasses(strategy.color).border">
                      <img
                        v-if="getStrategyBestPlant(strategy.key)?.image && !imageErrors[getStrategyBestPlant(strategy.key)?.seedId]"
                        :src="getStrategyBestPlant(strategy.key)?.image"
                        class="crop-img"
                        loading="lazy"
                        @error="imageErrors[getStrategyBestPlant(strategy.key)?.seedId] = true"
                      >
                      <el-icon v-else :size="18" color="var(--el-text-color-placeholder)"><Sunny /></el-icon>
                    </div>
                    <div class="strategy-plant-detail">
                      <div class="strategy-plant-name">{{ getStrategyBestPlant(strategy.key)?.name }}</div>
                      <div class="strategy-plant-level">Lv{{ formatLv(getStrategyBestPlant(strategy.key)?.level) }}</div>
                    </div>
                  </div>
                  <div class="strategy-metric-box">
                    <span class="strategy-metric-label">{{ strategy.unit }}/时</span>
                    <span class="strategy-metric-value" :class="getColorClasses(strategy.color).value">
                      {{ getStrategyBestPlant(strategy.key)?.[strategy.metric] }}
                    </span>
                  </div>
                </template>
                <el-empty v-else description="暂无可种植作物" :image-size="40" />
              </div>
            </el-card>
          </div>

          <div class="strategy-footer-hint">
            <el-icon><InfoFilled /></el-icon>
            <span>可种植 {{ getStrategyAvailableCount() }}/{{ list.length }} 种作物 · 策略计算与设置页面种植策略一致</span>
          </div>
        </el-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.analytics-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tab-badge {
  margin-left: 4px;
}

.tab-content {
  min-height: 200px;
}

.loading-wrapper {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

/* ===== Crops Tab ===== */
.crops-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.crops-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.crops-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.crops-title-text {
  font-weight: 600;
  font-size: 14px;
}

.crops-title-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.crops-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.search-input {
  width: 240px;
}

.filter-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.sort-label {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.sort-select {
  width: 160px;
}

.order-select {
  width: 90px;
}

/* Desktop table */
.crops-table {
  display: none;
}

@media (min-width: 640px) {
  .crops-table {
    display: table;
  }
  .mobile-crops-list {
    display: none;
  }
}

.crop-name-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.crop-icon-box {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-light);
  overflow: hidden;
}

.crop-img {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.crop-name {
  font-weight: 700;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.blacklist-tag {
  margin-left: 4px;
}

.crop-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.crop-id {
  font-size: 10px;
  color: var(--el-text-color-placeholder);
}

.time-cell {
  display: flex;
  flex-direction: column;
}

.time-main {
  font-weight: 500;
}

.time-sub {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.metric-purple {
  color: var(--el-color-purple);
  font-weight: 700;
}

.metric-blue {
  color: var(--el-color-primary);
  font-weight: 700;
}

.metric-amber {
  color: var(--el-color-warning-dark-2);
  font-weight: 700;
}

.metric-green {
  color: var(--el-color-success);
  font-weight: 700;
}

/* Mobile card list */
.mobile-crops-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mobile-crop-card {
  margin-bottom: 0;
}

.mobile-crop-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.mobile-crop-info {
  flex: 1;
  min-width: 0;
}

.crop-seasons {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.mobile-crop-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
  margin-bottom: 12px;
}

.mobile-stat {
  display: flex;
  flex-direction: column;
}

.mobile-stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mobile-stat-value {
  font-size: 13px;
  font-weight: 500;
}

.mobile-crop-action {
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
}

/* ===== Blacklist Tab ===== */
.blacklist-card :deep(.el-card__header) {
  padding: 16px;
}

.blacklist-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.blacklist-title {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.bl-title-text {
  font-weight: 600;
  font-size: 14px;
}

.bl-title-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.blacklist-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.blacklist-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.blacklist-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 12px 16px;
}

.blacklist-item-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bl-item-name {
  font-size: 14px;
  font-weight: 500;
}

.bl-item-id {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

/* ===== Strategy Tab ===== */
.strategy-section-card :deep(.el-card__header) {
  padding: 16px;
}

.strategy-section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.strategy-section-title {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.strat-title-text {
  font-weight: 600;
  font-size: 14px;
}

.strat-title-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.strategy-level-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.level-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.strategy-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

@media (min-width: 1024px) {
  .strategy-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.strategy-item-card {
  margin-bottom: 0;
}

.strategy-card-inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.strategy-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.strategy-card-header--purple {
  background: linear-gradient(135deg, #a855f7, #9333ea);
  padding: 6px;
  border-radius: 8px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.strategy-card-header--blue {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  padding: 6px;
  border-radius: 8px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.strategy-card-header--amber {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  padding: 6px;
  border-radius: 8px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.strategy-card-header--green {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  padding: 6px;
  border-radius: 8px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.strategy-label {
  font-size: 14px;
  font-weight: 600;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.strategy-text--purple {
  color: var(--el-color-purple);
}

.strategy-text--blue {
  color: var(--el-color-primary);
}

.strategy-text--amber {
  color: var(--el-color-warning-dark-2);
}

.strategy-text--green {
  color: var(--el-color-success);
}

.strategy-plant-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.strategy-icon-box {
  width: 40px;
  height: 40px;
}

.strategy-border--purple {
  border-color: var(--el-color-purple-light-5);
}

.strategy-border--blue {
  border-color: var(--el-color-primary-light-5);
}

.strategy-border--amber {
  border-color: var(--el-color-warning-light-5);
}

.strategy-border--green {
  border-color: var(--el-color-success-light-5);
}

.strategy-plant-detail {
  flex: 1;
  min-width: 0;
}

.strategy-plant-name {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.strategy-plant-level {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.strategy-metric-box {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  padding: 6px 8px;
}

.strategy-metric-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.strategy-metric-value {
  font-size: 16px;
  font-weight: 700;
}

.strategy-value--purple {
  color: var(--el-color-purple);
}

.strategy-value--blue {
  color: var(--el-color-primary);
}

.strategy-value--amber {
  color: var(--el-color-warning-dark-2);
}

.strategy-value--green {
  color: var(--el-color-success);
}

.strategy-footer-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* Strategy card borders */
.strategy-card--purple {
  border-color: var(--el-color-purple-light-5);
}

.strategy-card--blue {
  border-color: var(--el-color-primary-light-5);
}

.strategy-card--amber {
  border-color: var(--el-color-warning-light-5);
}

.strategy-card--green {
  border-color: var(--el-color-success-light-5);
}

/* El-empty compact override for strategy cards */
.strategy-card-inner .el-empty {
  padding: 12px 0;
}

.strategy-card-inner .el-empty .el-empty__description p {
  font-size: 12px;
}
</style>
