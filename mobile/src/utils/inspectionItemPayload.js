// Normalize the inspection API's fixed values and measurement collection together.
export function getMeasurementState(item) {
  const measurements = (Array.isArray(item.measurements) ? item.measurements : []).map((value, index) => ({
    sampleNo: value.sampleNo ?? value.sample_no ?? index + 1,
    measuredValue: value.measuredValue ?? value.measured_value ?? null,
    measuredBy: value.measuredBy ?? value.measured_by ?? null,
  }))
  const fixed = Object.fromEntries(Array.from({ length: 6 }, (_, index) => {
    const sampleNo = index + 1
    return [`measure${sampleNo}`, item[`measure${sampleNo}`] ?? measurements.find(m => Number(m.sampleNo) === sampleNo)?.measuredValue ?? null]
  }))
  return { ...fixed, measurements }
}

export function buildInspectionItemPayload(item) {
  const state = getMeasurementState(item)
  const first = item.actualValue ?? state.measure1 ?? ''
  const decimal = value => value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : value
  const values = Array.from({ length: 6 }, (_, index) => decimal(index === 0 ? first : state[`measure${index + 1}`]))
  return {
    id: item.id || undefined, itemName: item.itemName, standard: item.standard,
    method: item.method || '', type: item.type, isCritical: item.isCritical ? 1 : 0,
    result: item.result, remarks: item.remarks || '', actualValue: first,
    ...Object.fromEntries(values.map((value, index) => [`measure${index + 1}`, value])),
    measurements: [...values.flatMap((value, index) => {
      if (value === null || value === undefined || value === '') return []
      const prior = state.measurements.find(m => Number(m.sampleNo) === index + 1)
      return [{ sampleNo: index + 1, measuredValue: value, measuredBy: prior?.measuredBy ?? null }]
    }), ...state.measurements.filter(m => Number(m.sampleNo) > 6).map(m => ({ ...m, measuredValue: decimal(m.measuredValue) })).filter(m => m.measuredValue !== null)],
    dimensions: item.dimensions ?? null, tolerances: item.tolerances ?? null,
    dimensionValue: item.dimensionValue ?? null,
    toleranceUpper: item.toleranceUpper ?? null, toleranceLower: item.toleranceLower ?? null,
  }
}
