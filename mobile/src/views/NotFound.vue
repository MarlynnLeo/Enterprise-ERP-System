<!--
/**
 * NotFound.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="page-container flex-center">
    <div class="not-found-content text-center">
      <Icon name="warning-o" size="64" class="warning-icon" />
      <h2>页面未找到</h2>
      <p>您访问的页面不存在或已被移除</p>
      <Button type="primary" size="small" @click="goHome">返回首页</Button>
    </div>
  </div>
</template>

<script setup>
  import { useRouter } from 'vue-router'
  import { Icon, Button } from 'vant'

  const router = useRouter()

  const goHome = () => {
    router.push('/')
  }
</script>

<style scoped>
  .not-found-content {
    padding: 24px;

    h2 {
      margin: 12px 0;
      color: var(--text-primary);
    }

    p {
      margin-bottom: 12px;
      color: var(--text-secondary);
    }
  }

  .warning-icon {
    color: var(--color-warning);
  }
</style>
