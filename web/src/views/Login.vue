<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { ArrowRight, Key, Lock, Present, User } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import api from '@/api'
import { useUserStore } from '@/stores/user'

declare const __APP_VERSION__: string

const userStore = useUserStore()
const appVersion = __APP_VERSION__
const gameVersion = ref('')

const isLogin = ref(true)
const username = ref('')
const password = ref('')
const cardCode = ref('')
const error = ref('')
const success = ref('')
const loading = ref(false)
const showPasswordStrength = ref(false)
const lockoutRemaining = ref(0)
const rateLimitRemaining = ref(0)

const cardClaimEnabled = ref(false)
const cardClaimLoading = ref(false)
const showClaimModal = ref(false)
const claimModalContent = ref({
  success: true,
  title: '',
  message: '',
  cardCode: '',
  days: 0
})

const passwordStrength = computed(() => {
  const pwd = password.value
  if (!pwd) return { score: 0, level: '', valid: false }

  let score = 0

  if (pwd.length >= 6) score++
  if (pwd.length >= 10) score++

  let typeCount = 0
  if (/[a-z]/.test(pwd)) typeCount++
  if (/[A-Z]/.test(pwd)) typeCount++
  if (/[0-9]/.test(pwd)) typeCount++
  if (/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'/`~]/.test(pwd)) typeCount++

  if (typeCount >= 2) score += 2

  if (typeCount >= 3) score++
  if (typeCount >= 4) score++

  const commonPasswords = ['password', '123456', 'qwerty', 'abc123', '111111']
  if (commonPasswords.some(p => pwd.toLowerCase().includes(p))) {
    score = Math.max(0, score - 2)
  }

  const level = score <= 2 ? '弱' : score <= 4 ? '中' : score <= 6 ? '强' : '非常强'
  const color = score <= 2 ? '#ef5350' : score <= 4 ? '#ffa726' : score <= 6 ? '#66bb6a' : '#43a047'
  const valid = pwd.length >= 6 && typeCount >= 2

  return { score, level, color, valid }
})

const usernameValid = computed(() => {
  const name = username.value
  if (!name) return { valid: false, message: '' }
  if (name.length < 3) return { valid: false, message: '用户名至少3位' }
  if (name.length > 32) return { valid: false, message: '用户名最多32位' }
  if (!/^[a-zA-Z0-9_]+$/.test(name)) return { valid: false, message: '只能包含字母、数字、下划线' }
  return { valid: true, message: '' }
})

watch(password, () => {
  if (!isLogin.value && password.value) {
    showPasswordStrength.value = true
  }
})

function validateForm(): boolean {
  if (!username.value) {
    error.value = '请输入用户名'
    return false
  }

  if (!usernameValid.value.valid) {
    error.value = usernameValid.value.message
    return false
  }

  if (!password.value) {
    error.value = '请输入密码'
    return false
  }

  if (!isLogin.value) {
    if (password.value.length < 6) {
      error.value = '密码长度至少6位'
      return false
    }

    if (!passwordStrength.value.valid) {
      error.value = '密码强度不足：需包含大写字母、小写字母、数字、特殊符号中的至少两种'
      return false
    }

    if (!cardCode.value) {
      error.value = '请输入卡密'
      return false
    }
  }

  return true
}

async function handleSubmit() {
  if (!validateForm()) return

  loading.value = true
  error.value = ''
  success.value = ''

  try {
    if (isLogin.value) {
      const result = await userStore.login(username.value, password.value)
      if (result.ok) {
        if (result.data?.mustChangePassword) {
          success.value = '登录成功！请修改默认密码以确保账户安全'
        }
        setTimeout(() => {
          window.location.href = '/'
        }, 500)
      }
      else {
        if (result.errorType === 'rate_limit') {
          error.value = result.error || '请求过于频繁，请稍后重试'
          if (result.remainingMs) {
            rateLimitRemaining.value = Math.ceil(result.remainingMs / 1000)
          }
        } else if (result.errorType === 'locked') {
          error.value = result.error || '账户已被锁定'
          if (result.remainingMs) {
            lockoutRemaining.value = Math.ceil(result.remainingMs / 1000 / 60)
          }
        } else {
          error.value = result.error || '登录失败'
        }
      }
    }
    else {
      const result = await userStore.register(username.value, password.value, cardCode.value)
      if (result.ok) {
        success.value = '注册成功，请登录'
        isLogin.value = true
        cardCode.value = ''
        password.value = ''
      }
      else {
        error.value = result.error || '注册失败'
      }
    }
  }
  catch (e: any) {
    const data = e.response?.data
    if (data?.errorType === 'rate_limit') {
      error.value = data.error || '请求过于频繁'
      if (data.remainingMs) {
        rateLimitRemaining.value = Math.ceil(data.remainingMs / 1000)
      }
    } else if (data?.errorType === 'locked') {
      error.value = data.error || '账户已被锁定'
      if (data.remainingMs) {
        lockoutRemaining.value = Math.ceil(data.remainingMs / 1000 / 60)
      }
    } else {
      error.value = data?.error || e.message || '操作异常'
    }
  }
  finally {
    loading.value = false
  }
}

function toggleMode() {
  isLogin.value = !isLogin.value
  error.value = ''
  success.value = ''
  showPasswordStrength.value = false
  lockoutRemaining.value = 0
  rateLimitRemaining.value = 0
}

async function checkCardClaimStatus() {
  try {
    const res = await api.get('/api/card-claim/status')
    if (res.data.ok) {
      cardClaimEnabled.value = res.data.enabled === true
    }
  }
  catch (e) {
    console.error('检查卡密领取状态失败:', e)
  }
}

async function claimFreeCard() {
  if (cardClaimLoading.value)
    return

  cardClaimLoading.value = true
  error.value = ''

  try {
    const res = await api.post('/api/card-claim/claim')

    if (res.data.ok) {
      cardCode.value = res.data.cardCode
      claimModalContent.value = {
        success: true,
        title: '领取成功',
        message: `成功领取 ${res.data.days} 天卡密！`,
        cardCode: res.data.cardCode,
        days: res.data.days
      }
      showClaimModal.value = true
    }
    else {
      claimModalContent.value = {
        success: false,
        title: '领取失败',
        message: res.data.error || '领取失败，请稍后重试',
        cardCode: '',
        days: 0
      }
      showClaimModal.value = true
    }
  }
  catch (e: any) {
    const data = e.response?.data
    claimModalContent.value = {
      success: false,
      title: '领取失败',
      message: data?.error || e.message || '领取失败',
      cardCode: '',
      days: 0
    }
    showClaimModal.value = true
  }
  finally {
    cardClaimLoading.value = false
  }
}

function closeClaimModal() {
  showClaimModal.value = false
}

onMounted(() => {
  checkCardClaimStatus()
  fetchGameVersion()
})

async function fetchGameVersion() {
  try {
    const res = await api.get('/api/game-version')
    if (res.data.ok) {
      gameVersion.value = res.data.clientVersion
    }
  }
  catch (e) {
    console.error('获取游戏版本失败:', e)
  }
}
</script>

<template>
  <div class="login-container">
    <!-- Background decorations -->
    <div class="bg-decoration">
      <!-- Sun -->
      <div class="sun" />
      <!-- Clouds -->
      <div class="cloud cloud-1" />
      <div class="cloud cloud-2" />
      <div class="cloud cloud-3" />
      <!-- Grass -->
      <div class="grass" />
      <!-- Plant decorations -->
      <div class="plant plant-1" />
      <div class="plant plant-2" />
      <div class="plant plant-3" />
      <div class="plant plant-4" />
      <div class="plant plant-5" />
      <div class="plant plant-6" />
    </div>

    <!-- Login Card -->
    <div class="login-card">
      <!-- Logo Area -->
      <div class="logo-area">
        <div class="logo-icon">
          <el-icon :size="38"><Key /></el-icon>
        </div>
        <h1 class="logo-title">
          QQ农场智能助手
        </h1>
        <p class="logo-subtitle">
          {{ isLogin ? '欢迎回来，开始你的农场之旅' : '加入我们，开启农场新生活' }}
        </p>
      </div>

      <!-- Form Area -->
      <el-form label-position="top" class="form-area" @submit.prevent="handleSubmit">
        <el-form-item>
          <template #label>
            <span class="form-label">
              <el-icon><User /></el-icon>
              用户名
            </span>
          </template>
          <el-input
            id="username"
            v-model="username"
            type="text"
            placeholder="请输入用户名（3-32位字母数字下划线）"
          />
          <div v-if="username && !usernameValid.valid" class="form-hint-error">
            {{ usernameValid.message }}
          </div>
        </el-form-item>

        <el-form-item>
          <template #label>
            <span class="form-label">
              <el-icon><Lock /></el-icon>
              密码
            </span>
          </template>
          <el-input
            id="password"
            v-model="password"
            type="password"
            placeholder="请输入密码"
            show-password
          />
          <div v-if="showPasswordStrength && password" class="password-strength">
            <div class="strength-bar">
              <div
                class="strength-fill"
                :style="{ width: Math.min(passwordStrength.score * 12.5, 100) + '%', backgroundColor: passwordStrength.color }"
              />
            </div>
            <span class="strength-text" :style="{ color: passwordStrength.color }">
              {{ passwordStrength.level }}
            </span>
          </div>
        </el-form-item>

        <el-alert
          v-if="error"
          type="error"
          :closable="false"
          show-icon
          class="message-alert"
        >
          <template #default>
            <div>
              {{ error }}
              <span v-if="lockoutRemaining > 0" class="lockout-timer">
                ({{ lockoutRemaining }} 分钟后解锁)
              </span>
              <span v-if="rateLimitRemaining > 0" class="lockout-timer">
                ({{ rateLimitRemaining }} 秒后可重试)
              </span>
            </div>
          </template>
        </el-alert>

        <el-alert
          v-if="success"
          type="success"
          :closable="false"
          show-icon
          class="message-alert"
        >
          {{ success }}
        </el-alert>

        <el-alert
          v-if="lockoutRemaining > 0 || rateLimitRemaining > 0"
          type="warning"
          :closable="false"
          show-icon
          class="message-alert"
        >
          <template #default>
            <div>
              <span v-if="lockoutRemaining > 0">账户已被锁定，{{ lockoutRemaining }} 分钟后解锁</span>
              <span v-if="rateLimitRemaining > 0">请求过于频繁，{{ rateLimitRemaining }} 秒后可重试</span>
            </div>
          </template>
        </el-alert>

        <el-form-item v-if="!isLogin">
          <template #label>
            <span class="form-label">
              <el-icon><Key /></el-icon>
              卡密
            </span>
          </template>

          <div v-if="cardClaimEnabled" class="claim-btn-wrapper">
            <el-button
              type="success"
              class="claim-card-btn"
              :loading="cardClaimLoading"
              @click="claimFreeCard"
            >
              <template v-if="!cardClaimLoading">
                <el-icon><Present /></el-icon>
                免费领取卡密
              </template>
            </el-button>
          </div>

          <el-input
            id="cardCode"
            v-model="cardCode"
            type="text"
            placeholder="请输入卡密"
          />
        </el-form-item>

        <el-button
          type="primary"
          native-type="submit"
          :loading="loading"
        class="submit-btn"
      >
        <template v-if="!loading">
          {{ isLogin ? '立即登录' : '立即注册' }}
          <el-icon><ArrowRight /></el-icon>
        </template>
      </el-button>
      </el-form>

      <!-- Switch Area -->
      <div class="switch-area">
        <el-button
          type="primary"
        link
        @click="toggleMode"
      >
        {{ isLogin ? '没有账号？立即注册' : '已有账号？立即登录' }}
      </el-button>
      </div>

      <!-- Footer -->
      <div class="card-footer">
        <span>自动巡田、好友互动、收益分析，一处完成</span>
        <div class="footer-info">
          <span class="version">v{{ appVersion }}</span>
        </div>
        <div v-if="gameVersion" class="game-version">
          当前游戏版本：{{ gameVersion }}
        </div>
      </div>
    </div>

    <!-- Card Claim Result Dialog -->
    <el-dialog
      v-model="showClaimModal"
      :width="380"
      :show-close="true"
      class="claim-dialog"
      @close="closeClaimModal"
    >
      <template #header>
        <div class="claim-dialog-header">
          <el-icon class="claim-modal-icon"><component :is="claimModalContent.success ? Present : Key" /></el-icon>
          <h3 class="claim-modal-title">
            {{ claimModalContent.title }}
          </h3>
        </div>
      </template>

      <div class="claim-modal-body">
        <p class="claim-modal-message">
          {{ claimModalContent.message }}
        </p>
        <div v-if="claimModalContent.success && claimModalContent.cardCode" class="claim-modal-card-info">
          <div class="card-code-label">
            卡密已自动填入
          </div>
          <div class="card-code-value">
            {{ claimModalContent.cardCode }}
          </div>
        </div>
      </div>

      <template #footer>
        <el-button type="primary" class="claim-modal-btn" @click="closeClaimModal">
          {{ claimModalContent.success ? '开始注册' : '我知道了' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 20% 12%, rgba(95, 143, 99, 0.16), transparent 28%),
    radial-gradient(circle at 82% 18%, rgba(189, 138, 75, 0.14), transparent 24%),
    linear-gradient(135deg, #f7faf5 0%, #edf4ec 52%, #f7f1e8 100%);
  position: relative;
  overflow: hidden;
}

/* Background decorations */
.bg-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

/* Sun */
.sun {
  position: absolute;
  top: 40px;
  right: 80px;
  width: 80px;
  height: 80px;
  background: radial-gradient(circle, rgba(189, 138, 75, 0.24) 0%, rgba(189, 138, 75, 0.02) 70%);
  border-radius: 50%;
  box-shadow: 0 0 60px 20px rgba(193, 123, 32, 0.18);
  animation: sunPulse 4s ease-in-out infinite;
}

@keyframes sunPulse {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 0 60px 20px rgba(255, 215, 0, 0.4);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 0 80px 30px rgba(255, 215, 0, 0.5);
  }
}

/* Clouds */
.cloud {
  display: none;
}

.cloud::before,
.cloud::after {
  content: '';
  position: absolute;
  background: white;
  border-radius: 50%;
}

.cloud-1 {
  top: 60px;
  left: 10%;
  width: 100px;
  height: 40px;
  animation: cloudFloat 20s linear infinite;
}

.cloud-1::before {
  width: 50px;
  height: 50px;
  top: -25px;
  left: 15px;
}

.cloud-1::after {
  width: 35px;
  height: 35px;
  top: -15px;
  right: 15px;
}

.cloud-2 {
  top: 120px;
  left: 60%;
  width: 80px;
  height: 32px;
  animation: cloudFloat 25s linear infinite;
  animation-delay: -5s;
}

.cloud-2::before {
  width: 40px;
  height: 40px;
  top: -20px;
  left: 10px;
}

.cloud-2::after {
  width: 28px;
  height: 28px;
  top: -12px;
  right: 10px;
}

.cloud-3 {
  top: 200px;
  left: 30%;
  width: 60px;
  height: 24px;
  animation: cloudFloat 30s linear infinite;
  animation-delay: -10s;
}

.cloud-3::before {
  width: 30px;
  height: 30px;
  top: -15px;
  left: 8px;
}

.cloud-3::after {
  width: 22px;
  height: 22px;
  top: -10px;
  right: 8px;
}

@keyframes cloudFloat {
  0% {
    transform: translateX(-100px);
  }
  100% {
    transform: translateX(calc(100vw + 100px));
  }
}

/* Grass */
.grass {
  display: none;
}

.grass::before {
  content: '';
  position: absolute;
  top: -20px;
  left: 0;
  right: 0;
  height: 40px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 20'%3E%3Cpath fill='%237CB342' d='M0 20 Q25 0 50 20 Q75 0 100 20 V0 H0Z'/%3E%3C/svg%3E")
    repeat-x;
  background-size: 100px 20px;
}

/* Plant decorations */
.plant {
  display: none;
}

.plant-1 {
  bottom: 100px;
  left: 5%;
  animation-delay: 0s;
}
.plant-2 {
  bottom: 80px;
  left: 15%;
  animation-delay: 0.5s;
  font-size: 2.5rem;
}
.plant-3 {
  bottom: 110px;
  left: 25%;
  animation-delay: 1s;
}
.plant-4 {
  bottom: 90px;
  right: 25%;
  animation-delay: 1.5s;
}
.plant-5 {
  bottom: 100px;
  right: 15%;
  animation-delay: 2s;
}
.plant-6 {
  bottom: 85px;
  right: 5%;
  animation-delay: 2.5s;
  font-size: 2.5rem;
}

@keyframes plantSway {
  0%,
  100% {
    transform: rotate(-5deg);
  }
  50% {
    transform: rotate(5deg);
  }
}

/* Login Card */
.login-card {
  width: 100%;
  max-width: 420px;
  margin: 20px;
  padding: 40px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid var(--app-border);
  border-radius: 24px;
  box-shadow:
    0 30px 80px rgba(38, 48, 38, 0.13),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
  position: relative;
  z-index: 10;
  backdrop-filter: blur(10px);
}

/* Logo Area */
.logo-area {
  text-align: center;
  margin-bottom: 32px;
}

.logo-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  color: #fff;
  background: var(--theme-gradient);
  border: 0;
  border-radius: 20px;
  margin-bottom: 16px;
  box-shadow: 0 18px 36px rgba(95, 143, 99, 0.22);
  animation: logoBounce 2s ease-in-out infinite;
}

