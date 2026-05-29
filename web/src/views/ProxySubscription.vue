<template>
  <div class="proxy-subscription-container">
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span class="title">📡 VPN订阅管理</span>
          <el-button type="primary" @click="handleRefresh" :loading="refreshing">
            <el-icon><Refresh /></el-icon>
            刷新缓存
          </el-button>
        </div>
      </template>

      <!-- 提示信息 -->
      <el-alert type="success" :closable="false" class="info-alert">
        <template #title>VPN订阅链接已准备好</template>
        <p>将下面的链接复制到你的代理客户端（Clash、小火箭等）中导入</p>
      </el-alert>

      <!-- 订阅链接信息 -->
      <div v-if="subscriptionInfo" class="subscription-content">
        <!-- Clash订阅 -->
        <div class="subscription-section">
          <h3>🔵 Clash 订阅（推荐）</h3>
          <p class="description">适用于: Clash、Clash Verge、Clash Meta 等</p>
          
          <div class="link-box">
            <el-input 
              :model-value="subscriptionInfo.clash.url" 
              readonly
              class="link-input"
            />
            <el-button @click="copyLink(subscriptionInfo.clash.url, 'Clash')">
              <el-icon><DocumentCopy /></el-icon>
              复制
            </el-button>
          </div>

          <div class="qr-section">
            <p style="margin-bottom: 10px; font-size: 12px; color: #666;">
              或扫描二维码导入：
            </p>
            <img 
              :src="subscriptionInfo.clash.qrCode" 
              alt="Clash QR Code"
              class="qr-code"
              @click="showQrDialog(subscriptionInfo.clash.qrCode, 'Clash')"
            />
          </div>
        </div>

        <el-divider />

        <!-- 小火箭订阅 -->
        <div class="subscription-section">
          <h3>🟢 小火箭 / iOS 订阅</h3>
          <p class="description">适用于: Shadowrocket、Quantumult X、Surge 等iOS客户端</p>
          
          <div class="link-box">
            <el-input 
              :model-value="subscriptionInfo.shadowrocket.url" 
              readonly
              class="link-input"
            />
            <el-button @click="copyLink(subscriptionInfo.shadowrocket.url, '小火箭')">
              <el-icon><DocumentCopy /></el-icon>
              复制
            </el-button>
          </div>

          <div class="qr-section">
            <p style="margin-bottom: 10px; font-size: 12px; color: #666;">
              或扫描二维码导入：
            </p>
            <img 
              :src="subscriptionInfo.shadowrocket.qrCode" 
              alt="Shadowrocket QR Code"
              class="qr-code"
              @click="showQrDialog(subscriptionInfo.shadowrocket.qrCode, '小火箭')"
            />
          </div>
        </div>

        <el-divider />

        <!-- 使用说明 -->
        <div class="instructions">
          <h3>📖 使用说明</h3>
          <ol>
            <li>选择与你的客户端对应的订阅链接</li>
            <li>在客户端中点击 "添加订阅" 或 "导入"
              <ul>
                <li><strong>Clash</strong>: 设置 → 配置 → 添加配置</li>
                <li><strong>小火箭</strong>: + → 类型选择订阅 → 粘贴链接</li>
                <li><strong>Quantumult X</strong>: 右下角 ⚙️ → 节点资源库 → +</li>
              </ul>
            </li>
            <li>更新代理列表，获取最新节点</li>
            <li>选择代理节点并连接VPN</li>
            <li>VPN连接成功后，可在本系统自动登录</li>
          </ol>
        </div>

        <el-divider />

        <!-- 缓存信息 -->
        <div class="cache-info">
          <p v-if="stats">
            <strong>ℹ️ 缓存状态:</strong>
            {{ stats.cacheAge }} 
            (每 {{ stats.cacheDuration }} 自动更新一次)
          </p>
          <p style="margin-top: 10px; font-size: 12px; color: #999;">
            最后更新: {{ lastUpdateTime }}
          </p>
        </div>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="loading-state">
        <el-skeleton :rows="4" animated />
      </div>
    </el-card>

    <!-- 二维码放大查看对话框 -->
    <el-dialog v-model="showQrDialogVisible" title="扫描二维码" width="400px">
      <div style="text-align: center;">
        <p style="margin-bottom: 15px; color: #666;">{{ qrDialogTitle }}</p>
        <img :src="qrDialogCode" style="width: 100%; max-width: 250px;" />
        <p style="margin-top: 15px; font-size: 12px; color: #999;">
          在你的客户端上扫描此二维码导入订阅
        </p>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, DocumentCopy } from '@element-plus/icons-vue'
