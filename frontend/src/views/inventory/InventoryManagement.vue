<!--
/**
 * InventoryManagement.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="inventory-content">
    <router-view></router-view>
  </div>
</template>

<script setup>

import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
const router = useRouter()

onMounted(() => {
  // 如果当前路径是 /inventory，重定向到库存查询页面
  if (router.currentRoute.value.path === '/inventory') {
    router.push('/inventory/stock')
  }
})
</script>

<style scoped>
.inventory-content {
  padding: 0;
  height: 100%;
}
</style>