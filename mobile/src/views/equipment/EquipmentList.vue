<!--
/**
 * EquipmentList.vue
 * @description 设备台账列表
 * @date 2026-04-18
 */
-->
<template>
  <UniversalListPage :config="pageConfig" :api-function="loadEquipment" @item-click="handleItemClick" />
</template>

<script setup>
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'

  const router = useRouter()

  const pageConfig = computed(() => ({
    title: '设备台账',
    searchPlaceholder: '搜索设备名称或编码',

    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '运行中', value: 'running' },
      { label: '停机', value: 'stopped' },
      { label: '维修中', value: 'repair' },
      { label: '报废', value: 'scrapped' }
    ],

    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'code',
      icon: 'desktop-o',
      status: 'status',

      details: [
        { label: '型号', field: 'model' },
        { label: '所在位置', field: 'location' }
      ],

      tags: [
        {
          field: 'status',
          type: 'status',
          map: {
            running: { text: '运行中', color: 'success' },
            stopped: { text: '停机', color: 'default' },
            repair: { text: '维修中', color: 'danger' },
            scrapped: { text: '报废', color: 'default' }
          }
        }
      ]
    },

    detailRoute: '/equipment/detail/:id',

    headerActions: [
      {
        icon: 'plus',
        label: '新增设备',
        action: 'create'
      }
    ]
  }))

  const loadEquipment = async (params) => {
    // 模拟前后端联调数据
    return {
      data: {
        list: [
          { id: 1, name: '一号数控车床', code: 'EQP-CNC-001', model: 'CNC-X1', location: '一号车间', status: 'running' },
          { id: 2, name: '二号数控车床', code: 'EQP-CNC-002', model: 'CNC-X2', location: '一号车间', status: 'repair' },
          { id: 3, name: '全自动点胶机', code: 'EQP-GLU-001', model: 'GL-1000', location: '二号车间', status: 'running' }
        ],
        total: 3
      }
    }
  }

  const handleItemClick = (item) => {
    // router.push(`/equipment/detail/${item.id}`)
  }
</script>
