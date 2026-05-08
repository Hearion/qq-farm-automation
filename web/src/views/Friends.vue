<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Avatar,
  Lock,
  View,
  Search,
  Plus,
  Delete,
  Close,
  User,
  Loading,
} from '@element-plus/icons-vue'
import api from '@/api'
import LandCard from '@/components/LandCard.vue'
import { useAccountStore } from '@/stores/account'
import { useFriendStore } from '@/stores/friend'
import { useStatusStore } from '@/stores/status'

const accountStore = useAccountStore()
const friendStore = useFriendStore()
const statusStore = useStatusStore()
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const {
  friends,
  loading,
  friendLands,
  friendLandsLoading,
  blacklist,
  interactRecords,
  interactLoading,
  interactError,
  knownFriendGids,
  knownFriendGidSyncCooldownSec,
  friendsListCacheTtlSec,
  knownFriendSettingsLoading,
  knownFriendSettingsSaving,
} = storeToRefs(friendStore)
const { status, loading: statusLoading, realtimeConnected } = storeToRefs(statusStore)

const isQqAccount = computed(() => {
  const acc = currentAccount.value
  if (!acc)
    return false
  const platform = String(acc.platform || 'qq').toLowerCase()
  return platform === 'qq'
})

const knownFriendGidCount = computed(() => knownFriendGids.value.length)
const knownFriendGidSet = computed(() => new Set(knownFriendGids.value.map(Number)))
const friendGidSet = computed(() => new Set(friends.value.map(f => Number(f.gid))))
const blacklistGidSet = computed(() => new Set(blacklist.value.map(item => Number(item.gid))))

const filteredKnownFriendGids = computed(() => {
  const keyword = gidSearchKeyword.value.trim().toLowerCase()
  const list = knownFriendGids.value.map(gid => ({
    gid: Number(gid),
    synced: friendGidSet.value.has(Number(gid)),
  }))
  if (!keyword)
    return list
  return list.filter(item => String(item.gid).includes(keyword))
})

const syncedGidCount = computed(() => filteredKnownFriendGids.value.filter(item => item.synced).length)
const unsyncedGidCount = computed(() => filteredKnownFriendGids.value.filter(item => !item.synced).length)

async function handleRemoveGidFromList(gid: number) {
  if (!currentAccountId.value)
    return
  await friendStore.removeKnownFriendGid(currentAccountId.value, gid)
}

async function handleRemoveUnsyncedGids() {
  if (!currentAccountId.value)
    return
  const unsyncedGids = filteredKnownFriendGids.value.filter(item => !item.synced).map(item => item.gid)
  if (unsyncedGids.length === 0) {
    ElMessage.info('没有需要删除的未同步 GID')
    return
  }
  const result = await friendStore.removeUnsyncedKnownFriendGids(currentAccountId.value, unsyncedGids)
  if (result.ok && result.removedCount > 0) {
    ElMessage.success(`已删除 ${result.removedCount} 个未同步的 GID`)
  }
}

function openGidListModal() {
  gidSearchKeyword.value = ''
  showGidListModal.value = true
}

type TabKey = 'friends' | 'blacklist' | 'visitors'

const activeTab = ref<TabKey>('friends')

const avatarErrorKeys = ref<Set<string>>(new Set())
const searchKeyword = ref('')
const localKnownFriendGidSyncCooldownSec = ref(300)
const localFriendsListCacheTtlSec = ref(60)
const showBatchAddGidModal = ref(false)
const batchGidInput = ref('')
const showGidListModal = ref(false)
const gidSearchKeyword = ref('')

const interactFilter = ref('all')
const interactFilters = [
  { key: 'all', label: '全部' },
  { key: 'steal', label: '偷菜' },
  { key: 'help', label: '帮忙' },
  { key: 'bad', label: '捣乱' },
]

async function confirmAction(msg: string, action: () => Promise<any>) {
  try {
    await ElMessageBox.confirm(msg, '确认操作', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await action()
  }
  catch (e: any) {
    if (e === 'cancel' || e?.toString?.().includes('cancel'))
      return
    ElMessage.error(e?.message || '操作失败')
  }
}

const expandedFriends = ref<Set<string>>(new Set())
const currentPage = ref(1)
const pageSize = 25

const sortedFriends = computed(() => {
  return [...friends.value].sort((a: any, b: any) => {
    const levelA = Number(a?.level || 0)
    const levelB = Number(b?.level || 0)
    return levelB - levelA
  })
})

const filteredFriends = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  const list = sortedFriends.value
  if (!keyword)
    return list

  return list.filter((friend: any) => {
    const name = String(friend?.name || '').toLowerCase()
    const gid = String(friend?.gid || '')
    const uin = String(friend?.uin || '')
    return name.includes(keyword) || gid.includes(keyword) || uin.includes(keyword)
  })
})

