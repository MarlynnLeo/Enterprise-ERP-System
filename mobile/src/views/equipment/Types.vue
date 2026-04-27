<!--
/**
 * Types.vue
 * @description 设备类别管理
 */
-->
<template>
  <UniversalListPage :config="pageConfig" :api-function="loadTypes" />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'

  const pageConfig = computed(() => ({
    title: '设备类别',
    searchPlaceholder: '搜索类别名称',

    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'code',
      icon: 'cluster-o',
      
      details: [
        { label: '描述', field: 'description' }
      ]
    },

    headerActions: [
      { icon: 'plus', label: '新增类别', action: 'create' }
    ]
  }))

  const loadTypes = async (params) => {
    return {
      data: {
        list: [
          { id: 1, name: '生产设备', code: 'T-PRD', description: '一线车间生产用设备' },
          { id: 2, name: '测试设备', code: 'T-TST', description: '质检实验室设备' },
          { id: 3, name: '辅助设备', code: 'T-AUX', description: '叉车、空压机等外围设备' }
        ],
        total: 3
      }
    }
  }
</script>
