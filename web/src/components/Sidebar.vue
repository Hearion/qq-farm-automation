<script setup lang="ts">
import { useDateFormat, useIntervalFn, useNow } from '@vueuse/core'
import {
  ArrowDown,
  Bell,
  Brush,
  Check,
  CirclePlus,
  Close,
  CopyDocument,
  Edit,
  Hide,
  Key,
  Loading,
  Opportunity,
  Plus,
  RefreshRight,
  SwitchButton,
  User,
  View,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'
import AccountModal from '@/components/AccountModal.vue'
import RemarkModal from '@/components/RemarkModal.vue'
import { menuRoutes } from '@/router/menu'
import { getAccountAvatarUrl, getAccountQq, getPlatformClass, getPlatformLabel, useAccountStore } from '@/stores/account'
import { useAppStore } from '@/stores/app'
import { useStatusStore } from '@/stores/status'
import { useUserStore } from '@/stores/user'

const accountStore = useAccountStore()
const statusStore = useStatusStore()
const appStore = useAppStore()
const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
const { accounts, currentAccount } = storeToRefs(accountStore)
const { status, realtimeConnected } = storeToRefs(statusStore)
const { sidebarOpen } = storeToRefs(appStore)

const showAccountDropdown = ref(false)
const showAccountModal = ref(false)
const showRemarkModal = ref(false)
const accountToEdit = ref<any>(null)
const wsErrorNotifiedAt = ref<Record<string, number>>({})

const systemConnected = ref(true)
const serverUptimeBase = ref(0)
const serverVersion = ref('')
const lastPingTime = ref(Date.now())
const now = useNow()
const formattedTime = useDateFormat(now, 'YYYY-MM-DD HH:mm:ss')

async function checkConnection() {
  try {
    const res = await api.get('/api/ping')
    systemConnected.value = true
    if (res.data.ok && res.data.data) {
      if (res.data.data.uptime) {
        serverUptimeBase.value = res.data.data.uptime
        lastPingTime.value = Date.now()
      }
      if (res.data.data.version) {
        serverVersion.value = res.data.data.version
      }
    }
    const accountRef = currentAccount.value?.id || currentAccount.value?.uin
    if (accountRef) {
      statusStore.connectRealtime(String(accountRef))
    }
  }
  catch {
    systemConnected.value = false
  }
}

async function refreshStatusFallback() {
  if (realtimeConnected.value)
    return

  const accountRef = currentAccount.value?.id || currentAccount.value?.uin
  if (accountRef) {
    await statusStore.fetchStatus(String(accountRef))
  }
}

async function handleAccountSaved() {
  await accountStore.fetchAccounts()
  await refreshStatusFallback()
  showAccountModal.value = false
  showRemarkModal.value = false
}

function openRemarkModal(acc: any) {
  accountToEdit.value = acc
  showRemarkModal.value = true
  showAccountDropdown.value = false
}

onMounted(() => {
  accountStore.fetchAccounts()
  checkConnection()
  userStore.fetchUserInfo()
  fetchAnnouncement()
})

onBeforeUnmount(() => {
  statusStore.disconnectRealtime()
})

const platform = computed(() => getPlatformLabel(currentAccount.value?.platform))

useIntervalFn(checkConnection, 30000)
useIntervalFn(() => {
  refreshStatusFallback()
  accountStore.fetchAccounts()
}, 10000)

watch(() => currentAccount.value?.id || currentAccount.value?.uin || '', () => {
  const accountRef = currentAccount.value?.id || currentAccount.value?.uin
  statusStore.connectRealtime(String(accountRef || ''))
  refreshStatusFallback()
}, { immediate: true })

watch(() => status.value?.wsError, (wsError: any) => {
  if (!wsError || Number(wsError.code) !== 400 || !currentAccount.value)
    return

  const errAt = Number(wsError.at) || 0
  const accId = String(currentAccount.value.id || currentAccount.value.uin || '')
  const lastNotified = wsErrorNotifiedAt.value[accId] || 0
  if (errAt <= lastNotified)
    return

  wsErrorNotifiedAt.value[accId] = errAt
  accountToEdit.value = currentAccount.value
  showAccountModal.value = true
}, { deep: true })

const uptime = computed(() => {
  const diff = Math.floor(serverUptimeBase.value + (now.value.getTime() - lastPingTime.value) / 1000)
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60
  return `${h}h ${m}m ${s}s`
})

const displayName = computed(() => {
  const acc = currentAccount.value
  if (!acc)
    return '选择账号'

  const liveName = status.value?.status?.name
  if (liveName && liveName !== '未登录') {
    if (acc.name) {
      return `${liveName} (${acc.name})`
    }
    return liveName
  }

  if (acc.name) {
    if (acc.nick) {
      return `${acc.nick} (${acc.name})`
    }
    return acc.name
  }

  if (acc.nick)
    return acc.nick

  return getAccountQq(acc) || acc.uin
})

const connectionStatus = computed(() => {
  if (!systemConnected.value) {
    return {
      text: '系统离线',
      color: '#ef4444',
      pulse: false,
    }
  }

  if (!currentAccount.value?.id) {
    return {
      text: '请添加账号',
      color: '#9ca3af',
      pulse: false,
    }
  }

  const isConnected = status.value?.connection?.connected
  if (isConnected) {
    return {
      text: '运行中',
      color: '#22c55e',
      pulse: true,
    }
  }

  return {
    text: '未连接',
    color: '#9ca3af',
    pulse: false,
  }
})

const navItems = computed(() => {
  const isAdmin = userStore.isAdmin
  return menuRoutes
    .filter(item => !item.adminOnly || isAdmin)
    .map(item => ({
      path: item.path ? `/${item.path}` : '/',
      label: item.label,
      icon: item.icon,
    }))
})

function selectAccount(acc: any) {
  accountStore.setCurrentAccount(acc)
  showAccountDropdown.value = false
}

const version = __APP_VERSION__

watch(
  () => route.path,
  () => {
    if (window.innerWidth < 1024)
      appStore.closeSidebar()
  },
)

// User related state
const showUserDropdown = ref(false)
const showRenewModal = ref(false)
const renewCardCode = ref('')
const renewLoading = ref(false)
const renewError = ref('')
const renewSuccess = ref(false)
const renewCardInfo = ref<{ type: string, days: number, description: string } | null>(null)
const renewChecking = ref(false)

// Announcement related state
const showAnnouncementModal = ref(false)
const showAnnouncementViewModal = ref(false)
const announcementContent = ref('')
const announcementShowOnce = ref(true)
const announcementSaving = ref(false)
const announcementLoading = ref(false)
const currentAnnouncement = ref<{ content: string, showOnce: boolean, updatedAt: number, shouldShow?: boolean } | null>(null)
const showThemeDropdown = ref(false)
const showTokenDropdown = ref(false)
const tokenVisible = ref(false)
const tokenCopied = ref(false)

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await userStore.logout()
    router.push('/login')
  }
  catch {
    // User cancelled
  }
}