const totalPages = computed(() => Math.ceil(filteredFriends.value.length / pageSize) || 1)

const paginatedFriends = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  const end = start + pageSize
  return filteredFriends.value.slice(start, end)
})

function goToPage(page: number) {
  currentPage.value = Math.max(1, Math.min(page, totalPages.value))
}

watch(searchKeyword, () => {
  currentPage.value = 1
})

const filteredInteractRecords = computed(() => {
  if (interactFilter.value === 'all')
    return interactRecords.value

  const actionTypeMap: Record<string, number> = {
    steal: 1,
    help: 2,
    bad: 3,
  }
  const targetActionType = actionTypeMap[interactFilter.value] || 0
  return interactRecords.value.filter((record: any) => Number(record?.actionType) === targetActionType)
})

const visibleInteractRecords = computed(() => filteredInteractRecords.value.slice(0, 50))

async function loadData() {
  if (currentAccountId.value) {
    const acc = currentAccount.value
    if (!acc)
      return

    if (!realtimeConnected.value) {
      await statusStore.fetchStatus(currentAccountId.value)
    }

    if (acc.running && status.value?.connection?.connected) {
      avatarErrorKeys.value.clear()
      friendStore.fetchFriends(currentAccountId.value)
      friendStore.fetchBlacklist(currentAccountId.value)
      friendStore.fetchInteractRecords(currentAccountId.value)
      if (isQqAccount.value) {
        friendStore.fetchKnownFriendSettings(currentAccountId.value)
      }
    }
  }
}

useIntervalFn(() => {
  for (const gid in friendLands.value) {
    if (friendLands.value[gid]) {
      friendLands.value[gid] = friendLands.value[gid].map((l: any) =>
        l.matureInSec > 0 ? { ...l, matureInSec: l.matureInSec - 1 } : l,
      )
    }
  }
}, 1000)

onMounted(() => {
  loadData()
})

watch(currentAccountId, () => {
  expandedFriends.value.clear()
  loadData()
})

async function handleRefreshFriends() {
  if (!currentAccountId.value)
    return
  try {
    await api.post('/api/friends/clear-cache', {}, {
      headers: { 'x-account-id': currentAccountId.value },
    })
  }
  catch {
    // ignore
  }
  await friendStore.fetchFriends(currentAccountId.value, true)
}

function toggleFriend(friendId: string) {
  if (expandedFriends.value.has(friendId)) {
    expandedFriends.value.delete(friendId)
  }
  else {
    expandedFriends.value.clear()
    expandedFriends.value.add(friendId)
    if (currentAccountId.value && currentAccount.value?.running && status.value?.connection?.connected) {
      friendStore.fetchFriendLands(currentAccountId.value, friendId)
    }
  }
}

async function handleOp(friendId: string, type: string, e: Event) {
  e.stopPropagation()
  if (!currentAccountId.value)
    return

  const opNames: Record<string, string> = {
    steal: '偷取',
    water: '浇水',
    weed: '除草',
    bug: '除虫',
    bad: '捣乱',
  }

  if (type === 'bad') {
    await confirmAction('确定对好友执行捣乱操作吗?', async () => {
      ElMessage.info('已在捣乱中，间隔较长，请稍后返回好友土地查看')
      friendStore.operate(currentAccountId.value!, friendId, type)
      return { ok: true }
    })
  }
  else {
    await confirmAction(`确定对好友执行${opNames[type] || type}操作吗?`, async () => {
      const result = await friendStore.operate(currentAccountId.value!, friendId, type)
      if (result?.ok) {
        ElMessage.success(result.message || `${opNames[type] || type}完成`)
      }
      else {
        ElMessage.error(result?.message || `${opNames[type] || type}失败`)
      }
      return result
    })
  }
}

async function handleToggleBlacklist(friend: any, e: Event) {
  e.stopPropagation()
  if (!currentAccountId.value)
    return
  await friendStore.toggleBlacklist(currentAccountId.value, Number(friend.gid))
}

