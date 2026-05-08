/**
 * permission.js
 * @description 自定义指令文件
  * @date 2025-08-27
 * @version 1.0.0
 */

import { useAuthStore } from '../stores/auth'
import { watch } from 'vue'

// 隐藏元素 - 优化版，避免影响 Element Plus 组件状态
function hideElement(el) {
  // 标记元素为权限不足
  el.setAttribute('data-permission-denied', 'true')
  
  // 使用 visibility 而不是 display，保持元素在 DOM 中的位置和状态
  // 这样可以避免影响 Element Plus el-menu 组件的内部状态管理
  el.style.visibility = 'hidden'
  el.style.position = 'absolute'
  el.style.pointerEvents = 'none'
  el.style.height = '0'
  el.style.overflow = 'hidden'
  el.style.margin = '0'
  el.style.padding = '0'
}

// 显示元素 - 优化版
function showElement(el) {
  if (el.getAttribute('data-permission-denied') === 'true' || el.getAttribute('data-permission-pending') === 'true') {
    // 恢复显示
    el.removeAttribute('data-permission-denied')
    el.removeAttribute('data-permission-pending')

    // 移除隐藏样式
    el.style.display = ''  // 移除 display 样式
    el.style.visibility = ''
    el.style.position = ''
    el.style.pointerEvents = ''
    el.style.height = ''
    el.style.overflow = ''
    el.style.margin = ''
    el.style.padding = ''
  }
}

/**
 * 统一的权限检查函数
 * 核心逻辑委托给 authStore.hasPermission()，确保全系统单一权限判断入口
 * 仅额外保留侧边栏父级菜单可见性的向上兼容判断
 */
function checkPermission(authStore, permission) {
  // 1. 核心权限判断统一委托给 authStore（支持 *通配符、精确匹配、前缀通配符）
  if (authStore.hasPermission(permission)) {
    return true
  }

  // 2. 侧边栏菜单特殊逻辑：如果检查的是父级菜单（如 'sales'），
  //    只要用户拥有该模块下的任何子权限，就允许看到该父级菜单入口
  return authStore.hasChildPermission(permission)
}

export const permission = {
  // 挂载时检查权限
  mounted(el, binding) {
    const authStore = useAuthStore()
    const permission = binding.value

    if (permission) {
      // 检查权限的函数
      const checkAndUpdate = () => {
        const hasPermission = checkPermission(authStore, permission)
        if (!hasPermission) {
          hideElement(el)
        } else {
          showElement(el)
        }
      }

      // ✅ 修复闪烁问题: 采用"先显示,后隐藏"策略
      // 如果权限还没加载，监听权限加载完成
      if (!authStore.permissionsLoaded) {
        // ⚠️ 不再先隐藏元素,而是先显示,等权限加载完成后再决定是否隐藏
        // 这样可以避免"一闪而过"的问题
        el.setAttribute('data-permission-pending', 'true')

        // 监听权限加载完成
        const stopWatch = watch(
          () => authStore.permissionsLoaded,
          (loaded) => {
            if (loaded) {
              // 权限加载完成后,检查权限并更新显示状态
              el.removeAttribute('data-permission-pending')
              checkAndUpdate()
              // 停止监听
              if (stopWatch) stopWatch()
            }
          },
          { immediate: true }
        )

        // 保存 stopWatch 以便在 unmounted 时清理
        el._permissionWatcher = stopWatch
      } else {
        // 权限已加载，直接检查
        checkAndUpdate()
      }
    }
  },
  
  // 组件更新时重新检查权限
  updated(el, binding) {
    const authStore = useAuthStore()
    const permission = binding.value
    
    if (permission) {
      // 如果权限已加载，检查权限并更新显示状态
      if (authStore.permissionsLoaded) {
        const hasPermission = checkPermission(authStore, permission)
        
        if (!hasPermission) {
          hideElement(el)
        } else {
          // 如果有权限，确保元素显示（特别是之前被隐藏的待加载权限的元素）
          showElement(el)
          el.removeAttribute('data-permission-pending')
        }
      }
    }
  },
  
  // 卸载时清理
  unmounted(el) {
    // 停止监听
    if (el._permissionWatcher) {
      el._permissionWatcher()
      delete el._permissionWatcher
    }
    
    // 清理可能存在的属性
    el.removeAttribute('data-permission-denied')
    el.removeAttribute('data-permission-pending')
  }
}

export default {
  install(app) {
    app.directive('permission', permission)
  }
} 
