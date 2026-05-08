<script setup lang="ts">
import type { Card, UserCard } from '@/stores/user'
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Ticket,
  User,
  Document,
  Setting,
  Search,
  Refresh,
  Delete,
  Plus,
  CopyDocument,
  Loading,
  WarningFilled,
  Brush,
} from '@element-plus/icons-vue'
import api from '@/api'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

const activeTab = ref<'card' | 'user' | 'log' | 'system'>(
  (localStorage.getItem('admin-active-tab') as 'card' | 'user' | 'log' | 'system') || 'card'
)

watch(activeTab, (newTab) => {
  localStorage.setItem('admin-active-tab', newTab)
})

// ========== 卡密管理 ==========
const cards = ref<Card[]>([])
const cardsLoading = ref(false)
const showCreateModal = ref(false)

const newCard = ref({
  description: '',
  days: 30,
  count: 1,
  type: 'time' as 'time' | 'quota',
})

const selectedCardCodes = ref<string[]>([])
const selectAll = ref(false)

const searchQuery = ref('')
const filterStatus = ref<'all' | 'used' | 'unused' | 'enabled' | 'disabled'>('all')
const cardTypeFilter = ref<'all' | 'time' | 'quota'>('all')

// 卡密领取功能
const cardClaimEnabled = ref(false)
const cardClaimLoading = ref(false)

const unusedTimeCardsCount = computed(() => {
  return cards.value.filter(c => c.type === 'time' && !c.usedBy && c.enabled).length
})

const filteredCards = computed(() => {
  let result = cards.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(card =>
      card.code.toLowerCase().includes(query)
      || card.description.toLowerCase().includes(query)
      || (card.usedBy && card.usedBy.toLowerCase().includes(query)),
    )
  }

  switch (filterStatus.value) {
    case 'used':
      result = result.filter(card => card.usedBy)
      break
    case 'unused':
      result = result.filter(card => !card.usedBy)
      break
    case 'enabled':
      result = result.filter(card => card.enabled)
      break
    case 'disabled':
      result = result.filter(card => !card.enabled)
      break
  }

  if (cardTypeFilter.value !== 'all') {
    result = result.filter(card => card.type === cardTypeFilter.value)
  }

  return result
})

async function fetchCards() {
  cardsLoading.value = true
  try {
    const result = await userStore.getAllCards()
    if (result.ok) {
      cards.value = result.data
    }
    else {
      ElMessage.error(result.error || '获取卡密列表失败')
    }
  }
  catch (e: any) {
    ElMessage.error(e.message || '获取卡密列表失败')
  }
  finally {
    cardsLoading.value = false
  }
}

async function fetchCardClaimStatus() {
  cardClaimLoading.value = true
  try {
    const res = await api.get('/api/card-claim/status')
    if (res.data.ok) {
      cardClaimEnabled.value = res.data.enabled
    }
  }
  catch (e: any) {
    console.error('获取卡密领取状态失败:', e)
  }
  finally {
    cardClaimLoading.value = false
  }
}

async function toggleCardClaimStatus(enabled: boolean | undefined) {
  if (enabled === undefined) return
  cardClaimLoading.value = true
  try {
    const res = await api.post('/api/admin/card-claim/status', { enabled })
    if (res.data.ok) {
      cardClaimEnabled.value = res.data.enabled
      ElMessage.success(enabled ? '卡密领取功能已开启' : '卡密领取功能已关闭')
    }
  }
  catch (e: any) {
    ElMessage.error(e.message || '操作失败')
    cardClaimEnabled.value = !enabled
  }
  finally {
    cardClaimLoading.value = false
  }
}

async function createCard() {
  if (!newCard.value.description) {
    ElMessage.warning('请输入卡密描述')
    return
  }

  const count = Math.min(Math.max(Number.parseInt(String(newCard.value.count), 10) || 1, 1), 100)

  try {
    const result = await userStore.createCard(
      newCard.value.description,
      newCard.value.days,
      count > 1 ? count : undefined,
      newCard.value.type,
    )
    if (result.ok) {
      if (result.batch) {
        ElMessage.success(`成功创建 ${result.count} 个卡密`)
        exportCardsToFile(result.data, `卡密批量导出_${newCard.value.description}_${formatDateForFile(Date.now())}.txt`)
      }
      else {
        ElMessage.success('卡密创建成功')
      }
      showCreateModal.value = false
      newCard.value = { description: '', days: 30, count: 1, type: 'time' }
      await fetchCards()
    }
    else {
      ElMessage.error(result.error || '创建卡密失败')
    }
  }
  catch (e: any) {
    ElMessage.error(e.message || '创建卡密失败')
  }
}

async function toggleCardStatus(card: Card) {
  try {
    const result = await userStore.updateCard(card.code, { enabled: !card.enabled })
    if (result.ok) {
      ElMessage.success(card.enabled ? '卡密已禁用' : '卡密已启用')
      await fetchCards()
    }
    else {
      ElMessage.error(result.error || '操作失败')
    }
  }
  catch (e: any) {
    ElMessage.error(e.message || '操作失败')
  }
}