function getFriendStatusText(friend: any) {
  const p = friend.plant || {}
  const info = []
  if (p.stealNum)
    info.push(`偷${p.stealNum}`)
  if (p.dryNum)
    info.push(`水${p.dryNum}`)
  if (p.weedNum)
    info.push(`草${p.weedNum}`)
  if (p.insectNum)
    info.push(`虫${p.insectNum}`)
  return info.length ? info.join(' ') : '无操作'
}

function getFriendLevel(friend: any) {
  const level = Number.parseInt(String(friend?.level ?? ''), 10)
  if (!Number.isFinite(level) || level <= 0)
    return 0
  return level
}

function getFriendGold(friend: any) {
  const gold = Number.parseInt(String(friend?.gold ?? ''), 10)
  if (!Number.isFinite(gold) || gold < 0)
    return 0
  return gold
}

function formatFriendGold(value: unknown) {
  const gold = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(gold) || gold < 0)
    return '0'
  return gold.toLocaleString('zh-CN')
}

function getFriendAvatar(friend: any) {
  const direct = String(friend?.avatarUrl || friend?.avatar_url || '').trim()
  if (direct)
    return direct
  const uin = String(friend?.uin || '').trim()
  if (uin)
    return `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=100`
  return ''
}

function getFriendAvatarKey(friend: any) {
  const key = String(friend?.gid || friend?.uin || '').trim()
  return key || String(friend?.name || '').trim()
}

function canShowFriendAvatar(friend: any) {
  const key = getFriendAvatarKey(friend)
  if (!key)
    return false
  return !!getFriendAvatar(friend) && !avatarErrorKeys.value.has(key)
}

function handleFriendAvatarError(friend: any) {
  const key = getFriendAvatarKey(friend)
  if (!key)
    return
  avatarErrorKeys.value.add(key)
}

async function handleRemoveFromBlacklist(gid: number) {
  if (!currentAccountId.value)
    return
  await friendStore.toggleBlacklist(currentAccountId.value, gid)
}

async function refreshInteractRecords() {
  if (!currentAccountId.value)
    return
  await friendStore.fetchInteractRecords(currentAccountId.value)
}

function getInteractAvatar(record: any) {
  return String(record?.avatarUrl || '').trim()
}

function getInteractAvatarKey(record: any) {
  const key = String(record?.visitorGid || record?.key || record?.nick || '').trim()
  return key ? `interact:${key}` : ''
}

function canShowInteractAvatar(record: any) {
  const key = getInteractAvatarKey(record)
  if (!key)
    return false
  return !!getInteractAvatar(record) && !avatarErrorKeys.value.has(key)
}

function handleInteractAvatarError(record: any) {
  const key = getInteractAvatarKey(record)
  if (!key)
    return
  avatarErrorKeys.value.add(key)
}

function getInteractBadgeType(actionType: number): '' | 'success' | 'warning' | 'danger' | 'info' {
  if (Number(actionType) === 1)
    return ''
  if (Number(actionType) === 2)
    return 'success'
  if (Number(actionType) === 3)
    return 'danger'
  return 'info'
}

