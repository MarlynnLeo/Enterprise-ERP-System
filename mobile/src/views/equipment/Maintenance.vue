<!--
/**
 * Maintenance.vue
 * @description 设备保养管理
 */
-->
<template>
  <UniversalListPage :config="pageConfig" :api-function="loadMaintenance" />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'

  const pageConfig = computed(() => ({
    title: '保养计划',
    searchPlaceholder: '搜索保养工单或设备名称',
    
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待执行', value: 'pending' },
      { label: '执行中', value: 'processing' },
      { label: '已完成', value: 'completed' }
    ],

    fields: {
      id: 'id',
      title: 'equipmentName',
      subtitle: 'planNo',
      icon: 'setting-o',
      status: 'status',

      details: [
        { label: '计划时间', field: 'planDate', type: 'date' },
        { label: '维保等级', field: 'level' }
      ],

      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            pending: { text: '待执行', color: 'default' },
            processing: { text: '执行中', color: 'warning' },
            completed: { text: '已完成', color: 'success' }
          }
        }
      ]
    },

    headerActions: [
      { icon: 'plus', label: '制定计划', action: 'create' }
    ]
  }))

  const loadMaintenance = async (params) => {
    return {
      data: {
        list: [
          { id: 1, equipmentName: '全自动点胶机', planNo: 'MT-260418001', planDate: '2026-04-20', level: '月度保养', status: 'pending' },
          { id: 2, equipmentName: '三号冲床', planNo: 'MT-260411002', planDate: '2026-04-10', level: '季度保养', status: 'completed' }
        ],
        total: 2
      }
    }
  }
</script>
