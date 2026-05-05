<!--
/**
 * Logs.vue - 系统日志列表
 * @description 系统操作日志查看页面
 * @date 2026-04-18
 * @version 1.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadLogs"
    :show-add="false"
    list-title="日志列表"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { systemApi } from '@/services/api'

  const pageConfig = computed(() => ({
    title: '系统日志',
    searchPlaceholder: '搜索操作内容或用户',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '登录', value: 'login' },
      { label: '操作', value: 'operation' },
      { label: '异常', value: 'error' }
    ],
    fields: {
      id: 'id',
      title: 'action',
      subtitle: 'username',
      icon: 'notes-o',
      details: [
        { label: '操作用户', field: 'username' },
        { label: 'IP地址', field: 'ip_address' },
        { label: '操作时间', field: 'created_at', type: 'datetime' },
        { label: '操作模块', field: 'module' }
      ],
      tags: [
        {
          field: 'type',
          type: 'status',
          map: {
            login: { text: '登录', color: 'primary' },
            logout: { text: '登出', color: 'default' },
            create: { text: '新增', color: 'success' },
            update: { text: '修改', color: 'warning' },
            delete: { text: '删除', color: 'danger' },
            error: { text: '异常', color: 'danger' }
          }
        }
      ]
    }
  }))

  const loadLogs = async (params) => {
    const response = await systemApi.getLogs(params)
    return response
  }

  const handleItemClick = () => {
    // 日志详情
  }
</script>
