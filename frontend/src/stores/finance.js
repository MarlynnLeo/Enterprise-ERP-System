import { defineStore } from 'pinia'
import { api } from '@/services/axiosInstance'

const DEFAULT_VAT_RATES = [0, 0.03, 0.06, 0.09, 0.13]
const DEFAULT_PAYMENT_TERMS = [0, 7, 15, 30, 45, 60, 90]
const DEFAULT_PAGINATION = { defaultPageSize: 20, pageSizeOptions: [10, 20, 50, 100] }

export const useFinanceStore = defineStore('finance', {
  state: () => ({
    vatRateOptions: DEFAULT_VAT_RATES,
    defaultVATRate: 0.13,
    currencySymbol: '¥',
    paymentTermOptions: DEFAULT_PAYMENT_TERMS,
    defaultPaymentTermDays: 30,
    pagination: DEFAULT_PAGINATION,
    taxConfig: { returnTypes: [], returnStatuses: [], invoiceTypes: [], invoiceStatuses: [] },
    bankConfig: { transactionTypes: [], paymentMethods: [], transactionCategories: {} },
    glConfig: { documentTypes: [], entryStatuses: [] },
    isLoaded: false
  }),
  actions: {
    async loadSettings() {
      if (this.isLoaded) return

      try {
        const response = await api.get('/finance/settings')
        const data = response.data || {}

        if (data.tax) {
          this.vatRateOptions = data.tax.vatRateOptions || DEFAULT_VAT_RATES
          this.defaultVATRate = data.tax.defaultVATRate ?? 0.13
          this.taxConfig = {
            returnTypes: data.tax.returnTypes || [],
            returnStatuses: data.tax.returnStatuses || [],
            invoiceTypes: data.tax.invoiceTypes || [],
            invoiceStatuses: data.tax.invoiceStatuses || []
          }
        }

        if (data.currency) {
          this.currencySymbol = data.currency.symbol || '¥'
        }

        if (data.invoice) {
          this.paymentTermOptions = data.invoice.paymentTermOptions || DEFAULT_PAYMENT_TERMS
          this.defaultPaymentTermDays = data.invoice.defaultPaymentTermDays || 30
          this.pagination = data.invoice.pagination || DEFAULT_PAGINATION
        }

        if (data.bank) {
          this.bankConfig = data.bank
        }

        if (data.gl) {
          this.glConfig = data.gl
        }

        this.isLoaded = true
      } catch (error) {
        console.error('加载财务配置失败:', error)
      }
    },

    formatTaxRate(rate) {
      if (rate === 0) return '0%'
      return `${(rate * 100).toFixed(0)}%`
    }
  }
})
