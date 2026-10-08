<template>
  <UniversalListPage :config="config" :api-function="loadList" @item-click="item => router.push(`/quality/rework/${item.id}`)" />
</template>
<script setup>
import { useRoute, useRouter } from 'vue-router'
import UniversalListPage from '@/components/common/UniversalListPage.vue'
import { qualityApi } from '@/api'
const route = useRoute()
const router = useRouter()
const statuses = { pending: { text: '待分配', color: 'warning' }, in_progress: { text: '返工中', color: 'primary' }, completed: { text: '已完成', color: 'success' }, cancelled: { text: '已取消', color: 'default' } }
const config = {
  title: '返工任务', searchPlaceholder: '搜索返工单号',
  filterTabs: [{ label: '全部', value: 'all' }, ...Object.entries(statuses).map(([value,item]) => ({ value, label: item.text }))],
  fields: { id: 'id', title: 'reworkNo', subtitle: 'materialName', icon: 'replay', status: 'status',
    details: [{ label: '不合格品单', field: 'ncpNo' }, { label: '数量', field: 'quantity' }, { label: '负责人', field: 'assignedTo' }],
    tags: [{ field: 'status', type: 'status', map: statuses }] },
  detailRoute: '/quality/rework/:id'
}
const loadList = params => qualityApi.getReworkTasks({ ...params, keyword: undefined, reworkNo: params.keyword || params.search || undefined, status: params.status === 'all' ? undefined : params.status, ncpId: route.query.ncpId || undefined })
</script>
