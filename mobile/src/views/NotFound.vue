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

<style lang="scss" scoped>
  .unified-page {
    min-height: 100vh;
  }

  .not-found-content {
    padding: $padding-lg;

    h2 {
      margin: $margin-md 0;
      color: var(--text-primary);
    }

    p {
      margin-bottom: $margin-md;
      color: var(--text-secondary);
    }
  }

  .warning-icon {
    color: $warning-color;
  }
</style>
