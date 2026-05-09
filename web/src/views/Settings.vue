<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { ArrowDown, ArrowUp, Lock, Setting, SwitchButton, User } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import AccountModal from '@/components/AccountModal.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { getAccountAvatarUrl, getAccountQq, getPlatformClass, getPlatformLabel, useAccountStore } from '@/stores/account'
import { useFarmStore } from '@/stores/farm'
import { useSettingStore } from '@/stores/setting'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const accountStore = useAccountStore()
const userStore = useUserStore()
const settingStore = useSettingStore()
const farmStore = useFarmStore()

const activeTab = ref<'account' | 'strategy' | 'automation' | 'user'>(
  (localStorage.getItem('settings-active-tab') as 'account' | 'strategy' | 'automation' | 'user') || 'account'
)

watch(activeTab, (newTab) => {
  localStorage.setItem('settings-active-tab', newTab)
})

const tabs = [
  { key: 'account', label: '账号管理' },
  { key: 'strategy', label: '策略设置' },
  { key: 'automation', label: '自动控制' },
  { key: 'user', label: '用户管理' },
] as const

const modalVisible = ref(false)
const modalConfig = ref({
  title: '',
  message: '',
  type: 'primary' as 'primary' | 'danger',
  isAlert: true,
})

function showAlert(message: string, type: 'primary' | 'danger' = 'primary') {
  modalConfig.value = {
    title: type === 'danger' ? '错误' : '提示',
    message,
    type,
    isAlert: true,
  }
  modalVisible.value = true
}

// ==================== 账号管理 ====================
const { accounts, loading: accountsLoading, currentAccountId } = storeToRefs(accountStore)

const showModal = ref(false)
const showDeleteConfirm = ref(false)
const deleteLoading = ref(false)
const editingAccount = ref<any>(null)
const accountToDelete = ref<any>(null)
const showClearStoppedConfirm = ref(false)
const clearStoppedLoading = ref(false)

const isAccountOpsDisabled = computed(() => !userStore.isAdmin && userStore.isExpired)
const quotaLimit = computed(() => {
  const limit = userStore.accountLimit
  if (limit === undefined || limit === null)
    return 3
  return limit
})
const isOverQuota = computed(() => {
  if (userStore.isAdmin)
    return false
  const limit = quotaLimit.value
  if (limit === -1)
    return false
  return accounts.value.length >= limit
})
const isAddAccountDisabled = computed(() => isAccountOpsDisabled.value || isOverQuota.value)
const addAccountDisabledReason = computed(() => {
  if (isAccountOpsDisabled.value)
    return '账号已到期，无法添加账号'
  if (isOverQuota.value)
    return '已超过配额，无法添加账号'
  return ''
})

const stoppedAccounts = computed(() => accounts.value.filter((acc: any) => !acc.running))
const stoppedAccountsCount = computed(() => stoppedAccounts.value.length)

onMounted(async () => {
  await accountStore.fetchAccounts()
  if (!currentAccountId.value && accounts.value.length > 0 && accounts.value[0]) {
    accountStore.selectAccount(String(accounts.value[0].id))
  }
  if (currentAccountId.value) {
    await settingStore.fetchSettings(currentAccountId.value)
    syncLocalStrategySettings()
    syncLocalAutomationSettings()
    syncLocalOfflineSettings()
    await farmStore.fetchSeeds(currentAccountId.value)
  }
})

useIntervalFn(() => {
  accountStore.fetchAccounts()
}, 3000)

async function openSettings(account: any) {
  const accountId = String(account.id)
  const isSameAccount = String(currentAccountId.value) === accountId
  accountStore.selectAccount(accountId)
  activeTab.value = 'strategy'
  if (router.currentRoute.value.path !== '/settings') {
    router.push('/settings')
  }
  if (isSameAccount) {
    await loadStrategyData()
    syncLocalAutomationSettings()
    syncLocalOfflineSettings()
  }
}

function openAddModal() {
  editingAccount.value = null
  showModal.value = true
}

function openEditModal(account: any) {
  editingAccount.value = { ...account }
  showModal.value = true
}

async function handleDelete(account: any) {
  accountToDelete.value = account
  showDeleteConfirm.value = true
}

async function confirmDelete() {
  if (accountToDelete.value) {
    try {
      deleteLoading.value = true
      await accountStore.deleteAccount(accountToDelete.value.id)
      accountToDelete.value = null
      showDeleteConfirm.value = false
    }
    finally {
      deleteLoading.value = false
    }
  }
}

async function toggleAccount(account: any) {
  if (account.running) {
    await accountStore.stopAccount(account.id)
  }
  else {
    await accountStore.startAccount(account.id)
  }
}

function handleSaved() {
  accountStore.fetchAccounts()
}

function selectAccount(account: any) {
  if (!account || !account.id)
    return
  accountStore.selectAccount(String(account.id))
}

function openClearStoppedConfirm() {
  if (stoppedAccountsCount.value === 0) {
    showAlert('没有已停止的账号需要清理', 'primary')
    return
  }
  showClearStoppedConfirm.value = true
}

async function confirmClearStopped() {
  clearStoppedLoading.value = true
  try {
    const stoppedIds = stoppedAccounts.value.map((acc: any) => acc.id)
    let deletedCount = 0
    for (const id of stoppedIds) {
      try {
        await accountStore.deleteAccount(id)
        deletedCount++
      }
      catch (e) {
        console.error(`删除账号 ${id} 失败:`, e)
      }
    }
    showClearStoppedConfirm.value = false
    showAlert(`成功清理 ${deletedCount} 个已停止的账号`, 'primary')
    await accountStore.fetchAccounts()
  }
  finally {
    clearStoppedLoading.value = false
  }
}

// ==================== 策略设置 ====================
const { settings, loading: settingsLoading } = storeToRefs(settingStore)
const { seeds } = storeToRefs(farmStore)

const strategySaving = ref(false)

const currentAccountName = computed(() => {
  const acc = accounts.value.find((a: any) => a.id === currentAccountId.value)
  return acc ? (acc.name || acc.nick || acc.id) : null
})

const localStrategySettings = ref({
  plantingStrategy: 'max_exp',
  preferredSeedId: 0,
  bagSeedPriority: [] as number[],
  bagSeedFallbackStrategy: 'level',
  stealDelaySeconds: 0,
  plantOrderRandom: false,
  plantDelaySeconds: 0,
  intervals: { farmMin: 2, farmMax: 5, helpMin: 10, helpMax: 15, stealMin: 10, stealMax: 15 },
  friendQuietHours: { enabled: false, start: '23:00', end: '07:00' },
})

const plantingStrategyOptions = [
  { label: '优先种植种子', value: 'preferred' },
  { label: '最高等级作物', value: 'level' },
  { label: '最大经验/时', value: 'max_exp' },
  { label: '最大普通肥经验/时', value: 'max_fert_exp' },
  { label: '最大净利润/时', value: 'max_profit' },
  { label: '最大普通肥净利润/时', value: 'max_fert_profit' },
  { label: '背包种子优先', value: 'bag_priority' },
]

const BAG_FALLBACK_STRATEGY_OPTIONS = [
  { label: '最高等级作物', value: 'level' },
  { label: '最大经验/时', value: 'max_exp' },
  { label: '最大普通肥经验/时', value: 'max_fert_exp' },
  { label: '最大净利润/时', value: 'max_profit' },
  { label: '最大普通肥净利润/时', value: 'max_fert_profit' },
  { label: '优先种植种子', value: 'preferred' },
]

interface BagSeedItem {
  seedId: number
  name: string
  count: number
  requiredLevel: number
  plantSize: number
  image?: string
}

const bagSeeds = ref<BagSeedItem[]>([])
const bagSeedsLoading = ref(false)
const bagSeedsError = ref<string | null>(null)
const draggingBagSeedId = ref<number | null>(null)
const bagSeedImageErrors = ref<Record<number, boolean>>({})

const sortedBagSeeds = computed(() => {
  const priority = localStrategySettings.value.bagSeedPriority || []
  const indexMap = new Map<number, number>()
  priority.forEach((seedId, index) => indexMap.set(seedId, index))

  return [...bagSeeds.value].sort((a, b) => {
    const aIndex = indexMap.has(a.seedId) ? indexMap.get(a.seedId)! : Number.MAX_SAFE_INTEGER
    const bIndex = indexMap.has(b.seedId) ? indexMap.get(b.seedId)! : Number.MAX_SAFE_INTEGER
    if (aIndex !== bIndex)
      return aIndex - bIndex
    if (a.requiredLevel !== b.requiredLevel)
      return b.requiredLevel - a.requiredLevel
    return a.seedId - b.seedId
  })
})

