<!--
  移动端系统入口：仅 L1/L2 能力（通知等）
  L3 角色/权限/备份/配置 仅 PC — 见 backend/docs/MOBILE_PRODUCT_LAYER.md
-->
<template>
  <div class="system-page">
    <NavBar title="系统" left-arrow @click-left="$router.go(-1)" />

    <div class="content-container">
      <div class="system-info-card">
        <div class="info-header">
          <div class="system-logo">
            <Icon name="setting-o" size="32" color="#5E7BF6" />
          </div>
          <div class="system-details">
            <div class="system-name">现场终端</div>
            <div class="system-version">管理台功能请使用 PC 端</div>
          </div>
        </div>
      </div>

      <div class="management-modules">
        <div class="module-section">
          <div class="section-title">现场可用</div>
          <div class="module-grid">
            <div
              v-for="module in fieldModules"
              :key="module.key"
              class="module-item"
              @click="navigateTo(module.path)"
            >
              <div class="module-icon">
                <Icon :name="module.icon" size="24" :color="module.color" />
              </div>
              <div class="module-content">
                <div class="module-title">{{ module.title }}</div>
                <div class="module-description">{{ module.description }}</div>
              </div>
              <Icon name="arrow" size="12" color="var(--text-disabled)" />
            </div>
          </div>
        </div>

        <van-notice-bar
          left-icon="info-o"
          text="用户/角色/权限/备份/系统配置/凭证编制等高危能力已限制为 PC 端操作。"
          wrapable
          :scrollable="false"
          class="pc-only-tip"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { NavBar, Icon, NoticeBar as VanNoticeBar } from 'vant'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const allFieldModules = [
  {
    key: 'notifications',
    title: '消息通知',
    description: '系统与业务通知',
    path: '/system/notifications',
    icon: 'bell',
    color: '#5E7BF6',
    permission: 'system:notifications'
  },
  {
    key: 'hierarchy',
    title: '组织架构',
    description: '查看组织树（只读）',
    path: '/system/hierarchy',
    icon: 'cluster-o',
    color: '#07c160',
    permission: 'system:departments:view'
  },
  {
    key: 'approvals',
    title: '我的审批',
    description: '待办审批中心',
    path: '/workflow/approvals',
    icon: 'todo-list-o',
    color: '#ff976a',
    permission: 'system:workflow:use'
  }
]

const fieldModules = computed(() =>
  allFieldModules.filter(
    (m) => !m.permission || authStore.hasPermission(m.permission) || authStore.hasChildPermission?.(m.permission)
  )
)

const navigateTo = (path) => {
  router.push(path)
}
</script>

<style scoped>
.system-page {
  min-height: 100vh;
  background: var(--bg-page, #f7f8fa);
}
.content-container {
  padding: 12px 16px 24px;
}
.system-info-card {
  background: var(--bg-card, #fff);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}
.info-header {
  display: flex;
  gap: 12px;
  align-items: center;
}
.system-name {
  font-size: 16px;
  font-weight: 700;
}
.system-version {
  font-size: 12px;
  color: var(--text-secondary, #969799);
  margin-top: 4px;
}
.section-title {
  font-size: 13px;
  color: var(--text-secondary, #969799);
  margin: 8px 0 10px;
  font-weight: 600;
}
.module-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-card, #fff);
  border-radius: 10px;
  padding: 14px 12px;
  margin-bottom: 8px;
}
.module-title {
  font-size: 15px;
  font-weight: 600;
}
.module-description {
  font-size: 12px;
  color: var(--text-secondary, #969799);
  margin-top: 2px;
}
.module-content {
  flex: 1;
  min-width: 0;
}
.pc-only-tip {
  margin-top: 16px;
  border-radius: 8px;
}
</style>
