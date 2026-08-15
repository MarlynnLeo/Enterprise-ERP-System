import { useAuthStore } from '@/stores/auth'

/**
 * 与 v-permission / 路由守卫同一套判定：精确码或子权限前缀。
 */
export function canAccessPermission(authStore, permission) {
  if (!permission) return true
  if (Array.isArray(permission)) {
    return permission.some((item) => canAccessPermission(authStore, item))
  }
  return authStore.hasPermission(permission) || authStore.hasChildPermission(permission)
}

export function usePermission() {
  const authStore = useAuthStore()
  const canAccess = (permission) => canAccessPermission(authStore, permission)
  return { authStore, canAccess }
}