async function fetchBagSeeds() {
  if (!currentAccountId.value)
    return
  bagSeedsLoading.value = true
  bagSeedsError.value = null
  try {
    const res = await api.get('/api/bag/seeds', {
      headers: { 'x-account-id': currentAccountId.value },
    })
    if (res.data.ok) {
      bagSeeds.value = (res.data.data || []).filter((s: BagSeedItem) => Number(s.plantSize || 1) === 1)
      bagSeedImageErrors.value = {}
    }
  }
  catch (e: any) {
    bagSeedsError.value = e.message || '加载失败'
  }
  finally {
    bagSeedsLoading.value = false
  }
}

function resetBagSeedPriority() {
  localStrategySettings.value.bagSeedPriority = []
}

function getCurrentBagSeedOrder() {
  return sortedBagSeeds.value.map(seed => seed.seedId)
}

function moveBagSeed(seedId: number, direction: -1 | 1) {
  const nextOrder = getCurrentBagSeedOrder()
  const index = nextOrder.indexOf(seedId)
  const targetIndex = index + direction
  if (index < 0 || targetIndex < 0 || targetIndex >= nextOrder.length)
    return

  const temp = nextOrder[index]!
  nextOrder[index] = nextOrder[targetIndex]!
  nextOrder[targetIndex] = temp
  localStrategySettings.value.bagSeedPriority = nextOrder
}

function startBagSeedDrag(seedId: number, event: DragEvent) {
  draggingBagSeedId.value = seedId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(seedId))
  }
}

function dragOverBagSeed(_seedId: number, event: DragEvent) {
  if (draggingBagSeedId.value === null)
    return
  event.preventDefault()
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = 'move'
}

function dropBagSeed(seedId: number, event: DragEvent) {
  event.preventDefault()
  const sourceSeedId = draggingBagSeedId.value ?? Number(event.dataTransfer?.getData('text/plain') || '')
  if (!sourceSeedId || sourceSeedId === seedId) {
    draggingBagSeedId.value = null
    return
  }

  const nextOrder = getCurrentBagSeedOrder()
  const sourceIndex = nextOrder.indexOf(sourceSeedId)
  const targetIndex = nextOrder.indexOf(seedId)

  if (sourceIndex < 0 || targetIndex < 0) {
    draggingBagSeedId.value = null
    return
  }

  const temp = nextOrder[sourceIndex]
  nextOrder.splice(sourceIndex, 1)
  const newTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
  nextOrder.splice(newTargetIndex, 0, temp!)

  localStrategySettings.value.bagSeedPriority = nextOrder
  draggingBagSeedId.value = null
}

watchEffect(() => {
  if (localStrategySettings.value.plantingStrategy === 'bag_priority' && currentAccountId.value) {
    fetchBagSeeds()
  }
})

const preferredSeedOptions = computed(() => {
  const options: { label: string; value: number; disabled?: boolean }[] = [{ label: '自动选择', value: 0, disabled: false }]
  if (seeds.value) {
    options.push(...seeds.value.map(seed => ({
      label: `${seed.requiredLevel}级 ${seed.name} (${seed.price}金)`,
      value: seed.seedId,
      disabled: seed.locked || seed.soldOut,
    })))
  }
  return options
})

const analyticsSortByMap: Record<string, string> = {
  max_exp: 'exp',
  max_fert_exp: 'fert',
  max_profit: 'profit',
  max_fert_profit: 'fert_profit',
}

const strategyPreviewLabel = ref<string | null>(null)

watchEffect(async () => {
  let strategy = localStrategySettings.value.plantingStrategy
  if (strategy === 'preferred') {
    strategyPreviewLabel.value = null
    return
  }
  if (strategy === 'bag_priority') {
    strategy = localStrategySettings.value.bagSeedFallbackStrategy || 'level'
    if (strategy === 'preferred') {
      const preferredId = localStrategySettings.value.preferredSeedId
      if (preferredId > 0 && seeds.value) {
        const seed = seeds.value.find(s => s.seedId === preferredId)
        if (seed) {
          strategyPreviewLabel.value = `${seed.requiredLevel}级 ${seed.name}`
        }
        else {
          strategyPreviewLabel.value = '未选择优先种子'
        }
      }
      else {
        strategyPreviewLabel.value = '未选择优先种子'
      }
      return
    }
  }
  if (!seeds.value || seeds.value.length === 0) {
    strategyPreviewLabel.value = null
    return
  }
  const available = seeds.value.filter(s => !s.locked && !s.soldOut)
  if (available.length === 0) {
    strategyPreviewLabel.value = '暂无可用种子'
    return
  }
  if (strategy === 'level') {
    const best = [...available].sort((a, b) => b.requiredLevel - a.requiredLevel)[0]
    strategyPreviewLabel.value = best ? `${best.requiredLevel}级 ${best.name}` : null
    return
  }
  const sortBy = analyticsSortByMap[strategy]
  if (sortBy) {
    try {
      const res = await api.get(`/api/analytics?sort=${sortBy}`)
      const rankings: any[] = res.data.ok ? (res.data.data || []) : []
      const availableIds = new Set(available.map(s => s.seedId))
      const match = rankings.find(r => availableIds.has(Number(r.seedId)))
      if (match) {
        const seed = available.find(s => s.seedId === Number(match.seedId))
        strategyPreviewLabel.value = seed ? `${seed.requiredLevel}级 ${seed.name}` : null
      }
      else {
        strategyPreviewLabel.value = '暂无匹配种子'
      }
    }
    catch {
      strategyPreviewLabel.value = null
    }
  }
})

function syncLocalStrategySettings() {
  if (settings.value) {
    localStrategySettings.value = JSON.parse(JSON.stringify({
      plantingStrategy: settings.value.plantingStrategy,
      preferredSeedId: settings.value.preferredSeedId,
      bagSeedPriority: settings.value.bagSeedPriority ?? [],
      bagSeedFallbackStrategy: settings.value.bagSeedFallbackStrategy ?? 'level',
      stealDelaySeconds: settings.value.stealDelaySeconds ?? 0,
      plantOrderRandom: !!settings.value.plantOrderRandom,
      plantDelaySeconds: settings.value.plantDelaySeconds ?? 0,
      intervals: settings.value.intervals,
      friendQuietHours: settings.value.friendQuietHours,
    }))
  }
}

async function loadStrategyData() {
  if (currentAccountId.value) {
    await settingStore.fetchSettings(currentAccountId.value)
    syncLocalStrategySettings()
    await farmStore.fetchSeeds(currentAccountId.value)
  }
}

async function saveStrategySettings() {
  if (!currentAccountId.value)
    return
  strategySaving.value = true
  try {
    const fullSettings = {
      ...settings.value,
      ...localStrategySettings.value,
      automation: localAutomationSettings.value.automation,
    }
    const res = await settingStore.saveSettings(currentAccountId.value, fullSettings)
    if (res.ok) {
      showAlert('策略设置已保存', 'primary')
    }
    else {
      showAlert(`保存失败: ${res.error}`, 'danger')
    }
  }
  finally {
    strategySaving.value = false
  }
}

watch(currentAccountId, async () => {
  if (currentAccountId.value) {
    await loadStrategyData()
    syncLocalAutomationSettings()
    syncLocalOfflineSettings()
  }
})

// ==================== 自动控制 ====================
const automationSaving = ref(false)

const allFertilizerLandTypes = ['gold', 'black', 'red', 'normal']

const fertilizerLandTypeOptions = [
  { label: '金土地', value: 'gold' },
  { label: '黑土地', value: 'black' },
  { label: '红土地', value: 'red' },
  { label: '普通土地', value: 'normal' },
]

function normalizeFertilizerLandTypes(input: unknown) {
  const source = Array.isArray(input) ? input : allFertilizerLandTypes
  const normalized: string[] = []
  for (const item of source) {
    const value = String(item || '').trim().toLowerCase()
    if (!allFertilizerLandTypes.includes(value))
      continue
    if (normalized.includes(value))
      continue
    normalized.push(value)
  }
  return normalized
}

