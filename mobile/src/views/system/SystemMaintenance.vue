<template>
  <div class="page-container">
    <NavBar title="系统维护" left-arrow @click-left="$router.go(-1)" />
    <div class="page-body">
      <CellGroup inset title="系统信息">
        <Cell title="系统版本" :value="systemInfo.version || '--'" />
        <Cell title="Node.js" :value="systemInfo.nodeVersion || '--'" />
        <Cell title="数据库" :value="systemInfo.databaseVersion || '--'" />
        <Cell title="运行环境" :value="systemInfo.environment || '--'" />
        <Cell title="服务器时间" :value="serverTime" />
      </CellGroup>
      <CellGroup inset title="最近系统日志">
        <Cell
          v-for="log in logs"
          :key="log.id || `${log.timestamp}-${log.message}`"
          :title="log.action || log.message || '--'"
          :label="log.created_at || log.timestamp ? String(log.created_at || log.timestamp).substring(0, 19) : '--'"
          :value="log.username || log.operator || ''"
        />
        <Cell v-if="logs.length === 0" title="暂无日志" />
      </CellGroup>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { NavBar, CellGroup, Cell } from 'vant'
  import { systemApi } from '@/api'
  import { extractApiData } from '@/utils/apiHelper'
  import dayjs from 'dayjs'

  const serverTime = ref(dayjs().format('YYYY-MM-DD HH:mm:ss'))
  const systemInfo = ref({})
  const logs = ref([])

  const fetchSystemInfo = async () => {
    try {
      const response = await systemApi.getSystemInfo()
      systemInfo.value = extractApiData(response) || {}
      if (systemInfo.value.timestamp) {
        serverTime.value = dayjs(systemInfo.value.timestamp).format('YYYY-MM-DD HH:mm:ss')
      }
    } catch {
      systemInfo.value = {}
    }
  }

  const fetchLogs = async () => {
    try {
      const response = await systemApi.getLogs({ pageSize: 10, page: 1 })
      const data = extractApiData(response)
      logs.value = (Array.isArray(data) ? data : (data?.list || data?.items || [])).slice(0, 10)
    } catch {
      logs.value = []
    }
  }

  onMounted(() => Promise.all([fetchSystemInfo(), fetchLogs()]))
</script>

<style lang="scss" scoped>
  .page-container { min-height: 100%; background: var(--bg-primary); }
  .page-body { padding: 0 12px var(--app-bottom-space); }
</style>
