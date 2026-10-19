import { escapeHtml } from '@/utils/htmlSecurity'
import { formatJournalAmount } from './journalGrid'
import { postingMethodLabel, settlementMethodLabel, voucherStatus } from './voucherPresentation'

const text = value => escapeHtml(String(value ?? ''))
const optionalAmount = value => value == null || value === '' ? '—' : formatJournalAmount(value) || '0.00'
const unitPrice = value => value == null || value === '' ? '' : Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 6 })

// The selected print template remains intact. This supplement makes accounting
// evidence available even when an older/custom template has no currency fields.
export function appendVoucherPrintAudit(html, entry, items) {
  const rows = items.map((item, index) => {
    const dimensions = [
      ['部门', item.departmentName], ['成本中心', item.costCenterName], ['客户', item.customerName],
      ['供应商', item.supplierName], ['个人', item.employeeName], ['项目', item.projectName],
      ['结算方式', settlementMethodLabel(item.settlementMethod)], ['发票号', item.invoiceNumber],
      ['数量', item.quantity], ['单位', item.unitName], ['单价（原币）', unitPrice(item.unitPrice)],
    ].filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([label, value]) => `${text(label)}：${text(value)}`).join('；')
    const rate = item.exchangeRate != null && Number(item.exchangeRate) > 0
      ? Number(item.exchangeRate).toFixed(8) : '—'
    return `<tr><td>${index + 1}</td><td>${text([item.accountCode, item.accountName].filter(Boolean).join(' '))}<br>${dimensions || '—'}</td><td>${text(item.currencyCode || '—')}</td><td>${text(optionalAmount(item.foreignAmount))}</td><td>${text(rate)}</td><td>${text(optionalAmount(item.baseRoundingAdjustment))}</td></tr>`
  }).join('')
  const supplement = `<section class="voucher-print-audit">
    <style>.voucher-print-document table{table-layout:fixed;max-width:100%;font-size:12px}.voucher-print-document th,.voucher-print-document td{white-space:normal;overflow-wrap:anywhere}.voucher-print-audit{margin-top:20px;color:#222;font-size:11px;line-height:1.6;overflow-wrap:anywhere}.voucher-print-audit h2{font-size:14px;margin:0 0 6px}.voucher-print-audit p{margin:4px 0}.voucher-print-audit table{width:100%;border-collapse:collapse;font-size:11px}.voucher-print-audit th,.voucher-print-audit td{border:1px solid #999;padding:5px;vertical-align:top}.voucher-print-audit thead{display:table-header-group}.voucher-print-audit tr{break-inside:avoid}</style>
    <h2>凭证核算信息 · ${text(entry.entryNumber)}</h2>
    <p>本位币：人民币（CNY）。凭证借方、贷方及合计均为人民币金额；汇率表示 1 单位原币对应的人民币金额。折算舍入差额单位为 CNY。</p>
    <p>状态：${text(voucherStatus(entry))}；附单据：${text(entry.attachmentCount ?? '未记录')}；会计期间：${text(entry.periodName || '未记录')}；过账日期：${text(entry.postingDate || '未记录')}</p>
    <p>制单人：${text(entry.createdBy || '未记录')}；审核人：${text(entry.approverName || '未记录')}；过账人：${text(entry.postedBy || '未记录')}；过账方式：${text(postingMethodLabel(entry.postingMethod))}；过账时间：${text(entry.postedAt || '未记录')}</p>
    ${entry.reversalEntryId ? `<p>对应冲销凭证 ID：${text(entry.reversalEntryId)}</p>` : ''}${entry.reversalOfEntryId ? `<p>被冲销原凭证 ID：${text(entry.reversalOfEntryId)}</p>` : ''}
    <table><colgroup><col style="width:5%"><col style="width:43%"><col style="width:8%"><col style="width:14%"><col style="width:17%"><col style="width:13%"></colgroup><thead><tr><th>行</th><th>科目及辅助信息</th><th>原币</th><th>外币金额</th><th>汇率</th><th>舍入差额</th></tr></thead><tbody>${rows}</tbody></table>
  </section>`
  // Voucher descriptions and auxiliary evidence must wrap at a legible size;
  // the generic print fitter otherwise shrinks every long cell onto one line.
  const wrapper = '<div class="voucher-print-document" data-print-autofit="false">'
  return /<body\b[^>]*>/i.test(html) && /<\/body\s*>/i.test(html)
    ? html.replace(/<body\b[^>]*>/i, match => `${match}${wrapper}`).replace(/<\/body\s*>/i, () => `${supplement}</div></body>`)
    : `${wrapper}${html}${supplement}</div>`
}