const localAutomationSettings = ref({
  automation: {
    farm: false,
    task: false,
    sell: false,
    friend: false,
    farm_push: false,
    land_upgrade: false,
    friend_steal: false,
    friend_help: false,
    friend_bad: false,
    friend_help_exp_limit: false,
    fertilizer_gift: false,
    fertilizer_buy_organic: false,
    fertilizer_buy_normal: false,
    fertilizer: 'normal',
    skip_own_weed_bug: false,
    fertilizer_multi_season: false,
    fertilizer_land_types: [...allFertilizerLandTypes],
    fertilizer_smart_seconds: 300,
  },
  fertilizerBuyOrganicCount: 10,
  fertilizerBuyOrganicThresholdHours: 10,
  fertilizerBuyNormalCount: 10,
  fertilizerBuyNormalThresholdHours: 10,
  fertilizerBuyCheckIntervalMinutes: 30,
})

const fertilizerOptions = [
  { label: '普通 + 有机', value: 'both' },
  { label: '普通 + 快成熟有机', value: 'smart' },
  { label: '仅普通化肥', value: 'normal' },
  { label: '仅有机化肥', value: 'organic' },
  { label: '不施肥', value: 'none' },
]

function syncLocalAutomationSettings() {
  if (settings.value) {
    if (!settings.value.automation) {
      localAutomationSettings.value.automation = {
        farm: false,
        task: false,
        sell: false,
        friend: false,
        farm_push: false,
        land_upgrade: false,
        friend_steal: false,
        friend_help: false,
        friend_bad: false,
        friend_help_exp_limit: false,
        fertilizer_gift: false,
        fertilizer_buy_organic: false,
        fertilizer_buy_normal: false,
        fertilizer: 'none',
        skip_own_weed_bug: false,
        fertilizer_multi_season: false,
        fertilizer_land_types: [...allFertilizerLandTypes],
        fertilizer_smart_seconds: 300,
      }
    }
    else {
      const defaults = {
        farm: false,
        task: false,
        sell: false,
        friend: false,
        farm_push: false,
        land_upgrade: false,
        friend_steal: false,
        friend_help: false,
        friend_bad: false,
        friend_help_exp_limit: false,
        fertilizer_gift: false,
        fertilizer_buy_organic: false,
        fertilizer_buy_normal: false,
        fertilizer: 'none',
        skip_own_weed_bug: false,
        fertilizer_multi_season: false,
        fertilizer_land_types: [...allFertilizerLandTypes],
        fertilizer_smart_seconds: 300,
      }
      localAutomationSettings.value.automation = {
        ...defaults,
        ...settings.value.automation,
      }
    }
    localAutomationSettings.value.automation.fertilizer_land_types = normalizeFertilizerLandTypes(localAutomationSettings.value.automation.fertilizer_land_types)
    if (localAutomationSettings.value.automation.fertilizer_smart_seconds === undefined) {
      localAutomationSettings.value.automation.fertilizer_smart_seconds = 300
    }
    localAutomationSettings.value.fertilizerBuyOrganicCount = settings.value.fertilizerBuyOrganicCount ?? 10
    localAutomationSettings.value.fertilizerBuyOrganicThresholdHours = settings.value.fertilizerBuyOrganicThresholdHours ?? 10
    localAutomationSettings.value.fertilizerBuyNormalCount = settings.value.fertilizerBuyNormalCount ?? 10
    localAutomationSettings.value.fertilizerBuyNormalThresholdHours = settings.value.fertilizerBuyNormalThresholdHours ?? 10
    localAutomationSettings.value.fertilizerBuyCheckIntervalMinutes = settings.value.fertilizerBuyCheckIntervalMinutes ?? 30
  }
}

async function saveAutomationSettings() {
  if (!currentAccountId.value)
    return
  automationSaving.value = true
  try {
    const fullSettings = {
      ...settings.value,
      automation: localAutomationSettings.value.automation,
      fertilizerBuyOrganicCount: localAutomationSettings.value.fertilizerBuyOrganicCount,
      fertilizerBuyOrganicThresholdHours: localAutomationSettings.value.fertilizerBuyOrganicThresholdHours,
      fertilizerBuyNormalCount: localAutomationSettings.value.fertilizerBuyNormalCount,
      fertilizerBuyNormalThresholdHours: localAutomationSettings.value.fertilizerBuyNormalThresholdHours,
      fertilizerBuyCheckIntervalMinutes: localAutomationSettings.value.fertilizerBuyCheckIntervalMinutes,
    }
    const res = await settingStore.saveSettings(currentAccountId.value, fullSettings)
    if (res.ok) {
      showAlert('自动控制设置已保存', 'primary')

      // 如果启用了自动购买化肥，立即检测并购买
      if (localAutomationSettings.value.automation.fertilizer_buy_organic || localAutomationSettings.value.automation.fertilizer_buy_normal) {
        try {
          const buyRes = await api.post('/api/fertilizer/check-and-buy', {
            buyOrganic: localAutomationSettings.value.automation.fertilizer_buy_organic,
            buyNormal: localAutomationSettings.value.automation.fertilizer_buy_normal,
            organicCount: localAutomationSettings.value.fertilizerBuyOrganicCount,
            organicThresholdHours: localAutomationSettings.value.fertilizerBuyOrganicThresholdHours,
            normalCount: localAutomationSettings.value.fertilizerBuyNormalCount,
            normalThresholdHours: localAutomationSettings.value.fertilizerBuyNormalThresholdHours,
          }, {
            headers: { 'x-account-id': currentAccountId.value },
          })
          if (buyRes.data?.ok) {
            const totalBought = (buyRes.data.organicBought || 0) + (buyRes.data.normalBought || 0)
            if (totalBought > 0) {
              showAlert(`已自动购买 ${totalBought} 个化肥`, 'primary')
            }
          }
        }
        catch (e) {
          console.error('检测购买化肥失败', e)
        }
      }
    }
    else {
      showAlert(`保存失败: ${res.error}`, 'danger')
    }
  }
  finally {
    automationSaving.value = false
  }
}

// ==================== 用户管理 ====================
const passwordSaving = ref(false)
const offlineSaving = ref(false)
const offlineTesting = ref(false)

const passwordForm = ref({
  old: '',
  new: '',
  confirm: '',
})

const localOffline = ref({
  channel: 'webhook',
  reloginUrlMode: 'none',
  endpoint: '',
  token: '',
  title: '',
  msg: '',
  offlineDeleteSec: 0,
})

const channelOptions = [
  { label: 'Webhook(自定义接口)', value: 'webhook' },
  { label: 'Qmsg 酱', value: 'qmsg' },
  { label: 'Server 酱', value: 'serverchan' },
  { label: 'Push Plus', value: 'pushplus' },
  { label: 'Push Plus Hxtrip', value: 'pushplushxtrip' },
  { label: '钉钉', value: 'dingtalk' },
  { label: '企业微信', value: 'wecom' },
  { label: 'Bark', value: 'bark' },
  { label: 'Go-cqhttp', value: 'gocqhttp' },
  { label: 'OneBot', value: 'onebot' },
  { label: 'Atri', value: 'atri' },
  { label: 'PushDeer', value: 'pushdeer' },
  { label: 'iGot', value: 'igot' },
  { label: 'Telegram', value: 'telegram' },
  { label: '飞书', value: 'feishu' },
  { label: 'IFTTT', value: 'ifttt' },
  { label: '企业微信群机器人', value: 'wecombot' },
  { label: 'Discord', value: 'discord' },
  { label: 'WxPusher', value: 'wxpusher' },
]

const reloginUrlModeOptions = [
  { label: '不需要', value: 'none' },
  { label: 'QQ直链', value: 'qq_link' },
  { label: '二维码链接', value: 'qr_link' },
]

const CHANNEL_DOCS: Record<string, string> = {
  webhook: '',
  qmsg: 'https://qmsg.zendee.cn/',
  serverchan: 'https://sct.ftqq.com/',
  pushplus: 'https://www.pushplus.plus/',
  pushplushxtrip: 'https://pushplus.hxtrip.com/',
  dingtalk: 'https://open.dingtalk.com/document/group/custom-robot-access',
  wecom: 'https://guole.fun/posts/626/',
  wecombot: 'https://developer.work.weixin.qq.com/document/path/91770',
  bark: 'https://github.com/Finb/Bark',
  gocqhttp: 'https://docs.go-cqhttp.org/api/',
  onebot: 'https://docs.go-cqhttp.org/api/',
  atri: 'https://blog.tianli0.top/',
  pushdeer: 'https://www.pushdeer.com/',
  igot: 'https://push.hellyw.com/',
  telegram: 'https://core.telegram.org/bots',
  feishu: 'https://www.feishu.cn/hc/zh-CN/articles/360024984973',
  ifttt: 'https://ifttt.com/maker_webhooks',
  discord: 'https://discord.com/developers/docs/resources/webhook#execute-webhook',
  wxpusher: 'https://wxpusher.zjiecode.com/docs/#/',
}

