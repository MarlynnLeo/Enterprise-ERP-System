/**
 * 生成出库单打印HTML（支持智能替代物料显示）
 * @param {Object} printData - 出库单数据
 * @param {Function} formatDate - 日期格式化函数
 * @returns {String} HTML字符串
 */
export function generateOutboundPrintHTML(printData, formatDate) {
  // 创建扩展表格数据（包含替代物料）
  const expandedTableData = []

  printData.items.forEach((item, index) => {
    // 添加主物料行
    expandedTableData.push({
      ...item,
      originalIndex: index,
      isSubstitute: false
    })

    // 如果有替代物料，添加替代物料行
    if (item.substitutionInfo?.substituteMaterials?.length > 0) {
      item.substitutionInfo.substituteMaterials.forEach(sub => {
        expandedTableData.push({
          material_id: sub.materialId,
          material_code: sub.code,
          material_name: sub.name,
          specification: sub.specification || '',
          unit_name: sub.unit || '件',
          quantity: sub.requiredQuantity || item.quantity,
          originalIndex: index,
          isSubstitute: true,
          parentMaterialId: item.material_id
        })
      })
    }
  })

  // 创建表格行HTML
  const tableRows = expandedTableData.map((item) => {
    const isSubstitute = item.isSubstitute
    const rowStyle = isSubstitute ? ' style="color: #67c23a; font-size: 8pt;"' : ''
    const sequenceNumber = isSubstitute ? '└' : (item.originalIndex + 1)
    const materialName = isSubstitute ?
      (item.material_name + ' [替代]') :
      (item.material_name || item.materialName || '')

    return [
      '<tr' + rowStyle + '>',
      '  <td>' + sequenceNumber + '</td>',
      '  <td>' + (item.material_code || item.materialCode || '') + '</td>',
      '  <td>' + materialName + '</td>',
      '  <td>' + (item.specification || item.specs || '-') + '</td>',
      '  <td>' + (item.unit_name || item.unit || '') + '</td>',
      '  <td>' + Math.floor(item.quantity || 0) + '</td>',
      '</tr>'
    ].join('\n');
  }).join('\n');
  
  // 构建完整HTML
  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<title>出库单 - ' + printData.outbound_no + '</title>',
    '<style>',
    '/* 设置纸张尺寸为 241mm x 93mm */',
    '@page {',
    '  size: 241mm 93mm;',
    '  margin: 5mm;',
    '}',
    'body {',
    '  font-family: Arial, sans-serif;',
    '  margin: 0;',
    '  padding: 0;',
    '  font-size: 10pt;',
    '  width: 231mm; /* 241mm - 10mm 的页边距 */',
    '  height: 83mm; /* 93mm - 10mm 的页边距 */',
    '}',
    '.print-header {',
    '  text-align: center;',
    '  margin-bottom: 10px;',
    '}',
    '.print-header h2 {',
    '  margin: 0;',
    '  font-size: 16pt;',
    '}',
    '.print-info {',
    '  display: flex;',
    '  justify-content: space-between;',
    '  margin-bottom: 10px;',
    '  font-size: 10pt;',
    '}',
    '.print-warehouse {',
    '  margin-bottom: 10px;',
    '}',
    '.print-table {',
    '  width: 100%;',
    '  border-collapse: collapse;',
    '  margin-bottom: 10px;',
    '}',
    '.print-table th,',
    '.print-table td {',
    '  border: 1px solid #ddd;',
    '  padding: 3px;',
    '  text-align: center;',
    '  font-size: 9pt;',
    '}',
    '.print-table th {',
    '  background-color: #f2f2f2;',
    '}',
    '.print-footer {',
    '  margin-top: 10px;',
    '}',
    '.print-signatures {',
    '  display: flex;',
    '  justify-content: space-between;',
    '  margin-top: 20px;',
    '}',
    '</style>',
    '</head>',
    '<body>',
    '<div class="print-content">',
    '  <div class="print-header">',
    '    <h2>出库单</h2>',
    '    <div class="print-info">',
    '      <div>单号: ' + printData.outbound_no + '</div>',
    '      <div>日期: ' + formatDate(printData.outbound_date) + '</div>',
    '    </div>',
    '  </div>',
    '  ',
    '  <div class="print-warehouse">',
    '    <span>出库仓库: ' + printData.location_name + '</span>',
    '  </div>',
    '',
    '  <table class="print-table">',
    '    <thead>',
    '      <tr>',
    '        <th>序号</th>',
    '        <th>物料编码</th>',
    '        <th>物料名称</th>',
    '        <th>规格</th>',
    '        <th>单位</th>',
    '        <th>数量</th>',
    '      </tr>',
    '    </thead>',
    '    <tbody>',
    tableRows,
    '    </tbody>',
    '  </table>',
    '',
    '  <div class="print-footer">',
    '    <div>',
    '      <span>备注: ' + (printData.remark || '无') + '</span>',
    '    </div>',
    '    <div class="print-signatures">',
    '      <div>',
    '        <span>操作人: ' + printData.operator + '</span>',
    '      </div>',
    '      <div>',
    '        <span>签收人: ________________</span>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</div>',
    '<script>',
    '// 自动触发打印',
    'window.onload = function() {',
    '  window.print();',
    '  setTimeout(function() {',
    '    window.close();',
    '  }, 100);',
    '};',
    '</script>',
    '</body>',
    '</html>'
  ].join('\n');
} 