async function checkCardInfo() {
  if (!renewCardCode.value.trim()) {
    renewError.value = '请输入卡密'
    return
  }
  renewChecking.value = true
  renewError.value = ''
  renewCardInfo.value = null
  try {
    const res = await api.get(`/api/card/info/${renewCardCode.value.trim()}`)
    if (res.data.ok) {
      renewCardInfo.value = res.data.data
    }
    else {
      renewError.value = res.data.error || '卡密不存在或已使用'
    }
  }
  catch (e: any) {
    renewError.value = e?.response?.data?.error || e?.message || '查询卡密失败'
  }
  finally {
    renewChecking.value = false
  }
}

async function handleRenew() {
  if (!renewCardCode.value.trim()) {
    renewError.value = '请输入卡密'
    return
  }
  renewLoading.value = true
  renewError.value = ''
  renewSuccess.value = false
  try {
    const res = await userStore.renew(renewCardCode.value.trim())
    if (res.ok) {
      renewSuccess.value = true
      renewCardCode.value = ''
      renewCardInfo.value = null
      setTimeout(() => {
        showRenewModal.value = false
        renewSuccess.value = false
      }, 1500)
    }
    else {
      renewError.value = res.error || '续费失败'
    }
  }
  catch (e: any) {
    renewError.value = e?.response?.data?.error || e?.message || '续费失败'
  }
  finally {
    renewLoading.value = false
  }
}

function openRenewModal() {
  renewCardCode.value = ''
  renewError.value = ''
  renewSuccess.value = false
  renewCardInfo.value = null
  showRenewModal.value = true
  showUserDropdown.value = false
}

function getDaysLabel(days: number) {
  if (days === -1)
    return '永久'
  return `${days}天`
}

async function openAnnouncementModal() {
  showUserDropdown.value = false
  announcementLoading.value = true
  showAnnouncementModal.value = true
  try {
    const res = await api.get('/api/announcement')
    if (res.data?.ok && res.data?.data) {
      announcementContent.value = res.data.data.content || ''
      announcementShowOnce.value = res.data.data.showOnce !== false
    }
  }
  catch (e) {
    console.error('获取公告失败', e)
  }
  finally {
    announcementLoading.value = false
  }
}