const currentChannelDocUrl = computed(() => {
  const key = String(localOffline.value.channel || '').trim().toLowerCase()
  return CHANNEL_DOCS[key] || ''
})

function openChannelDocs() {
  const url = currentChannelDocUrl.value
  if (!url)
    return
  window.open(url, '_blank', 'noopener,noreferrer')
}

function syncLocalOfflineSettings() {
  if (settings.value?.offlineReminder) {
    localOffline.value = JSON.parse(JSON.stringify(settings.value.offlineReminder))
  }
}

watch(settings, () => {
  syncLocalOfflineSettings()
}, { deep: true })

async function handleChangePassword() {
  if (!passwordForm.value.old || !passwordForm.value.new) {
    showAlert('请填写完整', 'danger')
    return
  }
  if (passwordForm.value.new !== passwordForm.value.confirm) {
    showAlert('两次密码输入不一致', 'danger')
    return
  }
  if (passwordForm.value.new.length < 4) {
    showAlert('密码长度至少4位', 'danger')
    return
  }

  passwordSaving.value = true
  try {
    const res = await userStore.changePassword(passwordForm.value.old, passwordForm.value.new)

    if (res.ok) {
      showAlert('密码修改成功，请重新登录', 'primary')
      passwordForm.value = { old: '', new: '', confirm: '' }
      setTimeout(() => {
        userStore.logout()
        window.location.href = '/login'
      }, 1500)
    }
    else {
      showAlert(`修改失败: ${res.error || '未知错误'}`, 'danger')
    }
  }
  finally {
    passwordSaving.value = false
  }
}

async function handleSaveOffline() {
  offlineSaving.value = true
  try {
    const res = await settingStore.saveOfflineConfig(localOffline.value)

    if (res.ok) {
      showAlert('下线提醒设置已保存', 'primary')
    }
    else {
      showAlert(`保存失败: ${res.error || '未知错误'}`, 'danger')
    }
  }
  finally {
    offlineSaving.value = false
  }
}

async function handleTestOffline() {
  offlineTesting.value = true
  try {
    const { data } = await api.post('/api/settings/offline-reminder/test', localOffline.value)
    if (data?.ok) {
      showAlert('测试消息发送成功', 'primary')
    }
    else {
      showAlert(`测试失败: ${data?.error || '未知错误'}`, 'danger')
    }
  }
  catch (e: any) {
    const msg = e?.response?.data?.error || e?.message || '请求失败'
    showAlert(`测试失败: ${msg}`, 'danger')
  }
  finally {
    offlineTesting.value = false
  }
}
</script>

