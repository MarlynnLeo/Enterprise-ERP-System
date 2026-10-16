import { computed, onBeforeUnmount, onMounted, ref, toValue } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'

/** Explicit snapshot of editable data; call markSaved after loading/resetting or saving. */
export function useUnsavedChanges(source, { enabled = true, busy = false, confirm = () => ElMessageBox.confirm(
  '有未保存的更改，确定放弃这些更改吗？', '未保存的更改',
  { type: 'warning', confirmButtonText: '放弃更改', cancelButtonText: '继续编辑', closeOnClickModal: false }
) } = {}) {
  const snapshot = () => JSON.stringify(toValue(source))
  const saved = ref(snapshot())
  const dirty = computed(() => Boolean(toValue(enabled)) && snapshot() !== saved.value)
  const markSaved = (value = source) => { saved.value = JSON.stringify(toValue(value)) }
  const isBusy = () => Boolean(toValue(busy))
  let disposed = false
  let pending = null
  const confirmDiscard = () => {
    if (isBusy() || disposed) return Promise.resolve(false)
    if (!dirty.value) return Promise.resolve(true)
    if (!pending) pending = Promise.resolve().then(confirm).then(() => !isBusy() && !disposed, () => false)
      .finally(() => { pending = null })
    return pending
  }
  const beforeClose = async done => { if (await confirmDiscard()) done() }
  const beforeUnload = event => {
    if (!dirty.value && !isBusy()) return
    event.preventDefault()
    event.returnValue = ''
  }
  onBeforeRouteLeave(confirmDiscard)
  onBeforeRouteUpdate(confirmDiscard)
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onBeforeUnmount(() => { disposed = true; window.removeEventListener('beforeunload', beforeUnload) })
  return { dirty, markSaved, confirmDiscard, beforeClose }
}
