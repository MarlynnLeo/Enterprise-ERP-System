<template>
  <section class="voucher-sheet" aria-label="会计凭证">
    <div class="voucher-info">
      <strong class="voucher-type">{{ voucherType }}</strong>
      <span>第 <b class="voucher-value">{{ entry.voucherNumber || entry.entryNumber }}</b> 号</span>
      <span>凭证日期：<b class="voucher-value">{{ entry.entryDate }}</b></span>
      <span class="voucher-attachments">附单据 <b class="voucher-value">{{ entry.attachmentCount ?? '—' }}</b> 张</span>
      <span class="voucher-status">{{ voucherStatus(entry) }}</span>
    </div>
    <div class="voucher-origin entry-description">
      <span class="voucher-description" :title="entry.description">摘要：{{ entry.description || '—' }}</span>
      <span v-if="entry.documentNumber" :title="entry.documentNumber">业务票据：{{ entry.documentNumber }}</span>
    </div>

    <div class="voucher-lines-wrap">
      <table ref="lineTable" class="voucher-lines" aria-label="凭证分录">
        <colgroup>
          <col class="line-number-column" />
          <col class="summary-column" />
          <col class="account-column" />
          <col class="amount-column" />
          <col class="amount-column" />
        </colgroup>
        <thead>
          <tr><th scope="col">行号</th><th scope="col">摘要</th><th scope="col">科目</th><th scope="col">借方（CNY）</th><th scope="col">贷方（CNY）</th></tr>
        </thead>
        <tbody>
          <tr
            v-for="(item, index) in items"
            :key="item.id ?? index"
            :data-line-index="index"
            :class="{ 'selected-line': selectedIndex === index }"
            :aria-selected="selectedIndex === index"
            :tabindex="selectedIndex === index ? 0 : -1"
            @click="selectedIndex = index"
            @keydown.down.prevent="focusLine(index + 1)"
            @keydown.up.prevent="focusLine(index - 1)"
            @keydown.home.prevent="focusLine(0)"
            @keydown.end.prevent="focusLine(items.length - 1)"
          >
            <td class="line-number">{{ item.lineNumber ?? index + 1 }}</td>
            <td :title="item.description || entry.description">{{ item.description || entry.description || '' }}</td>
            <td :title="accountLabel(item)">{{ accountLabel(item) }}</td>
            <td class="amount">{{ formatAmount(item.debitAmount) }}</td>
            <td class="amount">{{ formatAmount(item.creditAmount) }}</td>
          </tr>
          <tr v-if="!items.length" class="voucher-empty"><td colspan="5">暂无分录</td></tr>
          <tr v-if="items.length < 7" class="voucher-space" aria-hidden="true">
            <td colspan="5" :style="{ height: `calc(${7 - items.length} * var(--voucher-blank-line-height, 27px))` }" />
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th colspan="3" scope="row">合　计</th>
            <td class="amount" aria-label="借方合计">{{ formatAmount(totals.debit) }}</td>
            <td class="amount" aria-label="贷方合计">{{ formatAmount(totals.credit) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="voucher-account-bar" aria-live="polite">
      <div><span>科目全称</span><strong class="voucher-value">{{ accountLabel(selectedItem) }}</strong></div>
      <div><span>部门</span><strong class="voucher-value">{{ selectedItem?.departmentName || '' }}</strong></div>
    </div>

    <div class="voucher-auxiliary" aria-label="选中分录辅助核算" aria-live="polite">
      <div class="voucher-aux-title">辅助核算</div>
      <dl class="voucher-aux-group">
        <div><dt>辅助项</dt><dd>{{ auxiliaryTypes }}</dd></div>
        <div><dt>客户</dt><dd>{{ selectedItem?.customerName || '' }}</dd></div>
        <div><dt>供应商</dt><dd>{{ selectedItem?.supplierName || '' }}</dd></div>
        <div><dt>成本中心</dt><dd>{{ selectedItem?.costCenterName || '' }}</dd></div>
      </dl>
      <dl class="voucher-aux-group">
        <div><dt>结算方式</dt><dd>{{ settlementMethodLabel(selectedItem?.settlementMethod) }}</dd></div>
        <div><dt>个人</dt><dd>{{ selectedItem?.employeeName || '' }}</dd></div>
        <div><dt>发票号</dt><dd>{{ selectedItem?.invoiceNumber || '' }}</dd></div>
        <div><dt>项目</dt><dd>{{ selectedItem?.projectName || '' }}</dd></div>
      </dl>
      <dl class="voucher-aux-group voucher-quantity">
        <div><dt>数量</dt><dd>{{ selectedItem?.quantity ?? '' }}</dd></div>
        <div><dt>单价（原币）</dt><dd>{{ formatUnitPrice(selectedItem?.unitPrice) }}</dd></div>
        <div><dt>外币金额</dt><dd>{{ formatOptionalAmount(selectedItem?.foreignAmount) }}</dd></div>
        <div v-if="selectedItem?.baseRoundingAdjustment"><dt>折算差额</dt><dd>{{ formatOptionalAmount(selectedItem.baseRoundingAdjustment) }}</dd></div>
      </dl>
      <dl class="voucher-aux-group voucher-currency">
        <div><dt>单位</dt><dd>{{ selectedItem?.unitName || '' }}</dd></div>
        <div><dt>汇率</dt><dd class="voucher-rate">{{ formatRate(selectedItem?.exchangeRate) }}</dd></div>
        <div><dt>币种</dt><dd>{{ currencyName }}</dd></div>
      </dl>
    </div>

    <div class="voucher-currency-note">
      本位币：人民币（CNY）<template v-if="selectedItem?.currencyCode && formatRate(selectedItem?.exchangeRate)">；1 {{ selectedItem.currencyCode }} = {{ formatRate(selectedItem.exchangeRate) }} CNY</template>
      <span v-if="selectedItem?.baseRoundingAdjustment">；折算差额为原币折算与分配的舍入调整（CNY）</span>
    </div>

    <div class="voucher-signatures">
      <span class="voucher-line-position" aria-live="polite">第 <b>{{ selectedIndex < 0 ? 0 : selectedIndex + 1 }}/{{ items.length }}</b> 行</span>
      <span>审核人：<b>{{ entry.approverName || '未记录' }}</b></span>
      <span>制单人：<b>{{ entry.createdBy || '未记录' }}</b></span>
      <span class="voucher-review">审核意见：<b>{{ entry.approvalComment || '' }}</b></span>
    </div>
    <div class="voucher-signatures voucher-posting">
      <span>过账方式：<b>{{ postingMethodLabel(entry.postingMethod) }}</b></span>
      <span>过账人：<b>{{ entry.postedBy || '未记录' }}</b></span>
      <span>过账时间：<b>{{ entry.postedAt || '未记录' }}</b></span>
      <button v-if="entry.reversalEntryId" type="button" @click="$emit('open-entry', entry.reversalEntryId)">查看冲销凭证 #{{ entry.reversalEntryId }}</button>
      <button v-if="entry.reversalOfEntryId" type="button" @click="$emit('open-entry', entry.reversalOfEntryId)">查看原凭证 #{{ entry.reversalOfEntryId }}</button>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { formatJournalAmount } from './journalGrid'
import { postingMethodLabel, settlementMethodLabel, voucherStatus } from './voucherPresentation'

defineEmits(['open-entry'])

const props = defineProps({
  entry: { type: Object, required: true },
  items: { type: Array, default: () => [] },
})

const lineTable = ref(null)
const selectedIndex = ref(-1)
watch(() => [props.entry.id, props.items], () => {
  selectedIndex.value = props.items.length ? 0 : -1
}, { immediate: true })

const selectedItem = computed(() => props.items[selectedIndex.value] || null)
const voucherTypes = { 收: '收款凭证', 付: '付款凭证', 转: '转账凭证', 记: '记账凭证' }
const voucherType = computed(() => voucherTypes[props.entry.voucherWord] || '会计凭证')
const currencyNames = { CNY: '人民币', RMB: '人民币', USD: '美元', EUR: '欧元', HKD: '港币', JPY: '日元', TWD: '新台币' }
const currencyName = computed(() => currencyNames[selectedItem.value?.currencyCode] || selectedItem.value?.currencyCode || '')
const auxiliaryTypes = computed(() => [
  ['customerName', '客户'], ['supplierName', '供应商'], ['costCenterName', '成本中心'],
  ['departmentName', '部门'], ['employeeName', '个人'], ['projectName', '项目'],
].filter(([field]) => selectedItem.value?.[field]).map(([, label]) => label).join('、'))

const accountLabel = item => [item?.accountCode, item?.accountName].filter(Boolean).join(' ')
const formatAmount = value => formatJournalAmount(value) || '0.00'
const formatOptionalAmount = value => value == null || value === '' || !Number.isFinite(Number(value)) ? '' : formatAmount(value)
const unitPriceFormatter = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
const formatUnitPrice = value => value == null || value === '' || !Number.isFinite(Number(value)) ? '' : unitPriceFormatter.format(Number(value))
const formatRate = value => value != null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value).toFixed(8) : ''
const totals = computed(() => props.items.reduce((sum, item) => ({
  debit: sum.debit + (Number(item.debitAmount) || 0),
  credit: sum.credit + (Number(item.creditAmount) || 0),
}), { debit: 0, credit: 0 }))

const focusLine = async index => {
  if (!props.items.length) return
  selectedIndex.value = Math.max(0, Math.min(index, props.items.length - 1))
  await nextTick()
  lineTable.value?.querySelector(`[data-line-index="${selectedIndex.value}"]`)?.focus()
}
</script>

<style scoped>
.voucher-sheet {
  border: 1px solid var(--color-border-base);
  background: var(--color-bg-base);
  color: var(--color-text-primary);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
}

.voucher-info,
.voucher-origin,
.voucher-signatures {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 24px;
  padding: 7px 10px;
}

.voucher-info {
  border-bottom: 1px solid var(--color-border-base);
  background: var(--color-bg-section);
}

.voucher-value,
.voucher-type,
.voucher-aux-group dd,
.voucher-signatures b {
  color: var(--color-primary-text, var(--color-primary));
  font-weight: 400;
}

.voucher-type { font-weight: 600; }
.voucher-attachments { margin-left: auto; }
.voucher-status { color: var(--color-text-secondary); }

.voucher-origin {
  flex-wrap: nowrap;
  border-bottom: 1px solid var(--color-border-base);
  color: var(--color-text-secondary);
  font-size: 12px;
}

.voucher-origin span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.voucher-description { flex: 1; }
.voucher-lines-wrap { overflow-x: auto; }

.voucher-lines {
  width: 100%;
  min-width: 640px;
  table-layout: fixed;
  border-collapse: collapse;
}

.line-number-column { width: 46px; }
.summary-column { width: 30%; }
.amount-column { width: 128px; }

.voucher-lines th,
.voucher-lines td {
  height: 27px;
  box-sizing: border-box;
  padding: 3px 7px;
  border-right: 1px solid var(--color-border-light);
  border-bottom: 1px solid var(--color-border-light);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.voucher-lines th:last-child,
.voucher-lines td:last-child { border-right: 0; }
.voucher-lines th { font-weight: 400; text-align: center; }
.voucher-lines thead { background: var(--color-bg-section); }
.voucher-lines tbody tr[data-line-index] { cursor: pointer; color: var(--color-primary-text, var(--color-primary)); }
.voucher-lines tbody tr[data-line-index]:hover { background: var(--color-bg-hover); }
.voucher-lines tbody tr.selected-line { background: var(--color-primary); color: var(--color-on-primary); }
.voucher-lines tbody tr.selected-line:hover { background: var(--color-primary); }
.voucher-lines tbody tr:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
.voucher-lines .line-number { text-align: center; }
.voucher-lines .amount { text-align: right; }
.voucher-lines tfoot th { letter-spacing: 6px; }
.voucher-lines tfoot td { color: var(--color-primary-text, var(--color-primary)); }
.voucher-lines tfoot th,
.voucher-lines tfoot td { border-top: 1px solid var(--color-border-base); border-bottom: 0; }
.voucher-lines .voucher-space td { padding: 0; border: 0; }
.voucher-empty { text-align: center; color: var(--color-text-secondary); }

.voucher-account-bar {
  display: grid;
  grid-template-columns: 2fr 1fr;
  border-block: 1px solid var(--color-border-base);
}

.voucher-account-bar > div { display: flex; gap: 10px; padding: 5px 8px; min-width: 0; }
.voucher-account-bar > div + div { border-left: 1px solid var(--color-border-base); }
.voucher-account-bar span { flex-shrink: 0; }
.voucher-account-bar strong { overflow-wrap: anywhere; }

.voucher-auxiliary {
  display: grid;
  grid-template-columns: 74px minmax(160px, 1.5fr) minmax(130px, 1fr) minmax(120px, 1fr) minmax(150px, 1fr);
}

.voucher-aux-title { display: flex; align-items: center; justify-content: center; padding: 8px; border-right: 1px solid var(--color-border-base); white-space: nowrap; }
.voucher-aux-group { margin: 0; padding: 7px 9px; min-width: 0; }
.voucher-quantity { border-left: 1px solid var(--color-border-base); }
.voucher-aux-group > div { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: baseline; gap: 8px; min-height: 25px; }
.voucher-aux-group dt { min-width: 3em; }
.voucher-aux-group dd { margin: 0; overflow-wrap: anywhere; }
.voucher-quantity dd,
.voucher-currency dd { text-align: right; }
.voucher-rate { white-space: nowrap; }

.voucher-signatures { border-top: 1px solid var(--color-border-base); font-size: 12px; }
.voucher-review { flex: 1; overflow-wrap: anywhere; }
.voucher-currency-note { padding: 5px 10px; border-top: 1px solid var(--color-border-light); color: var(--color-text-secondary); font-size: 12px; }
.voucher-posting button { border: 0; background: transparent; color: var(--color-primary); cursor: pointer; font: inherit; padding: 0; text-decoration: underline; }

@media (max-height: 850px) {
  .voucher-sheet { --voucher-blank-line-height: 10px; }
}

@media (max-width: 760px) {
  .voucher-info { gap: 6px 14px; }
  .voucher-attachments { margin-left: 0; }
  .voucher-account-bar { grid-template-columns: 1fr; }
  .voucher-account-bar > div + div { border-left: 0; border-top: 1px solid var(--color-border-light); }
  .voucher-auxiliary { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .voucher-aux-title { grid-column: 1 / -1; justify-content: flex-start; border-right: 0; border-bottom: 1px solid var(--color-border-light); padding: 4px 8px; }
  .voucher-quantity { border-left: 0; border-top: 1px solid var(--color-border-light); }
  .voucher-currency { border-top: 1px solid var(--color-border-light); }
}
</style>
