/**
 * useCrudDialog.js
 * @description 通用 CRUD 弹窗 composable — 消除 ~40 个弹窗表单的重复逻辑
 * @date 2026-06-22
 *
 * 用法:
 *   const {
 *     dialogVisible, dialogTitle, isEdit, formData, formLoading,
 *     openCreate, openEdit, closeDialog, submitForm
 *   } = useCrudDialog({
 *     defaultFormData: { name: '', code: '', status: 1 },
 *     createApi: (data) => api.create(data),
 *     updateApi: (id, data) => api.update(id, data),
 *     onSuccess: () => { loadList(); ElMessage.success('操作成功'); }
 *   })
 */

import { ref, reactive, toRaw } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'

/**
 * @param {Object} options
 * @param {Object} options.defaultFormData - 表单默认值
 * @param {Function} [options.createApi] - 创建 API 函数 (data) => Promise
 * @param {Function} [options.updateApi] - 更新 API 函数 (id, data) => Promise
 * @param {Function} [options.onSuccess] - 操作成功回调
 * @param {string} [options.idField='id'] - 主键字段名
 * @param {string} [options.createTitle='新增'] - 新增弹窗标题
 * @param {string} [options.editTitle='编辑'] - 编辑弹窗标题
 */
export function useCrudDialog(options = {}) {
  const {
    defaultFormData = {},
    createApi,
    updateApi,
    onSuccess,
    idField = 'id',
    createTitle = '新增',
    editTitle = '编辑',
  } = options

  const dialogVisible = ref(false)
  const dialogTitle = ref('')
  const isEdit = ref(false)
  const formLoading = ref(false)
  const formData = reactive({ ...defaultFormData })

  /** 重置表单数据 */
  const resetForm = () => {
    Object.keys(defaultFormData).forEach((key) => {
      formData[key] = defaultFormData[key]
    })
  }

  /** 打开新增弹窗 */
  const openCreate = (defaults = {}) => {
    resetForm()
    Object.assign(formData, defaults)
    isEdit.value = false
    dialogTitle.value = createTitle
    dialogVisible.value = true
  }

  /** 打开编辑弹窗 */
  const openEdit = (row) => {
    resetForm()
    Object.keys(formData).forEach((key) => {
      if (key in row) {
        formData[key] = row[key]
      }
    })
    // 确保主键字段被复制
    if (row[idField] !== undefined) {
      formData[idField] = row[idField]
    }
    isEdit.value = true
    dialogTitle.value = editTitle
    dialogVisible.value = true
  }

  /** 关闭弹窗 */
  const closeDialog = () => {
    dialogVisible.value = false
    resetForm()
  }

  /**
   * 提交表单
   * @param {Object} [formRef] - Element Plus 的 form ref，传入则自动验证
   */
  const submitForm = async (formRef) => {
    // 表单验证
    if (formRef) {
      try {
        await formRef.validate()
      } catch {
        return false
      }
    }

    if (formLoading.value) {
      ElMessage.warning('正在提交中，请勿重复操作')
      return false
    }

    formLoading.value = true
    try {
      const data = { ...toRaw(formData) }

      if (isEdit.value) {
        if (!updateApi) throw new Error('updateApi 未配置')
        await updateApi(data[idField], data)
      } else {
        if (!createApi) throw new Error('createApi 未配置')
        await createApi(data)
      }

      dialogVisible.value = false
      onSuccess?.()
      return true
    } catch (error) {
      const errorMsg =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        '操作失败'
      ElMessage.error(errorMsg)
      return false
    } finally {
      formLoading.value = false
    }
  }

  return {
    dialogVisible,
    dialogTitle,
    isEdit,
    formData,
    formLoading,
    openCreate,
    openEdit,
    closeDialog,
    submitForm,
    resetForm,
  }
}
