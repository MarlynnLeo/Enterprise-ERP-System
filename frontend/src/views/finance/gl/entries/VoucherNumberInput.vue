<script>
import { defineComponent, h, onBeforeUnmount, onMounted, onUpdated, ref } from 'vue'
import { ElInputNumber } from 'element-plus/es/components/input-number/index'

// Element Plus 2.14 sets aria-disabled only when InputNumber mounts. A form
// becoming enabled later leaves its native input with a stale disabled state
// for assistive technology. Keep ARIA aligned with the real native control;
// do not change its value, disabled behavior, or the distinction between null/0.
export default defineComponent({
  name: 'VoucherNumberInput',
  inheritAttrs: false,
  setup(_, { attrs, slots, expose }) {
    const numberInput = ref(null)
    let observedInput = null
    let observer = null
    const syncDisabled = () => {
      if (observedInput) observedInput.setAttribute('aria-disabled', String(observedInput.disabled))
    }
    const observeInput = () => {
      const input = numberInput.value?.$el?.querySelector?.('input')
      if (input !== observedInput) {
        observer?.disconnect()
        observedInput = input
        if (input) {
          observer = new MutationObserver(syncDisabled)
          observer.observe(input, { attributes: true, attributeFilter: ['disabled'] })
        }
      }
      syncDisabled()
    }
    onMounted(observeInput)
    onUpdated(observeInput)
    onBeforeUnmount(() => observer?.disconnect())
    expose({ focus: () => numberInput.value?.focus(), blur: () => numberInput.value?.blur() })
    return () => h(ElInputNumber, { ...attrs, ref: numberInput }, slots)
  },
})
</script>
