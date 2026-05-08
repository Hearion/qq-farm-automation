<script setup lang="ts">
defineProps<{
  modelValue?: string | number
  label?: string
  type?: string
  placeholder?: string
  disabled?: boolean
  min?: string | number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()
</script>

<template>
  <label class="base-field">
    <span v-if="label" class="base-field__label">{{ label }}</span>
    <el-input
      :model-value="modelValue"
      :type="type || 'text'"
      :placeholder="placeholder"
      :disabled="disabled"
      :min="min"
      clearable
      @update:model-value="value => emit('update:modelValue', value as string | number)"
    />
  </label>
</template>

<style scoped>
.base-field {
  display: flex;
  min-width: 0;
  min-height: 72px;
  flex-direction: column;
  gap: 8px;
  justify-content: flex-start;
}

.base-field__label {
  display: flex;
  height: 20px;
  align-items: center;
  color: var(--el-text-color-regular);
  line-height: 20px;
  font-size: 13px;
  font-weight: 650;
}

.base-field :deep(.el-input) {
  height: 40px;
}

.base-field :deep(.el-input__wrapper) {
  height: 40px;
  min-height: 40px;
}
</style>
