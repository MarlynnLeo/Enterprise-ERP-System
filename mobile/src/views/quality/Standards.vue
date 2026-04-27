<template>
  <div class="page-container">
    <NavBar title="AQL 抽样标准" left-arrow @click-left="$router.go(-1)" />
    <div class="page-body">
      <Search v-model="keyword" placeholder="搜索标准号/名称" @search="fetchData" />
      <Loading v-if="loading" size="24px" vertical style="padding:40px 0">加载中...</Loading>
      <template v-else>
        <div v-for="item in list" :key="item.id" class="std-card">
          <div class="std-header">
            <span class="std-code">{{ item.code }}</span>
            <Tag :type="item.status === 'active' ? 'success' : 'default'" size="medium">{{ item.status === 'active' ? '生效中' : '已停用' }}</Tag>
          </div>
          <div class="std-name">{{ item.name }}</div>
          <div class="std-row">
            <span>AQL级别: <b>{{ item.aql_level }}</b></span>
            <span>批量: {{ item.batch_min }}~{{ item.batch_max }}</span>
          </div>
          <div class="std-row">
            <span>抽样数(n): <b>{{ item.sample_size }}</b></span>
            <span class="ac">Ac: {{ item.accept_limit }}</span>
            <span class="re">Re: {{ item.reject_limit }}</span>
          </div>
        </div>
        <Empty v-if="list.length === 0" description="暂无标准数据" />
      </template>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { NavBar, Search, Loading, Empty, Tag } from 'vant'
  import { qualityApi } from '@/services/api'
  import { extractApiData } from '@/utils/apiHelper'

  const loading = ref(true)
  const keyword = ref('')
  const list = ref([])

  const fetchData = async () => {
    loading.value = true
    try {
      const res = await qualityApi.getAqlStandards({ keyword: keyword.value })
      const d = extractApiData(res)
      list.value = Array.isArray(d) ? d : (d.list || d.items || [])
    } catch { list.value = [] } finally { loading.value = false }
  }

  onMounted(fetchData)
</script>

<style lang="scss" scoped>
  .page-container { min-height: 100vh; background: var(--bg-primary); }
  .page-body { padding: 12px; }

  .std-card {
    background: var(--van-background);
    border: 1px solid var(--van-border-color);
    border-radius: 10px; padding: 12px; margin-bottom: 8px;
  }
  .std-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .std-code { font-weight: 600; color: var(--color-primary); font-size: 0.9375rem; }
  .std-name { font-size: 0.8125rem; color: var(--text-primary); margin-bottom: 6px; }
  .std-row {
    display: flex; gap: 12px; font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;
    b { color: var(--text-primary); }
  }
  .ac { color: #67C23A; font-weight: 600; }
  .re { color: #F56C6C; font-weight: 600; }
</style>
