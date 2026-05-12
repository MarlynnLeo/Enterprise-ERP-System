/**
 * 权限管理 Store
 * 使用 Pinia 进行集中状态管理
 * @date 2025-10-17
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const usePermissionStore = defineStore('permission', () => {
  // ==================== 状态定义 ====================

  // 角色相关
  const roleList = ref([])
  const roleLoading = ref(false)
  const roleSaveLoading = ref(false)

  // 菜单相关
  const menuList = ref([])
  const menuTree = ref([])
  const menuLoading = ref(false)
  const menuSaveLoading = ref(false)

  // 权限分配相关
  const currentRole = ref(null)
  const selectedMenuIds = ref([])
  const halfCheckedMenuIds = ref([])
  const permissionSaveLoading = ref(false)

  // 对话框状态
  const dialogs = ref({
    roleDialog: false,
    menuDialog: false,
    permissionDialog: false
  })

  // 树组件状态
  const treeRenderFlag = ref(false)
  const treeKey = ref(Date.now())

  // ==================== 计算属性 ====================

  const roleCount = computed(() => roleList.value.length)
  const menuCount = computed(() => menuList.value.length)
  const hasSelectedRole = computed(() => !!currentRole.value)
  const selectedMenuCount = computed(() => selectedMenuIds.value.length)
  const isLoading = computed(() =>
    roleLoading.value || menuLoading.value || permissionSaveLoading.value
  )

  // ==================== 角色管理方法 ====================

  const setRoleList = (roles) => {
    roleList.value = Array.isArray(roles) ? roles : []
  }

  const addRole = (role) => {
    roleList.value.push(role)
  }

  const updateRole = (id, roleData) => {
    const index = roleList.value.findIndex(r => r.id === id)
    if (index >= 0) {
      roleList.value[index] = { ...roleList.value[index], ...roleData }
    }
  }

  const removeRole = (id) => {
    roleList.value = roleList.value.filter(r => r.id !== id)
  }

  const setRoleLoading = (loading) => {
    roleLoading.value = loading
  }

  const setRoleSaveLoading = (loading) => {
    roleSaveLoading.value = loading
  }

  // ==================== 菜单管理方法 ====================

  const setMenuList = (menus) => {
    menuList.value = Array.isArray(menus) ? menus : []
  }

  const setMenuTree = (tree) => {
    menuTree.value = Array.isArray(tree) ? tree : []
  }

  const addMenu = (menu) => {
    menuList.value.push(menu)
  }

  const updateMenu = (id, menuData) => {
    const index = menuList.value.findIndex(m => m.id === id)
    if (index >= 0) {
      menuList.value[index] = { ...menuList.value[index], ...menuData }
    }
  }

  const removeMenu = (id) => {
    menuList.value = menuList.value.filter(m => m.id !== id)
  }

  const setMenuLoading = (loading) => {
    menuLoading.value = loading
  }

  const setMenuSaveLoading = (loading) => {
    menuSaveLoading.value = loading
  }

  // ==================== 权限分配方法 ====================

  const selectRole = (role) => {
    currentRole.value = role
  }

  const setSelectedMenuIds = (ids) => {
    selectedMenuIds.value = Array.isArray(ids)
      ? ids.map(id => Number(id)).filter(id => !isNaN(id) && id > 0)
      : []
  }

  const setHalfCheckedMenuIds = (ids) => {
    halfCheckedMenuIds.value = Array.isArray(ids)
      ? ids.map(id => Number(id)).filter(id => !isNaN(id) && id > 0)
      : []
  }

  const setPermissionSaveLoading = (loading) => {
    permissionSaveLoading.value = loading
  }

  const setPermissionData = (data) => {
    if (data && typeof data === 'object') {
      selectedMenuIds.value = Array.isArray(data.selectedMenuIds) ? data.selectedMenuIds : []
      halfCheckedMenuIds.value = Array.isArray(data.halfCheckedMenuIds) ? data.halfCheckedMenuIds : []
    }
  }

  // ==================== 对话框方法 ====================

  const openDialog = (dialogName) => {
    if (dialogName in dialogs.value) {
      dialogs.value[dialogName] = true
    }
  }

  const closeDialog = (dialogName) => {
    if (dialogName in dialogs.value) {
      dialogs.value[dialogName] = false
    }
  }

  const closeAllDialogs = () => {
    Object.keys(dialogs.value).forEach(key => {
      dialogs.value[key] = false
    })
  }

  // ==================== 树组件方法 ====================

  const setTreeRenderFlag = (flag) => {
    treeRenderFlag.value = flag
  }

  const refreshTreeKey = () => {
    treeKey.value = Date.now()
  }

  // ==================== 重置方法 ====================

  const resetPermissionState = () => {
    currentRole.value = null
    selectedMenuIds.value = []
    halfCheckedMenuIds.value = []
    refreshTreeKey()
  }

  const resetAllState = () => {
    roleList.value = []
    menuList.value = []
    menuTree.value = []
    currentRole.value = null
    selectedMenuIds.value = []
    halfCheckedMenuIds.value = []
    closeAllDialogs()
    treeRenderFlag.value = false
  }

  // ==================== 返回 ====================

  return {
    // 状态
    roleList,
    roleLoading,
    roleSaveLoading,
    menuList,
    menuTree,
    menuLoading,
    menuSaveLoading,
    currentRole,
    selectedMenuIds,
    halfCheckedMenuIds,
    permissionSaveLoading,
    dialogs,
    treeRenderFlag,
    treeKey,

    // 计算属性
    roleCount,
    menuCount,
    hasSelectedRole,
    selectedMenuCount,
    isLoading,

    // 角色方法
    setRoleList,
    addRole,
    updateRole,
    removeRole,
    setRoleLoading,
    setRoleSaveLoading,

    // 菜单方法
    setMenuList,
    setMenuTree,
    addMenu,
    updateMenu,
    removeMenu,
    setMenuLoading,
    setMenuSaveLoading,

    // 权限方法
    selectRole,
    setSelectedMenuIds,
    setHalfCheckedMenuIds,
    setPermissionSaveLoading,
    setPermissionData,

    // 对话框方法
    openDialog,
    closeDialog,
    closeAllDialogs,

    // 树组件方法
    setTreeRenderFlag,
    refreshTreeKey,

    // 重置方法
    resetPermissionState,
    resetAllState
  }
})
