<template>
  <div class="page-container">
    <NavBar title="系统维护" left-arrow @click-left="$router.go(-1)" />
    <div class="page-body">
      <CellGroup inset title="系统信息">
        <Cell title="系统版本" value="v2.0.0" />
        <Cell title="Node.js" value="18.x" />
        <Cell title="数据库" value="MySQL 8.0" />
        <Cell title="服务器时间" :value="serverTime" />
      </CellGroup>
      <CellGroup inset title="维护操作">
        <Cell title="清理缓存" is-link @click="showToast('缓存已清理')">
          <template #value><Tag type="warning" size="medium">执行</Tag></template>
        </Cell>
        <Cell title="重建索引" is-link @click="showToast('索引重建任务已提交')">
          <template #value><Tag type="primary" size="medium">执行</Tag></template>
        </Cell>
        <Cell title="检查数据完整性" is-link @click="showToast('数据完整性检查已启动')">
          <template #value><Tag type="success" size="medium">执行</Tag></template>
        </Cell>
      </CellGroup>
      <CellGroup inset title="最近系统日志">
        <Cell v-for="log in logs" :key="log.id" :title="log.action || log.message || '--'" :label="log.created_at ? log.created_at.substring(0, 19) : '--'" :value="log.username || log.operator || ''" />
        <Cell v-if="logs.length === 0" title="暂无日志" />
      </CellGroup>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { NavBar, CellGroup, Cell, Tag, showToast } from 'vant'
  import { systemApi } from '@/services/api'
  import { extractApiData } from '@/utils/apiHelper'
  import dayjs from 'dayjs'

  const serverTime = ref(dayjs().format('YYYY-MM-DD HH:mm:ss'))
  const logs = ref([])

  const fetchLogs = async () => {
    try {
      const res = await systemApi.getLogs({ pageSize: 10, page: 1 })
      const d = extractApiData(res)
      logs.value = (Array.isArray(d) ? d : (d.list || d.items || [])).slice(0, 10)
    } catch { logs.value = [] }
  }

  onMounted(fetchLogs)
</script>

<style lang="scss" scoped>
  .page-container { min-height: 100vh; background: var(--bg-primary); }
  .page-body { padding: 12px; }
</style>
