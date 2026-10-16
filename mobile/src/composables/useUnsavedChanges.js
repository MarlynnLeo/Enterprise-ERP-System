import { computed, onBeforeUnmount, onMounted, ref, toValue } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { showConfirmDialog } from 'vant'

/** Track the form model so picker selections and line edits are protected too. */
export function useUnsavedChanges(source, { enabled = true, busy = false, confirm = () => showConfirmDialog({
  title: '未保存的更改', message: '确定放弃尚未保存的更改吗？',
  confirmButtonText: '放弃更改', cancelButtonText: '继续编辑',
  // The router guard owns this popstate; closing the singleton popup would leave its promise pending.
  closeOnPopstate: false
}) } = {}) {
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
  const beforeUnload = event => {
    if (!dirty.value && !isBusy()) return
    event.preventDefault()
    event.returnValue = ''
  }
  onBeforeRouteLeave(confirmDiscard)
  onBeforeRouteUpdate(confirmDiscard)
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onBeforeUnmount(() => { disposed = true; window.removeEventListener('beforeunload', beforeUnload) })
  return { dirty, markSaved, confirmDiscard }
}
