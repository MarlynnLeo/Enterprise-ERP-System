// These labels describe glyphs in SPPLMFONT. An account must explicitly select its glyph;
// a person's name alone is never evidence of a configured electronic signature.
export const PRESET_SIGNATURE_OPTIONS = Object.freeze([
  { code: 'O', name: '王晓敏' },
  { code: 'A', name: '陈挺' },
  { code: 'C', name: '陈贤萍' },
  { code: 'P', name: '谢爱萍' },
])

export function resolveSignatureCode(code) {
  const trimmed = String(code ?? '').trim()
  return /^[A-Za-z]$/.test(trimmed) ? trimmed.toUpperCase() : ''
}

/**
 * 根据签名代号反查人员姓名
 * @param {string} code - 签名代号（例如：O、A、C）
 * @returns {string} 人员姓名或空字符串
 */
export function resolvePersonBySignatureCode(code) {
  const normalized = resolveSignatureCode(code)
  return PRESET_SIGNATURE_OPTIONS.find(option => option.code === normalized)?.name || ''
}

export function getSignatureDetails(data, role) {
  const name = data?.[`${role}Name`] ?? data?.[`${role}_name`] ?? data?.[role] ?? ''
  const code = data?.[`${role}SignatureCode`] ?? data?.[`${role}_signature_code`]
    ?? data?.[`${role}Signature`] ?? data?.[`${role}_signature`]
  return { name, code: resolveSignatureCode(code) }
}
