import { computed, ref, unref } from 'vue'

const defaultGetItemKey = (item) => item?.id

/**
 * Tracks the record currently displayed by a list-backed detail dialog.
 * The dialog owner remains responsible for loading its domain data; this
 * composable only provides stable, current-page list navigation.
 */
export function useListDetailNavigation(items, { getItemKey = defaultGetItemKey } = {}) {
  const currentItemKey = ref(null)

  const list = computed(() => {
    const source = typeof items === 'function' ? items() : unref(items)
    return Array.isArray(source) ? source : []
  })

  const currentIndex = computed(() => {
    if (currentItemKey.value === null || currentItemKey.value === undefined) return -1
    return list.value.findIndex((item) => (
      String(getItemKey(item)) === String(currentItemKey.value)
    ))
  })

  const previousItem = computed(() => (
    currentIndex.value > 0 ? list.value[currentIndex.value - 1] : null
  ))
  const nextItem = computed(() => (
    currentIndex.value >= 0 && currentIndex.value < list.value.length - 1
      ? list.value[currentIndex.value + 1]
      : null
  ))

  const setCurrentItem = (item) => {
    const key = getItemKey(item)
    if (key !== null && key !== undefined) currentItemKey.value = key
  }

  return {
    currentIndex,
    previousItem,
    nextItem,
    hasPrevious: computed(() => previousItem.value !== null),
    hasNext: computed(() => nextItem.value !== null),
    setCurrentItem
  }
}