@keyframes logoBounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}

.logo-title {
  font-size: 1.9rem;
  font-weight: 800;
  color: var(--app-text);
  margin: 0 0 8px 0;
  text-shadow: none;
}

.logo-subtitle {
  font-size: 0.9rem;
  color: var(--app-text-muted);
  font-weight: 500;
}

/* Form Area */
.form-area {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--app-text);
}

.label-icon {
  font-size: 1rem;
}

.form-hint-error {
  font-size: 0.75rem;
  color: #ef5350;
  margin-top: 4px;
}

.password-strength {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.strength-bar {
  flex: 1;
  height: 4px;
  background: #e0e0e0;
  border-radius: 2px;
  overflow: hidden;
}

.strength-fill {
  height: 100%;
  transition: width 0.3s ease, background-color 0.3s ease;
}

.strength-text {
  font-size: 0.75rem;
  font-weight: 500;
  min-width: 50px;
}

.lockout-timer {
  display: block;
  font-size: 0.75rem;
  opacity: 0.8;
  margin-top: 2px;
}

.message-alert {
  margin-top: 8px;
}

/* Submit Button */
.submit-btn {
  margin-top: 16px;
  height: 48px;
  font-size: 1rem;
  font-weight: 600;
  border-radius: 14px;
  background: var(--theme-gradient);
  box-shadow: var(--app-shadow-soft);
  transition: all 0.3s ease;
  border: none;
  width: 100%;
}

.submit-btn:hover {
  transform: translateY(-2px);
  box-shadow: var(--app-shadow-card);
  background: var(--theme-gradient);
}

.submit-btn:active {
  transform: translateY(0);
}

/* Claim button wrapper */
.claim-btn-wrapper {
  margin-bottom: 8px;
}

.claim-card-btn {
  width: 100%;
  border-radius: 8px;
}

/* Switch Area */
.switch-area {
  text-align: center;
  margin-top: 24px;
}

/* Card Footer */
.card-footer {
  text-align: center;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--app-border);
  color: var(--app-text-muted);
  font-size: 0.8rem;
}

