<template>
  <div class="page-container">
    <NavBar title="客户管理" left-arrow @click-left="$router.go(-1)" />
    <div class="page-body">
      <Search v-model="keyword" placeholder="搜索客户名称/编号" @search="fetchData" />
      <Loading v-if="loading" size="24px" vertical style="padding:40px 0">加载中...</Loading>
      <template v-else>
        <div v-for="cust in list" :key="cust.id" class="cust-card" @click="$router.push(`/baseData/customers/${cust.id}`)">
          <div class="cust-header">
            <span class="cust-name">{{ cust.name }}</span>
            <Tag v-if="cust.level" type="primary" size="medium">{{ cust.level }}</Tag>
          </div>
          <div class="cust-meta">{{ cust.code || cust.customer_code || '--' }}</div>
          <div class="cust-meta">
            <span v-if="cust.contact_person">联系人: {{ cust.contact_person }}</span>
            <span v-if="cust.phone"> | {{ cust.phone }}</span>
          </div>
          <div class="cust-meta" v-if="cust.address">{{ cust.address }}</div>
        </div>
        <Empty v-if="list.length === 0" description="暂无客户数据" />
      </template>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { NavBar, Search, Loading, Empty, Tag } from 'vant'
  import { salesApi } from '@/services/api'
  import { extractApiData } from '@/utils/apiHelper'

  const loading = ref(true)
  const keyword = ref('')
  const list = ref([])

  const fetchData = async () => {
    loading.value = true
    try {
      const res = await salesApi.getCustomers({ keyword: keyword.value, pageSize: 50 })
      const d = extractApiData(res)
      list.value = Array.isArray(d) ? d : (d.list || d.items || [])
    } catch { list.value = [] } finally { loading.value = false }
  }

  onMounted(fetchData)
</script>

<style lang="scss" scoped>
  .page-container { min-height: 100vh; background: var(--bg-primary); }
  .page-body { padding: 12px; }
  .cust-card {
    background: var(--van-background);
    border: 1px solid var(--van-border-color);
    border-radius: 10px; padding: 12px; margin-bottom: 8px;
  }
  .cust-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .cust-name { font-weight: 600; font-size: 0.9375rem; color: var(--text-primary); }
  .cust-meta { font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px; }
</style>
