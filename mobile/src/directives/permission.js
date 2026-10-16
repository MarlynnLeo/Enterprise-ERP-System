/**
 * permission.js
 * @description 自定义指令文件
  * @date 2025-08-27
 * @version 1.0.0
 */

import { useAuthStore } from '../stores/auth'
import { shallowRef, watchEffect } from 'vue'
import { isActionPermission } from '../utils/permissionActions'

const hiddenStates = new WeakMap()

// Hide denied controls without changing their business disabled state.
function hideElement(el) {
  if (!hiddenStates.has(el)) {
    hiddenStates.set(el, {
      display: el.style.getPropertyValue('display'),
      displayPriority: el.style.getPropertyPriority('display'),
      ariaHidden: el.getAttribute('aria-hidden')
    })
  }
  el.setAttribute('data-permission-denied', 'true')
  el.setAttribute('aria-hidden', 'true')
  el.style.setProperty('display', 'none', 'important')
}

// 显示元素 - 优化版
function showElement(el) {
  const previous = hiddenStates.get(el)
  el.removeAttribute('data-permission-denied')
  el.removeAttribute('data-permission-pending')
  if (previous) {
    if (previous.ariaHidden === null) el.removeAttribute('aria-hidden')
    else el.setAttribute('aria-hidden', previous.ariaHidden)
    el.style.setProperty('display', previous.display, previous.displayPriority)
    hiddenStates.delete(el)
  }
}

/**
 * 统一的权限检查函数
 * 核心逻辑委托给 authStore.hasPermission()，确保全系统单一权限判断入口
 * 仅额外保留侧边栏父级菜单可见性的向上兼容判断
 */
function checkPermission(authStore, permission) {
  if (Array.isArray(permission)) {
    return permission.some((p) => checkPermission(authStore, p))
  }

  if (authStore.hasPermission(permission)) {
    return true
  }

  // 操作按钮必须精确命中 create/update/delete…，不能用父级 production 顶上
  if (isActionPermission(permission)) {
    return false
  }

  return authStore.hasChildPermission(permission)
}

export const permission = {
  // 挂载时检查权限
  mounted(el, binding) {
    const authStore = useAuthStore()
    const requiredPermission = shallowRef(binding.value)
    el._requiredPermission = requiredPermission
    el._permissionWatcher = watchEffect(() => {
      // The store indexes permission strings in a Set, so explicitly track
      // replacement of the server list as well as its loaded flag.
      void authStore.permissions
      if (!requiredPermission.value) {
        showElement(el)
      } else if (!authStore.permissionsLoaded) {
        el.setAttribute('data-permission-pending', 'true')
        hideElement(el)
      } else if (checkPermission(authStore, requiredPermission.value)) {
        showElement(el)
      } else {
        el.removeAttribute('data-permission-pending')
        hideElement(el)
      }
    })
  },

  // 组件更新时重新检查权限
  updated(el, binding) {
    if (el._requiredPermission) el._requiredPermission.value = binding.value
    // A vnode style patch may restore display while the permission is denied.
    if (el.getAttribute('data-permission-denied') === 'true') {
      el.style.setProperty('display', 'none', 'important')
    }
  },

  // 卸载时清理
  unmounted(el) {
    // 停止监听
    if (el._permissionWatcher) {
      el._permissionWatcher()
      delete el._permissionWatcher
    }
    delete el._requiredPermission
    hiddenStates.delete(el)

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