async function saveAnnouncement() {
  announcementSaving.value = true
  try {
    const res = await api.post('/api/admin/announcement', {
      content: announcementContent.value,
      showOnce: announcementShowOnce.value,
    })
    if (res.data?.ok) {
      showAnnouncementModal.value = false
      ElMessage.success('公告保存成功')
    }
    else {
      ElMessage.error(res.data?.error || '保存公告失败')
    }
  }
  catch (e) {
    console.error('保存公告失败', e)
    ElMessage.error('保存公告失败')
  }
  finally {
    announcementSaving.value = false
  }
}

async function fetchAnnouncement() {
  if (userStore.isAdmin)
    return
  try {
    const res = await api.get('/api/announcement')
    if (res.data?.ok && res.data?.data) {
      currentAnnouncement.value = res.data.data
      if (res.data.data.shouldShow && res.data.data.content) {
        showAnnouncementViewModal.value = true
      }
    }
  }
  catch (e) {
    console.error('获取公告失败', e)
  }
}

async function markAnnouncementRead() {
  try {
    await api.post('/api/announcement/read')
    showAnnouncementViewModal.value = false
  }
  catch (e) {
    console.error('标记公告已读失败', e)
  }
}

async function copyToken() {
  const tokenValue = userStore.token
  if (!tokenValue)
    return

  try {
    await navigator.clipboard.writeText(tokenValue)
    tokenCopied.value = true
    ElMessage.success('Token 已复制')
    setTimeout(() => {
      tokenCopied.value = false
    }, 2000)
  }
  catch (e) {
    console.error('复制失败', e)
    ElMessage.error('复制失败')
  }
}

function getPlatformBadgeType(p?: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  if (p === 'qq')
    return ''
  if (p === 'wx')
    return 'success'
  return 'info'
}
</script>

