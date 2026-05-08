<script setup lang="ts">
import { computed, type Component } from 'vue'
import {
  Present,
  CircleCheck,
  Message,
  ShoppingBag,
  Share,
  Star,
  Calendar,
} from '@element-plus/icons-vue'

const props = defineProps<{
  dailyGifts: any
}>()

const GIFT_ICONS: Record<string, Component> = {
  task_claim: CircleCheck,
  email_rewards: Message,
  mall_free_gifts: ShoppingBag,
  daily_share: Share,
  vip_daily_gift: Star,
  month_card_gift: Calendar,
}

function getGiftIcon(key: string): Component {
  return GIFT_ICONS[key] || Present
}

const hasDailyData = computed(() => !!props.dailyGifts)
const gifts = computed(() => props.dailyGifts?.gifts || [])

function formatTime(timestamp: number) {
  if (!timestamp)
    return '未领取'
  const d = new Date(timestamp)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function getGiftStatusText(gift: any) {
  if (!gift)
    return '未知'
  if (gift.key === 'vip_daily_gift' && gift.hasGift === false)
    return '未开通'
  if (gift.key === 'month_card_gift' && gift.hasCard === false)
    return '未开通'
  if (gift.doneToday)
    return '今日已完成'
  if (gift.enabled)
    return '等待执行'
  return '未开启'
}

function getGiftTagType(gift: any): '' | 'success' | 'primary' | 'info' | 'warning' | 'danger' {
  if (!gift)
    return 'info'
  if (gift.doneToday)
    return 'success'
  if (gift.enabled)
    return 'primary'
  return 'info'
}

function getGiftIconBgClass(gift: any): string {
  if (!gift)
    return 'icon-bg-default'
  if (gift.doneToday)
    return 'icon-bg-success'
  if (gift.enabled)
    return 'icon-bg-primary'
  return 'icon-bg-default'
}

function getGiftIconColor(gift: any): string {
  if (!gift)
    return '#9ca3af'
  if (gift.doneToday)
    return '#22c55e'
  if (gift.enabled)
    return '#3b82f6'
  return '#9ca3af'
}

function formatGiftSubText(gift: any) {
  if (!gift)
    return ''
  if (gift.key === 'vip_daily_gift' && gift.hasGift === false)
    return '未开通QQ会员或无每日礼包'
  if (gift.key === 'month_card_gift' && gift.hasCard === false)
    return '未购买月卡或已过期'
  const ts = Number(gift.lastAt || 0)
  if (!ts)
    return ''
  if (gift.doneToday)
    return `完成时间 ${formatTime(ts)}`
  if (gift.enabled)
    return `上次执行 ${formatTime(ts)}`
  return `上次检测 ${formatTime(ts)}`
}

function formatGiftProgress(gift: any) {
  if (!gift)
    return ''
  const total = Number(gift.totalCount || 0)
  const current = Number(gift.completedCount || 0)
  if (!total)
    return ''
  return `进度：${current}/${total}`
}
</script>

<template>
  <div class="daily-overview">
    <!-- Daily Gifts Grid -->
    <el-card shadow="never" class="gifts-card">
      <template #header>
        <h3 class="gifts-title">
          <el-icon color="#ec4899"><Present /></el-icon>
          <span>每日礼包 & 任务</span>
        </h3>
      </template>

      <div v-if="!hasDailyData" class="empty-placeholder">
        请登录账号后查看
      </div>

      <div v-else-if="!gifts.length" class="empty-placeholder">
        暂无每日礼包与任务数据
      </div>

      <el-row v-else :gutter="12">
        <el-col
          v-for="gift in gifts"
          :key="gift.key"
          :xs="12"
          :sm="8"
          :lg="8"
          class="gift-col"
        >
          <div class="gift-item">
            <div class="gift-top">
              <div class="gift-icon-wrap" :class="getGiftIconBgClass(gift)">
                <el-icon :size="18" :color="getGiftIconColor(gift)">
                  <component :is="getGiftIcon(gift.key)" />
                </el-icon>
              </div>
              <span class="gift-label">{{ gift.label }}</span>
            </div>

            <div class="gift-bottom">
              <el-tag
                size="small"
                :type="getGiftTagType(gift)"
                effect="light"
              >
                {{ getGiftStatusText(gift) }}
              </el-tag>

              <div class="gift-details">
                <span v-if="formatGiftProgress(gift)" class="gift-progress">
                  {{ formatGiftProgress(gift) }}
                </span>
                <span v-if="formatGiftSubText(gift)" class="gift-sub-text">
                  {{ formatGiftSubText(gift) }}
                </span>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<style scoped>
.daily-overview {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.gifts-card {
  border-radius: 12px;
}

.gifts-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  margin: 0;
  font-size: 16px;
}

.empty-placeholder {
  border-radius: 12px;
  background-color: #f9fafb;
  padding: 24px;
  text-align: center;
  font-size: 14px;
  color: #6b7280;
}

.gift-col {
  margin-bottom: 12px;
}

.gift-item {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 12px;
  height: 100%;
}

.gift-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.gift-icon-wrap {
  flex-shrink: 0;
  height: 28px;
  width: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}

.icon-bg-success {
  background-color: #dcfce7;
}

.icon-bg-primary {
  background-color: #dbeafe;
}

.icon-bg-default {
  background-color: #f3f4f6;
}

.gift-label {
  font-size: 14px;
  font-weight: 500;
  color: #374151;
  line-height: 1.25;
}

.gift-bottom {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.gift-details {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.gift-progress {
  font-size: 12px;
  font-weight: bold;
  color: #6b7280;
}

.gift-sub-text {
  margin-top: 2px;
  font-size: 10px;
  color: #9ca3af;
}

@media (min-width: 1536px) {
  .gift-icon-wrap {
    height: 32px;
    width: 32px;
  }

  .gift-label {
    font-size: 16px;
  }

  .gift-progress {
    font-size: 14px;
  }

  .gift-sub-text {
    font-size: 12px;
  }

  .gift-item {
    padding: 16px;
  }
}
</style>
