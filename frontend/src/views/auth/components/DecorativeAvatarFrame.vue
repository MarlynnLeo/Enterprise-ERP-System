<template>
  <div
    class="decorative-avatar-frame"
    :class="rootClasses"
    :style="frameCssVars"
    role="img"
    :aria-label="frame?.name || '用户头像'"
  >
    <!-- 原有图片特效框（全部保留） -->
    <img
      v-if="frameImage"
      class="avatar-frame-image"
      :src="frameImage"
      alt=""
      aria-hidden="true"
      draggable="false"
      @error="onFrameImageError"
    />

    <el-avatar
      :size="resolvedAvatarSize"
      :src="resolvedAvatarSrc"
      class="decorative-avatar"
      @error="handleError"
    >
      {{ fallbackInitial }}
    </el-avatar>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { getAvatarInnerRatio } from '@/utils/avatarFrames'

const props = defineProps({
  frame: {
    type: Object,
    default: null
  },
  avatar: {
    type: String,
    default: ''
  },
  name: {
    type: String,
    default: ''
  },
  size: {
    type: Number,
    default: 140
  },
  /** 传 0 则按特效配置自动算占比 */
  avatarSize: {
    type: Number,
    default: 0
  },
  defaultAvatar: {
    type: String,
    default: '/default-avatar.webp'
  }
})

const emit = defineEmits(['avatar-error'])

const imageLoadFailed = ref(false)
const avatarLoadFailed = ref(false)
const defaultAvatarLoadFailed = ref(false)

watch(
  () => props.avatar,
  () => {
    avatarLoadFailed.value = false
    defaultAvatarLoadFailed.value = false
  }
)

watch(
  () => props.defaultAvatar,
  () => {
    defaultAvatarLoadFailed.value = false
  }
)

watch(
  () => props.frame?.image,
  () => {
    imageLoadFailed.value = false
  }
)

const frameImage = computed(() => {
  if (imageLoadFailed.value) return ''
  return props.frame?.image || ''
})

const resolvedAvatarSrc = computed(() => {
  if (props.avatar && !avatarLoadFailed.value) return props.avatar
  if (props.defaultAvatar && !defaultAvatarLoadFailed.value) return props.defaultAvatar
  return ''
})

const isNone = computed(
  () => !props.frame || props.frame.variant === 'none' || props.frame.id === 'none' || !frameImage.value
)

const resolvedAvatarSize = computed(() => {
  if (props.avatarSize > 0) return props.avatarSize
  const ratio = getAvatarInnerRatio(props.frame)
  return Math.max(20, Math.round(props.size * ratio))
})

const rootClasses = computed(() => {
  const id = props.frame?.id || 'none'
  const motion = props.frame?.motion || 'none'
  return [
    `frame-${id}`,
    `variant-${props.frame?.variant || 'none'}`,
    motion && motion !== 'none' ? `frame-motion-${motion}` : '',
    { 'is-none': isNone.value }
  ]
})

const frameCssVars = computed(() => ({
  '--frame-size': `${props.size}px`,
  '--avatar-size': `${resolvedAvatarSize.value}px`
}))

const fallbackInitial = computed(() => {
  return props.name ? props.name.slice(0, 1).toUpperCase() : 'U'
})

function handleError() {
  if (props.avatar && !avatarLoadFailed.value) {
    avatarLoadFailed.value = true
    emit('avatar-error', props.avatar)
    return
  }

  if (props.defaultAvatar && !defaultAvatarLoadFailed.value) {
    defaultAvatarLoadFailed.value = true
  }
}

function onFrameImageError() {
  imageLoadFailed.value = true
}
</script>

<style scoped>
.decorative-avatar-frame {
  --frame-size: 140px;
  --avatar-size: 100px;
  position: relative;
  width: var(--frame-size);
  height: var(--frame-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 var(--frame-size);
  box-sizing: border-box;
  /* 允许光环/星点外溢，避免被裁成硬边 */
  overflow: visible;
  isolation: isolate;
  line-height: 1;
  vertical-align: middle;
  /* 禁止 contain:layout，避免 fixed/绝对定位子层错位 */
  contain: style;
}

/* —— 图片特效框 —— */
.avatar-frame-image {
  position: absolute;
  inset: 0;
  width: var(--frame-size);
  height: var(--frame-size);
  z-index: 2;
  display: block;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  transform-origin: center center;
  /* 轻微投影，减轻「贴图假」 */
  filter: drop-shadow(0 2px 6px color-mix(in srgb, var(--color-text-primary) 12%, transparent));
}

.decorative-avatar {
  position: relative;
  z-index: 1;
  width: var(--avatar-size) !important;
  height: var(--avatar-size) !important;
  flex: 0 0 var(--avatar-size);
  border: 2px solid var(--el-bg-color, var(--color-bg-base));
  background: var(--el-fill-color, var(--color-fill-light));
  color: var(--el-text-color-secondary);
  font-size: calc(var(--avatar-size) * 0.32);
  font-weight: 600;
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--color-text-primary) 8%, transparent),
    0 4px 12px color-mix(in srgb, var(--color-text-primary) 6%, transparent);
}

:deep(.decorative-avatar img) {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.is-none .decorative-avatar {
  border-color: var(--color-border-lighter, var(--el-border-color-lighter));
  box-shadow: 0 2px 8px color-mix(in srgb, var(--color-text-primary) 6%, transparent);
}

/* —— 动画优化：更柔、更慢，不再猛缩放 —— */
.frame-motion-breath .avatar-frame-image {
  animation: avatarFrameImageBreath 4s ease-in-out infinite;
}

.frame-motion-slow-spin .avatar-frame-image {
  animation: avatarFrameImageSpin 22s linear infinite;
}

@keyframes avatarFrameImageBreath {
  0%, 100% {
    transform: scale(1);
    opacity: 0.94;
    filter: drop-shadow(0 2px 6px color-mix(in srgb, var(--color-text-primary) 12%, transparent));
  }
  50% {
    transform: scale(1.018);
    opacity: 1;
    filter: drop-shadow(0 3px 10px color-mix(in srgb, var(--color-text-primary) 16%, transparent));
  }
}

@keyframes avatarFrameImageSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .avatar-frame-image {
    animation: none !important;
  }
}

/* 顶栏等超小尺寸：减弱阴影即可 */
.decorative-avatar-frame[style*='--frame-size: 44px'] .avatar-frame-image,
.decorative-avatar-frame[style*='--frame-size: 48px'] .avatar-frame-image {
  filter: drop-shadow(0 1px 3px color-mix(in srgb, var(--color-text-primary) 10%, transparent));
}
</style>