<template>
  <!-- Mobile overlay -->
  <div
    v-if="sidebarOpen"
    class="sidebar-overlay"
    @click="appStore.closeSidebar"
  />

  <!-- Sidebar aside -->
  <aside
    class="sidebar"
    :class="{ 'sidebar--open': sidebarOpen }"
    :style="{ background: 'var(--theme-bg)', color: 'var(--theme-text)' }"
  >
    <!-- Brand Header -->
    <div class="sidebar-brand">
      <div class="sidebar-brand__content">
        <el-icon :size="24" :style="{ color: 'var(--theme-primary)' }">
          <Opportunity />
        </el-icon>
        <span class="sidebar-brand__title" :style="{ backgroundImage: 'var(--theme-gradient)' }">
          QQ农场智能助手
        </span>
      </div>
      <el-button
        class="sidebar-brand__close"
        :icon="Close"
        text
        size="small"
        @click="appStore.closeSidebar"
      />
    </div>

    <!-- User Info Dropdown -->
    <div class="sidebar-user">
      <el-dropdown trigger="click" popper-class="sidebar-user-popper" @command="(cmd: string) => {
        if (cmd === 'announcement') openAnnouncementModal()
        else if (cmd === 'renew') openRenewModal()
        else if (cmd === 'logout') handleLogout()
      }">
        <div class="sidebar-user__trigger">
          <div class="sidebar-user__left">
            <el-avatar :size="32" :src="userStore.avatar || undefined">
              <el-icon><User /></el-icon>
            </el-avatar>
            <div class="sidebar-user__info">
              <span class="sidebar-user__name">{{ userStore.username || '未登录' }}</span>
              <div class="sidebar-user__meta">
                <el-tag
                  :type="userStore.isAdmin ? 'warning' : ''"
                  size="small"
                  effect="light"
                  round
                >
                  {{ userStore.isAdmin ? '管理员' : '用户' }}
                </el-tag>
                <span v-if="userStore.userCard" class="sidebar-user__card-info">
                  {{ getDaysLabel(userStore.userCard.days) }} {{ userStore.accountLimit }}额度
                </span>
              </div>
            </div>
          </div>
          <el-icon class="sidebar-user__arrow"><ArrowDown /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <div class="sidebar-user__dropdown-header">
              <div class="sidebar-user__dropdown-name">{{ userStore.username }}</div>
              <div class="sidebar-user__dropdown-role">{{ userStore.isAdmin ? '管理员' : '普通用户' }}</div>
              <template v-if="userStore.userCard">
                <div class="sidebar-user__dropdown-detail">
                  <span class="sidebar-user__dropdown-label">时长:</span>
                  <span class="sidebar-user__dropdown-value" :style="{ color: 'var(--theme-primary)' }">{{ getDaysLabel(userStore.userCard.days) }}</span>
                  <span class="sidebar-user__dropdown-label" style="margin-left: 12px;">剩余额度:</span>
                  <span class="sidebar-user__dropdown-value" :style="{ color: 'var(--theme-primary)' }">{{ userStore.accountLimit }}</span>
                </div>
                <div class="sidebar-user__dropdown-detail">
                  <span class="sidebar-user__dropdown-label">过期时间:</span>
                  <span
                    class="sidebar-user__dropdown-value"
                    :style="{ color: userStore.isExpired ? '#ef4444' : '#22c55e' }"
                  >{{ userStore.expireTimeText }}</span>
                </div>
              </template>
            </div>
            <el-dropdown-item v-if="userStore.isAdmin" command="announcement" :icon="Bell">
              设置公告
            </el-dropdown-item>
            <el-dropdown-item v-if="!userStore.isAdmin" command="renew" :icon="RefreshRight">
              续费卡密/额度
            </el-dropdown-item>
            <el-dropdown-item command="logout" :icon="SwitchButton" divided>
              <span style="color: #f56c6c;">退出登录</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- Account Selector Dropdown -->
    <div class="sidebar-account">
      <el-dropdown trigger="click" popper-class="sidebar-account-popper" @command="(cmd: string) => {
        if (cmd === 'add') { showAccountModal = true; showAccountDropdown = false }
        else if (cmd === 'manage') { router.push('/settings'); showAccountDropdown = false }
        else { selectAccount(JSON.parse(cmd)); showAccountDropdown = false }
      }">
        <div class="sidebar-account__trigger">
          <div class="sidebar-account__left">
            <el-avatar :size="32" :src="getAccountAvatarUrl(currentAccount) || undefined">
              <el-icon><User /></el-icon>
            </el-avatar>
            <div class="sidebar-account__info">
              <span class="sidebar-account__name">{{ displayName }}</span>
              <div class="sidebar-account__meta">
                <el-tag
                  v-if="platform"
                  size="small"
                  :type="getPlatformBadgeType(currentAccount?.platform)"
                  effect="light"
                  round
                >
                  {{ platform }}
                </el-tag>
                <span class="sidebar-account__uin">
                  {{ getAccountQq(currentAccount) || currentAccount?.id || '未选择' }}
                </span>
              </div>
            </div>
          </div>
          <el-icon class="sidebar-account__arrow"><ArrowDown /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu class="sidebar-account__dropdown">
            <template v-if="accounts.length > 0">
              <div
                v-for="acc in accounts"
                :key="acc.id || acc.uin"
                class="sidebar-account__item"
                :class="{ 'sidebar-account__item--active': currentAccount?.id === acc.id }"
                @click="selectAccount(acc); showAccountDropdown = false"
              >
                <el-avatar :size="24" :src="getAccountAvatarUrl(acc) || undefined">
                  <el-icon><User /></el-icon>
                </el-avatar>
                <div class="sidebar-account__item-info">
                  <span class="sidebar-account__item-name">
                    {{ acc.nick && acc.name ? `${acc.nick} (${acc.name})` : acc.name || acc.nick || acc.uin }}
                  </span>
                  <div class="sidebar-account__item-meta">
                    <el-tag
                      v-if="getPlatformLabel(acc.platform)"
                      size="small"
                      :type="getPlatformBadgeType(acc.platform)"
                      effect="light"
                      round
                    >
                      {{ getPlatformLabel(acc.platform) }}
                    </el-tag>
                    <span class="sidebar-account__item-uin">{{ getAccountQq(acc) || acc.id }}</span>
                  </div>
                </div>
                <div class="sidebar-account__item-actions">
                  <el-button
                    :icon="Edit"
                    text
                    size="small"
                    circle
                    title="修改备注"
                    @click.stop="openRemarkModal(acc)"
                  />
                  <el-icon
                    v-if="currentAccount?.id === acc.id"
                    :style="{ color: 'var(--theme-primary)' }"
                  >
                    <Check />
                  </el-icon>
                </div>
              </div>
            </template>
            <div v-else class="sidebar-account__empty">
              暂无账号
            </div>
            <el-dropdown-item divided :icon="Plus" command="add">
              添加账号
            </el-dropdown-item>
            <el-dropdown-item :icon="CirclePlus" command="manage">
              <router-link to="/settings" class="sidebar-account__manage-link">管理账号</router-link>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- Navigation Menu -->
    <el-menu
      :default-active="route.path"
      :router="true"
      class="sidebar-nav"
    >
      <el-menu-item
        v-for="item in navItems"
        :key="item.path"
        :index="item.path"
      >
        <el-icon><component :is="item.icon" /></el-icon>
        <span>{{ item.label }}</span>
      </el-menu-item>
    </el-menu>

    <!-- Token Display -->
    <div v-if="userStore.token" class="sidebar-token">
      <el-button
        text
        class="sidebar-token__toggle"
        @click="showTokenDropdown = !showTokenDropdown"
      >
        <el-icon :style="{ color: 'var(--theme-primary)' }"><Key /></el-icon>
        <span class="sidebar-token__label">我的 Token</span>
        <el-icon class="sidebar-token__arrow" :class="{ 'sidebar-token__arrow--open': showTokenDropdown }">
          <ArrowDown />
        </el-icon>
      </el-button>
      <div v-show="showTokenDropdown" class="sidebar-token__content">
        <div class="sidebar-token__actions">
          <el-button
            text
            size="small"
            :type="tokenVisible ? 'primary' : 'default'"
            @click="tokenVisible = !tokenVisible"
          >
            <el-icon><component :is="tokenVisible ? Hide : View" /></el-icon>
            <span>{{ tokenVisible ? '隐藏' : '显示' }}</span>
          </el-button>
          <el-button
            text
            size="small"
            :type="tokenCopied ? 'success' : 'default'"
            @click="copyToken"
          >
            <el-icon><component :is="tokenCopied ? Check : CopyDocument" /></el-icon>
            <span>{{ tokenCopied ? '已复制' : '复制' }}</span>
          </el-button>
        </div>
        <div class="sidebar-token__value">
          {{ tokenVisible ? userStore.token : '••••••••••••••••' }}
        </div>
      </div>
    </div>

    <!-- Footer Status -->
    <div class="sidebar-footer">
      <div class="sidebar-footer__status">
        <div class="sidebar-footer__connection">
          <span
            class="sidebar-footer__dot"
            :class="{ 'sidebar-footer__dot--pulse': connectionStatus.pulse }"
            :style="{ backgroundColor: connectionStatus.color }"
          />
          <span class="sidebar-footer__status-text">{{ connectionStatus.text }}</span>
        </div>
        <span class="sidebar-footer__uptime">{{ uptime }}</span>
      </div>
      <div class="sidebar-footer__time-row">
        <span class="sidebar-footer__time">{{ formattedTime }}</span>
        <el-popover
          placement="top-end"
          :width="280"
          trigger="click"
        >
          <template #reference>
            <el-button text size="small" class="sidebar-footer__theme-btn">
              <el-icon :style="{ color: 'var(--theme-primary)' }"><Brush /></el-icon>
            </el-button>
          </template>
          <div class="theme-grid">
            <div
              v-for="(t, theme) in appStore.themes"
              :key="theme"
              class="theme-grid__item"
              :class="{ 'theme-grid__item--active': appStore.currentTheme === theme }"
              :style="{ background: t.gradient }"
              :title="t.name"
              @click="appStore.applyTheme(theme as any)"
            >
              <el-icon :size="16" color="#fff"><component :is="t.icon" /></el-icon>
              <span class="theme-grid__name">{{ t.name }}</span>
              <span v-if="appStore.currentTheme === theme" class="theme-grid__check">
                <el-icon :size="10" :style="{ color: t.primary }"><Check /></el-icon>
              </span>
            </div>
          </div>
        </el-popover>
      </div>
      <div class="sidebar-footer__version">
        <div class="sidebar-footer__version-left">
          <span>Web v{{ version }}</span>
        </div>
        <span v-if="serverVersion">Core v{{ serverVersion }}</span>
      </div>
    </div>
  </aside>

  <!-- Account Modal -->
  <AccountModal
    :show="showAccountModal"
    :edit-data="accountToEdit"
    @close="showAccountModal = false; accountToEdit = null"
    @saved="handleAccountSaved"
  />

  <!-- Remark Modal -->
  <RemarkModal
    :show="showRemarkModal"
    :account="accountToEdit"
    @close="showRemarkModal = false"
    @saved="handleAccountSaved"
  />

  <!-- Renew Card Dialog -->
  <el-dialog
    v-model="showRenewModal"
    title="续费卡密"
    width="420px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <!-- Current status -->
    <div v-if="userStore.userCard" class="renew-current">
      <div class="renew-current__label">当前状态</div>
      <div class="renew-current__row">
        <span class="renew-current__text">时长: {{ getDaysLabel(userStore.userCard.days) }}</span>
        <span class="renew-current__text">额度: {{ userStore.accountLimit }}个账号</span>
      </div>
      <div class="renew-current__row">
        <span class="renew-current__sub">过期时间:</span>
        <span :style="{ color: userStore.isExpired ? '#f56c6c' : '#67c23a' }">{{ userStore.expireTimeText }}</span>
      </div>
    </div>

    <!-- Card code input -->
    <div class="renew-input">
      <label class="renew-input__label">卡密</label>
      <el-input
        v-model="renewCardCode"
        placeholder="请输入卡密"
        :disabled="renewLoading || renewChecking"
        clearable
      >
        <template #append>
          <el-button
            :loading="renewChecking"
            :disabled="renewLoading || !renewCardCode.trim()"
            @click="checkCardInfo"
          >
            查询
          </el-button>
        </template>
      </el-input>
    </div>

    <!-- Card info preview -->
    <el-alert
      v-if="renewCardInfo"
      type="info"
      :closable="false"
      class="renew-preview"
    >
      <template #title>
        <span class="renew-preview__title">卡密信息</span>
      </template>
      <div class="renew-preview__content">
        <div class="renew-preview__row">
          <span class="renew-preview__label">描述:</span>
          <span class="renew-preview__value">{{ renewCardInfo.description }}</span>
        </div>
        <div class="renew-preview__row">
          <span class="renew-preview__label">类型:</span>
          <el-tag
            :type="renewCardInfo.type === 'quota' ? 'warning' : ''"
            size="small"
            round
          >
            {{ renewCardInfo.type === 'quota' ? '额度卡' : '时间卡' }}
          </el-tag>
        </div>
        <div class="renew-preview__row">
          <span class="renew-preview__label">
            {{ renewCardInfo.type === 'quota' ? '额度数量:' : '时长:' }}
          </span>
          <span class="renew-preview__value">
            {{ renewCardInfo.type === 'quota' ? `+${renewCardInfo.days}个账号额度` : getDaysLabel(renewCardInfo.days) }}
          </span>
        </div>
        <div class="renew-preview__hint">
          <template v-if="renewCardInfo.type === 'quota'">
            使用后将增加 <strong>{{ renewCardInfo.days }}</strong> 个账号额度
          </template>
          <template v-else>
            使用后将增加 <strong>{{ renewCardInfo.days === -1 ? '永久' : `${renewCardInfo.days}天` }}</strong> 使用时长
          </template>
        </div>
      </div>
    </el-alert>

    <!-- Error -->
    <el-alert
      v-if="renewError"
      type="error"
      :closable="false"
      :title="renewError"
      show-icon
      class="renew-alert"
    />

    <!-- Success -->
    <el-alert
      v-if="renewSuccess"
      type="success"
      :closable="false"
      title="续费成功！"
      show-icon
      class="renew-alert"
    />

    <template #footer>
      <el-button @click="showRenewModal = false" :disabled="renewLoading">
        取消
      </el-button>
      <el-button
        v-if="!renewCardInfo"
        type="primary"
        :disabled="renewLoading || renewChecking || !renewCardCode.trim()"
        :loading="renewChecking"
        @click="checkCardInfo"
      >
        查询卡密
      </el-button>
      <el-button
        v-else
        type="primary"
        :loading="renewLoading"
        @click="handleRenew"
      >
        确认使用
      </el-button>
    </template>
  </el-dialog>

  <!-- Admin Announcement Dialog -->
  <el-dialog
    v-model="showAnnouncementModal"
    title="设置公告"
    width="500px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div v-if="announcementLoading" class="announcement-loading">
      <el-icon class="is-loading" :size="24"><Loading /></el-icon>
    </div>
    <template v-else>
      <div class="announcement-form">
        <label class="announcement-form__label">公告内容</label>
        <el-input
          v-model="announcementContent"
          type="textarea"
          :rows="6"
          placeholder="请输入公告内容（留空则不显示公告）"
        />
      </div>
      <div class="announcement-checkbox">
        <el-checkbox v-model="announcementShowOnce">
          只显示一次（公告变动时再显示）
        </el-checkbox>
      </div>
    </template>
    <template #footer>
      <el-button @click="showAnnouncementModal = false">取消</el-button>
      <el-button
        type="primary"
        :loading="announcementSaving"
        @click="saveAnnouncement"
      >
        保存
      </el-button>
    </template>
  </el-dialog>

  <!-- User Announcement View Dialog -->
  <el-dialog
    v-model="showAnnouncementViewModal"
    title="系统公告"
    width="500px"
    :close-on-click-modal="false"
    :show-close="false"
    destroy-on-close
  >
    <template #header>
      <div class="announcement-view__header">
        <el-icon :size="20" :style="{ color: 'var(--theme-primary)' }"><Bell /></el-icon>
        <span>系统公告</span>
      </div>
    </template>
    <div v-if="currentAnnouncement?.content" class="announcement-view__content">
      {{ currentAnnouncement.content }}
    </div>
    <template #footer>
      <el-button type="primary" @click="markAnnouncementRead">
        我知道了
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
/* Sidebar base */
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 292px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--app-border);
  background:
    radial-gradient(circle at 18% 12%, rgba(95, 143, 99, 0.12), transparent 28%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(246, 249, 243, 0.92)) !important;
  backdrop-filter: blur(18px);
  transition: transform 0.3s ease;
  z-index: 50;
  overflow: hidden;
}

