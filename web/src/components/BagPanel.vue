<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Box, Close, Check, Loading, Link } from '@element-plus/icons-vue'
import { useAccountStore } from '@/stores/account'
import { useBagStore } from '@/stores/bag'
import { useStatusStore } from '@/stores/status'

const accountStore = useAccountStore()
const bagStore = useBagStore()
const statusStore = useStatusStore()

const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { items, loading: bagLoading, originalItems } = storeToRefs(bagStore)
const { status, loading: statusLoading, error: statusError, realtimeConnected } = storeToRefs(statusStore)

const imageErrors = ref<Record<string | number, boolean>>({})

const CATEGORY_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '果实', value: 'fruit' },
  { label: '种子', value: 'seed' },
  { label: '道具', value: 'tool' },
  { label: '其他', value: 'other' },
] as const

type CategoryValue = typeof CATEGORY_OPTIONS[number]['value']

const selectedCategory = ref<CategoryValue>('fruit')

function getItemCategory(item: any): CategoryValue {
  const itemType = Number(item?.itemType || 0)
  if (itemType === 17 || itemType === 6)
    return 'fruit'
  if (itemType === 5)
    return 'seed'
  if (itemType === 11)
    return 'tool'
  return 'other'
}

function getCategoryLabel(item: any) {
  const category = getItemCategory(item)
  return CATEGORY_OPTIONS.find(cat => cat.value === category)?.label || '其他'
}

const filteredItems = computed(() => {
  if (selectedCategory.value === 'all')
    return items.value
  return items.value.filter((item: any) => getItemCategory(item) === selectedCategory.value)
})

const categoryCounts = computed(() => {
  const counts: Record<CategoryValue, number> = { all: items.value.length, fruit: 0, seed: 0, tool: 0, other: 0 }
  for (const item of items.value) {
    const cat = getItemCategory(item)
    counts[cat]++
  }
  return counts
})

const batchMode = ref(false)
const selectedForBatch = ref<Set<number>>(new Set())
const batchSellResult = ref<{ gold: number, goldBean: number } | null>(null)

const selectedSellableCount = computed(() => {
  return selectedForBatch.value.size
})

function getPriceClass(item: any): string {
  const priceId = Number(item?.priceId || 0)
  if (priceId === 1005)
    return 'price-amber'
  if (priceId === 1002)
    return 'price-sky'
  return 'price-gray'
}

function canSell(item: any) {
  const itemType = Number(item?.itemType || 0)
  return itemType === 17 || itemType === 6
}

function canBatchSell(item: any) {
  return canSell(item) && Number(item.count || 0) > 0
}

function canUse(item: any) {
  const itemType = Number(item?.itemType || 0)
  return itemType === 11
}

function handleSellClick(item: any) {
  if (batchMode.value) {
    const isSelected = selectedForBatch.value.has(Number(item.id))
    if (isSelected) {
      selectedForBatch.value.delete(Number(item.id))
    }
    else {
      selectedForBatch.value.add(Number(item.id))
    }
    return
  }
  const totalPrice = (Number(item.count) || 0) * (Number(item.price) || 0)
  const priceUnit = item.priceUnit || '金'
  const messages = [
    `确定要出售全部${item.name || `物品${item.id}`}吗?`,
    `数量：${item.count || 0}`,
  ]
  if (totalPrice > 0) {
    messages.push(`售出总金币：${totalPrice}${priceUnit}`)
  }

  ElMessageBox.confirm(
    messages.join('\n'),
    '确认出售',
    {
      confirmButtonText: '确认出售',
      cancelButtonText: '取消',
      type: 'warning',
    },
  ).then(() => {
    doSell(item)
  }).catch(() => {
    // cancelled
  })
}

