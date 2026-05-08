<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'text' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
}>(), {
  variant: 'secondary',
  size: 'md',
  loading: false,
  disabled: false,
})

const buttonType = computed(() => {
  if (props.variant === 'primary')
    return 'primary'
  if (props.variant === 'danger')
    return 'danger'
  return undefined
})

const buttonSize = computed(() => props.size === 'sm' ? 'small' : props.size === 'lg' ? 'large' : 'default')
</script>

<template>
  <el-button
    :type="buttonType"
    :text="variant === 'text' || variant === 'ghost'"
    :plain="variant === 'secondary'"
    :size="buttonSize"
    :loading="loading"
    :disabled="disabled"
    class="base-el-button"
    :class="[`base-el-button--${variant}`, `base-el-button--${size}`]"
  >
    <slot />
  </el-button>
</template>

<style scoped>
.base-el-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 76px;
  border-radius: 12px;
  font-weight: 650;
  white-space: nowrap;
}

.base-el-button--sm {
  min-height: 34px;
  padding-inline: 12px;
  font-size: 13px;
}

.base-el-button--md {
  min-height: 36px;
  padding-inline: 14px;
  font-size: 14px;
}

.base-el-button--lg {
  min-height: 40px;
  padding-inline: 18px;
  font-size: 15px;
}

.base-el-button--primary {
  box-shadow: var(--app-shadow-soft);
}

.base-el-button--ghost {
  color: var(--el-text-color-secondary);
}

.base-el-button--text {
  padding-inline: 4px;
}
</style>
