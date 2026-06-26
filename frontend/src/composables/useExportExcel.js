/**
 * useExportExcel.js
 * @description 通用 Excel 导出 composable — 消除 ~20 个导出功能的重复代码
 * @date 2026-06-22
 *
 * 用法:
 *   const { exportLoading, exportToExcel } = useExportExcel()
 *
 *   const handleExport = () => {
 *     exportToExcel({
 *       columns: [
 *         { header: '编码', key: 'code', width: 15 },
 *         { header: '名称', key: 'name', width: 25 },
 *       ],
 *       data: tableData.value,
 *       filename: '物料列表',
 *       sheetName: '物料'
 *     })
 *   }
 */

import { ref } from 'vue'
import { ElMessage } from 'element-plus'

/**
 * @returns {{ exportLoading: Ref<boolean>, exportToExcel: Function }}
 */
export function useExportExcel() {
  const exportLoading = ref(false)

  /**
   * 导出数据为 Excel
   * @param {Object} options
   * @param {Array<{header: string, key: string, width?: number}>} options.columns - 列配置
   * @param {Array} options.data - 数据
   * @param {string} [options.filename='导出数据'] - 文件名（无需后缀）
   * @param {string} [options.sheetName='Sheet1'] - 工作表名
   */
  const exportToExcel = async (options) => {
    const {
      columns,
      data,
      filename = '导出数据',
      sheetName = 'Sheet1',
    } = options

    if (!data || data.length === 0) {
      ElMessage.warning('没有可导出的数据')
      return
    }

    exportLoading.value = true

    try {
      // 懒加载 ExcelJS（按需加载，不影响首屏）
      const ExcelJS = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet(sheetName)

      // 设置列
      worksheet.columns = columns.map((col) => ({
        header: col.header,
        key: col.key,
        width: col.width || 15,
      }))

      // 添加数据行
      data.forEach((row) => {
        const rowData = {}
        columns.forEach((col) => {
          rowData[col.key] = row[col.key] ?? ''
        })
        worksheet.addRow(rowData)
      })

      // 设置表头样式
      const headerRow = worksheet.getRow(1)
      headerRow.font = { bold: true }
      headerRow.alignment = { horizontal: 'center' }

      // 导出
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`
      link.click()
      URL.revokeObjectURL(link.href)

      ElMessage.success(`成功导出 ${data.length} 条数据`)
    } catch (error) {
      console.error('导出失败:', error)
      ElMessage.error('导出失败: ' + (error.message || '未知错误'))
    } finally {
      exportLoading.value = false
    }
  }

  return {
    exportLoading,
    exportToExcel,
  }
}