async function doSell(item: any) {
  if (!currentAccountId.value)
    return

  const sellItems = originalItems.value
    .filter((it: any) => Number(it.id) === Number(item.id))
    .map((it: any) => ({ id: it.id, count: it.count, uid: it.uid || 0 }))

  if (sellItems.length === 0) {
    ElMessage.error('未找到可出售的物品')
    return
  }

  try {
    const res = await bagStore.sellItems(currentAccountId.value, sellItems)
    if (res.ok) {
      ElMessage.success(`已出售 ${item.name || `物品${item.id}`}`)
      await loadBag()
    }
    else {
      ElMessage.error(`出售失败: ${res.error || '未知错误'}`)
    }
  }
  catch (e: any) {
    ElMessage.error(`操作失败: ${e.message || '未知错误'}`)
  }
}

function handleUseClick(item: any) {
  ElMessageBox.confirm(
    `确定要使用全部 ${item.name || `物品${item.id}`} 吗?\n数量：${item.count || 0}`,
    '确认使用',
    {
      confirmButtonText: '确认使用',
      cancelButtonText: '取消',
      type: 'info',
    },
  ).then(() => {
    doUse(item)
  }).catch(() => {
    // cancelled
  })
}

async function doUse(item: any) {
  if (!currentAccountId.value)
    return

  try {
    const res = await bagStore.useItem(currentAccountId.value, Number(item.id), Number(item.count || 1))
    if (res.ok) {
      ElMessage.success(`已使用 ${item.name || `物品${item.id}`}`)
      await loadBag()
    }
    else {
      ElMessage.error(`使用失败: ${res.error || '未知错误'}`)
    }
  }
  catch (e: any) {
    ElMessage.error(`操作失败: ${e.message || '未知错误'}`)
  }
}

function toggleBatchMode() {
  batchMode.value = !batchMode.value
  if (!batchMode.value) {
    selectedForBatch.value.clear()
    batchSellResult.value = null
  }
}

function selectAllSellable() {
  selectedForBatch.value.clear()
  for (const item of filteredItems.value) {
    if (canBatchSell(item)) {
      selectedForBatch.value.add(Number(item.id))
    }
  }
}

function handleBatchSellClick() {
  const sellableItems = filteredItems.value.filter((item: any) => canBatchSell(item))
  if (sellableItems.length === 0) {
    ElMessage.warning('没有可批量出售的物品')
    return
  }
  const selectedList = Array.from(selectedForBatch.value)
  if (selectedList.length === 0) {
    ElMessage.warning('请先选择要出售的物品')
    return
  }

  const itemsToSell = originalItems.value
    .filter((it: any) => selectedList.includes(Number(it.id)))
    .map((it: any) => ({ id: it.id, count: it.count, uid: it.uid || 0 }))

  let totalGold = 0
  let totalGoldBean = 0
  for (const it of itemsToSell) {
    const item = filteredItems.value.find((f: any) => Number(f.id) === Number(it.id))
    if (item) {
      const price = Number(item.price) || 0
      const count = Number(item.count) || 0
      const priceId = Number(item.priceId) || 0
      if (priceId === 1005) {
        totalGoldBean += price * count
      }
      else {
        totalGold += price * count
      }
    }
  }

  const messages = [
    `确定要批量出售选中的 ${selectedList.length} 种物品吗?`,
  ]
  if (totalGold > 0) {
    messages.push(`金币：${totalGold}`)
  }
  if (totalGoldBean > 0) {
    messages.push(`金豆豆：${totalGoldBean}`)
  }

  ElMessageBox.confirm(
    messages.join('\n'),
    '批量出售',
    {
      confirmButtonText: '确认出售',
      cancelButtonText: '取消',
      type: 'warning',
    },
  ).then(() => {
    doBatchSell(itemsToSell, selectedList)
  }).catch(() => {
    // cancelled
  })
}

