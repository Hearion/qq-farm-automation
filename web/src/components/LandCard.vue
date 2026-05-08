<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { Opportunity } from '@element-plus/icons-vue'

const props = defineProps<{
  land: any
}>()

const land = computed(() => props.land)
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
  }
})

function getLandStatusClass(land: any): string {
  const status = land.status
  const rawLandType = String(land.landType || land.type || land.land_type || '').toLowerCase()
  const level = Number(land.level ?? land.landsLevel ?? land.lands_level) || 0

  if (status === 'locked')
    return 'land-locked'

  let baseClass = 'land-normal'

  if (rawLandType.includes('purple') || rawLandType.includes('紫')) {
    baseClass = 'land-purple'
  }
  else {
    switch (level) {
      case 1:
        baseClass = 'land-yellow'
        break
      case 2:
        baseClass = 'land-red'
        break
      case 3:
        baseClass = 'land-dark'
        break
      case 4:
        baseClass = 'land-gold'
        break
      case 5:
        baseClass = 'land-purple'
        break
    }
  }

  if (status === 'dead')
    return 'land-dead'

  if (status === 'harvestable')
    return `${baseClass} land-harvestable`

  if (status === 'stealable')
    return `${baseClass} land-stealable`

  if (status === 'growing')
    return baseClass

  return baseClass
}

