<!--
/**
 * About.vue - 关于系统
 * @description 系统信息展示页面
 * @date 2026-04-18
 * @version 1.0.0
 */
-->
<template>
  <div class="about-page">
    <NavBar title="关于系统" left-arrow @click-left="$router.go(-1)" />

    <div class="content">
      <!-- Logo 区域 -->
      <div class="logo-section">
        <div class="logo-circle">
          <span class="logo-text">K</span>
        </div>
        <h1 class="app-name">KACON ERP</h1>
        <p class="app-subtitle">智能制造执行系统</p>
        <span class="version-badge">v{{ appVersion }}</span>
      </div>

      <!-- 系统信息 -->
      <div class="info-section">
        <CellGroup inset>
          <Cell title="当前版本" :value="'v' + appVersion" />
          <Cell title="系统类型" value="移动端" />
          <Cell title="技术栈" value="Vue 3 + Vant 4" />
          <Cell title="构建时间" :value="buildDate" />
        </CellGroup>
      </div>

      <!-- 版权信息 -->
      <div class="copyright-section">
        <p>© 2026 KACON 科技</p>
        <p class="sub">保留所有权利</p>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { NavBar, Cell, CellGroup } from 'vant'
  import { APP_INFO } from '@/config/app'

  const appVersion = APP_INFO.version
  const buildDate = import.meta.env.VITE_BUILD_TIME || new Date().toISOString().slice(0, 10)
</script>

<style scoped>
  .about-page {
    min-height: 100vh;
    background: var(--bg-primary);
  }

  .content {
    padding: 32px 16px;
  }

  .logo-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-bottom: 32px;
  }

  .logo-circle {
    width: 72px;
    height: 72px;
    border-radius: 18px;
    background: linear-gradient(135deg, var(--color-primary, var(--color-primary)), #7c3aed);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 8px;
  }

  .logo-text {
    font-size: 2rem;
    font-weight: 800;
    color: var(--text-primary);
  }

  .app-name {
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--text-primary);
    margin: 0;
  }

  .app-subtitle {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0;
  }

  .version-badge {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-primary, var(--color-primary));
    background: color-mix(in srgb, var(--color-primary, var(--color-primary)) 10%, transparent);
    padding: 2px 12px;
    border-radius: 99px;
  }

  .info-section {
    margin-bottom: 32px;
  }

  .copyright-section {
    text-align: center;
    color: var(--text-tertiary);
    font-size: 0.75rem;
    line-height: 1.6;
  }
  .copyright-section .sub {
    margin: 0;
    opacity: 0.7;
  }
</style>
