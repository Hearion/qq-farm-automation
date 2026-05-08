<script setup lang="ts">
const props = withDefaults(defineProps<{
  show: boolean
  title?: string
  message?: string
  type?: 'primary' | 'danger'
  isAlert?: boolean
  loading?: boolean
  confirmText?: string
  cancelText?: string
}>(), {
  title: '提示',
  message: '',
  type: 'primary',
  isAlert: true,
  loading: false,
  confirmText: '确定',
  cancelText: '取消',
})

const emit = defineEmits<{
  close: []
  cancel: []
  confirm: []
}>()
</script>

<template>
  <el-dialog
    :model-value="show"
    :title="props.title"
    width="min(420px, calc(100vw - 32px))"
    class="confirm-modal"
    align-center
    append-to-body
    destroy-on-close
    @close="emit('close')"
  >
    <el-alert
      :type="type === 'danger' ? 'error' : 'info'"
      :closable="false"
      show-icon
    >
      {{ message }}
    </el-alert>

    <template #footer>
      <el-button @click="isAlert ? emit('confirm') : emit('cancel')">
        {{ isAlert ? confirmText : cancelText }}
      </el-button>
      <el-button
        v-if="!isAlert"
        :type="type === 'danger' ? 'danger' : 'primary'"
        :loading="loading"
        @click="emit('confirm')"
      >
        {{ confirmText }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.confirm-modal :deep(.el-alert) {
  border: 1px solid var(--app-border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.62);
}
</style>