<template>
  <div class="settings-page">
    <div class="mb-4">
      <h1 class="text-2xl text-gray-900 font-bold dark:text-gray-100">
        设置
      </h1>
    </div>

    <div class="border border-gray-200/50 rounded-xl bg-white shadow-sm dark:border-gray-700/50 dark:bg-gray-800">
      <div class="border-b border-gray-200 dark:border-gray-700">
        <nav class="flex gap-1 p-2">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all"
            :class="activeTab === tab.key
              ? 'text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'"
            :style="activeTab === tab.key ? { backgroundColor: 'var(--theme-primary)' } : {}"
            @click="activeTab = tab.key"
          >
            <el-icon class="settings-tab-icon">
              <User v-if="tab.key === 'account'" />
              <Setting v-else-if="tab.key === 'strategy'" />
              <SwitchButton v-else-if="tab.key === 'automation'" />
              <Lock v-else />
            </el-icon>
            <span>{{ tab.label }}</span>
          </button>
        </nav>
      </div>

      <div class="p-4">
        <!-- 账号管理 -->
        <div v-if="activeTab === 'account'" class="space-y-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 class="text-lg text-gray-900 font-bold dark:text-gray-100">
              账号管理
            </h3>
            <div class="flex flex-wrap gap-2">
              <BaseButton
                v-if="userStore.isAdmin"
                variant="secondary"
                size="sm"
                :disabled="stoppedAccountsCount === 0"
                @click="openClearStoppedConfirm"
              >
                <div class="i-carbon-trash-can mr-2" />
                <span class="hidden sm:inline">一键清理</span>
                <span class="sm:hidden">清理</span>
                ({{ stoppedAccountsCount }})
              </BaseButton>
              <BaseButton
                variant="primary"
                size="sm"
                :disabled="isAddAccountDisabled"
                :title="addAccountDisabledReason"
                @click="openAddModal"
              >
                <div class="i-carbon-add mr-2" />
                添加账号
              </BaseButton>
            </div>
          </div>

          <div v-if="accountsLoading && accounts.length === 0" class="py-8 text-center text-gray-500">
            <div i-svg-spinners-90-ring-with-bg class="mb-2 inline-block text-2xl" />
            <div>加载中...</div>
          </div>

          <div v-else-if="accounts.length === 0" class="rounded-xl bg-white py-12 text-center shadow-sm dark:bg-gray-800">
            <div i-carbon-user-avatar class="mb-4 inline-block text-4xl text-gray-400" />
            <p class="mb-4 text-gray-500">
              暂无账号
            </p>
            <BaseButton
              variant="text"
              size="sm"
              :disabled="isAddAccountDisabled"
              :title="addAccountDisabledReason"
              @click="openAddModal"
            >
              立即添加
            </BaseButton>
          </div>

          <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <div
              v-for="acc in accounts"
              :key="acc.id"
              class="account-card cursor-pointer border rounded-xl bg-white p-3 shadow-sm transition-all duration-200 dark:bg-gray-800 sm:p-4"
              :class="String(currentAccountId) === String(acc.id)
                ? 'ring-2'
                : 'border-transparent'"
              :style="String(currentAccountId) === String(acc.id)
                ? { borderColor: 'var(--theme-primary)', backgroundColor: 'rgba(var(--theme-primary-rgb, 59, 130, 246), 0.1)' }
                : {}"
              @click="selectAccount(acc)"
            >
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div class="flex min-w-0 flex-1 items-center gap-3">
                  <div class="h-10 w-10 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700 sm:h-12 sm:w-12">
                    <img v-if="getAccountAvatarUrl(acc)" :src="getAccountAvatarUrl(acc)" class="h-full w-full object-cover" alt="">
                    <div v-else class="i-carbon-user text-xl text-gray-400 sm:text-2xl" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <h4 class="truncate text-base font-bold sm:text-lg">
                      {{ acc.name || acc.nick || acc.id }}
                    </h4>
                    <div class="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span
                        v-if="acc.platform"
                        class="rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight"
                        :class="getPlatformClass(acc.platform)"
                      >
                        {{ getPlatformLabel(acc.platform) }}
                      </span>
                      <span class="truncate text-xs text-gray-500 sm:text-sm">
                        {{ getAccountQq(acc) || '未绑定' }}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="flex items-center justify-end gap-2 sm:flex-col sm:items-end">
                  <span class="flex items-center gap-1 text-xs text-gray-500 sm:hidden">
                    <div class="h-2 w-2 rounded-full" :class="acc.running ? 'bg-green-500' : 'bg-gray-300'" />
                    {{ acc.running ? '运行中' : '已停止' }}
                  </span>
                  <BaseButton
                    variant="secondary"
                    size="sm"
                    class="border rounded-full shadow-sm transition-all duration-500 ease-in-out active:scale-95 sm:w-20"
                    :class="acc.running ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100 focus:ring-red-500 active:border-red-300 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 dark:focus:ring-red-500 dark:active:border-red-700' : 'border-green-200 bg-green-50 text-green-600 hover:bg-green-100 focus:ring-green-500 active:border-green-300 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 dark:focus:ring-green-500 dark:active:border-green-700'"
                    :disabled="!acc.running && isAccountOpsDisabled"
                    :title="!acc.running && isAccountOpsDisabled ? '账号已到期，无法启动账号' : ''"
                    @click.stop="toggleAccount(acc)"
                  >
                    <div :class="acc.running ? 'i-carbon-stop-filled' : 'i-carbon-play-filled'" class="mr-1" />
                    {{ acc.running ? '停止' : '启动' }}
                  </BaseButton>
                </div>
              </div>

              <div class="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-700 sm:mt-4 sm:pt-4">
                <div class="hidden items-center gap-2 text-sm text-gray-500 sm:flex">
                  <span class="flex items-center gap-1">
                    <div class="h-2 w-2 rounded-full" :class="acc.running ? 'bg-green-500' : 'bg-gray-300'" />
                    {{ acc.running ? '运行中' : '已停止' }}
                  </span>
                </div>

                <div class="flex flex-1 justify-end gap-1 sm:flex-initial sm:gap-2">
                  <BaseButton
                    variant="ghost"
                    class="account-action-btn"
                    title="设置"
                    @click.stop="openSettings(acc)"
                  >
                    <div i-carbon-settings />
                    <span>设置</span>
                  </BaseButton>
                  <BaseButton
                    variant="ghost"
                    class="account-action-btn"
                    title="编辑"
                    @click.stop="openEditModal(acc)"
                  >
                    <div i-carbon-edit />
                    <span>编辑</span>
                  </BaseButton>
                  <BaseButton
                    variant="ghost"
                    class="account-action-btn account-action-btn--danger"
                    title="删除"
                    @click.stop="handleDelete(acc)"
                  >
                    <div i-carbon-trash-can />
                    <span>删除</span>
                  </BaseButton>
                </div>
              </div>
            </div>
          </div>

          <AccountModal
            :show="showModal"
            :edit-data="editingAccount"
            @close="showModal = false"
            @saved="handleSaved"
          />

          <ConfirmModal
            :show="showDeleteConfirm"
            :loading="deleteLoading"
            title="删除账号"
            :message="accountToDelete ? `确定要删除账号 ${accountToDelete.name || accountToDelete.id} 吗?` : ''"
            confirm-text="删除"
            :is-alert="false"
            type="danger"
            @close="!deleteLoading && (showDeleteConfirm = false)"
            @cancel="!deleteLoading && (showDeleteConfirm = false)"
            @confirm="confirmDelete"
          />

          <ConfirmModal
            :show="showClearStoppedConfirm"
            :loading="clearStoppedLoading"
            title="一键清理已停止账号"
            :message="`确定要清理 ${stoppedAccountsCount} 个已停止的账号吗？此操作不可恢复！`"
            confirm-text="确认清理"
            :is-alert="false"
            type="danger"
            @close="!clearStoppedLoading && (showClearStoppedConfirm = false)"
            @cancel="!clearStoppedLoading && (showClearStoppedConfirm = false)"
            @confirm="confirmClearStopped"
          />
        </div>

        <!-- 策略设置 -->
        <div v-else-if="activeTab === 'strategy'" class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="flex items-center gap-2 text-lg text-gray-900 font-bold dark:text-gray-100">
              <div class="i-fas-cog text-lg" />
              策略设置
              <span v-if="currentAccountName" class="ml-2 text-sm text-gray-500 font-normal dark:text-gray-400">
                ({{ currentAccountName }})
              </span>
            </h3>
          </div>

          <div v-if="settingsLoading" class="py-4 text-center text-gray-500">
            <div class="i-svg-spinners-ring-resize mx-auto mb-2 text-2xl" />
            <p>加载中...</p>
          </div>

          <div v-else-if="!currentAccountId" class="py-8 text-center text-gray-500">
            <div class="i-carbon-settings-adjust mx-auto mb-2 text-3xl text-gray-400" />
            <p>请先选择账号</p>
          </div>

          <div v-else class="strategy-form space-y-4">
            <section class="strategy-section">
              <div class="strategy-section__header">
                <div>
                  <h4>种植策略</h4>
                  <p>控制种子选择和背包种子的消耗顺序。</p>
                </div>
              </div>
              <div class="strategy-grid strategy-grid--two">
                <BaseSelect
                  v-model="localStrategySettings.plantingStrategy"
                  label="种植策略"
                  :options="plantingStrategyOptions"
                />
                <BaseSelect
                  v-if="localStrategySettings.plantingStrategy === 'preferred'"
                  v-model="localStrategySettings.preferredSeedId"
                  label="优先种植种子"
                  :options="preferredSeedOptions"
                />
                <BaseSelect
                  v-else-if="localStrategySettings.plantingStrategy === 'bag_priority' && localStrategySettings.bagSeedFallbackStrategy === 'preferred'"
                  v-model="localStrategySettings.preferredSeedId"
                  label="优先种植种子"
                  :options="preferredSeedOptions"
                />
                <div v-else class="strategy-preview-field">
                  <label class="strategy-preview-field__label">
                    {{ localStrategySettings.plantingStrategy === 'bag_priority' ? '第二优先策略预览' : '策略选种预览' }}
                  </label>
                  <div class="strategy-preview">
                    <span class="truncate">{{ strategyPreviewLabel ?? '加载中...' }}</span>
                    <el-icon class="shrink-0 text-gray-400">
                      <ArrowDown />
                    </el-icon>
                  </div>
                </div>
              </div>

              <div v-if="localStrategySettings.plantingStrategy === 'bag_priority'" class="mt-4 space-y-3">
                <BaseSelect
                  v-model="localStrategySettings.bagSeedFallbackStrategy"
                  label="第二优先策略"
                  :options="BAG_FALLBACK_STRATEGY_OPTIONS"
                />
                <div class="seed-priority-panel">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div class="text-sm text-amber-900 font-semibold dark:text-amber-200">
                        背包种子优先顺序
                      </div>
                      <p class="mt-1 text-xs text-amber-700/90 dark:text-amber-300/90">
                        先按下方顺序消耗背包中的 1x1 种子；背包种子不足时，再按"第二优先策略"补种。
                      </p>
                    </div>
                    <button
                      class="rounded bg-amber-100 px-2 py-1 text-xs text-amber-700 transition hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-900/70"
                      @click="resetBagSeedPriority"
                    >
                      重置顺序
                    </button>
                  </div>
                  <div v-if="bagSeedsLoading" class="py-4 text-center text-sm text-amber-700 dark:text-amber-300">
                    加载中...
                  </div>
                  <div v-else-if="bagSeedsError" class="py-4 text-center text-sm text-red-600 dark:text-red-400">
                    {{ bagSeedsError }}
                  </div>
                  <div v-else-if="bagSeeds.length === 0" class="py-4 text-center text-sm text-amber-700 dark:text-amber-300">
                    背包中暂无 1x1 种子
                  </div>
                  <div v-else class="grid gap-2 lg:grid-cols-3 sm:grid-cols-2">
                    <div
                      v-for="(seed, index) in sortedBagSeeds"
                      :key="seed.seedId"
                      class="flex items-center gap-2 border border-amber-200 rounded-lg bg-white p-2 dark:border-amber-700/50 dark:bg-gray-800"
                      draggable="true"
                      @dragstart="startBagSeedDrag(seed.seedId, $event)"
                      @dragover.prevent="dragOverBagSeed(seed.seedId, $event)"
                      @drop="dropBagSeed(seed.seedId, $event)"
                    >
                      <div class="bag-seed-thumb">
                        <img
                          v-if="seed.image && !bagSeedImageErrors[seed.seedId]"
                          :src="seed.image"
                          :alt="seed.name"
                          class="bag-seed-thumb__image"
                          loading="lazy"
                          @error="bagSeedImageErrors[seed.seedId] = true"
                        >
                        <span v-else class="bag-seed-thumb__fallback">{{ index + 1 }}</span>
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="truncate text-sm text-gray-800 font-medium dark:text-gray-200">
                          {{ seed.name }}
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">
                          数量: {{ seed.count }} | 等级: {{ seed.requiredLevel }}
                        </div>
                      </div>
                      <div class="flex shrink-0 flex-col gap-1">
                        <button
                          class="bag-seed-order-btn"
                          :disabled="index === 0"
                          title="上移"
                          @click="moveBagSeed(seed.seedId, -1)"
                        >
                          <el-icon><ArrowUp /></el-icon>
                        </button>
                        <button
                          class="bag-seed-order-btn"
                          :disabled="index === sortedBagSeeds.length - 1"
                          title="下移"
                          @click="moveBagSeed(seed.seedId, 1)"
                        >
                          <el-icon><ArrowDown /></el-icon>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section class="strategy-section">
              <div class="strategy-section__header">
                <div>
                  <h4>巡查间隔</h4>
                  <p>单位为秒，建议最小值不要高于最大值。</p>
                </div>
              </div>
              <div class="strategy-grid strategy-grid--six">
                <BaseInput
                  v-model.number="localStrategySettings.intervals.farmMin"
                  label="农场最小"
                  type="number"
                  min="1"
                />
                <BaseInput
                  v-model.number="localStrategySettings.intervals.farmMax"
                  label="农场最大"
                  type="number"
                  min="1"
                />
                <BaseInput
                  v-model.number="localStrategySettings.intervals.helpMin"
                  label="帮助最小"
                  type="number"
                  min="1"
                />
                <BaseInput
                  v-model.number="localStrategySettings.intervals.helpMax"
                  label="帮助最大"
                  type="number"
                  min="1"
                />
                <BaseInput
                  v-model.number="localStrategySettings.intervals.stealMin"
                  label="偷菜最小"
                  type="number"
                  min="1"
                />
                <BaseInput
                  v-model.number="localStrategySettings.intervals.stealMax"
                  label="偷菜最大"
                  type="number"
                  min="1"
                />
              </div>
            </section>

            <section class="strategy-section">
              <div class="strategy-section__header strategy-section__header--inline">
                <div>
                  <h4>好友静默时段</h4>
                  <p>启用后，在设定时间内暂停好友相关巡查。</p>
                </div>
                <BaseSwitch
                  v-model="localStrategySettings.friendQuietHours.enabled"
                  label="启用"
                />
              </div>
              <div class="quiet-hours-row">
                <div class="quiet-time-field">
                  <label>开始时间</label>
                  <el-time-picker
                    v-model="localStrategySettings.friendQuietHours.start"
                    format="HH:mm"
                    value-format="HH:mm"
                    placeholder="开始"
                    :disabled="!localStrategySettings.friendQuietHours.enabled"
                    :clearable="false"
                    popper-class="settings-time-picker"
                  />
                </div>
                <span class="quiet-hours-separator">至</span>
                <div class="quiet-time-field">
                  <label>结束时间</label>
                  <el-time-picker
                    v-model="localStrategySettings.friendQuietHours.end"
                    format="HH:mm"
                    value-format="HH:mm"
                    placeholder="结束"
                    :disabled="!localStrategySettings.friendQuietHours.enabled"
                    :clearable="false"
                    popper-class="settings-time-picker"
                  />
                </div>
              </div>
            </section>

            <section class="strategy-section">
              <div class="strategy-section__header">
                <div>
                  <h4>种植与偷菜延迟</h4>
                  <p>控制单次操作之间的等待时间。</p>
                </div>
              </div>
              <div class="strategy-grid strategy-grid--three">
                <BaseSwitch
                  v-model="localStrategySettings.plantOrderRandom"
                  label="种植顺序随机"
                />
                <BaseInput
                  v-model.number="localStrategySettings.plantDelaySeconds"
                  label="种植延迟 (秒)"
                  type="number"
                  min="0"
                />
                <BaseInput
                  v-model.number="localStrategySettings.stealDelaySeconds"
                  label="偷菜延迟 (秒)"
                  type="number"
                  min="0"
                />
              </div>
            </section>

            <div class="strategy-actions">
              <BaseButton
                variant="primary"
                size="sm"
                :loading="strategySaving"
                @click="saveStrategySettings"
              >
                保存策略设置
              </BaseButton>
            </div>
          </div>
        </div>

        <!-- 自动控制 -->
        <div v-else-if="activeTab === 'automation'" class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-lg text-gray-900 font-bold dark:text-gray-100">
              自动控制
              <span v-if="currentAccountName" class="ml-2 text-sm text-gray-500 font-normal dark:text-gray-400">
                ({{ currentAccountName }})
              </span>
            </h3>
          </div>

          <div v-if="settingsLoading" class="py-4 text-center text-gray-500">
            <div class="i-svg-spinners-ring-resize mx-auto mb-2 text-2xl" />
            <p>加载中...</p>
          </div>

          <div v-else-if="!currentAccountId" class="py-8 text-center text-gray-500">
            <div class="i-carbon-settings-adjust mx-auto mb-2 text-3xl text-gray-400" />
            <p>请先选择账号</p>
          </div>

          <div v-else class="settings-form space-y-4">
            <section class="strategy-section">
              <div class="strategy-section__header">
                <div>
                  <h4>基础自动化</h4>
                  <p>控制日常农场、任务、背包出售和好友流程。</p>
                </div>
              </div>
              <div class="strategy-grid strategy-grid--six">
                <BaseSwitch v-model="localAutomationSettings.automation.farm" label="自动种植收获" />
                <BaseSwitch v-model="localAutomationSettings.automation.task" label="自动做任务" />
                <BaseSwitch v-model="localAutomationSettings.automation.sell" label="自动卖果实" />
                <BaseSwitch v-model="localAutomationSettings.automation.friend" label="自动好友互动" />
                <BaseSwitch v-model="localAutomationSettings.automation.farm_push" label="推送触发巡田" />
                <BaseSwitch v-model="localAutomationSettings.automation.land_upgrade" label="自动升级土地" />
                <BaseSwitch v-model="localAutomationSettings.automation.fertilizer_gift" label="自动填充化肥" />
                <BaseSwitch v-model="localAutomationSettings.automation.fertilizer_buy_organic" label="自动购买有机化肥" />
                <BaseSwitch v-model="localAutomationSettings.automation.fertilizer_buy_normal" label="自动购买无机化肥" />
                <BaseSwitch v-model="localAutomationSettings.automation.skip_own_weed_bug" label="不除自己草虫" />
              </div>
            </section>

            <section v-if="localAutomationSettings.automation.friend" class="strategy-section">
              <div class="strategy-section__header">
                <div>
                  <h4>好友互动</h4>
                  <p>细分好友访问时允许执行的动作。</p>
                </div>
              </div>
              <div class="strategy-grid strategy-grid--four">
                <BaseSwitch v-model="localAutomationSettings.automation.friend_steal" label="自动偷菜" />
                <BaseSwitch v-model="localAutomationSettings.automation.friend_help" label="自动帮忙" />
                <BaseSwitch v-model="localAutomationSettings.automation.friend_bad" label="自动捣乱" />
                <BaseSwitch v-model="localAutomationSettings.automation.friend_help_exp_limit" label="经验满不帮忙" />
              </div>
            </section>

            <section class="strategy-section">
              <div class="strategy-section__header">
                <div>
                  <h4>施肥策略</h4>
                  <p>设置施肥范围、补肥规则和快成熟判断。</p>
                </div>
              </div>
              <div class="automation-stack">
                <div class="fertilizer-land-panel">
                  <div class="mb-2 text-sm text-amber-800 font-medium dark:text-amber-300">
                    施肥范围
                  </div>
                  <div class="grid grid-cols-2 gap-2 md:grid-cols-4">
                    <label
                      v-for="option in fertilizerLandTypeOptions"
                      :key="option.value"
                      class="fertilizer-land-option"
                    >
                      <input
                        v-model="localAutomationSettings.automation.fertilizer_land_types"
                        :value="option.value"
                        type="checkbox"
                      >
                      <span>{{ option.label }}</span>
                    </label>
                  </div>
                  <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    施肥前会优先按土地类型过滤，仅对命中范围的地块执行施肥策略。
                  </p>
                </div>

                <div class="strategy-grid strategy-grid--two">
                  <BaseSelect
                    v-model="localAutomationSettings.automation.fertilizer"
                    label="施肥策略"
                    :options="fertilizerOptions"
                  />
                  <BaseSwitch
                    v-model="localAutomationSettings.automation.fertilizer_multi_season"
                    label="多季补肥"
                  />
                </div>

                <div v-if="localAutomationSettings.automation.fertilizer === 'smart'" class="smart-fertilizer-panel">
                  <BaseInput
                    v-model.number="localAutomationSettings.automation.fertilizer_smart_seconds"
                    label="快成熟判定秒数"
                    type="number"
                    min="30"
                    max="3600"
                  />
                  <span>距离成熟时间 <= 此秒数时施有机肥，默认 300 秒。</span>
                </div>
              </div>
            </section>

            <section v-if="localAutomationSettings.automation.fertilizer_buy_organic || localAutomationSettings.automation.fertilizer_buy_normal" class="strategy-section">
              <div class="strategy-section__header">
                <div>
                  <h4>化肥自动购买</h4>
                  <p>容器剩余低于阈值时自动购买，保存后会立即检测一次。</p>
                </div>
              </div>
              <div class="automation-stack">
                <div v-if="localAutomationSettings.automation.fertilizer_buy_organic">
                  <div class="automation-subtitle">有机化肥设置</div>
                  <div class="strategy-grid strategy-grid--two">
                    <BaseInput
                      v-model.number="localAutomationSettings.fertilizerBuyOrganicCount"
                      label="购买数量"
                      type="number"
                      min="1"
                      max="10000"
                    />
                    <BaseInput
                      v-model.number="localAutomationSettings.fertilizerBuyOrganicThresholdHours"
                      label="触发阈值 (小时)"
                      type="number"
                      min="1"
                      max="990"
                    />
                  </div>
                </div>
                <div v-if="localAutomationSettings.automation.fertilizer_buy_normal">
                  <div class="automation-subtitle">无机化肥设置</div>
                  <div class="strategy-grid strategy-grid--two">
                    <BaseInput
                      v-model.number="localAutomationSettings.fertilizerBuyNormalCount"
                      label="购买数量"
                      type="number"
                      min="1"
                      max="10000"
                    />
                    <BaseInput
                      v-model.number="localAutomationSettings.fertilizerBuyNormalThresholdHours"
                      label="触发阈值 (小时)"
                      type="number"
                      min="1"
                      max="990"
                    />
                  </div>
                </div>
                <div class="strategy-grid strategy-grid--two">
                  <BaseInput
                    v-model.number="localAutomationSettings.fertilizerBuyCheckIntervalMinutes"
                    label="检测间隔 (分钟)"
                    type="number"
                    min="1"
                    max="1440"
                  />
                </div>
              </div>
            </section>

            <div class="strategy-actions">
              <BaseButton
                variant="primary"
                size="sm"
                :loading="automationSaving"
                @click="saveAutomationSettings"
              >
                保存自动控制
              </BaseButton>
            </div>
          </div>
        </div>

        <!-- 用户管理 -->
        <div v-else-if="activeTab === 'user'" class="space-y-4">
          <h3 class="text-lg text-gray-900 font-bold dark:text-gray-100">
            用户管理
          </h3>

          <div class="settings-form space-y-4">
            <section class="strategy-section">
              <div class="strategy-section__header">
                <div>
                  <h4 class="flex items-center gap-2">
                    <span class="i-carbon-password" />
                    修改用户密码
                  </h4>
                  <p>更新当前登录用户的访问密码。</p>
                </div>
              </div>
              <div class="strategy-grid strategy-grid--three">
                <BaseInput
                  v-model="passwordForm.old"
                  label="当前密码"
                  type="password"
                  placeholder="当前用户密码"
                />
                <BaseInput
                  v-model="passwordForm.new"
                  label="新密码"
                  type="password"
                  placeholder="至少 4 位"
                />
                <BaseInput
                  v-model="passwordForm.confirm"
                  label="确认新密码"
                  type="password"
                  placeholder="再次输入新密码"
                />
              </div>
              <div class="strategy-actions strategy-actions--compact">
                <BaseButton
                  variant="primary"
                  size="sm"
                  :loading="passwordSaving"
                  @click="handleChangePassword"
                >
                  修改用户密码
                </BaseButton>
              </div>
            </section>

            <section class="strategy-section">
              <div class="strategy-section__header">
                <div>
                  <h4 class="flex items-center gap-2">
                    <span class="i-carbon-notification" />
                    下线提醒
                  </h4>
                  <p>配置账号离线后的通知渠道、内容和重登录链接。</p>
                </div>
              </div>

              <div class="automation-stack">
                <div class="strategy-grid strategy-grid--two">
                  <div class="offline-channel-field flex flex-col gap-1.5">
                    <div class="offline-channel-field__label">
                      <span class="text-sm text-gray-700 font-medium dark:text-gray-300">推送渠道</span>
                    </div>
                    <div class="offline-channel-control">
                      <BaseSelect
                        v-model="localOffline.channel"
                        :options="channelOptions"
                      />
                      <BaseButton
                        variant="secondary"
                        size="sm"
                        class="offline-doc-button"
                        :disabled="!currentChannelDocUrl"
                        @click="openChannelDocs"
                      >
                        官网
                      </BaseButton>
                    </div>
                  </div>
                  <BaseSelect
                    v-model="localOffline.reloginUrlMode"
                    label="重登录链接"
                    :options="reloginUrlModeOptions"
                  />
                </div>

                <BaseInput
                  v-model="localOffline.endpoint"
                  label="接口地址"
                  type="text"
                  :disabled="localOffline.channel !== 'webhook'"
                />

                <BaseInput
                  v-model="localOffline.token"
                  label="Token"
                  type="text"
                  placeholder="接收端 token"
                />

                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <BaseInput
                    v-model="localOffline.title"
                    label="标题"
                    type="text"
                    placeholder="提醒标题"
                  />
                  <BaseInput
                    v-model.number="localOffline.offlineDeleteSec"
                    label="离线删除账号 (秒)"
                    type="number"
                    min="0"
                    placeholder="0 表示不删除"
                  />
                </div>

                <BaseInput
                  v-model="localOffline.msg"
                  label="内容"
                  type="text"
                  placeholder="提醒内容"
                />
              </div>

              <div class="strategy-actions strategy-actions--compact">
                <BaseButton
                  variant="secondary"
                  size="sm"
                  :loading="offlineTesting"
                  :disabled="offlineSaving"
                  @click="handleTestOffline"
                >
                  测试通知
                </BaseButton>
                <BaseButton
                  variant="primary"
                  size="sm"
                  :loading="offlineSaving"
                  :disabled="offlineTesting"
                  @click="handleSaveOffline"
                >
                  保存下线提醒设置
                </BaseButton>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>

    <ConfirmModal
      :show="modalVisible"
      :title="modalConfig.title"
      :message="modalConfig.message"
      :type="modalConfig.type"
      :is-alert="modalConfig.isAlert"
      confirm-text="知道了"
      @close="modalVisible = false"
      @confirm="modalVisible = false"
      @cancel="modalVisible = false"
    />
  </div>
