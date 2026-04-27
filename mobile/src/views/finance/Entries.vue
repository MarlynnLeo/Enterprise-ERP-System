<!--
/**
 * Entries.vue
 * @description 会计凭证列表 - UniversalListPage 统一风格
 * @date 2026-04-17
 * @version 2.0.0
 */
-->
<template>
  <UniversalListPage :config="pageConfig" :api-function="loadEntries" @item-click="handleItemClick" />
</template>

<script setup>
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { financeApi } from '@/services/api'

  const router = useRouter()

  // 页面配置
  const pageConfig = computed(() => ({
    title: '会计凭证',
    searchPlaceholder: '搜索凭证号或摘要',

    // 筛选标签
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '草稿', value: 'draft' },
      { label: '待审核', value: 'pending' },
      { label: '已审核', value: 'approved' },
      { label: '已驳回', value: 'rejected' }
    ],

    // 字段映射
    fields: {
      id: 'id',
      title: 'entry_number',
      subtitle: 'summary',
      icon: 'credit-card',
      status: 'status',

      // 详情字段 — 精简为2列
      details: [
        { label: '金额', field: (item) => '¥' + Number(item.total_amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
        { label: '日期', field: 'entry_date', type: 'date' }
      ],

      // 标签
      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            draft: { text: '草稿', color: 'default' },
            pending: { text: '待审核', color: 'warning' },
            approved: { text: '已审核', color: 'success' },
            rejected: { text: '已驳回', color: 'danger' },
            posted: { text: '已过账', color: 'success' },
            voided: { text: '已作废', color: 'default' }
          }
        }
      ]
    },

    // 详情路由
    detailRoute: '/finance/gl/entries/:id',

    // 右上角按钮
    headerActions: [
      {
        icon: 'plus',
        label: '新建凭证',
        action: 'create'
      }
    ]
  }))

  // 加载凭证数据
  const loadEntries = async (params) => {
    // 处理状态筛选
    const apiParams = { ...params }
    if (!params.status || params.status === 'all') {
      delete apiParams.status
    }
    return await financeApi.getEntries(apiParams)
  }

  // 处理项目点击
  const handleItemClick = (entry) => {
    router.push(`/finance/gl/entries/${entry.id}`)
  }
</script>

<style lang="scss" scoped>
  // 使用 UniversalListPage 的样式，无需额外样式
</style>
