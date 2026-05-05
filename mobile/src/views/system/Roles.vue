<!--
/**
 * Roles.vue - 角色管理列表
 * @description 角色管理页面
 * @date 2026-04-18
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadRoles"
    :show-add="false"
    list-title="角色列表"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { systemApi } from '@/services/api'

  const pageConfig = computed(() => ({
    title: '角色管理',
    searchPlaceholder: '搜索角色名称',
    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'code',
      icon: 'shield-o',
      details: [
        { label: '角色编码', field: 'code' },
        { label: '用户数', field: 'user_count', suffix: '人' },
        { label: '说明', field: 'description' }
      ],
      tags: [
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

  const loadRoles = async (params) => {
    const response = await systemApi.getRoles(params)
    return response
  }

  const handleItemClick = () => {
    // 角色详情
  }
</script>
