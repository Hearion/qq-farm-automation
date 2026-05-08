<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { useAccountStore } from '@/stores/account'
import { useWxLoginStore } from '@/stores/wx-login'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits(['close', 'saved'])

const wxLoginStore = useWxLoginStore()
const accountStore = useAccountStore()

const accountName = ref('')

// 轮询检查登录状态
const { pause: stopCheck, resume: startCheck } = useIntervalFn(async () => {
  if (wxLoginStore.status !== 'qr_ready' && wxLoginStore.status !== 'confirming') {
    return
  }

  const result = await wxLoginStore.checkLogin()

  if (result.success && result.wxid) {
    stopCheck()

    // 自动添加账号
    await handleAutoAddAccount(result.wxid, result.nickname)
  }
}, 2000, { immediate: false })

// 自动添加账号
async function handleAutoAddAccount(wxid: string, nickname?: string) {
  try {
    const result = await wxLoginStore.getFarmCode()

    if (result.success && result.code) {
      const name = accountName.value.trim() || nickname || `微信账号${Date.now()}`

      // 检查是否启用自动添加账号
      if (wxLoginStore.config.autoAddAccount) {
        await accountStore.addAccount({
          name,
          code: result.code,
          platform: 'wx',
          loginType: 'wx_qr',
          wxid,
        })
        emit('saved')
        close()
      }
      else {
        // 不自动添加，只返回登录信息，让用户手动复制 code
        console.log('登录成功！Code:', result.code)
      }
    }
  }
  catch (e) {
    console.error('自动添加账号失败:', e)
  }
}

// 获取二维码
async function loadQRCode() {
  wxLoginStore.resetState()
  const success = await wxLoginStore.getQRCode()
  if (success) {
    startCheck()
  }
}

// 关闭弹窗
function close() {
  stopCheck()
  wxLoginStore.resetState()
  accountName.value = ''
  emit('close')
}

// 二维码图片地址
const qrImageSrc = computed(() => {
  if (!wxLoginStore.qrCode)
    return ''
  if (wxLoginStore.qrCode.startsWith('data:'))
    return wxLoginStore.qrCode
  if (wxLoginStore.qrCode.startsWith('http'))
    return wxLoginStore.qrCode
  return `data:image/png;base64,${wxLoginStore.qrCode}`
})

watch(() => props.show, (newVal) => {
  if (newVal) {
    loadQRCode()
  }
  else {
    stopCheck()
  }
})
</script>

<template>
  <el-dialog
    :model-value="show"
    title="微信扫码登录"
    width="460px"
    :close-on-click-modal="false"
    @update:model-value="$emit('close')"
    @close="close"
  >
    <el-form label-position="top" class="dialog-form">
      <el-form-item label="账号备注（可选）">
        <el-input
          v-model="accountName"
          placeholder="留空使用微信昵称"
        />
      </el-form-item>
    </el-form>

    <div class="qr-area">
      <div v-if="qrImageSrc" class="qr-image-wrapper">
        <img :src="qrImageSrc" class="qr-image">
      </div>
      <div v-else class="qr-placeholder">
        <el-icon v-if="wxLoginStore.isLoading" class="is-loading" :size="32">
          <Loading />
        </el-icon>
        <span v-else class="qr-placeholder-text">点击获取二维码</span>
      </div>

      <p class="qr-status-text">{{ wxLoginStore.statusMessage }}</p>
      <p v-if="wxLoginStore.errorMessage" class="qr-error-text">
        {{ wxLoginStore.errorMessage }}
      </p>

      <el-button
        :loading="wxLoginStore.isLoading"
        @click="loadQRCode"
      >
        刷新二维码
      </el-button>
    </div>

    <p class="qr-hint">
      使用微信扫描二维码登录，登录成功后将自动添加账号
    </p>
  </el-dialog>
</template>

<style scoped>
.dialog-form {
  margin-bottom: 8px;
}

.qr-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
}

.qr-image-wrapper {
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 8px;
  background: #fff;
}

.qr-image {
  width: 192px;
  height: 192px;
}

.qr-placeholder {
  width: 192px;
  height: 192px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.qr-placeholder-text {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.qr-status-text {
  text-align: center;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.qr-error-text {
  text-align: center;
  font-size: 14px;
  color: var(--el-color-danger);
}

.qr-hint {
  text-align: center;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  margin-top: 8px;
}
</style>
