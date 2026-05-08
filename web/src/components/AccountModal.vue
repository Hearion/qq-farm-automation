<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { computed, reactive, ref, watch } from 'vue'
import { Close, Loading } from '@element-plus/icons-vue'
import api from '@/api'
import { useWxLoginStore } from '@/stores/wx-login'

const props = defineProps<{
  show: boolean
  editData?: any
}>()

const emit = defineEmits(['close', 'saved'])

const wxLoginStore = useWxLoginStore()

// 标签页：wx-微信扫码, manual-手动填码
const activeTab = ref<'wx' | 'manual'>('manual')
const loading = ref(false)
const errorMessage = ref('')

// 微信扫码相关
const wxAccountName = ref('')

// 表单数据
const form = reactive({
  name: '',
  code: '',
  platform: 'qq' as 'qq' | 'wx',
})

// 微信扫码轮询
const { pause: stopWxCheck, resume: startWxCheck } = useIntervalFn(async () => {
  if (wxLoginStore.status !== 'qr_ready' && wxLoginStore.status !== 'confirming') {
    return
  }
  const result = await wxLoginStore.checkLogin()
  if (result.success && result.wxid) {
    stopWxCheck()
    // 获取Code并添加账号
    const codeResult = await wxLoginStore.getFarmCode()
    if (codeResult.success && codeResult.code) {
      const name = wxAccountName.value.trim() || result.nickname || `微信账号${Date.now()}`
      // 检查是否启用自动添加账号
      if (wxLoginStore.config.autoAddAccount) {
        await addAccount({
          id: props.editData?.id,
          name: props.editData ? (props.editData.name || name) : name,
          code: codeResult.code,
          platform: 'wx',
          loginType: 'wx_qr',
          wxid: result.wxid,
        })
      }
      else {
        // 不自动添加，只显示 code 让用户手动复制
        form.code = codeResult.code
        form.platform = 'wx'
        activeTab.value = 'manual'
      }
    }
  }
}, 2000, { immediate: false })

// 获取微信二维码
async function loadWxQRCode() {
  if (activeTab.value !== 'wx')
    return
  wxLoginStore.resetState()
  const success = await wxLoginStore.getQRCode()
  if (success) {
    startWxCheck()
  }
}

// 添加账号
async function addAccount(data: any) {
  loading.value = true
  errorMessage.value = ''
  try {
    const res = await api.post('/api/accounts', data)
    if (res.data.ok) {
      emit('saved')
      close()
    }
    else {
      errorMessage.value = `保存失败: ${res.data.error}`
    }
  }
  catch (e: any) {
    errorMessage.value = `保存失败: ${e.response?.data?.error || e.message}`
  }
  finally {
    loading.value = false
  }
}

// 手动提交
async function submitManual() {
  errorMessage.value = ''
  if (!form.code) {
    errorMessage.value = '请输入Code'
    return
  }

  let code = form.code.trim()
  const match = code.match(/[?&]code=([^&]+)/i)
  if (match && match[1]) {
    code = decodeURIComponent(match[1])
    form.code = code
  }

  let payload: any = {}
  if (props.editData) {
    const onlyNameChanged = form.name !== props.editData.name
      && form.code === (props.editData.code || '')
      && form.platform === (props.editData.platform || 'qq')

    if (onlyNameChanged) {
      payload = { id: props.editData.id, name: form.name }
    }
    else {
      payload = {
        id: props.editData.id,
        name: form.name,
        code,
        platform: form.platform,
        loginType: 'manual',
      }
    }
  }
  else {
    payload = {
      name: form.name,
      code,
      platform: form.platform,
      loginType: 'manual',
    }
  }

  await addAccount(payload)
}

// 微信二维码图片
const wxQrImageSrc = computed(() => {
  if (!wxLoginStore.qrCode)
    return ''
  if (wxLoginStore.qrCode.startsWith('data:'))
    return wxLoginStore.qrCode
  if (wxLoginStore.qrCode.startsWith('http'))
    return wxLoginStore.qrCode
  return `data:image/png;base64,${wxLoginStore.qrCode}`
})

