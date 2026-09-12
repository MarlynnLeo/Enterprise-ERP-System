import { ref } from 'vue'
import { baseDataApi } from '@/api/baseData'
import { parseListData } from '@/utils/responseParser'

/** Keep a task's fixed version when the current product version changes. */
export const useProductProcessSelection = (formData) => {
  const processTemplateList = ref([])
  const processTemplateLoading = ref(false)
  const selectedTemplate = ref(null)
  let requestSequence = 0

  const fetchProductProcessTemplates = async (productId, { preserveId = null, preserveSelection = false } = {}) => {
    const sequence = ++requestSequence
    processTemplateList.value = []
    selectedTemplate.value = null
    processTemplateLoading.value = false
    if (!preserveId) formData.value.processTemplateId = undefined
    if (!productId) return
    processTemplateLoading.value = true
    try {
      const response = await baseDataApi.getProcessTemplates({ productId, status: 1, pageSize: 100 })
      if (sequence !== requestSequence) return
      const active = parseListData(response, { enableLog: false }).filter(template =>
        Number(template.productId) === Number(productId) && Number(template.status) === 1
      )
      let current = active.find(template => Number(template.id) === Number(preserveId))
      if (preserveId && !current) {
        const detailResponse = await baseDataApi.getProcessTemplate(preserveId)
        if (sequence !== requestSequence) return
        const detail = detailResponse.data
        if (Number(detail?.productId) === Number(productId)) current = detail
      }
      if (sequence !== requestSequence) return
      processTemplateList.value = current && !active.some(template => Number(template.id) === Number(current.id))
        ? [current, ...active]
        : active
      const selected = preserveId || preserveSelection ? current : active[0]
      // Even a missing historical version must not silently select another route.
      formData.value.processTemplateId = preserveId || selected?.id || undefined
      selectedTemplate.value = selected || null
    } finally {
      if (sequence === requestSequence) processTemplateLoading.value = false
    }
  }

  const selectProcessTemplate = (id) => {
    selectedTemplate.value = processTemplateList.value.find(template => Number(template.id) === Number(id)) || null
  }

  return { processTemplateList, processTemplateLoading, selectedTemplate, fetchProductProcessTemplates, selectProcessTemplate }
}
