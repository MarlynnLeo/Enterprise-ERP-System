<template>
  <div class="page-container">
    <NavBar title="岗位管理" left-arrow @click-left="$router.go(-1)" />
    <div class="page-body">
      <Loading v-if="loading" size="24px" vertical style="padding:40px 0">加载中...</Loading>
      <template v-else>
        <CellGroup inset title="岗位列表">
          <Cell v-for="(pos, i) in positions" :key="i" :title="pos.name" :value="`${pos.count}人`" :label="pos.department || ''" />
          <Cell v-if="positions.length === 0" title="暂无岗位数据" />
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
  const positions = ref([])

  const fetchData = async () => {
    try {
      const res = await systemApi.getUsers({ pageSize: 200 })
      const d = extractApiData(res)
      const users = Array.isArray(d) ? d : (d.list || d.items || [])
      // 按岗位聚合
      const posMap = {}
      users.forEach(u => {
        const pos = u.position || u.role_name || '未设置'
        if (!posMap[pos]) posMap[pos] = { name: pos, count: 0, department: u.department || '' }
        posMap[pos].count++
      })
      positions.value = Object.values(posMap).sort((a, b) => b.count - a.count)
    } catch { positions.value = [] } finally { loading.value = false }
  }

  onMounted(fetchData)
</script>

<style lang="scss" scoped>
  .page-container { min-height: 100vh; background: var(--bg-primary); }
  .page-body { padding: 12px; }
</style>