async function doBatchSell(itemsToSell: any[], selectedList: number[]) {
  if (!currentAccountId.value)
    return

  try {
    const res = await bagStore.sellItems(currentAccountId.value, itemsToSell)
    if (res.ok) {
      let totalGold = 0
      let totalGoldBean = 0
      for (const sid of selectedList) {
        const fi = filteredItems.value.find((f: any) => Number(f.id) === sid)
        if (fi) {
          const price = Number(fi.price) || 0
          const count = Number(fi.count) || 0
          const priceId = Number(fi.priceId) || 0
          if (priceId === 1005) {
            totalGoldBean += price * count
          }
          else {
            totalGold += price * count
          }
        }
      }
      batchSellResult.value = { gold: totalGold, goldBean: totalGoldBean }
      ElMessage.success(`已批量出售 ${selectedList.length} 种物品，获得 ${totalGold} 金币, ${totalGoldBean} 金豆豆`)
      selectedForBatch.value.clear()
      batchMode.value = false
      await loadBag()
    }
    else {
      ElMessage.error(`批量出售失败: ${res.error || '未知错误'}`)
    }
  }
  catch (e: any) {
    ElMessage.error(`操作失败: ${e.message || '未知错误'}`)
  }
}

async function loadBag() {
  if (!currentAccountId.value)
    return

  const acc = currentAccount.value
  if (!acc)
    return

  if (!realtimeConnected.value)
    await statusStore.fetchStatus(currentAccountId.value)

  if (acc.running && status.value?.connection?.connected)
    await bagStore.fetchBag(currentAccountId.value)

  imageErrors.value = {}
}

onMounted(() => {
  loadBag()
})

watch(currentAccountId, () => {
  loadBag()
})

useIntervalFn(loadBag, 60000)
</script>

