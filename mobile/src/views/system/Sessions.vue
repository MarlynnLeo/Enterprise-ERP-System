<template>
  <div class="page-container">
    <NavBar title="会话管理" left-arrow @click-left="$router.go(-1)" />
    <div class="page-body">
      <Loading v-if="loading" size="24px" vertical style="padding:40px 0">加载中...</Loading>
      <template v-else>
        <div class="stat-row">
          <div class="stat-item">
            <div class="stat-val" style="color:#67C23A">{{ activeCount }}</div>
            <div class="stat-lbl">在线用户</div>
          </div>
          <div class="stat-item">
            <div class="stat-val">{{ totalCount }}</div>
            <div class="stat-lbl">总用户数</div>
          </div>
        </div>
        <CellGroup inset title="用户列表">
          <Cell v-for="u in users" :key="u.id" :title="u.real_name || u.username" :label="u.department || '--'">
            <template #value>
              <Tag :type="u.status === 1 ? 'success' : 'default'" size="medium">{{ u.status === 1 ? '启用' : '停用' }}</Tag>
            </template>
          </Cell>
          <Cell v-if="users.length === 0" title="暂无用户" />
        </CellGroup>
      </template>
    </div>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { NavBar, CellGroup, Cell, Loading, Tag } from 'vant'
  import { systemApi } from '@/services/api'
  import { extractApiData } from '@/utils/apiHelper'

  const loading = ref(true)
  const users = ref([])
  const activeCount = computed(() => users.value.filter(u => u.status === 1).length)
  const totalCount = computed(() => users.value.length)

  const fetchData = async () => {
    try {
      const res = await systemApi.getUsers({ pageSize: 200 })
      const d = extractApiData(res)
      users.value = Array.isArray(d) ? d : (d.list || d.items || [])
    } catch { users.value = [] } finally { loading.value = false }
  }

  onMounted(fetchData)
</script>

<style lang="scss" scoped>
  .page-container { min-height: 100vh; background: var(--bg-primary); }
  .page-body { padding: 12px; }
  .stat-row { display: flex; gap: 8px; margin-bottom: 12px; }
  .stat-item {
    flex: 1; text-align: center; padding: 14px 0;
    background: var(--van-background); border: 1px solid var(--van-border-color); border-radius: 10px;
  }
  .stat-val { font-size: 1.5rem; font-weight: 700; }
  .stat-lbl { font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px; }
</style>