async function deleteCard(card: Card) {
  try {
    await ElMessageBox.confirm(
      `确定要删除卡密 ${card.code} 吗？`,
      '确认删除',
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

  try {
    const result = await userStore.deleteCard(card.code)
    if (result.ok) {
      ElMessage.success('卡密删除成功')
      await fetchCards()
    }
    else {
      ElMessage.error(result.error || '删除卡密失败')
    }
  }
  catch (e: any) {
    ElMessage.error(e.message || '删除卡密失败')
  }
}

async function deleteSelectedCards() {
  const selectedCodes = [...selectedCardCodes.value]
  if (selectedCodes.length === 0) {
    ElMessage.warning('请先选择要删除的卡密')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedCodes.length} 个卡密吗？此操作不可恢复！`,
      '批量删除确认',
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

  try {
    const result = await userStore.deleteCardsBatch(selectedCodes)
    if (result.ok) {
      ElMessage.success(`成功删除 ${result.deletedCount} 个卡密`)
      if (result.notFoundCount > 0) {
        ElMessage.warning(`${result.notFoundCount} 个卡密未找到`)
      }
      selectedCardCodes.value = []
      selectAll.value = false
      await fetchCards()
    }
    else {
      ElMessage.error(result.error || '批量删除卡密失败')
    }
  }
  catch (e: any) {
    ElMessage.error(e.message || '批量删除卡密失败')
  }
}

async function copyCode(code: string) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(code)
      ElMessage.success('卡密已复制到剪贴板')
    }
    else {
      const textArea = document.createElement('textarea')
      textArea.value = code
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      ElMessage.success('卡密已复制到剪贴板')
      document.body.removeChild(textArea)
    }
  }
  catch (e) {
    ElMessage.error('复制失败，请手动复制')
    console.error('复制失败:', e)
  }
}

async function copySelectedCards() {
  const codes = [...selectedCardCodes.value]
  if (codes.length === 0) return

  try {
    const text = codes.join('\n')
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      ElMessage.success(`已复制 ${codes.length} 个卡密到剪贴板`)
    }
    else {
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      ElMessage.success(`已复制 ${codes.length} 个卡密到剪贴板`)
      document.body.removeChild(textArea)
    }
  }
  catch (e) {
    ElMessage.error('复制失败，请手动复制')
    console.error('复制失败:', e)
  }
}

function formatDate(timestamp: number | null) {
  if (!timestamp)
    return '-'
  return new Date(timestamp).toLocaleString('zh-CN')
}

function formatDateForFile(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`
}

function getCardTypeLabel(card: Card) {
  if (card.type === 'quota') {
    return '额度'
  }
  return '时间'
}

function getCardValueLabel(card: Card) {
  if (card.type === 'quota') {
    return `+${card.days}额度`
  }
  if (card.days === -1)
    return '永久'
  return `${card.days}天`
}

function exportCardsToFile(cardsToExport: Card[], filename?: string) {
  if (!cardsToExport || cardsToExport.length === 0) {
    ElMessage.warning('没有可导出的卡密')
    return
  }

  const content = cardsToExport.map(card =>
    `卡密: ${card.code}\n描述: ${card.description}\n时长: ${getCardTypeLabel(card)}\n状态: ${card.enabled ? '启用' : '禁用'}\n${card.usedBy ? `使用者: ${card.usedBy}\n使用时间: ${formatDate(card.usedAt)}` : '未使用'}\n创建时间: ${formatDate(card.createdAt)}\n${'='.repeat(40)}`,
  ).join('\n\n')

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename || `卡密导出_${formatDateForFile(Date.now())}.txt`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  ElMessage.success(`已导出 ${cardsToExport.length} 个卡密到文件`)
}

function handleSelectionChange(selection: Card[]) {
  selectedCardCodes.value = selection.map(card => card.code)
  selectAll.value = selection.length === filteredCards.value.length && filteredCards.value.length > 0
}

function handleSelectAll(selection: Card[]) {
  selectedCardCodes.value = selection.map(card => card.code)
  selectAll.value = selection.length === filteredCards.value.length && filteredCards.value.length > 0
}

// ========== 用户管理 ==========
interface UserInfo {
  username: string
  role: string
  card: UserCard | null
  accountLimit: number
}

interface EditForm {
  newUsername: string
  password: string
  accountLimit: number
  expiresAt: string
  isPermanent: boolean
}

const users = ref<UserInfo[]>([])
const usersLoading = ref(false)
const showEditModal = ref(false)
const selectedUser = ref<UserInfo | null>(null)
const editForm = ref<EditForm>({
  newUsername: '',
  password: '',
  accountLimit: 2,
  expiresAt: '',
  isPermanent: false,
})
const editLoading = ref(false)

const currentUsername = computed(() => userStore.username)

async function fetchUsers() {
  usersLoading.value = true
  try {
    const result = await userStore.getAllUsers()
    if (result.ok) {
      users.value = result.data
    }
    else {
      ElMessage.error(result.error || '获取用户列表失败')
    }
  }
  catch (e: any) {
    ElMessage.error(e.message || '获取用户列表失败')
  }
  finally {
    usersLoading.value = false
  }
}

async function toggleUserStatus(user: UserInfo) {
  try {
    const updates: Partial<UserCard> = { enabled: !user.card?.enabled }
    const result = await userStore.updateUser(user.username, updates)
    if (result.ok) {
      ElMessage.success(user.card?.enabled ? '用户已封禁' : '用户已解封')
      await fetchUsers()
    }
    else {
      ElMessage.error(result.error || '操作失败')
    }
  }
  catch (e: any) {
    ElMessage.error(e.message || '操作失败')
  }
}

async function deleteUser(user: UserInfo) {
  try {
    await ElMessageBox.confirm(
      `确定要删除用户 ${user.username} 吗？此操作不可恢复！`,
      '确认删除',
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

  try {
    const result = await userStore.deleteUser(user.username)
    if (result.ok) {
      ElMessage.success('用户删除成功')
      await fetchUsers()
    }
    else {
      ElMessage.error(result.error || '删除用户失败')
    }
  }
  catch (e: any) {
    ElMessage.error(e.message || '删除用户失败')
  }
}

function openEditModal(user: UserInfo) {
  selectedUser.value = user
  editForm.value = {
    newUsername: user.username,
    password: '',
    accountLimit: user.accountLimit || 2,
    expiresAt: user.card?.expiresAt ? formatDateTimeLocal(user.card.expiresAt) : '',
    isPermanent: user.card?.days === -1,
  }
  showEditModal.value = true
}

function formatDateTimeLocal(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

async function handleEdit() {
  if (!selectedUser.value)
    return

  editLoading.value = true
  try {
    const expiresAtValue = editForm.value.isPermanent
      ? null
      : (editForm.value.expiresAt ? new Date(editForm.value.expiresAt).getTime() : null)

    const updateData: Record<string, any> = {
      accountLimit: editForm.value.accountLimit,
      expiresAt: expiresAtValue,
      isPermanent: editForm.value.isPermanent,
    }

    if (editForm.value.newUsername && editForm.value.newUsername !== selectedUser.value.username) {
      updateData.newUsername = editForm.value.newUsername
    }

    if (editForm.value.password) {
      updateData.password = editForm.value.password
    }

    const res = await api.post(`/api/admin/users/${selectedUser.value.username}/edit`, updateData)

    if (res.data.ok) {
      ElMessage.success('用户信息已更新')
      showEditModal.value = false
      await fetchUsers()
    }
    else {
      ElMessage.error(res.data.error || '更新失败')
    }
  }
  catch (e: any) {
    ElMessage.error(e?.response?.data?.error || e?.message || '更新失败')
  }
  finally {
    editLoading.value = false
  }
}

function getDaysLabel(days: number) {
  if (days === -1)
    return '永久'
  return `${days}天`
}

function isExpired(card: UserCard | null) {
  if (!card?.expiresAt)
    return false
  return Date.now() > card.expiresAt
}

// ========== 登录日志 ==========
interface LoginLog {
  id: string
  timestamp: number
  event: 'login_success' | 'login_failed'
  username: string
  errorType: string | null
  ip: string
  userAgent: string
}

const loginLogs = ref<LoginLog[]>([])
const loginLogsLoading = ref(false)
const loginLogsTotal = ref(0)
const clearLogsLoading = ref(false)

async function fetchLoginLogs() {
  loginLogsLoading.value = true
  try {
    const result = await userStore.getLoginLogs(100, 0)
    if (result.ok) {
      loginLogs.value = result.data.logs
      loginLogsTotal.value = result.data.total
    }
    else {
      ElMessage.error(result.error || '获取登录日志失败')
    }
  }
  catch (e: any) {
    ElMessage.error(e.message || '获取登录日志失败')
  }
  finally {
    loginLogsLoading.value = false
  }
}

async function openClearLogsConfirm() {
  if (loginLogsTotal.value === 0) {
    ElMessage.warning('暂无日志可清空')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要清空所有登录日志吗？此操作不可恢复。\n当前共有 ${loginLogsTotal.value} 条记录`,
      '确认清空日志',
      {
        confirmButtonText: '确认清空',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    await confirmClearLogs()
  }
  catch {
    // cancelled
  }
}

async function confirmClearLogs() {
  clearLogsLoading.value = true
  try {
    const result = await userStore.clearLoginLogs()
    if (result.ok) {
      ElMessage.success('日志已清空')
      loginLogs.value = []
      loginLogsTotal.value = 0
    }
    else {
      ElMessage.error(result.error || '清空失败')
    }
  }
  catch (e: any) {
    ElMessage.error(e.message || '清空失败')
  }
  finally {
    clearLogsLoading.value = false
  }
}

function formatLogTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN')
}

function getEventLabel(event: string): string {
  return event === 'login_success' ? '登录成功' : '登录失败'
}

function getEventTagType(event: string): 'success' | 'danger' {
  return event === 'login_success' ? 'success' : 'danger'
}

function getErrorTypeLabel(errorType: string | null): string {
  if (!errorType) return '-'
  const labels: Record<string, string> = {
    'rate_limit': '速率限制',
    'locked': '账户锁定',
    'invalid_credentials': '凭证错误',
  }
  return labels[errorType] || errorType
}

function parseBrowser(userAgent: string): string {
  if (!userAgent || userAgent === 'unknown') return '未知'

  if (userAgent.includes('Edg/')) {
    const match = userAgent.match(/Edg\/([\d.]+)/)
    return `Edge ${match ? match[1] : ''}`
  }
  if (userAgent.includes('Chrome/')) {
    const match = userAgent.match(/Chrome\/([\d.]+)/)
    return `Chrome ${match ? match[1] : ''}`
  }
  if (userAgent.includes('Firefox/')) {
    const match = userAgent.match(/Firefox\/([\d.]+)/)
    return `Firefox ${match ? match[1] : ''}`
  }
  if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) {
    const match = userAgent.match(/Version\/([\d.]+)/)
    return `Safari ${match ? match[1] : ''}`
  }
  if (userAgent.includes('MSIE') || userAgent.includes('Trident/')) {
    return 'IE'
  }

  return '其他'
}

// ========== 系统配置 ==========
const systemConfigSaving = ref(false)
const systemConfigLoading = ref(false)

const localSystemConfig = ref({
  serverUrl: 'wss://gate-obt.nqf.qq.com/prod/ws',
  clientVersion: '1.10.0.13_20260417',
  platform: 'qq',
  os: 'iOS',
})

const defaultSystemConfig = ref({
  serverUrl: 'wss://gate-obt.nqf.qq.com/prod/ws',
  clientVersion: '1.10.0.13_20260417',
  platform: 'qq',
  os: 'iOS',
})

const wxConfigSaving = ref(false)

const localWxConfig = ref({
  enabled: true,
  apiBase: 'http://127.0.0.1:8059/api',
  apiKey: '',
  proxyApiUrl: 'http://127.0.0.1:8059/api',
  appId: 'wx5306c5978fdb76e4',
  autoAddAccount: true,
  userIsolation: true,
})

const platformOptions = [
  { label: 'QQ', value: 'qq' },
  { label: '微信', value: 'wx' },
]

const osOptions = [
  { label: 'iOS', value: 'iOS' },
  { label: 'Android', value: 'Android' },
]

async function loadWxConfig() {
  try {
    const { data } = await api.get('/api/admin/wx-config')
    if (data?.ok && data.data) {
      localWxConfig.value = { ...data.data }
    }
  }
  catch (e: any) {
    console.error('加载微信配置失败:', e)
  }
}

async function handleSaveWxConfig() {
  wxConfigSaving.value = true
  try {
    const { data } = await api.post('/api/admin/wx-config', localWxConfig.value)
    if (data?.ok) {
      ElMessage.success('微信配置已保存，全局应用生效')
    }
    else {
      ElMessageBox.alert(data?.error || '保存失败', '错误', { type: 'error' })
    }
  }
  catch (e: any) {
    ElMessageBox.alert(`保存失败: ${e.message || '未知错误'}`, '错误', { type: 'error' })
  }
  finally {
    wxConfigSaving.value = false
  }
}

async function handleResetWxConfig() {
  localWxConfig.value = {
    enabled: true,
    apiBase: 'http://127.0.0.1:8059/api',
    apiKey: '',
    proxyApiUrl: 'http://127.0.0.1:8059/api',
    appId: 'wx5306c5978fdb76e4',
    autoAddAccount: true,
    userIsolation: true,
  }
  ElMessage.success('微信配置已重置为默认值')
}

async function loadSystemConfig() {
  systemConfigLoading.value = true
  try {
    const { data } = await api.get('/api/admin/system-config')
    if (data?.ok) {
      if (data.data.saved) {
        localSystemConfig.value = { ...data.data.saved }
      }
      if (data.data.default) {
        defaultSystemConfig.value = { ...data.data.default }
      }
    }
  }
  catch (e: any) {
    console.error('加载系统配置失败:', e)
  }
  finally {
    systemConfigLoading.value = false
  }
}

async function handleSaveSystemConfig() {
  systemConfigSaving.value = true
  try {
    const { data } = await api.post('/api/admin/system-config', localSystemConfig.value)
    if (data?.ok) {
      ElMessage.success('系统配置已保存并立即生效，无需重启项目')
    }
    else {
      ElMessageBox.alert(data?.error || '保存失败', '错误', { type: 'error' })
    }
  }
  catch (e: any) {
    ElMessageBox.alert(`保存失败: ${e.message || '未知错误'}`, '错误', { type: 'error' })
  }
  finally {
    systemConfigSaving.value = false
  }
}

async function handleResetSystemConfig() {
  systemConfigSaving.value = true
  try {
    const { data } = await api.post('/api/admin/system-config/reset')
    if (data?.ok) {
      localSystemConfig.value = { ...data.data.saved }
      ElMessage.success('系统配置已重置为默认值')
    }
    else {
      ElMessageBox.alert(data?.error || '重置失败', '错误', { type: 'error' })
    }
  }
  catch (e: any) {
    ElMessageBox.alert(`重置失败: ${e.message || '未知错误'}`, '错误', { type: 'error' })
  }
  finally {
    systemConfigSaving.value = false
  }
}

onMounted(() => {
  fetchCards()
  fetchUsers()
  fetchLoginLogs()
  loadSystemConfig()
  loadWxConfig()
  fetchCardClaimStatus()
})
</script>

<template>
  <div class="admin-panel">
    <div class="page-header">
      <h1 class="page-title">
        <el-icon><WarningFilled /></el-icon>
        后台管理
      </h1>
    </div>

    <el-card shadow="never">
      <el-tabs v-model="activeTab">
        <!-- 卡密管理 -->
        <el-tab-pane name="card">
          <template #label>
            <span class="tab-label">
              <el-icon><Ticket /></el-icon>
              卡密
            </span>
          </template>

          <div class="section-header">
            <h3 class="section-title">卡密管理</h3>
            <div class="section-actions">
              <el-button @click="fetchCards">
                <el-icon><Refresh /></el-icon>
                刷新
              </el-button>
              <el-button type="primary" @click="showCreateModal = true">
                <el-icon><Plus /></el-icon>
                创建卡密
              </el-button>
            </div>
          </div>

          <!-- 卡密领取功能开关 -->
          <el-card shadow="never" class="claim-card">
            <div class="claim-row">
              <div>
                <h4 class="claim-title">卡密领取功能</h4>
                <p class="claim-desc">开启后，用户注册时可免费领取一张时间卡密</p>
              </div>
              <div class="claim-actions">
                <span class="claim-stock">
                  库存:
                  <span :class="unusedTimeCardsCount > 0 ? 'stock-ok' : 'stock-empty'">
                    {{ unusedTimeCardsCount }}
                  </span>
                  张
                </span>
                <el-switch
                  v-model="cardClaimEnabled"
                  :disabled="cardClaimLoading"
                  @change="toggleCardClaimStatus"
                />
              </div>
            </div>
          </el-card>

          <!-- Card type filter -->
          <div class="filter-row">
            <el-radio-group v-model="cardTypeFilter" size="small">
              <el-radio-button value="all">全部</el-radio-button>
              <el-radio-button value="time">时间卡密</el-radio-button>
              <el-radio-button value="quota">配额卡密</el-radio-button>
            </el-radio-group>
          </div>

          <!-- Search and status filter -->
          <div class="search-row">
            <el-input
              v-model="searchQuery"
              placeholder="搜索卡密、描述或使用者..."
              clearable
              class="search-input"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-select v-model="filterStatus" placeholder="全部状态" style="width: 140px;">
              <el-option label="全部状态" value="all" />
              <el-option label="未使用" value="unused" />
              <el-option label="已使用" value="used" />
              <el-option label="已启用" value="enabled" />
              <el-option label="已禁用" value="disabled" />
            </el-select>
          </div>

          <!-- Batch actions -->
          <el-alert
            v-if="selectedCardCodes.length > 0"
            :closable="false"
            class="batch-alert"
          >
            <div class="batch-row">
              <span class="batch-count">已选择 {{ selectedCardCodes.length }} 个卡密</span>
              <el-button size="small" @click="copySelectedCards">
                <el-icon><CopyDocument /></el-icon>
                一键复制
              </el-button>
              <el-button size="small" type="danger" @click="deleteSelectedCards">
                <el-icon><Delete /></el-icon>
                批量删除
              </el-button>
              <el-button
                size="small"
                link
                class="clear-selection"
                @click="selectedCardCodes = []; selectAll = false"
              >
                清除选择
              </el-button>
            </div>
          </el-alert>

          <!-- Cards table -->
          <div v-if="cardsLoading" class="loading-container">
            <el-icon class="is-loading" :size="32"><Loading /></el-icon>
            <span>加载中...</span>
          </div>

          <el-table
            v-else
            :data="filteredCards"
            stripe
            @selection-change="handleSelectionChange"
            @select-all="handleSelectAll"
          >
            <el-table-column type="selection" width="50" />
            <el-table-column label="卡密" min-width="140">
              <template #default="{ row }">
                <el-tag effect="plain" size="small" class="code-tag">{{ row.code }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="description" label="描述" min-width="120" />
            <el-table-column label="类型" width="80" align="center">
              <template #default="{ row }">
                <el-tag
                  size="small"
                  :type="row.type === 'quota' ? 'warning' : ''"
                >
                  {{ getCardTypeLabel(row) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="数值" width="100" align="center">
              <template #default="{ row }">
                {{ getCardValueLabel(row) }}
              </template>
            </el-table-column>
            <el-table-column label="状态" width="80" align="center">
              <template #default="{ row }">
                <el-tag
                  size="small"
                  :type="row.enabled ? 'success' : 'danger'"
                >
                  {{ row.enabled ? '启用' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="使用者" min-width="100">
              <template #default="{ row }">
                {{ row.usedBy || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="生成时间" width="170">
              <template #default="{ row }">
                {{ row.createdAt ? new Date(row.createdAt).toLocaleString() : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="使用时间" width="170">
              <template #default="{ row }">
                {{ row.usedAt ? new Date(row.usedAt).toLocaleString() : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200" align="right" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="copyCode(row.code)">
                  复制
                </el-button>
                <el-button link type="primary" size="small" @click="toggleCardStatus(row)">
                  {{ row.enabled ? '禁用' : '启用' }}
                </el-button>
                <el-button link type="danger" size="small" @click="deleteCard(row)">
                  删除
                </el-button>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty description="暂无卡密" :image-size="60" />
            </template>
          </el-table>
        </el-tab-pane>

        <!-- 用户管理 -->
        <el-tab-pane name="user">
          <template #label>
            <span class="tab-label">
              <el-icon><User /></el-icon>
              用户
            </span>
          </template>

          <div class="section-header">
            <h3 class="section-title">用户管理</h3>
            <el-button type="primary" @click="fetchUsers">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>

          <div v-if="usersLoading" class="loading-container">
            <el-icon class="is-loading" :size="32"><Loading /></el-icon>
            <span>加载中...</span>
          </div>

          <el-table
            v-else
            :data="users"
            stripe
            border
          >
            <el-table-column prop="username" label="用户名" min-width="120">
              <template #default="{ row }">
                <span class="font-medium">{{ row.username }}</span>
              </template>
            </el-table-column>
            <el-table-column label="角色" width="100" align="center">
              <template #default="{ row }">
                <el-tag
                  size="small"
                  :type="row.role === 'admin' ? 'warning' : 'info'"
                >
                  {{ row.role === 'admin' ? '管理员' : '用户' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="额度" width="100" align="center">
              <template #default="{ row }">
                <el-tag
                  size="small"
                  :type="row.role === 'admin' ? 'warning' : 'danger'"
                >
                  {{ row.role === 'admin' ? '无限制' : `${row.accountLimit || 2}个` }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="时长" width="80" align="center">
              <template #default="{ row }">
                {{ row.card ? getDaysLabel(row.card.days) : '无' }}
              </template>
            </el-table-column>
            <el-table-column label="过期时间" width="170">
              <template #default="{ row }">
                <span :class="{ 'text-danger': isExpired(row.card) }">
                  {{ formatDate(row.card?.expiresAt || null) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90" align="center">
              <template #default="{ row }">
                <el-tag
                  v-if="row.card"
                  size="small"
                  :type="row.card.enabled === false ? 'danger' : (isExpired(row.card) ? 'warning' : 'success')"
                >
                  {{ row.card.enabled === false ? '封禁' : (isExpired(row.card) ? '已过期' : '正常') }}
                </el-tag>
                <span v-else class="text-muted">-</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="180" align="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openEditModal(row)">
                  编辑
                </el-button>
                <el-button
                  v-if="row.card"
                  link
                  type="warning"
                  size="small"
                  @click="toggleUserStatus(row)"
                >
                  {{ row.card.enabled === false ? '解封' : '封禁' }}
                </el-button>
                <el-button
                  v-if="row.username !== currentUsername"
                  link
                  type="danger"
                  size="small"
                  @click="deleteUser(row)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty description="暂无用户" :image-size="60" />
            </template>
          </el-table>
        </el-tab-pane>

        <!-- 登录日志 -->
        <el-tab-pane name="log">
          <template #label>
            <span class="tab-label">
              <el-icon><Document /></el-icon>
              日志
            </span>
          </template>

          <div class="section-header">
            <h3 class="section-title">登录日志</h3>
            <div class="section-actions">
              <el-button type="danger" @click="openClearLogsConfirm">
                <el-icon><Delete /></el-icon>
                清空日志
              </el-button>
              <el-button
                type="primary"
                :loading="loginLogsLoading"
                @click="fetchLoginLogs"
              >
                <el-icon><Refresh /></el-icon>
                刷新
              </el-button>
            </div>
          </div>

          <div v-if="loginLogsLoading" class="loading-container">
            <el-icon class="is-loading" :size="32"><Loading /></el-icon>
            <span>加载中...</span>
          </div>

          <el-table
            v-else
            :data="loginLogs"
            stripe
            border
          >
            <el-table-column label="时间" width="170">
              <template #default="{ row }">
                {{ formatLogTime(row.timestamp) }}
              </template>
            </el-table-column>
            <el-table-column label="事件" width="100" align="center">
              <template #default="{ row }">
                <el-tag
                  size="small"
                  :type="getEventTagType(row.event)"
                >
                  {{ getEventLabel(row.event) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="username" label="用户名" min-width="120">
              <template #default="{ row }">
                <span class="font-medium">{{ row.username }}</span>
              </template>
            </el-table-column>
            <el-table-column label="错误类型" width="120">
              <template #default="{ row }">
                {{ getErrorTypeLabel(row.errorType) }}
              </template>
            </el-table-column>
            <el-table-column prop="ip" label="IP地址" width="140">
              <template #default="{ row }">
                <span class="mono-text">{{ row.ip }}</span>
              </template>
            </el-table-column>
            <el-table-column label="浏览器" min-width="120">
              <template #default="{ row }">
                {{ parseBrowser(row.userAgent) }}
              </template>
            </el-table-column>
            <template #empty>
              <el-empty description="暂无登录日志" :image-size="60" />
            </template>
          </el-table>

          <div v-if="loginLogsTotal > 0" class="log-footer">
            共 {{ loginLogsTotal }} 条记录
          </div>
        </el-tab-pane>

        <!-- 系统配置 -->
        <el-tab-pane name="system">
          <template #label>
            <span class="tab-label">
              <el-icon><Setting /></el-icon>
              系统
            </span>
          </template>

          <h3 class="section-title" style="margin-bottom: 16px;">系统配置</h3>

          <div class="config-sections">
            <!-- System config -->
            <el-card shadow="never" class="config-card">
              <template #header>
                <div class="config-card-header">
                  <el-icon><Setting /></el-icon>
                  <span>系统配置</span>
                </div>
              </template>

              <el-form label-width="120px" label-position="top">
                <el-form-item label="服务器地址">
                  <el-input v-model="localSystemConfig.serverUrl" placeholder="wss://..." />
                </el-form-item>
                <el-form-item label="客户端版本">
                  <el-input v-model="localSystemConfig.clientVersion" placeholder="1.10.0.13_20260417" />
                </el-form-item>
                <div class="config-row-2col">
                  <el-form-item label="平台">
                    <el-radio-group v-model="localSystemConfig.platform">
                      <el-radio-button
                        v-for="option in platformOptions"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                  <el-form-item label="系统">
                    <el-radio-group v-model="localSystemConfig.os">
                      <el-radio-button
                        v-for="option in osOptions"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </el-radio-button>
                    </el-radio-group>
                  </el-form-item>
                </div>
              </el-form>

              <div class="config-actions">
                <el-button
                  :loading="systemConfigSaving"
                  @click="handleResetSystemConfig"
                >
                  重置
                </el-button>
                <el-button
                  type="primary"
                  :loading="systemConfigSaving"
                  @click="handleSaveSystemConfig"
                >
                  保存
                </el-button>
              </div>
            </el-card>

            <!-- WeChat config -->
            <el-card shadow="never" class="config-card">
              <template #header>
                <div class="config-card-header">
                  <el-icon><User /></el-icon>
                  <span>微信配置</span>
                </div>
              </template>

              <el-alert
                type="info"
                :closable="false"
                show-icon
                class="wx-tip"
              >
                <ul class="wx-tip-list">
                  <li>启用微信登录：关闭后普通用户无法使用微信扫码登录</li>
                  <li>自动添加账号：扫码成功后自动添加账号，关闭则只返回Code</li>
                  <li>用户隔离：开启后普通用户只能看到自己的账号</li>
                </ul>
              </el-alert>

              <el-form label-position="top">
                <el-form-item label="启用微信登录">
                  <el-switch v-model="localWxConfig.enabled" />
                </el-form-item>
                <el-form-item label="API地址">
                  <el-input v-model="localWxConfig.apiBase" placeholder="http://127.0.0.1:8059/api" />
                </el-form-item>
                <el-form-item label="API密钥">
                  <el-input v-model="localWxConfig.apiKey" placeholder="可选，用于代理模式" />
                </el-form-item>
                <el-form-item label="代理API地址">
                  <el-input v-model="localWxConfig.proxyApiUrl" placeholder="http://127.0.0.1:8059/api" />
                </el-form-item>
                <div class="config-row-2col">
                  <el-form-item label="自动添加账号">
                    <el-switch v-model="localWxConfig.autoAddAccount" />
                  </el-form-item>
                  <el-form-item label="用户隔离">
                    <el-switch v-model="localWxConfig.userIsolation" />
                  </el-form-item>
                </div>
              </el-form>

              <div class="config-actions">
                <el-button
                  :loading="wxConfigSaving"
                  @click="handleResetWxConfig"
                >
                  重置
                </el-button>
                <el-button
                  type="primary"
                  :loading="wxConfigSaving"
                  @click="handleSaveWxConfig"
                >
                  保存
                </el-button>
              </div>
            </el-card>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- Create card dialog -->
    <el-dialog
      v-model="showCreateModal"
      title="创建卡密"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top">
        <el-form-item label="描述">
          <el-input v-model="newCard.description" placeholder="例如：月卡-2024" />
        </el-form-item>
        <el-form-item label="卡密类型">
          <el-radio-group v-model="newCard.type">
            <el-radio value="time">时间卡（增加使用时长）</el-radio>
            <el-radio value="quota">额度卡（增加账号额度）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="newCard.type === 'quota' ? '额度数量' : '天数'">
          <el-input-number
            v-model="newCard.days"
            :min="-1"
            :max="9999"
            :placeholder="newCard.type === 'quota' ? '可添加的账号数量' : '天数'"
            style="width: 100%;"
          />
          <div class="form-hint">
            <template v-if="newCard.type === 'time'">
              输入-1表示永久，其他数字表示天数
            </template>
            <template v-else>
              用户使用后可增加的账号额度数量
            </template>
          </div>
        </el-form-item>
        <el-form-item label="数量">
          <el-input-number
            v-model="newCard.count"
            :min="1"
            :max="100"
            style="width: 100%;"
          />
          <div class="form-hint">
            批量创建数量（1-100），批量创建后会自动导出文件
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateModal = false">取消</el-button>
        <el-button type="primary" @click="createCard">创建</el-button>
      </template>
    </el-dialog>

    <!-- Edit user dialog -->
    <el-dialog
      v-model="showEditModal"
      :title="`编辑用户：${selectedUser?.username}`"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form label-position="top">
        <el-form-item label="用户名">
          <el-input v-model="editForm.newUsername" placeholder="输入新用户名（留空则不修改）" />
          <div class="form-hint">用户名只能包含字母、数字和下划线，长度3-32位</div>
        </el-form-item>
        <el-form-item label="新密码">
          <el-input
            v-model="editForm.password"
            type="password"
            placeholder="输入新密码（留空则不修改）"
            show-password
          />
          <div class="form-hint">密码长度至少6位，需包含大写字母、小写字母、数字、特殊符号中的至少两种</div>
        </el-form-item>
        <el-form-item label="账号额度">
          <el-input-number
            v-model="editForm.accountLimit"
            :min="1"
            style="width: 100%;"
          />
          <div class="form-hint">用户最多可添加的农场账号数量</div>
        </el-form-item>
        <el-form-item label="过期时间">
          <div class="permanent-row">
            <el-checkbox v-model="editForm.isPermanent">永久有效</el-checkbox>
          </div>
          <el-date-picker
            v-if="!editForm.isPermanent"
            v-model="editForm.expiresAt"
            type="datetime"
            placeholder="选择过期时间"
            style="width: 100%; margin-top: 8px;"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditModal = false">取消</el-button>
        <el-button
          type="primary"
          :loading="editLoading"
          @click="handleEdit"
        >
          {{ editLoading ? '保存中...' : '保存' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-panel {
  padding: 16px;
}

.page-header {
  margin-bottom: 16px;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 24px;
  font-weight: 700;
  margin: 0;
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* Section headers */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.section-actions {
  display: flex;
  gap: 8px;
}

/* Loading */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 0;
  color: var(--el-text-color-secondary);
}

/* Claim card */
.claim-card {
  margin-bottom: 16px;
}

.claim-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.claim-title {
  font-size: 14px;
  font-weight: 500;
  margin: 0;
}

.claim-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.claim-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.claim-stock {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.stock-ok {
  font-weight: 500;
  color: var(--el-color-success);
}

.stock-empty {
  font-weight: 500;
  color: var(--el-color-danger);
}

/* Filters */
.filter-row {
  margin-bottom: 12px;
}

.search-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.search-input {
  width: 280px;
}

/* Batch selection */
.batch-alert {
  margin-bottom: 16px;
}

.batch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.batch-count {
  font-weight: 500;
  color: var(--el-color-primary);
}

.clear-selection {
  margin-left: auto;
}

/* Code tag */
.code-tag {
  font-family: monospace;
}

/* User table */
.font-medium {
  font-weight: 500;
}

.text-danger {
  color: var(--el-color-danger);
}

.text-muted {
  color: var(--el-text-color-secondary);
}

.mono-text {
  font-family: monospace;
}

/* Log footer */
.log-footer {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

/* Config sections */
.config-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.config-row-2col {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
}

@media (min-width: 640px) {
  .config-row-2col {
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
}

.config-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

/* WeChat tip */
.wx-tip {
  margin-bottom: 16px;
}

.wx-tip-list {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  line-height: 1.8;
}

/* Form hints */
.form-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* Permanent row */
.permanent-row {
  margin-bottom: 4px;
}
</style>
