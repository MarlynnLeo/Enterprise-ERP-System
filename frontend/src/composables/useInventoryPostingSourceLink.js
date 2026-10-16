import { inject, onBeforeUnmount, watch } from 'vue'
import { routeLocationKey } from 'vue-router'
import { ElMessage } from 'element-plus/es/components/message/index'
import { getApiErrorMessage } from '@/utils/errorHandler'

const queryText = (value) => typeof value === 'string' ? value.trim() : ''

/** Opens the source record addressed by the inventory posting workbench. */
export function useInventoryPostingSourceLink({ path, sourceTypes, open, setSearch, byNumber = false }) {
  const route = inject(routeLocationKey, null)
  if (!route) return
  let sequence = 0
  let pending = null
  let opening = false

  async function openPending() {
    if (opening) return
    opening = true
    try {
      while (pending) {
        const target = pending
        pending = null
        try {
          let id = target.id
          if (!id && !byNumber) {
            const { financeApi } = await import('@/api/finance')
            const response = await financeApi.inventoryPostings.getBySource({
              sourceType: target.sourceType, sourceNo: target.sourceNo,
            })
            const payload = response?.data ?? response ?? {}
            const movement = payload.movement
            id = Number(movement?.sourceId ?? movement?.source_id)
          }
          if (target.sequence !== sequence) continue
          if ((!Number.isSafeInteger(id) || id <= 0) && !byNumber) {
            throw new Error('未找到过账对应的来源单据')
          }
          setSearch?.(target.sourceNo)
          await open({ id, sourceNo: target.sourceNo })
        } catch (error) {
          if (target.sequence === sequence) ElMessage.error(getApiErrorMessage(error, '打开来源单据失败'))
        }
      }
    } finally {
      opening = false
    }
  }

  watch(() => [route.path, route.query.sourceType, route.query.sourceId, route.query.sourceNo], () => {
    sequence += 1
    pending = null
    if (route.path !== path) return
    const sourceType = queryText(route.query.sourceType)
    const sourceNo = queryText(route.query.sourceNo)
    const rawId = queryText(route.query.sourceId)
    if (!sourceTypes.includes(sourceType) || (!rawId && !sourceNo)) return
    if (sourceNo.length > 128 || (rawId && !/^[1-9]\d*$/.test(rawId))) {
      ElMessage.error('来源单据定位参数无效')
      return
    }
    if (byNumber && !sourceNo) {
      ElMessage.error('来源单据定位缺少单号')
      return
    }
    pending = { id: Number(rawId), sourceNo, sourceType, sequence }
    void openPending()
  }, { immediate: true })
  onBeforeUnmount(() => { sequence += 1; pending = null })
}
