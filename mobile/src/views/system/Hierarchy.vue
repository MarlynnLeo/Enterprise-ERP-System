<template>
  <div class="page-container">
    <NavBar title="组织架构" left-arrow @click-left="$router.go(-1)" />
    <div class="page-body">
      <Loading v-if="loading" size="24px" vertical style="padding:40px 0">加载中...</Loading>
      <template v-else>
        <div v-for="dept in departments" :key="dept.id" class="dept-card" :style="{ marginLeft: (dept.level || 0) * 16 + 'px' }">
          <div class="dept-header">
            <Icon name="manager-o" color="var(--color-primary)" />
            <span class="dept-name">{{ dept.name }}</span>
          </div>
          <div class="dept-meta" v-if="dept.manager_name || dept.member_count">
            <span v-if="dept.manager_name">负责人: {{ dept.manager_name }}</span>
            <span v-if="dept.member_count"> | {{ dept.member_count }}人</span>
          </div>
          <div class="dept-meta" v-if="dept.description">{{ dept.description }}</div>
        </div>
        <Empty v-if="departments.length === 0" description="暂无部门数据" />
      </template>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { NavBar, Loading, Empty, Icon } from 'vant'
  import { systemApi } from '@/services/api'
  import { extractApiData } from '@/utils/apiHelper'

  const loading = ref(true)
  const departments = ref([])

  const flattenTree = (list, level = 0) => {
    const result = []
    for (const item of list) {
      result.push({ ...item, level })
      if (item.children?.length) result.push(...flattenTree(item.children, level + 1))
    }
    return result
  }

  const fetchData = async () => {
    try {
      const res = await systemApi.getDepartments()
      const d = extractApiData(res)
      const arr = Array.isArray(d) ? d : (d.list || d.items || [])
      departments.value = flattenTree(arr)
    } catch { departments.value = [] } finally { loading.value = false }
  }

  onMounted(fetchData)
</script>

<style lang="scss" scoped>
  .page-container { min-height: 100vh; background: var(--bg-primary); }
  .page-body { padding: 12px; }
  .dept-card {
    background: var(--van-background);
    border: 1px solid var(--van-border-color);
    border-radius: 8px; padding: 10px 12px; margin-bottom: 6px;
  }
  .dept-header { display: flex; align-items: center; gap: 6px; }
  .dept-name { font-weight: 600; font-size: 0.9375rem; color: var(--text-primary); }
  .dept-meta { font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px; padding-left: 24px; }
</style>
