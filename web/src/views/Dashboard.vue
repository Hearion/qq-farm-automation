<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import {
  Document,
  Search,
  Delete,
  Timer,
  Opportunity,
  Avatar,
  Position,
  DataLine,
  WarningFilled,
  MagicStick,
  Place,
  ShoppingCart,
  CircleCheck,
  Clock,
  Link,
  User,
  Lightning,
  Coin,
  Ticket,
  Star,
  StarFilled,
  Loading,
  Coffee,
  Scissor,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'
import { useAccountStore } from '@/stores/account'
import { useBagStore } from '@/stores/bag'
import { useStatusStore } from '@/stores/status'

const statusStore = useStatusStore()
const accountStore = useAccountStore()
const bagStore = useBagStore()
const {
  status,
  logs: statusLogs,
  accountLogs: statusAccountLogs,
  realtimeConnected,
} = storeToRefs(statusStore)
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { dashboardItems } = storeToRefs(bagStore)
const logContainer = ref<any>(null)
const autoScroll = ref(true)
const lastBagFetchAt = ref(0)
const clearingLogs = ref(false)

const allLogs = computed(() => {
  const sLogs = statusLogs.value || []
  const aLogs = (statusAccountLogs.value || []).map((l: any) => ({
    ts: new Date(l.time).getTime(),
    time: l.time,
    tag: l.action === 'Error' ? '错误' : '系统',
    msg: l.reason ? `${l.msg} (${l.reason})` : l.msg,
  }))

  return [...sLogs, ...aLogs].sort((a: any, b: any) => a.ts - b.ts)
})

const filter = reactive({
  module: '',
  event: '',
  keyword: '',
  isWarn: '',
})

const hasActiveLogFilter = computed(() =>
  !!(filter.module || filter.event || filter.keyword || filter.isWarn),
)

const modules = [
  { label: '所有模块', value: '' },
  { label: '农场', value: 'farm' },
  { label: '好友', value: 'friend' },
  { label: '仓库', value: 'warehouse' },
  { label: '任务', value: 'task' },
  { label: '系统', value: 'system' },
]

const events = [
  { label: '所有事件', value: '' },
  { label: '农场巡查', value: 'farm_cycle' },
  { label: '收获作物', value: 'harvest_crop' },
  { label: '清理枯株', value: 'remove_plant' },
  { label: '种植种子', value: 'plant_seed' },
  { label: '施加化肥', value: 'fertilize' },
  { label: '土地推送', value: 'lands_notify' },
  { label: '选择种子', value: 'seed_pick' },
  { label: '购买种子', value: 'seed_buy' },
  { label: '购买化肥', value: 'fertilizer_buy' },
  { label: '开启礼包', value: 'fertilizer_gift_open' },
  { label: '获取任务', value: 'task_scan' },
  { label: '完成任务', value: 'task_claim' },
  { label: '免费礼包', value: 'mall_free_gifts' },
  { label: '分享奖励', value: 'daily_share' },
  { label: '会员礼包', value: 'vip_daily_gift' },
  { label: '月卡礼包', value: 'month_card_gift' },
  { label: '图鉴奖励', value: 'illustrated_rewards' },
  { label: '邮箱领取', value: 'email_rewards' },
  { label: '出售成功', value: 'sell_success' },
  { label: '土地升级', value: 'upgrade_land' },
  { label: '土地解锁', value: 'unlock_land' },
  { label: '好友巡查', value: 'friend_cycle' },
  { label: '访问好友', value: 'visit_friend' },
]

const eventLabelMap: Record<string, string> = Object.fromEntries(
  events.filter(e => e.value).map(e => [e.value, e.label]),
)

function getEventLabel(event: string) {
  return eventLabelMap[event] || event
}

const logLevels = [
  { label: '所有等级', value: '' },
  { label: '普通', value: 'info' },
  { label: '警告', value: 'warn' },
]

const displayName = computed(() => {
  const account = accountStore.currentAccount

  // Try to use nickname from status (game server)
  const gameName = status.value?.status?.name
  if (gameName) {
    if (account?.name) {
      return `${gameName} (${account.name})`
    }
    return gameName
  }

  // Check login status
  if (!status.value?.connection?.connected) {
    if (account) {
      if (account.name && account.nick) {
        return `${account.nick} (${account.name})`
      }
      return account.name || account.nick || '未登录'
    }
    return '未登录'
  }

  // Fallback to account name (usually ID) or '未命名'
  if (account) {
    if (account.name && account.nick) {
      return `${account.nick} (${account.name})`
    }
    return account.name || account.nick || '未命名'
  }
  return '未命名'
})

// Exp Rate & Time to Level
const expRate = computed(() => {
  const gain = status.value?.sessionExpGained || 0
  const uptime = status.value?.uptime || 0
  if (!uptime)
    return '0/时'
  const hours = uptime / 3600
  const rate = hours > 0 ? (gain / hours) : 0
  return `${Math.floor(rate)}/时`
})

const timeToLevel = computed(() => {
  const gain = status.value?.sessionExpGained || 0
  const uptime = status.value?.uptime || 0
  const current = status.value?.levelProgress?.current || 0
  const needed = status.value?.levelProgress?.needed || 0

  if (!needed || !uptime || gain <= 0)
    return ''

  const hours = uptime / 3600
  const ratePerHour = hours > 0 ? (gain / hours) : 0
  if (ratePerHour <= 0)
    return ''

  const expNeeded = needed - current
  const minsToLevel = expNeeded / (ratePerHour / 60)

  if (minsToLevel < 60)
    return `约 ${Math.ceil(minsToLevel)} 分钟后升级`
  return `约 ${(minsToLevel / 60).toFixed(1)} 小时后升级`
})

// Fertilizer & Collection
const fertilizerNormal = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 1011))
const fertilizerOrganic = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 1012))
const collectionNormal = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 3001))
const collectionRare = computed(() => dashboardItems.value.find((i: any) => Number(i.id) === 3002))

