<template>
  <div class="page-container">
    <NavBar title="访问控制" left-arrow @click-left="$router.go(-1)" />
    <div class="page-body">
      <Loading v-if="loading" size="24px" vertical style="padding:40px 0">加载中...</Loading>
      <template v-else>
        <CellGroup inset title="角色列表">
          <Cell v-for="role in roles" :key="role.id" :title="role.name" :value="role.code || ''" :label="role.description || '--'" />
          <Cell v-if="roles.length === 0" title="暂无角色" />
        </CellGroup>
        <CellGroup inset title="权限模块">
          <Cell v-for="perm in permissions" :key="perm.id" :title="perm.name" :value="perm.code || ''" :label="perm.description || perm.module || '--'" />
          <Cell v-if="permissions.length === 0" title="暂无权限数据" />
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
  const roles = ref([])
  const permissions = ref([])

  const fetchData = async () => {
    try {
      const [rRes, pRes] = await Promise.allSettled([
        systemApi.getRoles(),
        systemApi.getPermissions()
      ])
      if (rRes.status === 'fulfilled') { const d = extractApiData(rRes.value); roles.value = Array.isArray(d) ? d : (d.list || d.items || []) }
      if (pRes.status === 'fulfilled') { const d = extractApiData(pRes.value); permissions.value = Array.isArray(d) ? d : (d.list || d.items || []) }
    } catch { /* 静默 */ } finally { loading.value = false }
  }

  onMounted(fetchData)
</script>

<style lang="scss" scoped>
  .page-container { min-height: 100vh; background: var(--bg-primary); }
  .page-body { padding: 12px; }
</style>
