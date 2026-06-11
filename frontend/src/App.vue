<!--
/**
 * App.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <el-config-provider :locale="languageStore.elementLocale">
    <router-view />
  </el-config-provider>
</template>

<script setup>
// App.vue - 根组件
import { useLanguageStore } from '@/stores/language';

// 使用语言store
const languageStore = useLanguageStore();
</script>

<style>
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow: hidden; /* Prevent page-level scrollbar */
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif;
}

#app {
  height: 100%;
  width: 100%;
  overflow: hidden;
}
</style>