function formatBucketTime(item: any) {
  if (!item)
    return '0.0h'
  if (item.hoursText)
    return item.hoursText.replace('小时', 'h')
  const count = Number(item.count || 0)
  return `${(count / 3600).toFixed(1)}h`
}

// Next Check Countdown
const nextFarmCheck = ref('--:--:--')
const nextHelpCheck = ref('--:--:--')
const nextStealCheck = ref('--:--:--')
const localUptime = ref(0)
let localNextFarmRemainSec = 0
let localNextHelpRemainSec = 0
let localNextStealRemainSec = 0

function updateCountdowns() {
  // Update uptime
  if (!status.value?.connection?.connected) {
    nextFarmCheck.value = '账号未登录'
    nextHelpCheck.value = '账号未登录'
    nextStealCheck.value = '账号未登录'
  }
  else {
    localUptime.value++
    if (localNextFarmRemainSec > 0) {
      localNextFarmRemainSec--
      nextFarmCheck.value = formatDuration(localNextFarmRemainSec)
    }
    else {
      nextFarmCheck.value = '巡查中...'
    }

    if (localNextHelpRemainSec > 0) {
      localNextHelpRemainSec--
      nextHelpCheck.value = formatDuration(localNextHelpRemainSec)
    }
    else {
      nextHelpCheck.value = '巡查中...'
    }

    if (localNextStealRemainSec > 0) {
      localNextStealRemainSec--
      nextStealCheck.value = formatDuration(localNextStealRemainSec)
    }
    else {
      nextStealCheck.value = '巡查中...'
    }
  }
}

watch(status, (newVal) => {
  if (newVal?.nextChecks) {
    localNextFarmRemainSec = newVal.nextChecks.farmRemainSec || 0
    localNextHelpRemainSec = newVal.nextChecks.helpRemainSec || 0
    localNextStealRemainSec = newVal.nextChecks.stealRemainSec || 0
    updateCountdowns()
  }
  if (newVal?.uptime !== undefined) {
    localUptime.value = newVal.uptime
  }
}, { deep: true })

