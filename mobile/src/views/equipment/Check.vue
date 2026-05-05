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
  import { equipmentApi } from '@/services/api'

  const pageConfig = computed(() => ({
    title: '日常点检',
    searchPlaceholder: '搜索设备名或点检人',

    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '正常', value: 'normal' },
      { label: '异常', value: 'abnormal' },
      { label: '合格', value: 'passed' },
      { label: '不合格', value: 'failed' }
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
            normal: { text: '正常', color: 'success' },
            abnormal: { text: '异常', color: 'danger' },
            passed: { text: '合格', color: 'success' },
            failed: { text: '不合格', color: 'danger' }
          }
        }
      ]
    },

    headerActions: [
      { icon: 'plus', label: '扫码点检', action: 'create' }
    ]
  }))

  const loadChecks = async (params) => {
    return await equipmentApi.getInspectionRecords(params)
  }
</script>
