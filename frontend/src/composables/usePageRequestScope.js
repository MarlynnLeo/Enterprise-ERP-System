import { onActivated, onBeforeUnmount, onDeactivated } from 'vue'

// A response belongs to the activation and latest request that started it.
// Re-entering a cached page must not revive callbacks from its previous visit.
export function usePageRequestScope({ onResume, onLeave } = {}) {
  let active = true
  let activation = 0
  const requests = new Map()

  const start = (key) => {
    const request = (requests.get(key) || 0) + 1
    const currentActivation = activation
    requests.set(key, request)
    return () => active && activation === currentActivation && requests.get(key) === request
  }

  const leave = () => {
    active = false
    activation += 1
    requests.clear()
    onLeave?.()
  }

  onBeforeUnmount(leave)
  onDeactivated(leave)
  onActivated(() => {
    const resuming = !active
    active = true
    if (resuming) onResume?.()
  })

  return { start }
}