function formatTime(sec: number) {
  if (sec <= 0)
    return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return `${h > 0 ? `${h}:` : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function getSafeImageUrl(url: string) {
  if (!url)
    return ''
  if (url.startsWith('http://'))
    return url.replace('http://', 'https://')
  return url
}

function getLandTypeName(level: number) {
  const typeMap: Record<number, string> = {
    0: '普通',
    1: '黄土地',
    2: '红土地',
    3: '黑土地',
    4: '金土地',
    5: '紫土地',
  }
  return typeMap[Number(level) || 0] || ''
}

function getPlantSizeText(land: any) {
  const size = Number(land?.plantSize) || 1
  if (size <= 1)
    return ''
  return `${size}x${size}`
}

function getStatusLabel(land: any) {
  if (land.status === 'locked')
    return '未解锁'
  if (land.status === 'harvestable')
    return '可收获'
  if (land.status === 'stealable')
    return '可偷取'
  if (land.status === 'dead')
    return '枯萎'
  if (land.matureInSec > 0)
    return '生长中'
  return land.phaseName || '空地'
}
</script>

<template>
  <el-card
    :body-style="{ padding: '0' }"
    shadow="hover"
    class="land-card"
    :class="getLandStatusClass(land)"
  >
    <div class="land-card-inner">
      <div class="land-header">
        <span class="land-id">#{{ land.id }}</span>
        <span class="status-pill">{{ getStatusLabel(land) }}</span>
      </div>

      <div class="plant-row">
        <div class="seed-image-wrapper">
          <img
            v-if="land.seedImage"
            :src="getSafeImageUrl(land.seedImage)"
            class="seed-image"
            loading="lazy"
            referrerpolicy="no-referrer"
          >
          <el-icon v-else :size="20" class="seed-placeholder">
            <Opportunity />
          </el-icon>
        </div>

        <div class="plant-copy">
          <div class="plant-name" :title="land.plantName">
            {{ land.plantName || '-' }}
          </div>
          <div class="grow-info">
            <span v-if="land.matureInSec > 0" class="mature-time">
              预计 {{ formatTime(land.matureInSec) }} 后成熟
            </span>
            <span v-else>
              {{ land.phaseName || (land.status === 'locked' ? '未解锁' : '未开垦') }}
            </span>
          </div>
        </div>
      </div>

      <div class="land-meta">
        <div class="meta-item">
          <span>土地</span>
          <strong>{{ getLandTypeName(land.level) }}</strong>
        </div>
        <div class="meta-item">
          <span>季数</span>
          <strong>{{ land.totalSeason > 0 ? (`${land.currentSeason}/${land.totalSeason}`) : '-/-' }}</strong>
        </div>
      </div>

      <div class="land-footer">
        <span v-if="land.plantSize > 1" class="plant-size">合种 {{ getPlantSizeText(land) }}</span>
        <div class="status-badges">
          <el-tag v-if="land.needWater" size="small" type="primary" class="badge-tag">缺水</el-tag>
          <el-tag v-if="land.needWeed" size="small" type="success" class="badge-tag">有草</el-tag>
          <el-tag v-if="land.needBug" size="small" type="danger" class="badge-tag">有虫</el-tag>
          <el-tag v-if="land.status === 'harvestable'" size="small" type="warning" class="badge-tag">可收</el-tag>
        </div>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.land-card {
  position: relative;
  width: 100%;
  min-height: 178px;
  border: 1px solid rgba(158, 180, 151, 0.32) !important;
  border-radius: 18px !important;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(250, 252, 248, 0.72)) !important;
  box-shadow: 0 14px 32px rgba(42, 58, 42, 0.08) !important;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.land-card::before {
  content: none;
}

.land-card:hover {
  transform: translateY(-3px);
  border-color: rgba(95, 143, 99, 0.36) !important;
  box-shadow: 0 22px 46px rgba(42, 58, 42, 0.13) !important;
}

/* Land status classes */
.land-locked {
  opacity: 0.6;
  border-style: dashed;
}

.land-normal {
  border-color: rgba(183, 137, 76, 0.58) !important;
  background:
    radial-gradient(circle at 50% 16%, rgba(255, 255, 255, 0.28), transparent 34%),
    linear-gradient(180deg, rgba(183, 137, 76, 0.92), rgba(183, 137, 76, 0.72)) !important;
}

.land-normal::before {
  background: linear-gradient(90deg, #b7894c, #d8b57e);
}

.land-yellow {
  border-color: rgba(214, 155, 67, 0.42) !important;
  background: linear-gradient(180deg, rgba(255, 252, 238, 0.95), rgba(255, 248, 224, 0.68)) !important;
}

.land-yellow::before {
  background: linear-gradient(90deg, #d69b43, #f0c66d);
}

.land-red {
  border-color: rgba(223, 83, 49, 0.58) !important;
  background:
    radial-gradient(circle at 50% 16%, rgba(255, 255, 255, 0.38), transparent 34%),
    linear-gradient(180deg, rgba(223, 83, 49, 0.92), rgba(223, 83, 49, 0.72)) !important;
}

.land-red::before {
  background: linear-gradient(90deg, #df5331, #f28c72);
}

.land-dark {
  border-color: rgba(101, 75, 50, 0.74) !important;
  background:
    radial-gradient(circle at 50% 16%, rgba(255, 255, 255, 0.18), transparent 34%),
    linear-gradient(180deg, rgba(101, 75, 50, 0.95), rgba(101, 75, 50, 0.78)) !important;
}

.land-dark::before {
  background: linear-gradient(90deg, #654b32, #a7825a);
}

.land-gold {
  border-color: rgba(252, 206, 50, 0.68) !important;
  background:
    radial-gradient(circle at 50% 16%, rgba(255, 255, 255, 0.46), transparent 34%),
    linear-gradient(180deg, rgba(252, 206, 50, 0.96), rgba(252, 206, 50, 0.72)) !important;
}

.land-gold::before {
  background: linear-gradient(90deg, #fcce32, #fff0a6);
}

.land-purple {
  border-color: rgba(202, 157, 228, 0.68) !important;
  background:
    radial-gradient(circle at 50% 16%, rgba(255, 255, 255, 0.42), transparent 34%),
    linear-gradient(180deg, rgba(202, 157, 228, 0.96), rgba(202, 157, 228, 0.74)) !important;
}

.land-purple::before {
  background: linear-gradient(90deg, #ca9de4, #ead3f7);
}

.land-normal .land-id,
.land-normal .status-pill,
.land-normal .plant-size,
.land-red .land-id,
.land-red .status-pill,
.land-red .plant-size,
.land-dark .land-id,
.land-dark .status-pill,
.land-dark .plant-size,
.land-gold .land-id,
.land-gold .status-pill,
.land-gold .plant-size,
.land-purple .land-id,
.land-purple .status-pill,
.land-purple .plant-size {
  border-color: rgba(255, 255, 255, 0.32);
  background: rgba(255, 255, 255, 0.72);
  color: rgba(46, 36, 26, 0.78);
}

.land-normal .seed-image-wrapper,
.land-red .seed-image-wrapper,
.land-dark .seed-image-wrapper,
.land-gold .seed-image-wrapper,
.land-purple .seed-image-wrapper {
  border-color: rgba(255, 255, 255, 0.36);
  background: radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.66));
}

.land-normal .plant-name,
.land-red .plant-name,
.land-dark .plant-name {
  color: #fffaf4;
  text-shadow: 0 1px 2px rgba(38, 24, 16, 0.26);
}

.land-normal .grow-info,
.land-red .grow-info,
.land-dark .grow-info,
.land-normal .mature-time,
.land-red .mature-time,
.land-dark .mature-time {
  color: rgba(255, 250, 244, 0.82);
}

.land-gold .plant-name {
  color: #4a381b;
}

.land-gold .grow-info,
.land-gold .mature-time {
  color: rgba(74, 56, 27, 0.74);
}

.land-purple .plant-name {
  color: #3f2850;
}

.land-purple .grow-info,
.land-purple .mature-time {
  color: rgba(63, 40, 80, 0.74);
}

.land-gold .meta-item,
.land-purple .meta-item,
.land-yellow .meta-item {
  border-color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.28);
}

.land-gold .meta-item span,
.land-purple .meta-item span,
.land-yellow .meta-item span {
  color: rgba(58, 42, 25, 0.56);
}

.land-gold .meta-item strong,
.land-yellow .meta-item strong {
  color: #4a381b;
}

.land-purple .meta-item strong {
  color: #3f2850;
}

.land-dead {
  border-color: rgba(138, 152, 135, 0.28) !important;
  background: linear-gradient(180deg, rgba(247, 248, 246, 0.86), rgba(232, 235, 230, 0.7)) !important;
  filter: grayscale(1);
}

.land-harvestable {
  outline: 2px solid rgba(214, 155, 67, 0.36);
  outline-offset: 2px;
}

.land-stealable {
  outline: 2px solid rgba(120, 98, 167, 0.34);
  outline-offset: 2px;
}

.land-card-inner {
  display: flex;
  min-height: 178px;
  flex-direction: column;
  padding: 14px;
}

.land-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.land-id,
.status-pill,
.plant-size {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: rgba(46, 36, 26, 0.76);
  font-size: 11px;
  font-weight: 780;
  line-height: 1;
  white-space: nowrap;
}

.land-id {
  padding: 6px 10px;
  font-family: monospace;
}

.status-pill {
  min-width: 54px;
  justify-content: center;
  padding: 6px 10px;
}

.plant-row {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}

.seed-image-wrapper {
  position: relative;
  height: 58px;
  width: 58px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(158, 180, 151, 0.22);
  border-radius: 20px;
  background:
    radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.96), rgba(236, 245, 232, 0.72));
  box-shadow: inset 0 -10px 20px rgba(95, 143, 99, 0.08), 0 12px 24px rgba(42, 58, 42, 0.08);
}

.seed-image {
  max-height: 74%;
  max-width: 74%;
  object-fit: contain;
}

.seed-placeholder {
  color: #d1d5db;
}

.plant-copy {
  min-width: 0;
}

.plant-name {
  width: 100%;
  padding: 0;
  text-align: left;
  color: var(--app-text);
  font-size: 15px;
  font-weight: 850;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.grow-info {
  min-height: 18px;
  margin-top: 4px;
  width: 100%;
  text-align: left;
  font-size: 11px;
  font-weight: 650;
  color: var(--app-text-muted);
}

.mature-time {
  color: #a96f2c;
}

.land-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}

.meta-item {
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.18);
  padding: 8px 10px;
}

.meta-item span {
  display: block;
  color: rgba(255, 250, 244, 0.72);
  font-size: 10px;
  font-weight: 700;
}

.meta-item strong {
  display: block;
  margin-top: 3px;
  overflow: hidden;
  color: #fffaf4;
  font-size: 12px;
  font-weight: 850;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.land-footer {
  display: flex;
  min-height: 24px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 12px;
}

.plant-size {
  padding: 5px 8px;
  color: rgba(46, 36, 26, 0.72);
}

.status-badges {
  display: flex;
  flex: 1;
  min-height: 24px;
  justify-content: flex-end;
  transform-origin: bottom;
  gap: 4px;
  font-size: 11px;
}

.badge-tag {
  border-radius: 999px;
  padding: 0 5px;
  font-weight: 750;
}

@media (prefers-color-scheme: dark) {
  .plant-size {
    background-color: rgba(131, 24, 67, 0.3);
    color: #f9a8d4;
  }
}
</style>
