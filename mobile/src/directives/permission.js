/**
 * permission.js
 * @description 移动端权限指令 — 与网页端逻辑一致
 * @date 2026-04-20
 * @version 1.0.0
 *
 * 用法：
 *   v-permission="'purchase:requisitions:create'"
 *   无权限时元素将被隐藏
 */

import { useAuthStore } from '../stores/auth'
import { watch } from 'vue'

/**
 * 隐藏元素
 */
function hideElement(el) {
  el.setAttribute('data-permission-denied', 'true')
  el.style.display = 'none'
}

/**
 * 显示元素
 */
function showElement(el) {
  if (el.getAttribute('data-permission-denied') === 'true' || el.getAttribute('data-permission-pending') === 'true') {
    el.removeAttribute('data-permission-denied')
    el.removeAttribute('data-permission-pending')
    el.style.display = ''
  }
}

/**
 * 统一权限检查 — 与桌面端对齐
 * 精确权限 + 模块父级（无冒号时 hasChildPermission）
 */
function checkPermission(authStore, permission) {
  if (Array.isArray(permission)) {
    return permission.some((p) => checkPermission(authStore, p))
  }
  if (authStore.hasPermission(permission)) {
    return true
  }
  // 与 PC / 路由守卫统一：中间码也可被子权限满足
  return authStore.hasChildPermission(permission)
}

export const permission = {
  // 挂载时检查权限
  mounted(el, binding) {
    const authStore = useAuthStore()
    const permValue = binding.value

    if (permValue) {
      const checkAndUpdate = () => {
        const hasPerm = checkPermission(authStore, permValue)
        if (!hasPerm) {
          hideElement(el)
        } else {
          showElement(el)
        }
      }

      // 如果权限还没加载完成，监听加载完成事件
      if (!authStore.permissionsLoaded) {
        el.setAttribute('data-permission-pending', 'true')
        hideElement(el)

        const stopWatch = watch(
          () => authStore.permissionsLoaded,
          (loaded) => {
            if (loaded) {
              el.removeAttribute('data-permission-pending')
              checkAndUpdate()
              if (stopWatch) stopWatch()
            }
          },
          { immediate: true }
        )

        el._permissionWatcher = stopWatch
      } else {
        // 权限已加载，直接检查
        checkAndUpdate()
      }
    }
  },

  // 更新时重新检查
  updated(el, binding) {
    const authStore = useAuthStore()
    const permValue = binding.value

    if (permValue && authStore.permissionsLoaded) {
      const hasPerm = checkPermission(authStore, permValue)
      if (!hasPerm) {
        hideElement(el)
      } else {
        showElement(el)
        el.removeAttribute('data-permission-pending')
      }
    }
  },

  // 卸载时清理
  unmounted(el) {
    if (el._permissionWatcher) {
      el._permissionWatcher()
      delete el._permissionWatcher
    }
    el.removeAttribute('data-permission-denied')
    el.removeAttribute('data-permission-pending')
  }
}

export default {
  install(app) {
    app.directive('permission', permission)
  }
}