.footer-info {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--app-text-muted);
}

.game-version {
  margin-top: 8px;
  font-size: 0.7rem;
  color: var(--app-text-muted);
  text-align: center;
}

/* Claim Dialog */
.claim-dialog-header {
  text-align: center;
}

.claim-modal-icon {
  display: inline-flex;
  font-size: 2.4rem;
  margin-bottom: 8px;
  color: var(--app-accent);
}

.claim-modal-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--app-text);
  margin: 0;
}

.claim-modal-body {
  padding: 8px 0;
  text-align: center;
}

.claim-modal-message {
  font-size: 1rem;
  color: var(--app-text-muted);
  margin: 0 0 16px;
  line-height: 1.5;
}

.claim-modal-card-info {
  background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%);
  border-radius: 12px;
  padding: 16px;
  margin-top: 8px;
}

.card-code-label {
  font-size: 0.75rem;
  color: #66bb6a;
  margin-bottom: 8px;
}

.card-code-value {
  font-family: 'Courier New', monospace;
  font-size: 0.9rem;
  font-weight: 600;
  color: #2e7d32;
  background: white;
  padding: 8px 12px;
  border-radius: 8px;
  word-break: break-all;
}

.claim-modal-btn {
  width: 100%;
  border-radius: 8px;
  background: var(--theme-gradient);
  border: none;
}

.claim-modal-btn:hover {
  background: linear-gradient(135deg, #8bc34a 0%, #689f38 100%);
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .login-card {
    background: var(--app-surface);
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(102, 187, 106, 0.2);
  }

  .claim-modal-card-info {
    background: linear-gradient(135deg, #1a3a2a 0%, #2a4a3a 100%);
  }

  .card-code-label {
    color: #66bb6a;
  }

  .card-code-value {
    background: #0d2818;
    color: #81c784;
  }
}

/* Responsive */
@media (max-width: 480px) {
  .login-card {
    margin: 10px;
    padding: 30px 24px;
    border-radius: 24px;
  }

  .logo-icon {
    width: 70px;
    height: 70px;
  }

  .logo-title {
    font-size: 1.5rem;
  }

  .sun {
    width: 60px;
    height: 60px;
    top: 20px;
    right: 40px;
  }

  .plant {
    font-size: 1.5rem;
  }

  .plant-2,
  .plant-6 {
    font-size: 2rem;
  }
}
</style>
