<!--
/**
 * Check.vue
 * @description 设备日常点检
 */
-->
<template>
  <UniversalListPage :config="pageConfig" :api-function="loadChecks" />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { equipmentApi } from '@/api'

  const pageConfig = computed(() => ({
    title: '日常点检',
    searchPlaceholder: '搜索设备名或点检人',

    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '合格', value: 'pass' },
      { label: '有条件合格', value: 'conditional_pass' },
      { label: '不合格', value: 'fail' }
    ],

    fields: {
      id: 'id',
      title: 'equipmentName',
      subtitle: 'checkDate',
      icon: 'passed',
      status: 'status',

      details: [
        { label: '点检人', field: 'checker' },
        { label: '点检结果', field: 'resultDesc' }
      ],

      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            pass: { text: '合格', color: 'success' },
            conditional_pass: { text: '有条件合格', color: 'warning' },
            fail: { text: '不合格', color: 'danger' }
          }
        }
      ]
    },

    headerActions: [
      {
        icon: 'plus',
        label: '扫码点检',
        action: 'create',
        path: '/equipment/check/create',
        permission: 'production:equipment:update'
      }
    ]
  }))

  const loadChecks = async (params) => {
    return await equipmentApi.getInspectionRecords(params)
  }
</script>
