<template>
  <div
    class="decorative-avatar-frame"
    :class="[frameClass, motionClass, { 'is-none': !frameImage }]"
    :style="frameStyle"
  >
    <img
      v-if="frameImage"
      class="avatar-frame-image"
      :style="frameImageStyle"
      :src="frameImage"
      alt=""
      aria-hidden="true"
      draggable="false"
    />

    <el-avatar
      :size="avatarSize"
      :src="avatar || defaultAvatar"
      class="decorative-avatar"
      @error="handleError"
    >
      {{ fallbackInitial }}
    </el-avatar>
  </div>
</template>

<script setup>
import { computed } from 'vue'

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
  avatarSize: {
    type: Number,
    default: 100
  },
  defaultAvatar: {
    type: String,
    default: '/default-avatar.webp'
  }
})

const emit = defineEmits(['avatar-error'])

const frameImage = computed(() => props.frame?.image || '')
const frameClass = computed(() => props.frame?.id ? `frame-${props.frame.id}` : 'frame-none')
const motionClass = computed(() => props.frame?.motion ? `frame-motion-${props.frame.motion}` : '')
const frameStyle = computed(() => ({
  position: 'relative',
  width: `${props.size}px`,
  height: `${props.size}px`,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: `0 0 ${props.size}px`,
  overflow: 'hidden',
  '--frame-size': `${props.size}px`,
  '--avatar-size': `${props.avatarSize}px`
}))
const frameImageStyle = computed(() => ({
  position: 'absolute',
  inset: '0',
  width: `${props.size}px`,
  height: `${props.size}px`,
  minWidth: `${props.size}px`,
  minHeight: `${props.size}px`,
  maxWidth: `${props.size}px`,
  maxHeight: `${props.size}px`,
  zIndex: 2,
  display: 'block',
  objectFit: 'contain',
  pointerEvents: 'none',
  userSelect: 'none'
}))
const fallbackInitial = computed(() => {
  return props.name ? props.name.slice(0, 1).toUpperCase() : 'U'
})

function handleError() {
  emit('avatar-error')
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
  overflow: hidden;
  contain: layout paint;
  isolation: isolate;
  line-height: 1;
  vertical-align: middle;
}

.avatar-frame-image {
  position: absolute;
  inset: 0;
  width: var(--frame-size);
  height: var(--frame-size);
  min-width: var(--frame-size);
  min-height: var(--frame-size);
  max-width: var(--frame-size);
  max-height: var(--frame-size);
  z-index: 2;
  display: block;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  transform-origin: center;
}

.decorative-avatar {
  position: relative;
  z-index: 1;
  width: var(--avatar-size) !important;
  height: var(--avatar-size) !important;
  flex: 0 0 var(--avatar-size);
  border: 3px solid var(--el-bg-color);
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: calc(var(--avatar-size) * 0.32);
  box-shadow: 0 2px 12px color-mix(in srgb, var(--color-text-primary) 8%, transparent);
}

:deep(.decorative-avatar img) {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.is-none .decorative-avatar {
  box-shadow: 0 2px 12px color-mix(in srgb, var(--color-text-primary) 8%, transparent);
}

.frame-motion-breath .avatar-frame-image {
  animation: avatarFrameImageBreath 3.2s ease-in-out infinite;
}

.frame-motion-slow-spin .avatar-frame-image {
  animation: avatarFrameImageSpin 14s linear infinite;
}

@keyframes avatarFrameImageBreath {
  0%, 100% { transform: scale(1); opacity: 0.96; }
  50% { transform: scale(1.035); opacity: 1; }
}

@keyframes avatarFrameImageSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .avatar-frame-image {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