</template>

<style scoped>
.settings-page {
  min-height: 100%;
  padding: 2px 2px 32px;
  color: var(--app-text);
}

.settings-page > .mb-4 {
  margin-bottom: 18px;
}

.settings-page h1 {
  margin: 0;
  color: var(--app-text);
  font-size: 24px;
  font-weight: 850;
  letter-spacing: 0;
}

.settings-page > .border {
  border: 1px solid var(--app-border) !important;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: var(--app-shadow-soft);
  backdrop-filter: blur(18px);
  overflow: hidden;
}

.settings-page > .border > .border-b {
  border-bottom: 1px solid var(--app-border) !important;
  background: rgba(255, 255, 255, 0.58);
  padding: 10px;
}

.settings-page nav {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  padding: 0;
}

.settings-page nav button {
  justify-content: center;
  min-height: 42px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: transparent;
}

.settings-page .settings-tab-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  font-size: 18px;
  line-height: 1;
}

.settings-page .settings-tab-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.settings-page nav button:not(.text-white) {
  color: var(--app-text-muted);
}

.settings-page nav button:hover {
  background: rgba(95, 143, 99, 0.08);
  color: var(--app-text);
}

.settings-page nav button.text-white {
  background: linear-gradient(135deg, var(--app-accent), var(--app-accent-strong)) !important;
  box-shadow: 0 14px 30px rgba(95, 143, 99, 0.2);
}

