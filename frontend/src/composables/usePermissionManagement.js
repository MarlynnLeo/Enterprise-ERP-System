/**
 * 权限管理组合式函数
 * 拆分权限管理页面的复杂逻辑
 */

import { ref, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import { systemApi } from '@/services/api';
import { PermissionStorage } from '@/utils/unifiedStorage';
import { parseApiResponse } from '@/utils/responseParser';
import {
  PERMISSION_DELAYS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
} from '@/constants/permissions';

/**
 * 权限数据管理
 */
export function usePermissionData() {
  // 响应式数据
  const selectedMenuIds = ref([]);
  const halfCheckedMenuIds = ref([]);
  const currentRole = ref(null);
  const menuTreeData = ref([]);
  const loading = ref(false);

  /**
   * 从后端获取角色权限
   */
  const fetchRolePermissions = async (roleId) => {
    try {
      const response = await systemApi.getRolePermissions(roleId);
      
      if (!response || !response.data) {
        throw new Error('服务器响应无效');
      }

      // 拦截器已解包，response.data 就是业务数据
      const permissionData = response.data;

      // 处理权限数据
      if (Array.isArray(permissionData)) {
        selectedMenuIds.value = permissionData
          .map(id => Number(id))
          .filter(id => !isNaN(id));
        halfCheckedMenuIds.value = [];
      } else if (permissionData && typeof permissionData === 'object') {
        selectedMenuIds.value = (permissionData.checkedKeys || [])
          .map(id => Number(id))
          .filter(id => !isNaN(id));
        halfCheckedMenuIds.value = (permissionData.halfCheckedKeys || [])
          .map(id => Number(id))
          .filter(id => !isNaN(id));
      } else {
        selectedMenuIds.value = [];
        halfCheckedMenuIds.value = [];
      }

      return selectedMenuIds.value;
    } catch (error) {
      console.error('获取角色权限失败:', error);
      ElMessage.error(ERROR_MESSAGES.PERMISSION_LOAD_FAILED + ': ' + error.message);
      selectedMenuIds.value = [];
      halfCheckedMenuIds.value = [];
      throw error;
    }
  };

  /**
   * 保存角色权限
   */
  const saveRolePermissions = async (roleId, menuIds) => {
    try {
      const response = await systemApi.updateRolePermissions(roleId, {
        menuIds: menuIds
      });
      const result = parseApiResponse(response);

      if (result.success) {
        ElMessage.success(SUCCESS_MESSAGES.PERMISSION_SAVED);

        // 清除相关缓存
        PermissionStorage.removeRolePermissions(roleId);
        PermissionStorage.clearUserPermissions();

        return true;
      } else {
        throw new Error(result.error || '保存失败');
      }
    } catch (error) {
      console.error('保存角色权限失败:', error);
      ElMessage.error(ERROR_MESSAGES.PERMISSION_SAVE_FAILED + ': ' + error.message);
      throw error;
    }
  };

  /**
   * 获取菜单树数据
   */
  const fetchMenuTree = async () => {
    try {
      // 尝试从缓存获取
      const cachedMenus = PermissionStorage.getCachedMenus();
      if (cachedMenus) {
        menuTreeData.value = cachedMenus;
        return cachedMenus;
      }

      // 从后端获取
      const response = await systemApi.getMenus();
      const result = parseApiResponse(response);

      if (result.success && result.data) {
        menuTreeData.value = result.data;
        PermissionStorage.setCachedMenus(result.data);
        return result.data;
      } else {
        throw new Error(result.error || '菜单数据格式无效');
      }
    } catch (error) {
      console.error('获取菜单树失败:', error);
      ElMessage.error(ERROR_MESSAGES.MENU_LOAD_FAILED + ': ' + error.message);
      throw error;
    }
  };

  /**
   * 清理权限数据
   */
  const clearPermissionData = () => {
    selectedMenuIds.value = [];
    halfCheckedMenuIds.value = [];
    currentRole.value = null;
  };

  return {
    // 响应式数据
    selectedMenuIds,
    halfCheckedMenuIds,
    currentRole,
    menuTreeData,
    loading,
    
    // 方法
    fetchRolePermissions,
    saveRolePermissions,
    fetchMenuTree,
    clearPermissionData
  };
}

/**
 * 权限树管理
 */
export function usePermissionTree() {
  const permissionTreeRef = ref(null);
  const treeKey = ref(Date.now());
  const treeRenderFlag = ref(false);

  /**
   * 确保ID为数字类型
   */
  const ensureNumericIds = (ids) => {
    if (!Array.isArray(ids)) return [];
    return ids.map(id => Number(id)).filter(id => !isNaN(id) && id > 0);
  };

  /**
   * 展开所有节点
   */
  const expandAll = () => {
    if (!permissionTreeRef.value) return;
    
    try {
      permissionTreeRef.value.setExpandedKeys(
        permissionTreeRef.value.store.nodesMap ? 
        Object.keys(permissionTreeRef.value.store.nodesMap) : []
      );
    } catch {
      // 静默处理错误
    }
  };

  /**
   * 应用权限选中状态
   */
  const applyPermissionState = (selectedIds) => {
    if (!permissionTreeRef.value || !Array.isArray(selectedIds)) {
      return;
    }

    try {
      const numericIds = ensureNumericIds(selectedIds);

      // 设置选中状态
      permissionTreeRef.value.setCheckedKeys(numericIds);

      // 验证设置结果
      setTimeout(() => {
        const currentChecked = permissionTreeRef.value.getCheckedKeys();

        if (currentChecked.length !== numericIds.length) {
          permissionTreeRef.value.setCheckedKeys(numericIds);
        }
      }, PERMISSION_DELAYS.DOM_UPDATE_DELAY);

    } catch (error) {
      console.error('应用权限状态失败:', error);
    }
  };

  /**
   * 获取当前选中的权限
   */
  const getSelectedPermissions = () => {
    if (!permissionTreeRef.value) {
      return { checkedKeys: [], halfCheckedKeys: [] };
    }

    try {
      const checkedKeys = permissionTreeRef.value.getCheckedKeys() || [];
      const halfCheckedKeys = permissionTreeRef.value.getHalfCheckedKeys() || [];
      
      return {
        checkedKeys: ensureNumericIds(checkedKeys),
        halfCheckedKeys: ensureNumericIds(halfCheckedKeys)
      };
    } catch (error) {
      console.error('获取选中权限失败:', error);
      return { checkedKeys: [], halfCheckedKeys: [] };
    }
  };

  /**
   * 重置树组件
   */
  const resetTree = () => {
    treeRenderFlag.value = false;
    treeKey.value = Date.now();
    
    nextTick(() => {
      treeRenderFlag.value = true;
    });
  };

  /**
   * 初始化树组件
   */
  const initializeTree = async (selectedIds = []) => {
    resetTree();
    
    await nextTick();
    
    // 等待树组件渲染
    setTimeout(() => {
      expandAll();
      
      // 延迟应用权限状态
      setTimeout(() => {
        applyPermissionState(selectedIds);
      }, PERMISSION_DELAYS.PERMISSION_APPLY_DELAY);
    }, PERMISSION_DELAYS.TREE_RENDER_DELAY);
  };

  return {
    // 响应式数据
    permissionTreeRef,
    treeKey,
    treeRenderFlag,
    
    // 方法
    ensureNumericIds,
    expandAll,
    applyPermissionState,
    getSelectedPermissions,
    resetTree,
    initializeTree
  };
}

/**
 * 权限对话框管理
 */
export function usePermissionDialog() {
  const permissionDialogVisible = ref(false);
  const dialogLoading = ref(false);

  /**
   * 打开权限对话框
   */
  const openPermissionDialog = async (role, onOpened) => {
    if (!role) {
      ElMessage.warning('请先选择角色');
      return;
    }

    permissionDialogVisible.value = true;
    dialogLoading.value = true;

    try {
      if (typeof onOpened === 'function') {
        await onOpened(role);
      }
    } catch (error) {
      console.error('打开权限对话框失败:', error);
      ElMessage.error(ERROR_MESSAGES.OPERATION_FAILED);
    } finally {
      dialogLoading.value = false;
    }
  };

  /**
   * 关闭权限对话框
   */
  const closePermissionDialog = () => {
    permissionDialogVisible.value = false;
    dialogLoading.value = false;
  };

  return {
    // 响应式数据
    permissionDialogVisible,
    dialogLoading,
    
    // 方法
    openPermissionDialog,
    closePermissionDialog
  };
}
