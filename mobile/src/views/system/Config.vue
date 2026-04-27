<!--
/**
 * Config.vue - 系统配置
 * @description 系统参数配置页面
 * @date 2026-04-18
 * @version 1.0.0
 */
-->
<template>
  <div class="config-page">
    <NavBar title="系统配置" left-arrow @click-left="$router.go(-1)" />

    <div class="content-container">
      <!-- 基础配置 -->
      <div class="config-section">
        <div class="section-title">基础配置</div>
        <CellGroup inset>
          <Cell title="系统名称" :value="config.systemName" is-link />
          <Cell title="公司名称" :value="config.companyName" is-link />
          <Cell title="系统语言" :value="config.language" is-link />
          <Cell title="时区设置" :value="config.timezone" is-link />
        </CellGroup>
      </div>

      <!-- 业务配置 -->
      <div class="config-section">
        <div class="section-title">业务配置</div>
        <CellGroup inset>
          <Cell title="审批流程" value="已启用" is-link>
            <template #right-icon>
              <Switch v-model="config.approvalEnabled" size="20" />
            </template>
          </Cell>
          <Cell title="库存预警" value="已启用" is-link>
            <template #right-icon>
              <Switch v-model="config.inventoryAlertEnabled" size="20" />
            </template>
          </Cell>
          <Cell title="自动编号" value="已启用" is-link>
            <template #right-icon>
              <Switch v-model="config.autoNumberEnabled" size="20" />
            </template>
          </Cell>
        </CellGroup>
      </div>

      <!-- 安全配置 -->
      <div class="config-section">
        <div class="section-title">安全配置</div>
        <CellGroup inset>
          <Cell title="密码强度" :value="config.passwordPolicy" is-link />
          <Cell title="会话超时" :value="config.sessionTimeout" is-link />
          <Cell title="登录失败锁定" :value="config.lockoutThreshold" is-link />
          <Cell title="操作日志" value="已启用" is-link>
            <template #right-icon>
              <Switch v-model="config.auditLogEnabled" size="20" />
            </template>
          </Cell>
        </CellGroup>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { reactive } from 'vue'
  import { NavBar, Cell, CellGroup, Switch } from 'vant'

  const config = reactive({
    systemName: 'KACON ERP',
    companyName: 'KACON科技',
    language: '简体中文',
    timezone: 'Asia/Shanghai (UTC+8)',
    approvalEnabled: true,
    inventoryAlertEnabled: true,
    autoNumberEnabled: true,
    passwordPolicy: '中等强度',
    sessionTimeout: '30分钟',
    lockoutThreshold: '10次失败后锁定',
    auditLogEnabled: true
  })
</script>

<style scoped>
  .config-page {
    min-height: 100vh;
    background-color: var(--bg-primary);
  }

  .content-container {
    padding: 12px 0;
  }

  .config-section {
    margin-bottom: 16px;
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    padding: 0 28px;
    margin-bottom: 8px;
  }
</style>
