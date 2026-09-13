// List and detail views derive completion from the same API quantity fields.
export const getProductionTaskProgress = (task) => {
  if (!task) return 0
  const quantity = Number(task.quantity)
  const completed = Number(task.completedQuantity)
  const percent = quantity > 0 && Number.isFinite(completed)
    ? (completed / quantity) * 100
    : Number(task.progress)
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : 0
}
