<template>
  <div class="page-container">
    <NavBar title="系统配置" left-arrow @click-left="$router.go(-1)" />
    <div class="page-body">
      <Loading v-if="loading" size="24px" vertical style="padding:40px 0">加载中...</Loading>
      <template v-else>
        <CellGroup inset title="配置项">
          <Cell v-for="item in configs" :key="item.id || item.key" :title="item.label || item.key" :value="item.value || '--'" :label="item.description || item.key" />
          <Cell v-if="configs.length === 0" title="暂无配置数据" />
        </CellGroup>
      </template>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { NavBar, CellGroup, Cell, Loading } from 'vant'
  import { systemApi } from '@/services/api'
  import { extractApiData } from '@/utils/apiHelper'

  const loading = ref(true)
  const configs = ref([])

  const fetchData = async () => {
    try {
      const res = await systemApi.getConfig()
      const d = extractApiData(res)
      configs.value = Array.isArray(d) ? d : (d.list || d.items || Object.entries(d).map(([key, value]) => ({ key, value: String(value) })))
    } catch { configs.value = [] } finally { loading.value = false }
  }

  onMounted(fetchData)
</script>

<style lang="scss" scoped>
  .page-container { min-height: 100vh; background: var(--bg-primary); }
  .page-body { padding: 12px; }
</style>