.settings-page > .border > .p-4 {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.46), rgba(247, 250, 245, 0.66));
  padding: 22px;
}

.settings-page h3 {
  margin: 0;
  color: var(--app-text);
  font-size: 18px;
  font-weight: 820;
}

.settings-page h4 {
  color: var(--app-text);
}

.settings-page .strategy-form,
.settings-page .settings-form {
  max-width: 980px;
}

.settings-page .strategy-section {
  border: 1px solid var(--app-border);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.64);
  box-shadow: 0 16px 38px rgba(38, 48, 38, 0.06);
  padding: 18px;
}

.settings-page .strategy-section__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.settings-page .strategy-section__header--inline {
  align-items: center;
}

.settings-page .strategy-section__header h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
}

.settings-page .strategy-section__header p {
  margin: 5px 0 0;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.settings-page .strategy-grid {
  display: grid;
  gap: 14px;
  align-items: start;
}

.settings-page .strategy-grid--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.settings-page .strategy-grid--three {
  grid-template-columns: minmax(220px, 1.1fr) repeat(2, minmax(160px, 1fr));
}

.settings-page .strategy-grid--four {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.settings-page .strategy-grid--six {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.settings-page .automation-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.settings-page .automation-subtitle {
  margin-bottom: 10px;
  color: var(--app-accent-strong);
  font-size: 13px;
  font-weight: 800;
}

.settings-page .fertilizer-land-panel,
.settings-page .smart-fertilizer-panel {
  border: 1px solid rgba(186, 124, 45, 0.22);
  border-radius: 16px;
  background: rgba(255, 249, 237, 0.74);
  box-shadow: 0 12px 28px rgba(186, 124, 45, 0.06);
  padding: 14px;
}

.settings-page .fertilizer-land-option {
  display: flex;
  min-height: 34px;
  cursor: pointer;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--app-border);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.78);
  padding: 7px 10px;
  color: var(--app-text);
  font-size: 12px;
  font-weight: 650;
}

.settings-page .fertilizer-land-option input {
  width: 14px;
  height: 14px;
  accent-color: var(--app-accent);
}

.settings-page .smart-fertilizer-panel {
  display: grid;
  grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
  align-items: end;
  gap: 14px;
}

.settings-page .smart-fertilizer-panel span {
  padding-bottom: 8px;
  color: var(--app-text-muted);
  font-size: 12px;
}

.settings-page .strategy-preview {
  display: flex;
  height: 40px;
  min-height: 40px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: rgba(246, 249, 244, 0.78);
  padding: 0 11px;
  color: var(--app-text-muted);
  font-size: 13px;
}

.settings-page .strategy-preview-field {
  display: flex;
  min-width: 0;
  min-height: 72px;
  flex-direction: column;
  gap: 8px;
  justify-content: flex-start;
}

.settings-page .strategy-preview-field__label {
  display: flex;
  height: 20px;
  align-items: center;
  color: var(--app-text);
  line-height: 20px;
  font-size: 13px;
  font-weight: 650;
}

.settings-page .seed-priority-panel {
  border: 1px solid rgba(186, 124, 45, 0.22);
  border-radius: 16px;
  background: rgba(255, 249, 237, 0.74);
  box-shadow: 0 12px 28px rgba(186, 124, 45, 0.06);
  padding: 14px;
}

.settings-page .bag-seed-thumb {
  width: 42px;
  height: 42px;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 10px;
  background: rgba(186, 124, 45, 0.1);
}

.settings-page .bag-seed-thumb__image {
  width: 34px;
  height: 34px;
  object-fit: contain;
}

.settings-page .bag-seed-thumb__fallback {
  color: var(--app-accent);
  font-size: 14px;
  font-weight: 800;
}

.settings-page .bag-seed-order-btn {
  width: 26px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--app-text-muted);
  transition: all 0.16s ease;
}

