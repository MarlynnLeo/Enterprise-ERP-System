import { getThemePreset } from '@/config/themePresets'
import { DEFAULT_PAGE_SIZE } from '@/config/pagination'

/**
 * Use the applied theme for a new list's initial density. Existing lists keep
 * their current page size, including any value selected by the user.
 */
export function getThemeDefaultPageSize(fallback = DEFAULT_PAGE_SIZE) {
  const presetId = typeof document === 'undefined'
    ? undefined
    : document.documentElement.dataset.theme
  return getThemePreset(presetId).defaultPageSize ?? fallback
}
