<template>
  <div class="module-container" :class="[moduleName ? `${moduleName}-container` : '', padding ? 'with-padding' : '']">
    <router-view v-slot="{ Component }">
      <keep-alive>
        <component :is="Component" />
      </keep-alive>
    </router-view>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  moduleName: {
    type: String,
    default: ''
  },
  padding: {
    type: Boolean,
    default: false
  }
});

const isFullScreen = ref(false);

function toggleFullScreen() {
  try {
    if (!isFullScreen.value) {
      const container = document.querySelector(`.${props.moduleName}-container`) || document.querySelector('.module-container');
      if (container) {
        if (container.requestFullscreen) {
          container.requestFullscreen();
        } else if (container.mozRequestFullScreen) {
          container.mozRequestFullScreen();
        } else if (container.webkitRequestFullscreen) {
          container.webkitRequestFullscreen();
        } else if (container.msRequestFullscreen) {
          container.msRequestFullscreen();
        }
      }
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  } catch (error) {
    console.error('全屏操作失败:', error);
  }
}

function handleKeyDown(event) {
  if (event.key === 'F11') {
    event.preventDefault();
    toggleFullScreen();
  }
}

function handleFullScreenChange() {
  isFullScreen.value = !!(
    document.fullscreenElement ||
    document.mozFullScreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement
  );
}

onMounted(() => {
  document.addEventListener('fullscreenchange', handleFullScreenChange);
  document.addEventListener('mozfullscreenchange', handleFullScreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullScreenChange);
  document.addEventListener('MSFullscreenChange', handleFullScreenChange);
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', handleFullScreenChange);
  document.removeEventListener('mozfullscreenchange', handleFullScreenChange);
  document.removeEventListener('webkitfullscreenchange', handleFullScreenChange);
  document.removeEventListener('MSFullscreenChange', handleFullScreenChange);
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<style scoped>
.module-container {
  width: 100%;
  height: 100%;
  position: relative;
  background-color: transparent;
}

.module-container:fullscreen,
.module-container:-webkit-full-screen,
.module-container:-moz-full-screen,
.module-container:-ms-fullscreen {
  background-color: var(--color-bg-page);
  padding: 20px;
  overflow: auto;
}

.module-container.with-padding,
.finance-container {
  padding: 0;
}
</style>
