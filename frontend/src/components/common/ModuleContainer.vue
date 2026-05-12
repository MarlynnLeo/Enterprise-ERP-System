<!--
/**
 * ModuleContainer.vue
 * @description Vue组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
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

// 切换全屏状态
function toggleFullScreen() {
  try {
    if (!isFullScreen.value) {
      // 进入全屏
      const container = document.querySelector(`.${props.moduleName}-container`) || document.querySelector('.module-container');
      if (container) {
        if (container.requestFullscreen) {
          container.requestFullscreen();
        } else if (container.mozRequestFullScreen) { // Firefox
          container.mozRequestFullScreen();
        } else if (container.webkitRequestFullscreen) { // Chrome, Safari
          container.webkitRequestFullscreen();
        } else if (container.msRequestFullscreen) { // IE11
          container.msRequestFullscreen();
        }
      }
    } else {
      // 退出全屏
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.mozCancelFullScreen) { // Firefox
        document.mozCancelFullScreen();
      } else if (document.webkitExitFullscreen) { // Chrome, Safari
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) { // IE11
        document.msExitFullscreen();
      }
    }
  } catch (error) {
    console.error('全屏操作失败:', error);
  }
}

// 处理键盘事件
function handleKeyDown(event) {
  // F11键的keyCode是122
  if (event.key === 'F11') {
    event.preventDefault(); // 阻止浏览器默认的F11全屏行为
    toggleFullScreen();
  }
}

// 监听全屏状态变化
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

  // 添加键盘事件监听
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', handleFullScreenChange);
  document.removeEventListener('mozfullscreenchange', handleFullScreenChange);
  document.removeEventListener('webkitfullscreenchange', handleFullScreenChange);
  document.removeEventListener('MSFullscreenChange', handleFullScreenChange);

  // 移除键盘事件监听
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

.module-container:fullscreen {
  background-color: var(--el-bg-color, #ffffff);
  padding: 20px;
  overflow: auto;
}

.module-container:-webkit-full-screen {
  background-color: var(--el-bg-color, #ffffff);
  padding: 20px;
  overflow: auto;
}

.module-container:-moz-full-screen {
  background-color: var(--el-bg-color, #ffffff);
  padding: 20px;
  overflow: auto;
}

.module-container:-ms-fullscreen {
  background-color: var(--el-bg-color, #ffffff);
  padding: 20px;
  overflow: auto;
}

.module-container.with-padding,
.finance-container {
  padding: 0;
}
</style>