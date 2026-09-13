import { getCurrentScope, onScopeDispose, ref } from 'vue'
import { showToast } from 'vant'
import { extractApiPaginated } from '@/utils/apiHelper'

/** One active query owns its pages, refresh, errors and completion state. */
export function usePagination(fetchDataFn, options = {}) {
  const { immediate = true, initPageSize = 20, getItemKey = item => item?.id ?? item?._id } = options
  const list = ref([])
  const loading = ref(false)
  const finished = ref(false)
  const refreshing = ref(false)
  const error = ref(false)
  const initialized = ref(false)
  const page = ref(1)
  const pageSize = ref(initPageSize)
  const total = ref(-1)
  const payload = ref({})
  let params = {}
  let activeRequest = null
  let disposed = false

  if (getCurrentScope()) onScopeDispose(() => { disposed = true; activeRequest = null })

  const load = (extraParams, reset) => {
    if (disposed) return Promise.resolve()
    if (!reset && activeRequest) return activeRequest.promise
    if (!reset && finished.value) { loading.value = false; return Promise.resolve() }
    if (extraParams !== undefined) params = reset ? { ...extraParams } : { ...params, ...extraParams }
    if (reset) {
      page.value = 1
      list.value = []
      total.value = -1
      payload.value = {}
      finished.value = false
      refreshing.value = true
    }
    loading.value = true
    error.value = false
    const request = { page: page.value, promise: null }
    activeRequest = request
    const isCurrent = () => !disposed && activeRequest === request
    const query = { ...params, page: request.page, pageSize: pageSize.value, limit: pageSize.value }

    request.promise = (async () => {
      try {
        const response = await fetchDataFn(query)
        if (!isCurrent()) return
        const parsed = extractApiPaginated(response, { totalFallback: -1 })
        const previous = request.page === 1 ? [] : list.value
        const keys = new Set(previous.map(getItemKey).filter(key => key !== undefined && key !== null))
        const additions = parsed.list.filter(item => {
          const key = getItemKey(item)
          if (key === undefined || key === null) return true
          if (keys.has(key)) return false
          keys.add(key)
          return true
        })
        list.value = [...previous, ...additions]
        total.value = Number.isFinite(parsed.total) ? parsed.total : -1
        payload.value = parsed.payload
        const exhausted = parsed.list.length === 0 || (request.page > 1 && additions.length === 0)
        finished.value = exhausted || (total.value >= 0
          ? list.value.length >= total.value
          : parsed.list.length < (Number(parsed.pageSize) || pageSize.value))
        page.value = request.page + 1
      } catch {
        if (isCurrent()) {
          error.value = true
          showToast('加载失败，请重试')
        }
      } finally {
        if (isCurrent()) {
          activeRequest = null
          loading.value = false
          refreshing.value = false
          initialized.value = true
        }
      }
    })()
    return request.promise
  }

  const onLoad = extraParams => load(extraParams, false)
  const onRefresh = extraParams => load(extraParams, true)
  if (immediate) void onLoad()
  return { list, loading, finished, refreshing, error, initialized, page, pageSize, total, payload, onLoad, onRefresh }
}