import api from '@/api'

interface SubscriptionInfo {
  clash: {
    url: string
    qrCode: string
    description: string
  }
  shadowrocket: {
    url: string
    qrCode: string
    description: string
  }
  instructions: string[]
}

interface Stats {
  cacheAge: string
  cacheDuration: string
}

const subscriptionInfo = ref<SubscriptionInfo | null>(null)
const stats = ref<Stats | null>(null)
const loading = ref(false)
const refreshing = ref(false)
const showQrDialogVisible = ref(false)
const qrDialogCode = ref('')
const qrDialogTitle = ref('')
const lastUpdateTime = ref('')

onMounted(() => {
  fetchSubscriptionInfo()
  fetchStats()
  updateTime()
})

function updateTime() {
  const now = new Date()
  lastUpdateTime.value = now.toLocaleString('zh-CN')
}

async function fetchSubscriptionInfo() {
  loading.value = true
  try {
    const res = await api.get('/api/proxy/subscribe/info')
    if (res.data.ok) {
      subscriptionInfo.value = res.data.data
    } else {
      ElMessage.error(res.data.error || '获取订阅信息失败')
    }
  } catch (error: any) {
    ElMessage.error('获取订阅信息失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

async function fetchStats() {
  try {
    const res = await api.get('/api/admin/proxy/stats')
    if (res.data.ok) {
      stats.value = res.data.data
    }
  } catch (error) {
    console.error('获取统计信息失败', error)
  }
}

async function handleRefresh() {
  refreshing.value = true
  try {
    const res = await api.post('/api/admin/proxy/refresh')
    if (res.data.ok) {
      ElMessage.success('代理缓存已刷新')
      fetchStats()
      updateTime()
    } else {
      ElMessage.error(res.data.error || '刷新失败')
    }
  } catch (error: any) {
    ElMessage.error('刷新失败: ' + error.message)
  } finally {
    refreshing.value = false
  }
}

function copyLink(link: string, name: string) {
  navigator.clipboard.writeText(link).then(() => {
    ElMessage.success(`${name} 链接已复制到剪贴板`)
  }).catch(() => {
    ElMessage.error('复制失败')
  })
}

function showQrDialog(qrCode: string, title: string) {
  qrDialogCode.value = qrCode
  qrDialogTitle.value = title
  showQrDialogVisible.value = true
}
</script>

<style scoped lang="css">
.proxy-subscription-container {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title {
  font-size: 18px;
  font-weight: bold;
}

.info-alert {
  margin-bottom: 20px;
}

.subscription-content {
  padding: 20px 0;
}

.subscription-section {
  padding: 20px;
  background: #f5f7fa;
  border-radius: 4px;
  margin-bottom: 20px;
}

.subscription-section h3 {
  margin-top: 0;
  color: #333;
  font-size: 16px;
}

.description {
  margin: 10px 0;
  font-size: 13px;
  color: #666;
}

.link-box {
  display: flex;
  gap: 10px;
  margin: 15px 0;
}

.link-input {
  flex: 1;
}

.link-box .el-button {
  flex-shrink: 0;
}

.qr-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 15px;
  background: white;
  border-radius: 4px;
  margin-top: 15px;
}

.qr-code {
  width: 150px;
  height: 150px;
  border: 2px solid #e0e0e0;
  cursor: pointer;
  transition: all 0.3s;
}

.qr-code:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.instructions {
  padding: 20px;
  background: #e6f7ff;
  border-radius: 4px;
}

.instructions h3 {
  margin-top: 0;
  color: #0050b3;
}

.instructions ol {
  margin: 10px 0;
  padding-left: 20px;
}

.instructions li {
  margin: 8px 0;
  line-height: 1.6;
}

.instructions ul {
  margin: 8px 0;
  padding-left: 20px;
  font-size: 13px;
}

.cache-info {
  padding: 15px;
  background: #f0f9ff;
  border-left: 3px solid #1890ff;
  border-radius: 4px;
}

.cache-info p {
  margin: 5px 0;
  font-size: 13px;
}

.loading-state {
  padding: 20px;
}
</style>
