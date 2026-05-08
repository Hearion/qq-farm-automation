<script setup lang="ts">
defineProps<{
  modelValue?: boolean
  label?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <div class="base-switch-field">
    <span class="base-switch-field__label">{{ label || '\u00a0' }}</span>
    <div class="base-switch">
      <span v-if="label" class="base-switch__label">{{ label }}</span>
      <el-switch
        :model-value="modelValue"
        :disabled="disabled"
        inline-prompt
        active-text="开"
        inactive-text="关"
        @update:model-value="value => emit('update:modelValue', Boolean(value))"
      />
    </div>
  </div>
</template>

<style scoped>
.base-switch-field {
  display: flex;
  min-width: 0;
  min-height: 72px;
  flex-direction: column;
  gap: 8px;
  justify-content: flex-start;
}

.base-switch-field__label {
  display: flex;
  height: 20px;
  align-items: center;
  color: transparent;
  line-height: 20px;
  font-size: 13px;
  font-weight: 650;
  user-select: none;
}

.base-switch {
  display: flex;
  min-height: 40px;
  height: 40px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--app-surface-muted);
  padding: 8px 12px;
}

.base-switch__label {
  color: var(--el-text-color-regular);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.2;
}
</style>
