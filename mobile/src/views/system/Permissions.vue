<!--
/**
 * Permissions.vue - 权限管理列表
 * @description 权限管理页面
 * @date 2026-04-18
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadPermissions"
    :show-add="false"
    list-title="权限列表"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { systemApi } from '@/services/api'

  const pageConfig = computed(() => ({
    title: '权限管理',
    searchPlaceholder: '搜索权限名称或编码',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '菜单', value: 'menu' },
      { label: '按钮', value: 'button' },
      { label: 'API', value: 'api' }
    ],
    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'code',
      icon: 'lock',
      details: [
        { label: '权限编码', field: 'code' },
        { label: '类型', field: 'type' },
        { label: '归属模块', field: 'module' }
      ],
      tags: [
        {
          field: 'type',
          type: 'status',
          map: {
            menu: { text: '菜单', color: 'primary' },
            button: { text: '按钮', color: 'success' },
            api: { text: 'API', color: 'warning' }
          }
        }
      ]
    }
  }))

  const loadPermissions = async (params) => {
    const response = await systemApi.getPermissions(params)
    return response
  }

  const handleItemClick = (item) => {
    // 权限详情
  }
</script>
