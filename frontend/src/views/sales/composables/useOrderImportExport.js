/**
 * useOrderImportExport.js
 * @description 销售订单导入导出逻辑的组合式函数（从 SalesOrders.vue 抽取）
 */
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { salesApi } from '@/api'
import dayjs from 'dayjs'

export function useOrderImportExport(fetchDataCallback, searchQuery, statusFilter, operatorFilter, dateRange) {
  // 导入对话框控制
  const importDialogVisible = ref(false)
  const importMethod = ref('template')
  const uploadRef = ref(null)
  const importJsonData = ref('')
  const importing = ref(false)
  const importResult = ref(null)

  // 文件对象
  let importFile = null

  // 导入操作
  const handleImport = () => {
    importDialogVisible.value = true
    importMethod.value = 'template'
    importJsonData.value = ''
    importResult.value = null
    if (uploadRef.value) uploadRef.value.clearFiles()
  }

  const closeImportDialog = () => {
    importDialogVisible.value = false
    importResult.value = null
    importFile = null
    if (uploadRef.value) uploadRef.value.clearFiles()
  }

  // 下载模板
  const downloadTemplate = async () => {
    try {
      const response = await salesApi.downloadOrderTemplate()
      let blob
      if (response instanceof Blob) blob = response
      else if (response?.data instanceof Blob) blob = response.data
      else blob = new Blob([response?.data || response], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = '销售订单导入模板.xlsx'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      ElMessage.success('模板下载成功')
    } catch (error) {
      ElMessage.error('下载模板失败: ' + (error.response?.data?.message || error.message))
    }
  }

  // 处理文件选择
  const handleFileChange = (file) => {
    importFile = file.raw
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      ElMessage.error('文件大小不能超过10MB')
      uploadRef.value.clearFiles()
      importFile = null
      return
    }
    const allowedTypes = ['.xlsx', '.xls']
    const fileName = file.name.toLowerCase()
    const isValidType = allowedTypes.some(type => fileName.endsWith(type))
    if (!isValidType) {
      ElMessage.error('只支持Excel文件格式(.xlsx, .xls)')
      uploadRef.value.clearFiles()
      importFile = null
      return
    }
    ElMessage.success('文件选择成功')
  }

  // 提交导入
  const submitImport = async () => {
    if (importMethod.value === 'template') {
      if (!importFile) { ElMessage.error('请先选择要导入的文件'); return }
    } else {
      ElMessage.error('暂不支持JSON格式直导'); return
    }
    importing.value = true
    importResult.value = null
    try {
      const formData = new FormData()
      formData.append('file', importFile)
      const response = await salesApi.importOrders(formData)
      // 后端经过 unwrapResponse 解包后，response.data = { successCount, errorCount, errors }
      // 前端模板使用 success / failed 字段，这里做映射转换
      const raw = response.data || {}
      importResult.value = {
        success: raw.successCount || raw.success || 0,
        failed: raw.errorCount || raw.failed || 0,
        errors: raw.errors || []
      }
      if (importResult.value.success > 0) {
        ElMessage.success(`成功导入 ${importResult.value.success} 条订单数据`)
        if (fetchDataCallback) fetchDataCallback()
      }
      if (importResult.value.failed > 0) {
        ElMessage.warning(`${importResult.value.failed} 条订单数据导入失败，请查看详情`)
      }
    } catch (error) {
      console.error('导入订单失败:', error)
      ElMessage.error('导入订单失败: ' + (error.response?.data?.message || error.message || '未知错误'))
    } finally {
      importing.value = false
    }
  }

  // 导出
  const handleExport = async () => {
    try {
      const exportParams = {
        search: searchQuery.value?.trim() || '',
        status: statusFilter.value || '',
        operator: operatorFilter.value || '',
        startDate: dateRange.value && dateRange.value.length > 0 ? dayjs(dateRange.value[0]).format('YYYY-MM-DD') : '',
        endDate: dateRange.value && dateRange.value.length > 1 ? dayjs(dateRange.value[1]).format('YYYY-MM-DD') : ''
      }
      const response = await salesApi.exportOrders(exportParams)
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `销售订单_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      ElMessage.success('导出成功')
    } catch (error) {
      console.error('导出失败:', error)
      ElMessage.error('导出失败: ' + (error.message || '未知错误'))
    }
  }

  return {
    importDialogVisible, importMethod, uploadRef, importJsonData,
    importing, importResult,
    handleImport, closeImportDialog, downloadTemplate,
    handleFileChange, submitImport, handleExport
  }
}
