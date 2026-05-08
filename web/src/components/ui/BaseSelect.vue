<script setup lang="ts">
defineProps<{
  modelValue?: string | number | boolean
  label?: string
  options: Array<{ label: string, value: string | number | boolean }>
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | number | boolean]
}>()
</script>

<template>
  <label class="base-field">
    <span v-if="label" class="base-field__label">{{ label }}</span>
    <el-select
      :model-value="modelValue"
      :disabled="disabled"
      class="base-select"
      @update:model-value="value => emit('update:modelValue', value as string | number | boolean)"
    >
      <el-option
        v-for="opt in options"
        :key="String(opt.value)"
        :label="opt.label"
        :value="opt.value"
      />
    </el-select>
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

.base-select {
  --el-component-size: 40px;
  height: 40px;
  width: 100%;
}

.base-select :deep(.el-select__wrapper) {
  height: 40px;
  min-height: 40px;
}
</style>
