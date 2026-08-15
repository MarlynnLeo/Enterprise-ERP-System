/**
 * @module stores/finance
 * @description 财务模块全局配置状态管理
 *
 * 管理从后端加载的财务配置（增值税率、货币符号、付款条款、税务/银行/总账配置等）。
 * 首次加载后缓存在内存中，避免重复请求。
 */

import { ref } from 'vue'
import { defineStore } from 'pinia'
import { financeApi } from '@/api'
import logger from '@/utils/logger'

/**
 * 分页配置
 * @typedef {Object} PaginationConfig
 * @property {number} defaultPageSize - 默认每页条数
 * @property {number[]} pageSizeOptions - 可选的每页条数列表
 */

/**
 * 税务配置
 * @typedef {Object} TaxConfig
 * @property {string[]} returnTypes - 纳税申报类型列表
 * @property {string[]} returnStatuses - 纳税申报状态列表
 * @property {string[]} invoiceTypes - 发票类型列表
 * @property {string[]} invoiceStatuses - 发票状态列表
 */

/**
 * 银行配置
 * @typedef {Object} BankConfig
 * @property {string[]} transactionTypes - 交易类型列表
 * @property {string[]} paymentMethods - 付款方式列表
 * @property {Object<string, string[]>} transactionCategories - 交易分类（按类型分组）
 */

/**
 * 总账配置
 * @typedef {Object} GLConfig
 * @property {string[]} documentTypes - 凭证类型列表
 * @property {string[]} entryStatuses - 分录状态列表
 */

/**
 * Finance Store 返回类型
 * @typedef {Object} FinanceStore
 * @property {import('vue').Ref<number[]>} vatRateOptions - 增值税率选项
 * @property {import('vue').Ref<number>} defaultVATRate - 默认增值税率
 * @property {import('vue').Ref<string>} currencySymbol - 货币符号
 * @property {import('vue').Ref<number[]>} paymentTermOptions - 付款条款选项（天数）
 * @property {import('vue').Ref<number>} defaultPaymentTermDays - 默认付款天数
 * @property {import('vue').Ref<PaginationConfig>} pagination - 分页配置
 * @property {import('vue').Ref<TaxConfig>} taxConfig - 税务配置
 * @property {import('vue').Ref<BankConfig>} bankConfig - 银行配置
 * @property {import('vue').Ref<GLConfig>} glConfig - 总账配置
 * @property {import('vue').Ref<boolean>} isLoaded - 是否已加载
 * @property {() => Promise<void>} loadSettings - 加载配置
 * @property {(rate: number) => string} formatTaxRate - 格式化税率
 */

/** @type {number[]} 默认增值税率选项 */
const DEFAULT_VAT_RATES = [0, 0.03, 0.06, 0.09, 0.13]
/** @type {number[]} 默认付款条款选项（天数） */
const DEFAULT_PAYMENT_TERMS = [0, 7, 15, 30, 45, 60, 90]
/** @type {PaginationConfig} 默认分页配置 */
const DEFAULT_PAGINATION = { defaultPageSize: 20, pageSizeOptions: [10, 20, 50, 100] }

/** @returns {FinanceStore} */
export const useFinanceStore = defineStore('finance', () => {
  /** @type {import('vue').Ref<number[]>} */
  const vatRateOptions = ref(DEFAULT_VAT_RATES)
  /** @type {import('vue').Ref<number>} */
  const defaultVATRate = ref(0.13)
  /** @type {import('vue').Ref<string>} */
  const currencySymbol = ref('¥')
  /** @type {import('vue').Ref<number[]>} */
  const paymentTermOptions = ref(DEFAULT_PAYMENT_TERMS)
  /** @type {import('vue').Ref<number>} */
  const defaultPaymentTermDays = ref(30)
  /** @type {import('vue').Ref<PaginationConfig>} */
  const pagination = ref(DEFAULT_PAGINATION)
  /** @type {import('vue').Ref<TaxConfig>} */
  const taxConfig = ref({ returnTypes: [], returnStatuses: [], invoiceTypes: [], invoiceStatuses: [] })
  /** @type {import('vue').Ref<BankConfig>} */
  const bankConfig = ref({ transactionTypes: [], paymentMethods: [], transactionCategories: {} })
  /** @type {import('vue').Ref<GLConfig>} */
  const glConfig = ref({ documentTypes: [], entryStatuses: [] })
  /** @type {import('vue').Ref<boolean>} */
  const isLoaded = ref(false)

  /**
   * 从后端加载财务配置（幂等，已加载则跳过）
   * @returns {Promise<void>}
   */
  async function loadSettings() {
    if (isLoaded.value) return

    try {
      const response = await financeApi.settings.getOptions()
      const data = response.data || {}

      if (data.tax) {
        vatRateOptions.value = data.tax.vatRateOptions || DEFAULT_VAT_RATES
        defaultVATRate.value = data.tax.defaultVATRate ?? 0.13
        taxConfig.value = {
          returnTypes: data.tax.returnTypes || [],
          returnStatuses: data.tax.returnStatuses || [],
          invoiceTypes: data.tax.invoiceTypes || [],
          invoiceStatuses: data.tax.invoiceStatuses || [],
          incomeTaxRate: data.tax.incomeTaxRate ?? 0.25,
          additionalTaxRate: data.tax.additionalTaxRate ?? 0.12
        }
      }

      if (data.currency) {
        currencySymbol.value = data.currency.symbol || '¥'
      }

      if (data.invoice) {
        paymentTermOptions.value = data.invoice.paymentTermOptions || DEFAULT_PAYMENT_TERMS
        defaultPaymentTermDays.value = data.invoice.defaultPaymentTermDays || 30
        pagination.value = data.invoice.pagination || DEFAULT_PAGINATION
      }

      if (data.bank) {
        bankConfig.value = data.bank
      }

      if (data.gl) {
        glConfig.value = data.gl
      }

      isLoaded.value = true
    } catch (error) {
      logger.error('加载财务配置失败:', error)
    }
  }

  /**
   * 格式化税率为百分比字符串
   * @param {number} rate - 税率小数（如 0.13 表示 13%）
   * @returns {string} 格式化后的百分比字符串（如 '13%'）
   */
  function formatTaxRate(rate) {
    if (rate === 0) return '0%'
    return `${(rate * 100).toFixed(0)}%`
  }

  return {
    vatRateOptions,
    defaultVATRate,
    currencySymbol,
    paymentTermOptions,
    defaultPaymentTermDays,
    pagination,
    taxConfig,
    bankConfig,
    glConfig,
    isLoaded,
    loadSettings,
    formatTaxRate
  }
})