function close() {
  stopWxCheck()
  wxLoginStore.resetState()
  emit('close')
}

watch(() => props.show, (newVal) => {
  if (newVal) {
    errorMessage.value = ''
    if (props.editData) {
      activeTab.value = 'manual'
      form.name = props.editData.name || ''
      form.code = props.editData.code || ''
      form.platform = props.editData.platform || 'qq'
      wxAccountName.value = props.editData.name || ''
    }
    else {
      activeTab.value = 'manual'
      form.name = ''
      form.code = ''
      form.platform = 'qq'
      wxAccountName.value = ''
    }
  }
  else {
    stopWxCheck()
    wxLoginStore.resetState()
  }
})

watch(activeTab, (tab) => {
  if (tab === 'wx') {
    loadWxQRCode()
  }
})
</script>

<template>
  <el-dialog
    :model-value="show"
    :title="editData ? '编辑账号' : '添加账号'"
    width="520px"
    class="account-modal"
    align-center
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    @update:model-value="$emit('close')"
    @close="close"
  >
    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="dialog-alert"
    />

    <el-tabs v-model="activeTab">
      <el-tab-pane label="手动填码" name="manual">
        <el-form label-position="top" class="dialog-form">
          <el-form-item label="账号备注（可选）">
            <el-input
              v-model="form.name"
              placeholder="留空默认账号"
            />
          </el-form-item>

          <el-form-item label="Code">
            <el-input
              v-model="form.code"
              type="textarea"
              :rows="3"
              placeholder="请输入登录 Code"
            />
          </el-form-item>

          <el-form-item v-if="!editData" label="平台">
            <el-radio-group v-model="form.platform">
              <el-radio value="qq">QQ小程序</el-radio>
              <el-radio value="wx">微信小程序</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-form>

        <div class="dialog-footer">
          <el-button @click="close">取消</el-button>
          <el-button type="primary" :loading="loading" @click="submitManual">
            {{ editData ? '保存' : '添加' }}
          </el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane v-if="wxLoginStore.config.enabled" label="微信扫码" name="wx">
        <el-form label-position="top" class="dialog-form">
          <el-form-item label="账号备注（可选）">
            <el-input
              v-model="wxAccountName"
              placeholder="留空使用微信昵称"
            />
          </el-form-item>
        </el-form>

        <div class="qr-area">
          <div v-if="wxQrImageSrc" class="qr-image-wrapper">
            <img :src="wxQrImageSrc" class="qr-image">
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
            @click="loadWxQRCode"
          >
            刷新二维码
          </el-button>
        </div>

        <p class="qr-hint">
          使用微信扫描二维码登录，登录成功后将自动添加账号
        </p>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<style scoped>
.dialog-alert {
  margin-bottom: 16px;
}

.account-modal :deep(.el-dialog__body) {
  padding-top: 8px !important;
}

:deep(.account-modal) {
  max-width: calc(100vw - 32px);
}

.account-modal :deep(.el-dialog__header) {
  border-bottom: 1px solid var(--app-border);
  background: rgba(247, 250, 245, 0.72);
}

.account-modal :deep(.el-tabs__header) {
  margin-bottom: 18px;
}

.account-modal :deep(.el-tabs__item) {
  height: 38px;
}

.dialog-form {
  margin-top: 8px;
}

.dialog-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.dialog-form :deep(.el-form-item__label) {
  color: var(--app-text);
  font-weight: 700;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--app-border);
  margin-top: 8px;
  padding-top: 18px;
}

.dialog-footer .el-button {
  min-width: 84px;
}

.qr-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
}

.qr-image-wrapper {
  border: 1px solid var(--app-border);
  border-radius: 16px;
  padding: 10px;
  background: #fff;
  box-shadow: 0 18px 44px rgba(38, 48, 38, 0.1);
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
  border: 1px dashed var(--app-border);
  border-radius: 16px;
  background: var(--app-surface-muted);
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
