/**
 * useTablePagination.js
 * @description 通用表格分页 composable — 消除 65+ 组件的分页逻辑重复
 * @date 2026-06-22
 *
 * 用法:
 *   const { pagination, handleCurrentChange, handleSizeChange, resetPagination } = useTablePagination({
 *     defaultPageSize: 20,
 *     onPageChange: () => loadData()
 *   })
 *
 *   <!-- 模板中 -->
 *   <el-pagination
 *     v-model:current-page="pagination.currentPage"
 *     v-model:page-size="pagination.pageSize"
 *     :total="pagination.total"
 *     @current-change="handleCurrentChange"
 *     @size-change="handleSizeChange"
 *   />
 */

import { reactive } from 'vue'

/**
 * @param {Object} options
 * @param {number} [options.defaultPageSize=20] - 默认每页条数
 * @param {number[]} [options.pageSizes] - 可选的每页条数
 * @param {Function} [options.onPageChange] - 页码或条数变更后的回调
 */
export function useTablePagination(options = {}) {
  const {
    defaultPageSize = 20,
    pageSizes = [10, 20, 50, 100],
    onPageChange,
  } = options

  const pagination = reactive({
    currentPage: 1,
    pageSize: defaultPageSize,
    total: 0,
    pageSizes,
  })

  const handleCurrentChange = (page) => {
    pagination.currentPage = page
    onPageChange?.()
  }

  const handleSizeChange = (size) => {
    pagination.pageSize = size
    pagination.currentPage = 1 // 切换条数时回到第一页
    onPageChange?.()
  }

  const resetPagination = () => {
    pagination.currentPage = 1
    pagination.total = 0
  }

  /**
   * 更新总数（通常在 API 返回后调用）
   * @param {number} total
   */
  const setTotal = (total) => {
    pagination.total = total
  }

  /**
   * 获取当前分页参数（用于传给 API）
   * @returns {{ page: number, pageSize: number }}
   */
  const getParams = () => ({
    page: pagination.currentPage,
    pageSize: pagination.pageSize,
  })

  return {
    pagination,
    handleCurrentChange,
    handleSizeChange,
    resetPagination,
    setTotal,
    getParams,
  }
}