<template>
  <div class="bag-panel">
    <div class="panel-header">
      <h2 class="panel-title">
        <el-icon><Box /></el-icon>
        背包
      </h2>
      <div v-if="items.length" class="item-count">
        共 {{ items.length }} 种物品
      </div>
    </div>

    <div v-if="bagLoading || statusLoading" class="loading-wrapper">
      <el-icon class="is-loading" :size="40" color="#409eff">
        <Loading />
      </el-icon>
    </div>

    <el-empty
      v-else-if="!currentAccountId"
      description="请选择账号后查看背包"
    />

    <el-alert
      v-else-if="statusError"
      type="error"
      show-icon
      :closable="false"
    >
      <template #title>
        <span class="error-title">获取数据失败</span>
      </template>
      {{ statusError }}
    </el-alert>

    <el-empty
      v-else-if="!status?.connection?.connected"
      description="请先运行账号或检查网络连接"
    >
      <template #image>
        <el-icon :size="40" color="#9ca3af"><Link /></el-icon>
      </template>
    </el-empty>

    <el-empty
      v-else-if="items.length === 0"
      description="无可展示物品"
    />

    <div v-else>
      <div class="filter-bar">
        <el-radio-group v-model="selectedCategory" size="default">
          <el-radio-button
            v-for="cat in CATEGORY_OPTIONS"
            :key="cat.value"
            :value="cat.value"
          >
            {{ cat.label }} ({{ categoryCounts[cat.value] || 0 }})
          </el-radio-button>
        </el-radio-group>

        <div class="filter-spacer" />

        <template v-if="selectedCategory === 'fruit' || selectedCategory === 'all'">
          <el-button
            :type="batchMode ? 'warning' : 'default'"
            @click="toggleBatchMode"
          >
            <el-icon v-if="batchMode"><Close /></el-icon>
            {{ batchMode ? '取消批量' : '批量出售' }}
          </el-button>
          <template v-if="batchMode">
            <el-button type="primary" @click="selectAllSellable">
              全选
            </el-button>
            <el-button
              :type="selectedSellableCount > 0 ? 'danger' : 'default'"
              :disabled="selectedSellableCount === 0"
              @click="handleBatchSellClick"
            >
              出售 ({{ selectedSellableCount }})
            </el-button>
          </template>
        </template>
      </div>

      <div class="item-grid">
        <el-card
          v-for="item in filteredItems"
          :key="item.id"
          shadow="hover"
          :body-style="{ padding: '0' }"
          class="item-card"
          :class="{
            'item-selected': batchMode && selectedForBatch.has(Number(item.id)),
            'item-dimmed': batchMode && canBatchSell(item) && !selectedForBatch.has(Number(item.id)),
          }"
          @click="batchMode && canBatchSell(item) && handleSellClick(item)"
        >
          <div class="item-card-inner">
            <div class="item-topline">
              <span class="item-id">#{{ item.id }}</span>
              <span class="item-category">{{ getCategoryLabel(item) }}</span>
            </div>

            <div class="item-main">
              <div class="thumb-wrap">
                <img
                  v-if="item.image && !imageErrors[item.id]"
                  :src="item.image"
                  :alt="item.name"
                  class="thumb-image"
                  loading="lazy"
                  @error="imageErrors[item.id] = true"
                >
                <div v-else class="thumb-fallback">
                  {{ (item.name || '物').slice(0, 1) }}
                </div>
              </div>

              <div class="item-info">
                <div class="item-name" :title="item.name">
                  {{ item.name || `物品${item.id}` }}
                </div>
                <div class="item-subline">
                  <span>类型 {{ item.itemType || 0 }}</span>
                  <span v-if="item.level > 0">Lv{{ item.level }}</span>
                  <span v-if="item.uid">UID {{ item.uid }}</span>
                </div>
              </div>
            </div>

            <div class="item-bottom">
              <div class="quantity-block">
                <span>{{ item.hoursText ? '时长' : '数量' }}</span>
                <strong :class="item.hoursText ? 'has-hours' : ''">
                  {{ item.hoursText || `x${item.count || 0}` }}
                </strong>
              </div>

              <div class="value-block">
                <span>{{ item.price > 0 ? '单价' : '价值' }}</span>
                <strong v-if="item.price > 0" :class="getPriceClass(item)">
                  {{ item.price }}{{ item.priceUnit || '金' }}
                </strong>
                <strong v-else class="price-gray">-</strong>
              </div>
            </div>

            <div class="item-actions">
              <template v-if="!batchMode">
                <el-button
                  v-if="canSell(item)"
                  type="danger"
                  size="small"
                  round
                  title="出售全部"
                  @click.stop="handleSellClick(item)"
                >
                  出售
                </el-button>
                <el-button
                  v-if="canUse(item)"
                  type="success"
                  size="small"
                  round
                  title="使用全部"
                  @click.stop="handleUseClick(item)"
                >
                  使用
                </el-button>
              </template>
              <el-checkbox
                v-else-if="canBatchSell(item)"
                :model-value="selectedForBatch.has(Number(item.id))"
                @click.stop
                @change="handleSellClick(item)"
              />
              <el-icon v-if="batchMode && selectedForBatch.has(Number(item.id))" class="selected-icon">
                <Check />
              </el-icon>
            </div>
          </div>
        </el-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bag-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 24px;
  font-weight: bold;
  margin: 0;
}

.item-count {
  font-size: 14px;
  color: #6b7280;
}