@media (min-width: 1024px) {
  .sidebar {
    position: static;
    transform: translateX(0) !important;
  }
}

.sidebar:not(.sidebar--open) {
  transform: translateX(-100%);
}

.sidebar--open {
  transform: translateX(0);
}

/* Mobile overlay */
.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 18, 0.38);
  backdrop-filter: blur(8px);
  z-index: 40;
}

@media (min-width: 1024px) {
  .sidebar-overlay {
    display: none;
  }
}

/* Brand */
.sidebar-brand {
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid var(--app-border);
}

.sidebar-brand__content {
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.58);
  padding: 8px 12px;
  box-shadow: 0 10px 24px rgba(38, 48, 38, 0.08);
}

.sidebar-brand__title {
  font-size: 17px;
  font-weight: 800;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.sidebar-brand__close {
  display: none;
}

@media (max-width: 1023px) {
  .sidebar-brand__close {
    display: inline-flex;
  }
}

/* User section */
.sidebar-user {
  padding: 14px;
  border-bottom: 1px solid var(--app-border);
}

.sidebar-user :deep(.el-dropdown),
.sidebar-account :deep(.el-dropdown) {
  display: block;
  width: 100%;
}

.sidebar-user__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.66);
  box-shadow: 0 12px 28px rgba(38, 48, 38, 0.07);
  cursor: pointer;
  transition: background 0.2s;
}