function formatInteractTime(timestamp: number) {
  const ts = Number(timestamp) || 0
  if (!ts)
    return '--'

  const date = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute

  if (diff >= 0 && diff < minute)
    return '刚刚'
  if (diff >= minute && diff < hour)
    return `${Math.floor(diff / minute)} 分钟前`

  const sameDay = now.getFullYear() === date.getFullYear()
    && now.getMonth() === date.getMonth()
    && now.getDate() === date.getDate()

  if (sameDay) {
    return `今天 ${date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`
  }

  if (now.getFullYear() === date.getFullYear()) {
    return `${date.getMonth() + 1}-${date.getDate()} ${date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function normalizeKnownFriendGidSyncCooldownSec(value: number) {
  const v = Number.parseInt(String(value || ''), 10)
  if (!Number.isFinite(v) || v <= 0)
    return 600
  return Math.max(30, Math.min(86400, v))
}

function normalizeFriendsListCacheTtlSec(value: number) {
  const v = Number.parseInt(String(value || ''), 10)
  if (!Number.isFinite(v) || v <= 0)
    return 60
  return Math.max(10, Math.min(86400, v))
}

async function handleRemoveKnownFriendGid(friend: any, e: Event) {
  e.stopPropagation()
  if (!currentAccountId.value)
    return
  const gid = Number(friend?.gid) || 0
  const name = String(friend?.name || `GID ${gid}`).trim()
  await confirmAction(
    `确定将 ${name} 移出同步列表吗？后续如果最近访客再次命中，这个 GID 仍可被自动同步回来。`,
    async () => {
      await friendStore.removeKnownFriendGid(currentAccountId.value!, gid)
      await refreshFriendsAfterKnownGidChange()
      ElMessage.success(`已移出同步列表: ${name}`)
    },
  )
}

async function refreshFriendsAfterKnownGidChange() {
  if (!currentAccountId.value)
    return
  await friendStore.fetchFriends(currentAccountId.value, true)
}

async function handleSaveKnownFriendSettings() {
  if (!currentAccountId.value)
    return
  const cooldownSec = normalizeKnownFriendGidSyncCooldownSec(localKnownFriendGidSyncCooldownSec.value)
  const cacheTtlSec = normalizeFriendsListCacheTtlSec(localFriendsListCacheTtlSec.value)
  await friendStore.saveKnownFriendSettings(currentAccountId.value, {
    knownFriendGidSyncCooldownSec: cooldownSec,
    friendsListCacheTtlSec: cacheTtlSec,
  })
  ElMessage.success('设置已保存')
}

watch(knownFriendGidSyncCooldownSec, (val) => {
  localKnownFriendGidSyncCooldownSec.value = val
}, { immediate: true })

watch(friendsListCacheTtlSec, (val) => {
  localFriendsListCacheTtlSec.value = val
}, { immediate: true })

function parseBatchGids(input: string): number[] {
  const text = String(input || '').trim()
  if (!text)
    return []
  const gids: number[] = []
  const parts = text.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean)
  for (const part of parts) {
    const num = Number.parseInt(part, 10)
    if (Number.isFinite(num) && num > 0 && !gids.includes(num)) {
      gids.push(num)
    }
  }
  return gids
}

async function handleBatchAddKnownFriendGids() {
  if (!currentAccountId.value)
    return
  const gids = parseBatchGids(batchGidInput.value)
  if (gids.length === 0) {
    ElMessage.error('请输入有效的 GID 列表')
    return
  }
  const result = await friendStore.batchAddKnownFriendGids(currentAccountId.value, gids)
  if (result.ok) {
    batchGidInput.value = ''
    showBatchAddGidModal.value = false
    await refreshFriendsAfterKnownGidChange()
    ElMessage.success(`已批量添加 ${result.addedCount} 个 GID`)
  }
}

function handlePageChange(page: number) {
  currentPage.value = page
}
</script>

<template>
  <div class="friends-page">
    <div class="page-header">
      <h2 class="page-title">
        <el-icon><Avatar /></el-icon>
        好友
      </h2>
      <div class="header-stats">
        <span v-if="activeTab === 'friends'" class="stat-text">
          共 {{ filteredFriends.length }}/{{ friends.length }} 名好友
        </span>
        <span v-if="activeTab === 'blacklist'" class="stat-text">
          共 {{ blacklist.length }} 人
        </span>
        <span v-if="activeTab === 'visitors' && interactRecords.length" class="stat-text">
          共 {{ filteredInteractRecords.length }}/{{ interactRecords.length }} 条记录
        </span>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="main-tabs">
      <el-tab-pane name="friends">
        <template #label>
          <span class="tab-label">
            <el-icon><Avatar /></el-icon>
            好友列表
          </span>
        </template>

        <div v-if="loading || statusLoading || interactLoading" class="loading-container">
          <el-icon class="is-loading" :size="40"><Loading /></el-icon>
        </div>

        <div v-else-if="!currentAccountId">
          <el-empty description="未登录账号">
            <template #description>
              <p>未登录账号</p>
              <p class="sub-text">请先添加农场账号</p>
            </template>
          </el-empty>
        </div>

        <div v-else-if="!status?.connection?.connected">
          <el-empty description="账号未登录">
            <template #description>
              <p>账号未登录</p>
              <p class="sub-text">请先运行账号或检查网络连接</p>
            </template>
          </el-empty>
        </div>

        <template v-else>
          <!-- QQ friend auto sync section -->
          <el-card v-if="currentAccountId && isQqAccount" class="sync-card" shadow="never">
            <div class="sync-header">
              <div>
                <div class="sync-title-row">
                  <el-icon :size="18" color="#f59e0b"><User /></el-icon>
                  <span class="sync-title">QQ 好友自动同步</span>
                  <el-tag size="small" type="warning" class="gid-count-tag" @click="openGidListModal">
                    {{ knownFriendGidCount }}
                  </el-tag>
                </div>
                <p class="sync-desc">
                  QQ 新好友接口依赖已知 GID。系统会自动从最近访客补充，进入好友农场明确失败时自动移除失效 GID。
                </p>
              </div>
              <div class="sync-actions">
                <el-button
                  size="small"
                  :loading="knownFriendSettingsLoading"
                  @click="currentAccountId && friendStore.fetchKnownFriendSettings(currentAccountId)"
                >
                  刷新
                </el-button>
                <el-button
                  size="small"
                  type="success"
                  :loading="knownFriendSettingsSaving"
                  @click="handleSaveKnownFriendSettings"
                >
                  保存设置
                </el-button>
                <el-button
                  size="small"
                  type="primary"
                  @click="showBatchAddGidModal = true"
                >
                  批量新增 GID
                </el-button>
              </div>
            </div>

            <div class="sync-fields">
              <el-form-item label="访客检测入库冷却(秒)">
                <el-input-number v-model="localKnownFriendGidSyncCooldownSec" :min="30" :max="86400" />
              </el-form-item>
              <el-form-item label="好友列表缓存(秒)">
                <el-input-number v-model="localFriendsListCacheTtlSec" :min="10" :max="86400" />
              </el-form-item>
            </div>
          </el-card>

          <!-- Search bar -->
          <div v-if="friends.length > 0" class="search-bar">
            <el-input
              v-model="searchKeyword"
              placeholder="搜索好友..."
              clearable
              class="search-input"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-button :loading="loading" @click="handleRefreshFriends">
              刷新列表
            </el-button>
          </div>

          <!-- Empty state -->
          <el-empty v-if="friends.length === 0" description="暂无好友或数据加载失败" />

          <!-- Friend list -->
          <template v-else>
            <div class="friend-list">
              <el-card
                v-for="friend in paginatedFriends"
                :key="friend.gid"
                shadow="never"
                class="friend-card"
                :class="{ 'is-blacklisted': blacklistGidSet.has(Number(friend.gid)) }"
              >
                <div class="friend-main" @click="toggleFriend(friend.gid)">
                  <div class="friend-info">
                    <el-avatar :size="40" class="friend-avatar">
                      <img
                        v-if="canShowFriendAvatar(friend)"
                        :src="getFriendAvatar(friend)"
                        @error="handleFriendAvatarError(friend)"
                      />
                      <el-icon v-else :size="20"><User /></el-icon>
                    </el-avatar>
                    <div class="friend-detail">
                      <div class="friend-name-row">
                        <span class="friend-name">{{ friend.name }} ({{ friend.gid }})</span>
                        <el-tag
                          v-if="blacklistGidSet.has(Number(friend.gid))"
                          size="small"
                          type="info"
                        >
                          已屏蔽
                        </el-tag>
                      </div>
                      <div class="friend-meta">
                        <el-tag v-if="getFriendLevel(friend) > 0" size="small" type="info">
                          Lv.{{ getFriendLevel(friend) }}
                        </el-tag>
                        <el-tag v-if="getFriendGold(friend) > 0" size="small" type="warning">
                          金币 {{ formatFriendGold(friend.gold) }}
                        </el-tag>
                      </div>
                      <div class="friend-status" :class="{ 'has-actions': getFriendStatusText(friend) !== '无操作' }">
                        {{ getFriendStatusText(friend) }}
                      </div>
                    </div>
                  </div>

                  <div class="friend-actions" @click.stop>
                    <el-button-group>
                      <el-button size="small" type="primary" @click="handleOp(friend.gid, 'steal', $event)">
                        偷取
                      </el-button>
                      <el-button size="small" @click="handleOp(friend.gid, 'water', $event)">
                        浇水
                      </el-button>
                      <el-button size="small" type="success" @click="handleOp(friend.gid, 'weed', $event)">
                        除草
                      </el-button>
                      <el-button size="small" type="warning" @click="handleOp(friend.gid, 'bug', $event)">
                        除虫
                      </el-button>
                      <el-button size="small" type="danger" @click="handleOp(friend.gid, 'bad', $event)">
                        捣乱
                      </el-button>
                    </el-button-group>
                    <el-button
                      size="small"
                      @click="handleToggleBlacklist(friend, $event)"
                    >
                      {{ blacklistGidSet.has(Number(friend.gid)) ? '移出黑名单' : '加入黑名单' }}
                    </el-button>
                    <el-button
                      v-if="isQqAccount && knownFriendGidSet.has(Number(friend.gid))"
                      size="small"
                      type="warning"
                      @click="handleRemoveKnownFriendGid(friend, $event)"
                    >
                      移出同步列表
                    </el-button>
                  </div>
                </div>

                <!-- Expanded land preview -->
                <div v-if="expandedFriends.has(friend.gid)" class="friend-lands">
                  <div v-if="friendLandsLoading[friend.gid]" class="loading-inline">
                    <el-icon class="is-loading" :size="24"><Loading /></el-icon>
                  </div>
                  <el-empty v-else-if="!friendLands[friend.gid] || friendLands[friend.gid]?.length === 0" description="无土地数据" :image-size="60" />
                  <div v-else class="lands-grid">
                    <LandCard
                      v-for="land in friendLands[friend.gid]"
                      :key="land.id"
                      :land="land"
                    />
                  </div>
                </div>
              </el-card>
            </div>

            <!-- Pagination -->
            <div v-if="filteredFriends.length > pageSize" class="pagination-wrapper">
              <el-pagination
                v-model:current-page="currentPage"
                :page-size="pageSize"
                :total="filteredFriends.length"
                layout="total, prev, pager, next, jumper"
                background
                @current-change="handlePageChange"
              />
            </div>
          </template>
        </template>
      </el-tab-pane>

      <el-tab-pane name="blacklist">
        <template #label>
          <span class="tab-label">
            <el-icon><Lock /></el-icon>
            好友黑名单
            <el-badge
              v-if="blacklist.length > 0"
              :value="blacklist.length"
              type="danger"
              class="tab-badge"
            />
          </span>
        </template>

        <div v-if="loading" class="loading-container">
          <el-icon class="is-loading" :size="40"><Loading /></el-icon>
        </div>

        <template v-else>
          <el-alert
            type="info"
            :closable="false"
            show-icon
            class="blacklist-tip"
          >
            加入黑名单的好友在自动偷菜和帮助时会被跳过。
          </el-alert>

          <el-empty v-if="blacklist.length === 0" description="暂无黑名单好友" />

          <el-table
            v-else
            :data="blacklist"
            stripe
            class="blacklist-table"
          >
            <el-table-column label="好友" min-width="200">
              <template #default="{ row }">
                <div class="user-cell">
                  <el-avatar :size="32">
                    <img
                      v-if="row.avatarUrl"
                      :src="row.avatarUrl"
                      @error="($event.target as HTMLImageElement).style.display = 'none'"
                    />
                    <el-icon v-else :size="16"><User /></el-icon>
                  </el-avatar>
                  <span class="user-name">{{ row.name || `GID:${row.gid}` }}</span>
                  <span class="user-gid">({{ row.gid }})</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="140" align="right">
              <template #default="{ row }">
                <el-button size="small" type="danger" @click="handleRemoveFromBlacklist(row.gid)">
                  移出黑名单
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </el-tab-pane>

      <el-tab-pane name="visitors">
        <template #label>
          <span class="tab-label">
            <el-icon><View /></el-icon>
            最近访客
          </span>
        </template>

        <div v-if="interactLoading" class="loading-container">
          <el-icon class="is-loading" :size="40"><Loading /></el-icon>
        </div>

        <template v-else>
          <div class="visitors-toolbar">
            <el-radio-group v-model="interactFilter" size="small">
              <el-radio-button
                v-for="item in interactFilters"
                :key="item.key"
                :value="item.key"
              >
                {{ item.label }}
              </el-radio-button>
            </el-radio-group>
            <el-button
              size="small"
              :loading="interactLoading"
              @click="refreshInteractRecords"
            >
              {{ interactLoading ? '刷新中...' : '刷新' }}
            </el-button>
          </div>

          <el-alert
            v-if="!!interactError"
            type="error"
            :closable="false"
            show-icon
            class="interact-error"
          >
            {{ interactError }}
          </el-alert>

          <el-empty v-else-if="visibleInteractRecords.length === 0" description="暂无访客记录" />

          <el-table
            v-else
            :data="visibleInteractRecords"
            stripe
            class="visitors-table"
          >
            <el-table-column label="访客" min-width="220">
              <template #default="{ row }">
                <div class="user-cell">
                  <el-avatar :size="36">
                    <img
                      v-if="canShowInteractAvatar(row)"
                      :src="getInteractAvatar(row)"
                      @error="handleInteractAvatarError(row)"
                    />
                    <el-icon v-else :size="18"><User /></el-icon>
                  </el-avatar>
                  <div class="visitor-info">
                    <span class="visitor-name">{{ row.nick || `GID:${row.visitorGid}` }}</span>
                    <span v-if="row.visitorGid" class="visitor-gid">GID {{ row.visitorGid }}</span>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="类型" width="100" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="getInteractBadgeType(row.actionType)">
                  {{ row.actionLabel }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="等级" width="80" align="center">
              <template #default="{ row }">
                <span v-if="row.level">Lv.{{ row.level }}</span>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="详情" min-width="160">
              <template #default="{ row }">
                {{ row.actionDetail || row.actionLabel }}
              </template>
            </el-table-column>
            <el-table-column label="时间" width="140" align="right">
              <template #default="{ row }">
                {{ formatInteractTime(row.serverTimeMs) }}
              </template>
            </el-table-column>
          </el-table>

          <div v-if="filteredInteractRecords.length > visibleInteractRecords.length" class="more-hint">
            仅展示最近 {{ visibleInteractRecords.length }} 条
          </div>
        </template>
      </el-tab-pane>
    </el-tabs>

    <!-- Batch add GID dialog -->
    <el-dialog
      v-model="showBatchAddGidModal"
      title="批量新增 GID"
      width="520px"
      :close-on-click-modal="false"
    >
      <p class="dialog-hint">支持一行一个或用逗号/空格分隔，自动去重</p>
      <el-input
        v-model="batchGidInput"
        type="textarea"
        :rows="8"
        placeholder="每行一个 GID，或用逗号、空格分隔&#10;例如：&#10;12345678&#10;87654321&#10;或&#10;12345678, 87654321, 11111111"
      />
      <template #footer>
        <el-button @click="showBatchAddGidModal = false">取消</el-button>
        <el-button
          type="primary"
          :loading="knownFriendSettingsSaving"
          :disabled="!batchGidInput.trim()"
          @click="handleBatchAddKnownFriendGids"
        >
          确认添加
        </el-button>
      </template>
    </el-dialog>

    <!-- GID list dialog -->
    <el-dialog
      v-model="showGidListModal"
      title="已导入的 GID 列表"
      width="720px"
      :close-on-click-modal="false"
      top="5vh"
    >
      <template #header>
        <div class="gid-dialog-header">
          <div>
            <h3 class="gid-dialog-title">已导入的 GID 列表</h3>
            <p class="gid-dialog-desc">
              共 {{ knownFriendGidCount }} 个 GID，
              <el-tag size="small" type="warning">已同步 {{ syncedGidCount }} 个</el-tag>，
              <el-tag size="small" type="danger">未同步 {{ unsyncedGidCount }} 个</el-tag>
            </p>
          </div>
        </div>
      </template>

      <div class="gid-toolbar">
        <el-input
          v-model="gidSearchKeyword"
          placeholder="搜索 GID..."
          clearable
          class="gid-search"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button
          type="danger"
          size="small"
          :loading="knownFriendSettingsSaving"
          :disabled="unsyncedGidCount === 0"
          @click="handleRemoveUnsyncedGids"
        >
          删除未同步 ({{ unsyncedGidCount }})
        </el-button>
      </div>

      <el-empty v-if="filteredKnownFriendGids.length === 0" description="暂无数据" :image-size="60" />

      <div v-else class="gid-grid">
        <div
          v-for="item in filteredKnownFriendGids"
          :key="item.gid"
          class="gid-item"
          :class="item.synced ? 'gid-synced' : 'gid-unsynced'"
        >
          <div class="gid-item-info">
            <span class="gid-number">{{ item.gid }}</span>
            <el-tag v-if="item.synced" size="small" type="warning">已同步</el-tag>
            <el-tag v-else size="small" type="danger">未同步</el-tag>
          </div>
          <el-button
            size="small"
            :icon="Delete"
            circle
            :disabled="knownFriendSettingsSaving"
            @click="handleRemoveGidFromList(item.gid)"
          />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.friends-page {
  padding: 16px;
}

.page-header {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 24px;
  font-weight: 700;
  margin: 0;
}

.header-stats {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stat-text {
  font-size: 13px;
  color: #909399;
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tab-badge {
  margin-left: 4px;
}

.loading-container {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.sub-text {
  font-size: 13px;
  color: #c0c4cc;
  margin-top: 4px;
}

/* Sync card */
.sync-card {
  margin-bottom: 16px;
  border-color: #fbbf24;
}

.sync-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (min-width: 1024px) {
  .sync-header {
    flex-direction: row;
    align-items: flex-start;
    justify-content: space-between;
  }
}

.sync-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sync-title {
  font-size: 16px;
  font-weight: 600;
}

.gid-count-tag {
  cursor: pointer;
}

.sync-desc {
  margin-top: 4px;
  font-size: 13px;
  color: #909399;
}

.sync-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.sync-fields {
  margin-top: 16px;
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr;
}

@media (min-width: 1024px) {
  .sync-fields {
    grid-template-columns: 1fr 1fr;
  }
}

/* Search bar */
.search-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--el-bg-color);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.search-input {
  width: 280px;
}

/* Friend list */
.friend-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.friend-card {
  overflow: hidden;
  transition: all 0.2s;
}

.friend-card.is-blacklisted {
  opacity: 0.5;
}

.friend-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  cursor: pointer;
  justify-content: space-between;
}

@media (min-width: 640px) {
  .friend-main {
    flex-direction: row;
    align-items: center;
  }
}

.friend-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.friend-avatar {
  flex-shrink: 0;
}

.friend-detail {
  min-width: 0;
}

.friend-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
}

.friend-name {
  font-size: 15px;
}

.friend-meta {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.friend-status {
  margin-top: 4px;
  font-size: 13px;
  color: #909399;
}

.friend-status.has-actions {
  color: var(--el-color-success);
  font-weight: 500;
}

.friend-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.friend-lands {
  border-top: 1px solid var(--el-border-color-lighter);
  padding: 16px;
  background-color: var(--el-fill-color-lighter);
}

.loading-inline {
  display: flex;
  justify-content: center;
  padding: 16px 0;
}

.lands-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

@media (min-width: 640px) {
  .lands-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (min-width: 768px) {
  .lands-grid {
    grid-template-columns: repeat(5, 1fr);
  }
}

@media (min-width: 1024px) {
  .lands-grid {
    grid-template-columns: repeat(8, 1fr);
  }
}

/* Pagination */
.pagination-wrapper {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}

/* Blacklist */
.blacklist-tip {
  margin-bottom: 16px;
}

.blacklist-table .user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.blacklist-table .user-name {
  font-weight: 500;
}

.blacklist-table .user-gid {
  font-size: 13px;
  color: #909399;
}

/* Visitors */
.visitors-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.interact-error {
  margin-bottom: 16px;
}

.visitors-table .user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.visitors-table .visitor-info {
  display: flex;
  flex-direction: column;
}

.visitors-table .visitor-name {
  font-weight: 500;
  font-size: 14px;
}

.visitors-table .visitor-gid {
  font-size: 12px;
  color: #909399;
}

.more-hint {
  margin-top: 12px;
  text-align: center;
  font-size: 12px;
  color: #909399;
}

/* GID dialog */
.gid-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.gid-dialog-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.gid-dialog-desc {
  margin-top: 4px;
  font-size: 13px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 4px;
}

.gid-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.gid-search {
  flex: 1;
}

.gid-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  max-height: 50vh;
  overflow-y: auto;
}

@media (min-width: 1024px) {
  .gid-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.gid-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 8px;
  padding: 8px 12px;
  border: 1px solid;
}

.gid-item.gid-synced {
  border-color: #fde68a;
  background-color: #fefce8;
}

.gid-item.gid-unsynced {
  border-color: #fca5a5;
  background-color: #fef2f2;
}

.gid-item-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.gid-number {
  font-size: 13px;
  font-family: monospace;
}

.dialog-hint {
  font-size: 13px;
  color: #909399;
  margin-bottom: 12px;
}
</style>