.settings-page .bag-seed-order-btn:hover:not(:disabled) {
  border-color: rgba(186, 124, 45, 0.28);
  background: rgba(186, 124, 45, 0.1);
  color: var(--app-accent-strong);
}

.settings-page .bag-seed-order-btn:disabled {
  cursor: not-allowed;
  opacity: 0.32;
}

.settings-page .quiet-hours-row {
  width: max-content;
  max-width: 100%;
  display: grid;
  grid-template-columns: 220px auto 220px;
  align-items: end;
  justify-content: start;
  gap: 10px;
}

.settings-page .quiet-time-field {
  display: flex;
  min-height: 72px;
  min-width: 0;
  flex-direction: column;
  gap: 7px;
}

.settings-page .quiet-time-field label {
  display: flex;
  min-height: 19px;
  align-items: center;
  color: var(--app-text);
  font-size: 13px;
  font-weight: 650;
}

.settings-page .quiet-time-field :deep(.el-date-editor.el-input) {
  width: 100%;
}

.settings-page .quiet-time-field :deep(.el-input__wrapper) {
  height: 40px;
  min-height: 40px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 0 0 1px var(--app-border) inset;
}

.settings-page .quiet-time-field :deep(.el-input.is-disabled .el-input__wrapper) {
  background: rgba(246, 249, 244, 0.56);
}

.settings-page .quiet-hours-separator {
  padding-bottom: 15px;
  color: var(--app-text-muted);
  font-size: 12px;
  font-weight: 700;
}

.settings-page .offline-channel-field {
  min-height: 72px;
  justify-content: flex-start;
}

.settings-page .offline-channel-field__label {
  display: flex;
  height: 20px;
  align-items: center;
  line-height: 20px;
}

.settings-page .offline-channel-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
}

.settings-page .offline-channel-control :deep(.base-field) {
  min-height: 40px;
}

.settings-page .offline-doc-button {
  height: 40px;
  min-height: 40px;
}

.settings-page .strategy-actions {
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--app-border);
  padding-top: 16px;
}

.settings-page .strategy-actions--compact {
  margin-top: 16px;
}

.settings-page :deep(.base-switch),
.settings-page .border.rounded.bg-amber-50\/60,
.settings-page .rounded.bg-green-50,
.settings-page .rounded.bg-blue-50,
.settings-page .rounded.bg-amber-50 {
  border: 1px solid var(--app-border) !important;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.56) !important;
  box-shadow: 0 12px 28px rgba(38, 48, 38, 0.05);
}

.settings-page .account-card {
  border: 1px solid var(--app-border) !important;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 16px 38px rgba(38, 48, 38, 0.07);
  color: var(--app-text);
}

.settings-page .account-card:hover {
  transform: translateY(-2px);
  border-color: rgba(95, 143, 99, 0.28) !important;
  box-shadow: var(--app-shadow-card);
}

.settings-page .account-card.ring-2 {
  background: rgba(95, 143, 99, 0.1) !important;
  box-shadow: 0 0 0 1px rgba(95, 143, 99, 0.22), 0 18px 42px rgba(95, 143, 99, 0.13);
}

.settings-page .account-card h4 {
  color: var(--app-text);
}

.settings-page .account-card :deep(.base-el-button--secondary) {
  border-color: var(--app-border);
  background: rgba(255, 255, 255, 0.72);
}

.settings-page .account-card :deep(.base-el-button--ghost) {
  border: 1px solid var(--app-border);
  background: rgba(255, 255, 255, 0.54);
  color: var(--app-text-muted);
}

.settings-page .account-card :deep(.base-el-button--ghost:hover) {
  background: rgba(95, 143, 99, 0.1);
  color: var(--app-accent-strong);
}

.settings-page .account-card :deep(.base-el-button--secondary.border-red-200) {
  border-color: rgba(214, 87, 69, 0.24) !important;
  background: rgba(255, 247, 244, 0.9) !important;
  color: var(--app-danger);
}

.settings-page .account-action-btn {
  min-width: 76px;
  padding: 8px 10px !important;
  border-radius: 12px !important;
  color: var(--app-text-muted) !important;
}

.settings-page .account-action-btn :deep(.el-icon),
.settings-page .account-action-btn [class*="i-carbon"] {
  font-size: 14px;
}

.settings-page .account-action-btn--danger {
  color: var(--app-danger) !important;
}

.settings-page .account-action-btn--danger:hover {
  border-color: rgba(214, 87, 69, 0.22) !important;
  background: rgba(255, 247, 244, 0.92) !important;
  color: var(--app-danger) !important;
}

.settings-page .account-card .border-t {
  border-top-color: var(--app-border) !important;
}

.settings-page :deep(.base-field__label),
.settings-page label,
.settings-page .text-gray-700,
.settings-page .text-gray-800,
.settings-page .text-gray-900 {
  color: var(--app-text);
}

.settings-page .text-gray-500,
.settings-page .text-gray-400 {
  color: var(--app-text-muted);
}

.settings-page input[type="time"] {
  min-height: 34px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.78);
  color: var(--app-text);
}

.settings-page .space-y-4 > .border.border-gray-200\/50 {
  border: 1px solid var(--app-border) !important;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.66);
  box-shadow: 0 16px 38px rgba(38, 48, 38, 0.06);
}

.settings-page .rounded.bg-green-50,
.settings-page .rounded.bg-blue-50,
.settings-page .rounded.bg-amber-50,
.settings-page .border.border-amber-200 {
  color: var(--app-text);
}

@media (max-width: 760px) {
  .settings-page nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .settings-page > .border > .p-4 {
    padding: 16px;
  }

  .settings-page .strategy-section {
    padding: 14px;
  }

  .settings-page .strategy-section__header,
  .settings-page .strategy-section__header--inline {
    flex-direction: column;
    align-items: stretch;
  }

  .settings-page .strategy-grid--two,
  .settings-page .strategy-grid--three,
  .settings-page .strategy-grid--four,
  .settings-page .strategy-grid--six {
    grid-template-columns: 1fr;
  }

  .settings-page .smart-fertilizer-panel {
    grid-template-columns: 1fr;
  }

  .settings-page .quiet-hours-row {
    width: 100%;
    grid-template-columns: 1fr;
  }

  .settings-page .quiet-hours-separator {
    padding: 0;
  }
}
</style>