function formatDuration(seconds: number) {
  if (seconds <= 0)
    return '00:00:00'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  const pad = (n: number) => n.toString().padStart(2, '0')

  if (d > 0)
    return `${d}天 ${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function getLogTagType(tag: string) {
  if (tag === '错误') return 'danger'
  if (tag === '系统') return ''
  if (tag === '警告') return 'warning'
  return 'success'
}

function formatLogTime(timeStr: string) {
  if (!timeStr)
    return ''
  const parts = timeStr.split(' ')
  return parts.length > 1 ? parts[1] : timeStr
}

const OP_META: Record<string, { label: string, icon: any, color: string }> = {
  harvest: { label: '收获', icon: Opportunity, color: '#67c23a' },
  water: { label: '浇水', icon: Coffee, color: '#409eff' },
  weed: { label: '除草', icon: Scissor, color: '#e6a23c' },
  bug: { label: '除虫', icon: WarningFilled, color: '#f56c6c' },
  fertilize: { label: '施肥', icon: MagicStick, color: '#53a8ff' },
  plant: { label: '种植', icon: Place, color: '#95d475' },
  steal: { label: '偷菜', icon: Position, color: '#e6a23c' },
  helpWater: { label: '帮浇水', icon: Coffee, color: '#79bbff' },
  helpWeed: { label: '帮除草', icon: Scissor, color: '#eebe77' },
  helpBug: { label: '帮除虫', icon: WarningFilled, color: '#fab6b6' },
  taskClaim: { label: '任务', icon: CircleCheck, color: '#7c3aed' },
  sell: { label: '出售', icon: ShoppingCart, color: '#f472b6' },
}

const filteredOperations = computed(() => {
  const ops = status.value?.operations || {}
  const result: Record<string, number> = {}
  for (const key of Object.keys(ops)) {
    if (key !== 'upgrade' && key !== 'levelUp') {
      result[key] = ops[key]
    }
  }
  return result
})

function getOpName(key: string | number) {
  return OP_META[String(key)]?.label || String(key)
}

function getOpIcon(key: string | number) {
  return OP_META[String(key)]?.icon || Clock
}

function getOpColor(key: string | number) {
  return OP_META[String(key)]?.color || '#909399'
}

function getExpPercent(p: any) {
  if (!p || !p.needed)
    return 0
  return Math.min(100, Math.max(0, (p.current / p.needed) * 100))
}

async function refreshBag(force = false) {
  if (!currentAccountId.value)
    return
  if (!currentAccount.value?.running)
    return
  if (!status.value?.connection?.connected)
    return

  const now = Date.now()
  if (!force && now - lastBagFetchAt.value < 2500)
    return
  lastBagFetchAt.value = now
  await bagStore.fetchBag(currentAccountId.value)
}

async function refresh(forceReloadLogs = false) {
  if (currentAccountId.value) {
    const acc = currentAccount.value
    if (!acc)
      return

    if (!realtimeConnected.value) {
      await statusStore.fetchStatus(currentAccountId.value)
      await statusStore.fetchAccountLogs()
    }

    if (forceReloadLogs || hasActiveLogFilter.value || !realtimeConnected.value) {
      await statusStore.fetchLogs(currentAccountId.value, {
        module: filter.module || undefined,
        event: filter.event || undefined,
        keyword: filter.keyword || undefined,
        isWarn: filter.isWarn === 'warn' ? true : filter.isWarn === 'info' ? false : undefined,
      })
    }

    await refreshBag()
  }
}

function onLogFilterChange() {
  refresh(true)
}

function onLogSearchTrigger() {
  refresh(true)
}

watch(currentAccountId, async () => {
  await refresh()
  scrollToBottom()
})

watch(() => status.value?.connection?.connected, (connected) => {
  if (connected)
    refreshBag(true)
})

watch(() => JSON.stringify(status.value?.operations || {}), (next, prev) => {
  if (!realtimeConnected.value || next === prev)
    return
  refreshBag()
})

watch(hasActiveLogFilter, (enabled) => {
  statusStore.setRealtimeLogsEnabled(!enabled)
  refresh()
})

function onLogScroll(e: Event) {
  const payload = e as any
  const wrap = logContainer.value?.wrapRef
  const scrollHeight = payload?.scrollHeight ?? wrap?.scrollHeight
  const scrollTop = payload?.scrollTop ?? wrap?.scrollTop
  const clientHeight = wrap?.clientHeight
  if (!scrollHeight || scrollTop === undefined || !clientHeight)
    return
  const isNearBottom = scrollHeight - scrollTop - clientHeight < 50
  autoScroll.value = isNearBottom
}

function setLogScrollToBottom() {
  const scrollbar = logContainer.value as any
  const wrap = scrollbar?.wrapRef
  if (scrollbar && wrap) {
    scrollbar.setScrollTop(wrap.scrollHeight)
  }
}

async function handleClearLogs() {
  try {
    await ElMessageBox.confirm(
      '确定要清空所有日志吗？此操作不可撤销。',
      '清空日志',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  }
  catch {
    return
  }

  if (!currentAccountId.value)
    return
  clearingLogs.value = true
  try {
    const { data } = await api.delete('/api/logs')
    if (data?.ok) {
      ElMessage.success('日志已清空')
      await refresh(true)
    }
    else {
      ElMessage.error(`清空失败: ${data?.error || '未知错误'}`)
    }
  }
  catch (e: any) {
    const msg = e?.response?.data?.error || e?.message || '请求失败'
    ElMessage.error(`清空失败: ${msg}`)
  }
  finally {
    clearingLogs.value = false
  }
}

// Auto scroll logs
watch(allLogs, () => {
  nextTick(() => {
    if (autoScroll.value) {
      requestAnimationFrame(() => {
        requestAnimationFrame(setLogScrollToBottom)
      })
    }
  })
}, { deep: true })

function scrollToBottom() {
  nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(setLogScrollToBottom)
    })
  })
}

onMounted(async () => {
  statusStore.setRealtimeLogsEnabled(!hasActiveLogFilter.value)
  await refresh()
  autoScroll.value = true
  scrollToBottom()
})

// Auto refresh fallback every 10s (WS disconnected or filter enabled falls back to HTTP)
useIntervalFn(refresh, 10000)
// Countdown timer (every 1s)
useIntervalFn(updateCountdowns, 1000)
</script>

<template>
  <div class="dashboard-wrapper">
    <!-- Status Cards -->
    <div class="status-cards">
      <!-- Account & Exp -->
      <el-card shadow="hover" class="status-card">
        <div class="card-header-row">
          <div class="card-label">
            <el-icon><User /></el-icon>
            <span>账号</span>
          </div>
          <el-tag size="small" effect="plain" round>
            Lv.{{ status?.status?.level || 0 }}
          </el-tag>
        </div>
        <div class="account-name" :title="displayName">
          {{ displayName }}
        </div>

        <!-- Level Progress -->
        <div class="exp-section">
          <div class="exp-header">
            <div class="exp-label">
              <el-icon :style="{ color: 'var(--el-color-primary)' }"><Lightning /></el-icon>
              <span>EXP</span>
            </div>
            <span class="exp-values">{{ status?.levelProgress?.current || 0 }} / {{ status?.levelProgress?.needed || '?' }}</span>
          </div>
          <el-progress
            :percentage="getExpPercent(status?.levelProgress)"
            :stroke-width="6"
            :show-text="false"
            color="var(--el-color-primary)"
          />
          <div class="exp-footer">
            <span>效率: {{ expRate }}</span>
            <span>{{ timeToLevel }}</span>
          </div>
        </div>
      </el-card>

      <!-- Assets & Status -->
      <el-card shadow="hover" class="status-card">
        <div class="assets-row">
          <div class="asset-item">
            <div class="asset-label">
              <el-icon color="#e6a23c"><Coin /></el-icon>
              <span>金币</span>
            </div>
            <div class="asset-value gold-value">
              {{ status?.status?.gold || 0 }}
            </div>
            <div
              v-if="(status?.sessionGoldGained || 0) !== 0"
              class="asset-delta"
              :class="(status?.sessionGoldGained || 0) > 0 ? 'delta-positive' : 'delta-negative'"
            >
              {{ (status?.sessionGoldGained || 0) > 0 ? '+' : '' }}{{ status?.sessionGoldGained || 0 }}
            </div>
          </div>
          <div class="asset-item asset-right">
            <div class="asset-label">
              <el-icon color="#67c23a"><Ticket /></el-icon>
              <span>点券</span>
            </div>
            <div class="asset-value coupon-value">
              {{ status?.status?.coupon || 0 }}
            </div>
            <div
              v-if="(status?.sessionCouponGained || 0) !== 0"
              class="asset-delta"
              :class="(status?.sessionCouponGained || 0) > 0 ? 'delta-positive' : 'delta-negative'"
            >
              {{ (status?.sessionCouponGained || 0) > 0 ? '+' : '' }}{{ status?.sessionCouponGained || 0 }}
            </div>
          </div>
          <div class="asset-item asset-right">
            <div class="asset-label">
              <el-icon color="#e6a23c"><Coin /></el-icon>
              <span>金豆豆</span>
            </div>
            <div class="asset-value bean-value">
              {{ status?.status?.goldBean || 0 }}
            </div>
          </div>
        </div>
        <div class="connection-row">
          <div class="connection-status">
            <span class="status-dot" :class="status?.connection?.connected ? 'dot-online' : 'dot-offline'" />
            <span class="status-text">{{ status?.connection?.connected ? '在线' : '离线' }}</span>
          </div>
          <div class="uptime-display">
            <el-icon color="#9b59b6"><Clock /></el-icon>
            <span>{{ formatDuration(localUptime) }}</span>
          </div>
        </div>
      </el-card>

      <!-- Items (Fertilizer & Collection) -->
      <el-card shadow="hover" class="status-card">
        <div class="section-label">
          <el-icon color="#67c23a"><MagicStick /></el-icon>
          <span>化肥容器</span>
        </div>
        <div class="items-grid">
          <div class="item-cell">
            <div class="item-label">
              <el-icon color="#67c23a"><MagicStick /></el-icon>
              <span>普通</span>
            </div>
            <div class="item-value">
              {{ formatBucketTime(fertilizerNormal) }}
            </div>
          </div>
          <div class="item-cell">
            <div class="item-label">
              <el-icon color="#67c23a"><MagicStick /></el-icon>
              <span>有机</span>
            </div>
            <div class="item-value">
              {{ formatBucketTime(fertilizerOrganic) }}
            </div>
          </div>
        </div>
        <el-divider class="card-divider" />
        <div class="section-label">
          <el-icon color="#67c23a"><Star /></el-icon>
          <span>收藏点</span>
        </div>
        <div class="items-grid">
          <div class="item-cell">
            <div class="item-label">
              <el-icon color="#67c23a"><StarFilled /></el-icon>
              <span>普通</span>
            </div>
            <div class="item-value">
              {{ collectionNormal?.count || 0 }}
            </div>
          </div>
          <div class="item-cell">
            <div class="item-label">
              <el-icon color="#67c23a"><Coin /></el-icon>
              <span>典藏</span>
            </div>
            <div class="item-value">
              {{ collectionRare?.count || 0 }}
            </div>
          </div>
        </div>
      </el-card>
    </div>

    <!-- Main Content Flex -->
    <div class="main-content">
      <!-- Logs (Left Column) -->
      <div class="logs-column">
        <el-card shadow="hover" class="logs-card">
          <div class="logs-header">
            <h3 class="section-title">
              <el-icon><Document /></el-icon>
              <span>运行日志</span>
            </h3>

            <el-form :inline="true" class="filter-form" @submit.prevent>
              <el-form-item>
                <el-select
                  v-model="filter.module"
                  placeholder="所有模块"
                  style="width: 130px"
                  @change="onLogFilterChange"
                >
                  <el-option
                    v-for="opt in modules"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </el-form-item>

              <el-form-item>
                <el-select
                  v-model="filter.event"
                  placeholder="所有事件"
                  style="width: 130px"
                  @change="onLogFilterChange"
                >
                  <el-option
                    v-for="opt in events"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </el-form-item>

              <el-form-item>
                <el-select
                  v-model="filter.isWarn"
                  placeholder="所有等级"
                  style="width: 130px"
                  @change="onLogFilterChange"
                >
                  <el-option
                    v-for="opt in logLevels"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </el-form-item>

              <el-form-item>
                <el-input
                  v-model="filter.keyword"
                  placeholder="关键词..."
                  clearable
                  style="width: 130px"
                  @keyup.enter="onLogSearchTrigger"
                  @clear="onLogSearchTrigger"
                />
              </el-form-item>

              <el-form-item>
                <el-button type="primary" @click="onLogSearchTrigger">
                  <el-icon><Search /></el-icon>
                </el-button>
              </el-form-item>

              <el-form-item>
                <el-button @click="handleClearLogs" :loading="clearingLogs">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </el-form-item>
            </el-form>
          </div>

          <el-scrollbar ref="logContainer" class="log-scrollbar" @scroll="onLogScroll">
            <div class="log-content">
              <el-empty v-if="!allLogs.length" description="暂无日志" :image-size="60" />
              <div v-for="log in allLogs" :key="log.ts + log.msg" class="log-line">
                <span class="log-time">[{{ formatLogTime(log.time) }}]</span>
                <el-tag size="small" :type="getLogTagType(log.tag)" effect="dark" class="log-tag">{{ log.tag }}</el-tag>
                <el-tag v-if="log.meta?.event" size="small" type="info" effect="plain" class="log-event">{{ getEventLabel(log.meta.event) }}</el-tag>
                <span class="log-msg" :class="{ 'log-msg-error': log.tag === '错误' }">{{ log.msg }}</span>
              </div>
            </div>
          </el-scrollbar>
        </el-card>
      </div>

      <!-- Right Column Stack -->
      <div class="right-column">
        <!-- Next Checks -->
        <el-card shadow="hover" class="countdown-card">
          <h3 class="section-title">
            <el-icon><Timer /></el-icon>
            <span>下次巡查倒计时</span>
          </h3>
          <div class="countdown-list">
            <div class="countdown-item">
              <div class="countdown-label">
                <el-icon color="#67c23a" :size="18"><Opportunity /></el-icon>
                <span>农场</span>
              </div>
              <div class="countdown-value">
                {{ nextFarmCheck }}
              </div>
            </div>
            <div class="countdown-item">
              <div class="countdown-label">
                <el-icon color="#409eff" :size="18"><Avatar /></el-icon>
                <span>帮助</span>
              </div>
              <div class="countdown-value">
                {{ nextHelpCheck }}
              </div>
            </div>
            <div class="countdown-item">
              <div class="countdown-label">
                <el-icon color="#e6a23c" :size="18"><Position /></el-icon>
                <span>偷菜</span>
              </div>
              <div class="countdown-value">
                {{ nextStealCheck }}
              </div>
            </div>
          </div>
        </el-card>

        <!-- Operations Grid -->
        <el-card shadow="hover" class="operations-card">
          <h3 class="section-title">
            <el-icon><DataLine /></el-icon>
            <span>今日统计</span>
          </h3>
          <div v-if="!status?.connection?.connected" class="offline-state">
            <el-empty :image-size="48" description="">
              <template #description>
                <div class="offline-text">
                  <div class="offline-title">账号未登录</div>
                  <div class="offline-sub">请先运行账号或检查网络连接</div>
                </div>
              </template>
            </el-empty>
          </div>
          <div v-else class="operations-grid">
            <div
              v-for="(val, key) in filteredOperations"
              :key="key"
              class="op-item"
            >
              <div class="op-info">
                <el-icon :size="16" :color="getOpColor(key)">
                  <component :is="getOpIcon(key)" />
                </el-icon>
                <span class="op-name">{{ getOpName(key) }}</span>
              </div>
              <span class="op-value">{{ val }}</span>
            </div>
          </div>
        </el-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-wrapper {
  height: calc(100dvh - 52px);
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-top: 0;
  overflow: hidden;
}

/* Status Cards Grid */
.status-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  flex-shrink: 0;
}

@media (max-width: 1024px) {
  .status-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .status-cards {
    grid-template-columns: 1fr;
  }
}

.status-card {
  display: flex;
  flex-direction: column;
  position: relative;
}

.status-card::after {
  content: none;
}

/* Card Header Row */
.card-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}

.card-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.account-name {
  margin-bottom: 4px;
  color: var(--app-text);
  font-size: 22px;
  font-weight: 800;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Exp Section */
.exp-section {
  margin-top: auto;
}

.exp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.exp-label {
  display: flex;
  align-items: center;
  gap: 4px;
}

.exp-values {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.exp-footer {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  margin-top: 8px;
}

/* Assets Row */
.assets-row {
  display: flex;
  justify-content: space-between;
}

.asset-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.asset-right {
  text-align: right;
}

.asset-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.asset-right .asset-label {
  justify-content: flex-end;
}

.asset-value {
  font-size: 27px;
  font-weight: 800;
  text-shadow: none;
}

.gold-value {
  color: #e6a23c;
}

.coupon-value {
  color: #67c23a;
}

.bean-value {
  color: #e6a23c;
}

.asset-delta {
  font-size: 10px;
}

.delta-positive {
  color: var(--el-color-success);
}

.delta-negative {
  color: var(--el-color-danger);
}

/* Connection Row */
.connection-row {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.dot-online {
  background-color: var(--el-color-success);
}

.dot-offline {
  background-color: var(--el-color-danger);
}

.status-text {
  font-size: 12px;
  font-weight: 700;
}

.uptime-display {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

/* Section Label */
.section-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.items-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.item-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.item-value {
  font-weight: 700;
}

.card-divider {
  margin: 8px 0;
}

/* Section Title */
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 500;
  margin: 0 0 16px 0;
}

/* Main Content Layout */
.main-content {
  display: flex;
  flex: 1;
  gap: 24px;
  min-height: 0;
  overflow: hidden;
}

@media (max-width: 768px) {
  .main-content {
    flex-direction: column;
  }
}

.logs-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
  min-height: 0;
}

.logs-card {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.logs-card :deep(.el-card__body) {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  padding: 18px;
}

.logs-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 16px;
}

@media (min-width: 640px) {
  .logs-header {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

.filter-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}

.filter-form :deep(.el-form-item) {
  margin-bottom: 0;
  margin-right: 0;
}

/* Log Scrollbar */
.log-scrollbar {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.log-content {
  min-height: 100%;
  padding: 16px;
  font-size: 13px;
  line-height: 1.6;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.48);
}

.log-line {
  margin-bottom: 4px;
  border-bottom: 1px solid var(--app-border);
  padding-bottom: 4px;
  word-break: break-all;
}

.log-time {
  margin-right: 8px;
  user-select: none;
  color: var(--el-text-color-placeholder);
}

.log-tag {
  margin-right: 8px;
}

.log-event {
  margin-right: 8px;
}

.log-msg {
  color: var(--el-text-color-regular);
}

.log-msg-error {
  color: var(--el-color-danger);
}

/* Right Column */
.right-column {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 25%;
  min-width: 260px;
  min-height: 0;
  overflow: hidden;
}

@media (max-width: 768px) {
  .right-column {
    width: 100%;
  }
}

/* Countdown */
.countdown-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.countdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.44);
  padding: 10px 12px;
  box-shadow: none;
}

.countdown-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-regular);
}

.countdown-value {
  font-size: 18px;
  font-weight: 700;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
}

/* Operations */
.operations-card {
  flex: 1;
  min-height: 0;
}

.operations-card :deep(.el-card__body) {
  min-height: 0;
  overflow: auto;
}

.offline-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.offline-text {
  text-align: center;
}

.offline-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.offline-sub {
  margin-top: 4px;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

.operations-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

@media (min-width: 1536px) {
  .operations-grid {
    gap: 12px;
  }
}

.op-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.48);
}

.op-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.op-name {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

@media (min-width: 1536px) {
  .op-name {
    font-size: 14px;
  }
}

.op-value {
  font-size: 14px;
  font-weight: 700;
}

@media (min-width: 1536px) {
  .op-value {
    font-size: 16px;
  }
}
</style>
