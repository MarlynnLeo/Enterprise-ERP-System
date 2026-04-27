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

  const pageConfig = computed(() => ({
    title: '日常点检',
    searchPlaceholder: '搜索设备名或点检人',

    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '正常', value: 'normal' },
      { label: '异常', value: 'abnormal' }
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
            abnormal: { text: '异常', color: 'danger' }
          }
        }
      ]
    },

    headerActions: [
      { icon: 'plus', label: '扫码点检', action: 'create' }
    ]
  }))

  const loadChecks = async (params) => {
    return {
      data: {
        list: [
          { id: 1, equipmentName: '一号数控车床', checkDate: '2026-04-18', checker: '张三', resultDesc: '温度偏高，需注意', status: 'abnormal' },
          { id: 2, equipmentName: '二号数控车床', checkDate: '2026-04-18', checker: '李四', resultDesc: '参数正常', status: 'normal' }
        ],
        total: 2
      }
    }
  }
</script>
