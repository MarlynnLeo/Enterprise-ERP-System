<!--
/**
 * ComingSoon.vue
 * @description 功能开发中占位页面
 * @date 2026-04-14
 * @version 3.0.0
 */
-->
<template>
  <div class="unified-page">
    <NavBar :title="pageTitle" left-arrow @click-left="onBack" />

    <div class="content-container">
      <Empty image="error" :description="`${pageTitle} 模块正在紧张开发中...`">
        <template #default>
          <div style="margin-top: 16px; text-align: center">
            <Button plain type="primary" size="small" @click="onBack">返回上一页</Button>
          </div>
        </template>
      </Empty>
    </div>
  </div>
</template>

<script setup>
  import { computed } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import { NavBar, Empty, Button } from 'vant'

  const router = useRouter()
  const route = useRoute()

  const pageTitle = computed(() => {
    return route.meta.title || '功能开发中'
  })

  const onBack = () => {
    router.back()
  }
</script>

<style scoped>
  .unified-page {
    min-height: 100vh;
    background-color: var(--van-background-2);
    display: flex;
    flex-direction: column;
  }
  .content-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