.loading-wrapper {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.error-title {
  font-size: 18px;
  font-weight: bold;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.filter-spacer {
  flex: 1;
}

.item-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

@media (min-width: 640px) {
  .item-grid {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  }
}

@media (min-width: 768px) {
  .item-grid {
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }
}

@media (min-width: 1024px) {
  .item-grid {
    grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  }
}

@media (min-width: 1280px) {
  .item-grid {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  }
}

.item-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(158, 180, 151, 0.28) !important;
  border-radius: 18px !important;
  background:
    radial-gradient(circle at 90% 0%, rgba(214, 155, 67, 0.12), transparent 32%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(248, 251, 246, 0.7)) !important;
  box-shadow: 0 16px 36px rgba(42, 58, 42, 0.07) !important;
  cursor: default;
  transition: opacity 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.item-card:hover {
  transform: translateY(-2px);
  border-color: rgba(194, 145, 75, 0.34) !important;
  box-shadow: 0 22px 48px rgba(42, 58, 42, 0.11) !important;
}

.item-card.item-dimmed {
  opacity: 0.48;
}

.item-card.item-selected {
  border-color: rgba(214, 155, 67, 0.72) !important;
  outline: 2px solid rgba(214, 155, 67, 0.34);
  outline-offset: 2px;
  opacity: 1;
}

.item-card-inner {
  position: relative;
  display: flex;
  min-height: 154px;
  flex-direction: column;
  padding: 14px;
}

.item-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.item-id,
.item-category {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 760;
  line-height: 1;
  white-space: nowrap;
}

.item-id {
  border: 1px solid rgba(158, 180, 151, 0.24);
  background: rgba(255, 255, 255, 0.64);
  padding: 5px 8px;
  color: var(--app-text-muted);
  font-family: monospace;
}

.item-category {
  background: rgba(194, 145, 75, 0.12);
  padding: 5px 9px;
  color: #9f6a24;
}

.item-main {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  margin-top: 14px;
}

.thumb-wrap {
  height: 70px;
  width: 70px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(158, 180, 151, 0.22);
  border-radius: 18px;
  background:
    radial-gradient(circle at 50% 28%, rgba(255, 255, 255, 0.98), rgba(239, 246, 235, 0.74));
  box-shadow: inset 0 -10px 20px rgba(95, 143, 99, 0.08), 0 12px 26px rgba(42, 58, 42, 0.08);
}

.thumb-image {
  max-height: 76%;
  max-width: 76%;
  object-fit: contain;
}

.thumb-fallback {
  font-size: 24px;
  font-weight: bold;
  color: #9ca3af;
  text-transform: uppercase;
}

.item-info {
  min-width: 0;
}

.item-name {
  width: 100%;
  color: var(--app-text);
  font-size: 15px;
  font-weight: 850;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-subline {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 7px;
}

.item-subline span {
  border-radius: 999px;
  background: rgba(95, 143, 99, 0.08);
  padding: 3px 7px;
  color: var(--app-text-muted);
  font-size: 11px;
  font-weight: 650;
}

.item-bottom {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}

.quantity-block,
.value-block {
  min-width: 0;
  border: 1px solid rgba(158, 180, 151, 0.18);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.46);
  padding: 8px 10px;
}

.quantity-block span,
.value-block span {
  display: block;
  color: var(--app-text-muted);
  font-size: 10px;
  font-weight: 700;
}

.quantity-block strong,
.value-block strong {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: var(--app-text);
  font-size: 13px;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.price-amber {
  color: #b7791f !important;
}

.price-sky {
  color: #2f78a8 !important;
}

.price-gray {
  color: var(--app-text-muted) !important;
}

.has-hours {
  color: #2f78a8 !important;
}

.item-actions {
  display: flex;
  min-height: 28px;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  margin-top: auto;
  padding-top: 12px;
}

.item-actions :deep(.el-button) {
  min-height: 28px;
  padding: 6px 12px;
  border-radius: 999px !important;
  font-weight: 760;
}

.selected-icon {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 999px;
  background: rgba(214, 155, 67, 0.16);
  color: #9f6a24;
}

.item-actions :deep(.el-checkbox__inner) {
  border-radius: 7px;
}

.thumb-wrap.fallback img {
  display: none;
}

.thumb-wrap.fallback::after {
  content: attr(data-fallback);
  font-size: 1.5rem;
  font-weight: bold;
  color: #9ca3af;
  text-transform: uppercase;
}

@media (max-width: 520px) {
  .item-grid {
    grid-template-columns: 1fr;
  }
}
</style>