.sidebar-user__trigger:hover {
  background: var(--el-fill-color, #ebedf0);
}

.sidebar-user__left {
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
  min-width: 0;
}

.sidebar-user__info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.sidebar-user__name {
  font-size: 14px;
  font-weight: 500;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.sidebar-user__meta {
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.sidebar-user__card-info {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-user__arrow {
  color: var(--el-text-color-secondary, #909399);
  transition: transform 0.2s;
}

.sidebar-user__dropdown-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.sidebar-user__dropdown-name {
  font-size: 14px;
  font-weight: 500;
}

.sidebar-user__dropdown-role {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
  margin-top: 2px;
}

.sidebar-user__dropdown-detail {
  margin-top: 4px;
  font-size: 12px;
}

.sidebar-user__dropdown-label {
  color: var(--el-text-color-secondary, #909399);
}

.sidebar-user__dropdown-value {
  margin-left: 4px;
  font-weight: 500;
}

/* Account section */
.sidebar-account {
  padding: 14px;
  border-bottom: 1px solid var(--app-border);
}

.sidebar-account__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.66);
  box-shadow: 0 12px 28px rgba(38, 48, 38, 0.07);
  cursor: pointer;
  transition: background 0.2s;
}

.sidebar-account__trigger:hover {
  background: var(--el-fill-color, #ebedf0);
}

.sidebar-account__left {
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
  min-width: 0;
}

.sidebar-account__info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.sidebar-account__name {
  font-size: 14px;
  font-weight: 500;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.sidebar-account__meta {
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.sidebar-account__uin {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-account__arrow {
  color: var(--el-text-color-secondary, #909399);
}

.sidebar-account__dropdown {
  width: 272px;
  max-width: calc(100vw - 32px);
  padding: 6px;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(38, 48, 38, 0.14);
}

.sidebar-account__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.sidebar-account__item:hover {
  background: var(--el-fill-color-light, #f5f7fa);
}

.sidebar-account__item--active {
  background: color-mix(in srgb, var(--theme-primary) 10%, transparent);
}

.sidebar-account__item-info {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.sidebar-account__item-name {
  font-size: 13px;
  font-weight: 500;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-account__item-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sidebar-account__item-uin {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}

.sidebar-account__item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.sidebar-account__empty {
  padding: 12px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--el-text-color-secondary, #909399);
}

.sidebar-account__manage-link {
  color: inherit;
  text-decoration: none;
}

/* Navigation */
.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  border-right: none !important;
  padding: 14px;
  background: transparent !important;
}

.sidebar-nav .el-menu-item {
  height: 46px;
  line-height: 46px;
  border: 1px solid transparent;
  border-radius: 14px;
  margin-bottom: 6px;
  font-weight: 700;
  background: transparent !important;
  color: var(--app-text-muted);
  text-shadow: none;
  box-shadow: none;
}

.sidebar-nav .el-menu-item:hover {
  background: rgba(255, 255, 255, 0.56) !important;
  color: var(--app-text);
}

.sidebar-nav .el-menu-item.is-active {
  border-color: rgba(95, 143, 99, 0.18);
  background: rgba(95, 143, 99, 0.12) !important;
  color: var(--app-accent-strong) !important;
  box-shadow: 0 12px 26px rgba(95, 143, 99, 0.1);
}

/* Token display */
.sidebar-token {
  padding: 8px 12px;
  border-top: 1px solid var(--app-border);
}

.sidebar-token__toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
}

.sidebar-token__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary, #909399);
}

.sidebar-token__arrow {
  margin-left: auto;
  color: var(--el-text-color-secondary, #909399);
  transition: transform 0.2s;
}

.sidebar-token__arrow--open {
  transform: rotate(180deg);
}

.sidebar-token__content {
  padding: 8px 4px 4px;
}

.sidebar-token__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.sidebar-token__value {
  word-break: break-all;
  font-size: 10px;
  font-family: monospace;
  padding: 6px 8px;
  border-radius: 4px;
  background: var(--el-fill-color-light, #f5f7fa);
  color: var(--el-text-color-secondary, #909399);
}

/* Footer */
.sidebar-footer {
  margin-top: auto;
  padding: 16px;
  border-top: 1px solid var(--app-border);
  background: rgba(255, 255, 255, 0.5);
}

.sidebar-footer__status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}

.sidebar-footer__connection {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sidebar-footer__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.sidebar-footer__dot--pulse {
  animation: pulse-dot 2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.sidebar-footer__status-text {
  font-size: 12px;
}

.sidebar-footer__uptime {
  font-size: 12px;
}

.sidebar-footer__time-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.sidebar-footer__time {
  font-size: 12px;
  font-family: monospace;
  color: var(--el-text-color-secondary, #909399);
}

.sidebar-footer__theme-btn {
  padding: 4px;
}

.sidebar-footer__version {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
  font-family: monospace;
  opacity: 0.5;
}

.sidebar-footer__version-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Theme grid */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.theme-grid__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s;
  position: relative;
}

.theme-grid__item:hover {
  transform: scale(1.05);
}

.theme-grid__item--active {
  box-shadow: 0 0 0 2px var(--theme-primary), 0 0 0 3px var(--theme-bg);
}

.theme-grid__name {
  font-size: 10px;
  color: #fff;
  font-weight: 500;
  line-height: 1.2;
}

.theme-grid__check {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

/* Renew modal */
.renew-current {
  padding: 12px;
  border-radius: 8px;
  background: var(--el-fill-color-light, #f5f7fa);
  margin-bottom: 16px;
}

.renew-current__label {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}

.renew-current__row {
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.renew-current__text {
  font-size: 14px;
  font-weight: 500;
}

.renew-current__sub {
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}

.renew-input {
  margin-bottom: 16px;
}

.renew-input__label {
  display: block;
  font-size: 14px;
  margin-bottom: 6px;
  color: var(--el-text-color-regular, #606266);
}

.renew-preview {
  margin-bottom: 16px;
}

.renew-preview__title {
  font-weight: 500;
}

.renew-preview__content {
  margin-top: 8px;
}

.renew-preview__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.renew-preview__label {
  font-size: 14px;
  color: var(--el-text-color-secondary, #909399);
}

.renew-preview__value {
  font-size: 14px;
  font-weight: 500;
}

.renew-preview__hint {
  margin-top: 12px;
  padding: 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
}

.renew-alert {
  margin-bottom: 12px;
}

/* Announcement */
.announcement-loading {
  display: flex;
  justify-content: center;
  padding: 32px 0;
}

.announcement-form {
  margin-bottom: 16px;
}

.announcement-form__label {
  display: block;
  font-size: 14px;
  margin-bottom: 6px;
  color: var(--el-text-color-regular, #606266);
}

.announcement-checkbox {
  margin-bottom: 16px;
}

.announcement-view__header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
}

.announcement-view__content {
  white-space: pre-wrap;
  padding: 16px;
  border-radius: 8px;
  background: var(--el-fill-color-light, #f5f7fa);
  max-height: 50vh;
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.6;
}

/* Scrollbar for nav and account list */
.sidebar-nav::-webkit-scrollbar {
  width: 4px;
}

.sidebar-nav::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar-nav::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.3);
  border-radius: 2px;
}

.sidebar-nav::-webkit-scrollbar-thumb:hover {
  background-color: rgba(156, 163, 175, 0.5);
}
</style>
