<template>
  <div class="not-found-container">
    <div class="not-found-content">
      <div class="error-code">404</div>
      <div class="error-title">页面未找到</div>
      <div class="error-desc">
        抱歉，您访问的页面不存在或已被移除。
      </div>
      <div class="error-actions">
        <el-button type="primary" size="large" @click="goHome">
          <el-icon><HomeFilled /></el-icon>
          返回首页
        </el-button>
        <el-button size="large" @click="goBack">
          <el-icon><Back /></el-icon>
          返回上页
        </el-button>
      </div>
      <div class="error-path">
        <span>请求路径：</span>
        <code>{{ currentPath }}</code>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { HomeFilled, Back } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()

const currentPath = computed(() => route.fullPath)

const goHome = () => {
  router.push('/')
}

const goBack = () => {
  if (window.history.length > 1) {
    router.go(-1)
  } else {
    router.push('/')
  }
}
</script>

<style scoped>
.not-found-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0f0f23 100%);
  color: #e0e0e0;
  font-family: 'Inter', sans-serif;
}

.not-found-content {
  text-align: center;
  padding: 3rem;
}

.error-code {
  font-size: 8rem;
  font-weight: 900;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
  margin-bottom: 0.5rem;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.error-title {
  font-size: 1.8rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: #ffffff;
}

.error-desc {
  font-size: 1.1rem;
  color: #8888aa;
  margin-bottom: 2.5rem;
  max-width: 400px;
  margin-left: auto;
  margin-right: auto;
}

.error-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-bottom: 2rem;
}

.error-path {
  font-size: 0.85rem;
  color: #555577;
  margin-top: 1rem;
}

.error-path code {
  background: rgba(102, 126, 234, 0.15);
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  color: #667eea;
  font-family: 'Courier New', monospace;
}
</style>
