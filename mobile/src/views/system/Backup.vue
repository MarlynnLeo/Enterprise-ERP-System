<template>
  <div class="page-container">
    <NavBar title="数据备份" left-arrow @click-left="$router.go(-1)" />
    <div class="page-body">
      <CellGroup inset title="备份状态">
        <Cell title="数据库状态" value="运行中" value-class="status-ok" />
        <Cell title="最后备份时间" :value="lastBackup" />
        <Cell title="备份方式" value="自动定时" />
      </CellGroup>
      <CellGroup inset title="操作">
        <Cell title="手动备份" is-link @click="handleBackup">
          <template #value><Tag type="primary" size="medium">立即执行</Tag></template>
        </Cell>
        <Cell title="备份策略" value="每日凌晨2:00自动备份" />
        <Cell title="保留策略" value="保留最近30天" />
      </CellGroup>
    </div>
  </div>
</template>

<script setup>
  import { ref } from 'vue'
  import { NavBar, CellGroup, Cell, Tag, showToast } from 'vant'
  import dayjs from 'dayjs'

  const lastBackup = ref(dayjs().subtract(1, 'day').format('YYYY-MM-DD HH:mm'))

  const handleBackup = () => {
    showToast('备份任务已提交，请在服务器端查看进度')
  }
</script>

<style lang="scss" scoped>
  .page-container { min-height: 100vh; background: var(--bg-primary); }
  .page-body { padding: 12px; }
  :deep(.status-ok) { color: #67C23A !important; font-weight: 600; }
</style>
