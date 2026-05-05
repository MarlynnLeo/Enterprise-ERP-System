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
  import { equipmentApi } from '@/services/api'

  const router = useRouter()

  const pageConfig = computed(() => ({
    title: '设备台账',
    searchPlaceholder: '搜索设备名称或编码',

    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '正常', value: 'normal' },
      { label: '保养中', value: 'maintenance' },
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
            normal: { text: '正常', color: 'success' },
            maintenance: { text: '保养中', color: 'warning' },
            idle: { text: '闲置', color: 'default' },
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
    const apiParams = { ...params }
    if (apiParams.status === 'all') {
      delete apiParams.status
    }
    return await equipmentApi.getList(apiParams)
  }

  const handleItemClick = (item) => {
    router.push(`/equipment/detail/${item.id}`)
  }
</script>
