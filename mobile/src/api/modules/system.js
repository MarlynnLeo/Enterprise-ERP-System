/**
 * 系统管理 API 模块
 */
import api from '../client'

export const systemApi = {
  getDepartments(params) {
    return api.get('/system/departments', { params })
  },
  getDepartment(id) {
    return api.get(`/system/departments/${id}`)
  },
  createDepartment(data) {
    return api.post('/system/departments', data)
  },
  updateDepartment(id, data) {
    return api.put(`/system/departments/${id}`, data)
  },
  getRoles(params) {
    return api.get('/system/roles', { params })
  },
  getPermissions(params) {
    const query = { ...params, name: params?.name || params?.search || undefined }
    delete query.search
    delete query.status

    return api.get('/system/menus', { params: query }).then((response) => {
      const flattenMenus = (items = [], result = []) => {
        items.forEach((item) => {
          result.push(item)
          if (Array.isArray(item.children) && item.children.length) {
            flattenMenus(item.children, result)
          }
        })
        return result
      }

      const menus = flattenMenus(Array.isArray(response.data) ? response.data : [])
      let permissions = menus
        .filter((item) => item.permission)
        .map((item) => {
          const code = item.permission
          const typeMap = { 1: 'menu', 2: 'menu', 3: 'button' }
          return {
            id: item.id,
            name: item.name || code,
            code,
            type: typeMap[item.type] || 'menu',
            module: code.split(':')[0] || '-',
            description: item.path || item.component || ''
          }
        })

      const keyword = (params?.search || '').trim().toLowerCase()
      if (keyword) {
        permissions = permissions.filter((item) =>
          [item.name, item.code, item.module].some((value) =>
            String(value || '').toLowerCase().includes(keyword)
          )
        )
      }

      if (params?.status && params.status !== 'all') {
        permissions = permissions.filter((item) => item.type === params.status)
      }

      return { ...response, data: permissions }
    })
  },
  getLogs(params) {
    return api.get('/system/logs', { params })
  },
  getConfig(params) {
    return api.get('/system/settings', { params })
  },

  // ==================== 用户管理 ====================
  getUsers(params) {
    return api.get('/system/users', { params })
  },
  getUserById(id) {
    return api.get(`/system/users/${id}`)
  },
  createUser(data) {
    return api.post('/system/users', data)
  },
  updateUser(id, data) {
    return api.put(`/system/users/${id}`, data)
  },
  updateUserStatus(id, status) {
    return api.put(`/system/users/${id}/status`, { status })
  },
  resetUserPassword(id, data) {
    return api.put(`/system/users/${id}/password/reset`, data)
  },

  getBusinessTypeDictionary() {
    return api.get('/system/business-types/dictionary')
  },

  // ==================== 通知管理 ====================
  getNotifications(params) {
    return api.get('/system/notifications', { params })
  },
  getUnreadCount() {
    return api.get('/system/notifications/unread-count')
  },
  getNotificationDetail(id) {
    return api.get(`/system/notifications/${id}`)
  },
  markNotificationRead(id) {
    return api.put(`/system/notifications/${id}/read`)
  },
  markAllNotificationsRead(ids) {
    // 支持传入 ids 数组进行批量标记，不传则标记全部
    return api.put('/system/notifications/mark-all-read', ids ? { ids } : {})
  },
  deleteNotification(id) {
    return api.delete(`/system/notifications/${id}`)
  },
  batchDeleteNotifications(ids) {
    return api.post('/system/notifications/batch-delete', { ids })
  },

  createBackup() {
    return api.post('/system/backup')
  },
  getBackups() {
    return api.get('/system/backups')
  },
  verifyBackup(filename) {
    return api.get(`/system/backups/${encodeURIComponent(filename)}/verify`)
  }
}
