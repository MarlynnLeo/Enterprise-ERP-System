<!--
/**
 * Templates.vue - 检验模板列表
 * @description 质量检验模板管理页面
 * @date 2026-04-18
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadTemplates"
    :show-add="false"
    list-title="检验模板列表"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { qualityApi } from '@/services/api'

  const pageConfig = computed(() => ({
    title: '检验模板',
    searchPlaceholder: '搜索模板名称或编码',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: 'IQC', value: 'IQC' },
      { label: 'IPQC', value: 'IPQC' },
      { label: 'FQC', value: 'FQC' }
    ],
    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'code',
      icon: 'description',
      details: [
        { label: '模板编码', field: 'code' },
        { label: '检验类型', field: 'inspection_type' },
        { label: '检验项数', field: 'item_count', suffix: '项' },
        { label: '更新时间', field: 'updated_at', type: 'date' }
      ],
      tags: [
        {
          field: 'inspection_type',
          type: 'status',
          map: {
            IQC: { text: '来料检验', color: 'primary' },
            IPQC: { text: '过程检验', color: 'warning' },
            FQC: { text: '成品检验', color: 'success' }
          }
        },
        {
          field: 'status',
          type: 'status',
          map: {
            active: { text: '启用', color: 'success' },
            inactive: { text: '停用', color: 'default' }
          }
        }
      ]
    }
  }))

  const loadTemplates = async (params) => {
    const response = await qualityApi.getInspectionTemplates(params)
    return response
  }

  const handleItemClick = (item) => {
    // 模板详情 — 可在后续开发
  }
</script>
