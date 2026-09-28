/** Theme state, local cache and serialized account persistence. */
import { ref, computed } from 'vue'
import { themes, defaultThemeName, getTheme } from '@/config/themes'
import api from '@/api'
import { extractApiData } from '@/utils/apiHelper'

const STORAGE_KEY = 'theme_settings'
const DEFAULT_FONT_SIZE = 14
const isThemeName = (name) => themes.some((theme) => theme.name === name)

const readStoredSettings = () => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

const normalizeFontSize = (value) => {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return DEFAULT_FONT_SIZE
  const size = Number(value)
  return Number.isFinite(size) ? Math.min(18, Math.max(12, Math.round(size))) : DEFAULT_FONT_SIZE
}

const buildThemeSettings = (themeName, sourceSettings = {}) => {
  const source = sourceSettings && typeof sourceSettings === 'object' && !Array.isArray(sourceSettings) ? sourceSettings : {}
  const theme = getTheme(themeName || source.preset || source.theme)
  let primaryColor = typeof source.primaryColor === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(source.primaryColor)
    ? source.primaryColor.toUpperCase()
    : theme.preview.primary
  if (primaryColor.length === 4) {
    primaryColor = `#${[...primaryColor.slice(1)].map((channel) => channel.repeat(2)).join('')}`
  }
  // Migrate the former premium default to the current shared palette.
  if (theme.name === 'premium' && primaryColor === '#FFFFFF') primaryColor = theme.preview.primary
  return {
    theme: theme.isDark ? 'dark' : 'light',
    preset: theme.name,
    primaryColor,
    fontSize: normalizeFontSize(source.fontSize)
  }
}

const persistTheme = (settings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.warn('[theme] Failed to cache theme settings:', error?.message || error)
  }
}

const accessibleTextColor = (color) => {
  const luminance = [1, 3, 5].reduce((sum, index, channel) => {
    const value = Number.parseInt(color.slice(index, index + 2), 16) / 255
    const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    return sum + linear * [0.2126, 0.7152, 0.0722][channel]
  }, 0)
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#FFFFFF'
}

const currentSettings = ref(buildThemeSettings(null, readStoredSettings()))
const currentThemeName = computed(() => currentSettings.value.preset)
let appearanceRevision = 0
let loadRevision = 0
let sessionRevision = 0
let hasUnsyncedChanges = false
let saveQueue = Promise.resolve()
let sessionRequests = new AbortController()
let loadedForUser = null
let pendingUserLoad = null

const applyThemeToDOM = (settings) => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-theme', settings.preset)
  root.classList.remove('light', 'dark')
  root.classList.add(settings.theme)
  root.style.setProperty('--font-size-base', `${settings.fontSize}px`)
  root.style.setProperty('--color-primary', settings.primaryColor)
  root.style.setProperty('--color-on-primary', accessibleTextColor(settings.primaryColor))
}

export const useTheme = () => {
  const setTheme = async (themeName, options = {}) => {
    if (!isThemeName(themeName)) return false
    const { syncServer = true, settings: sourceSettings } = options
    const settings = buildThemeSettings(themeName, {
      fontSize: currentSettings.value.fontSize,
      ...sourceSettings
    })
    const revision = ++appearanceRevision
    const session = sessionRevision
    const signal = sessionRequests.signal
    currentSettings.value = settings
    applyThemeToDOM(settings)
    persistTheme(settings)
    if (!syncServer) return true

    hasUnsyncedChanges = true
    const task = saveQueue.then(async () => {
      if (session !== sessionRevision) return false
      await api.post('/auth/theme', settings, { signal })
      return session === sessionRevision
    })
    saveQueue = task.catch(() => {})
    try {
      const synced = await task
      if (synced && revision === appearanceRevision) hasUnsyncedChanges = false
      return synced
    } catch (error) {
      if (session !== sessionRevision) return false
      console.warn('[theme] Failed to sync theme settings:', error?.message || error)
      return false
    }
  }

  return {
    currentTheme: computed(() => getTheme(currentThemeName.value)),
    currentThemeName,
    availableThemes: computed(() => themes),
    isDark: computed(() => currentSettings.value.theme === 'dark'),
    setTheme
  }
}

export const initTheme = () => {
  const settings = buildThemeSettings(null, readStoredSettings())
  currentSettings.value = settings
  applyThemeToDOM(settings)
}

export const loadThemeFromServer = async () => {
  const revision = appearanceRevision
  const load = ++loadRevision
  const session = sessionRevision
  const signal = sessionRequests.signal
  const isCurrent = () => revision === appearanceRevision && load === loadRevision && session === sessionRevision
  try {
    await saveQueue
    if (!isCurrent() || hasUnsyncedChanges) return false
    const response = await api.get('/auth/theme', { signal })
    if (!isCurrent()) return false
    const serverSettings = extractApiData(response, {})
    const preset = isThemeName(serverSettings?.preset) ? serverSettings.preset
      : (isThemeName(serverSettings?.theme) ? serverSettings.theme : defaultThemeName)
    await useTheme().setTheme(preset, { syncServer: false, settings: serverSettings })
    return true
  } catch (error) {
    if (session !== sessionRevision) return false
    console.warn('[theme] Failed to load server theme settings:', error?.message || error)
    return false
  }
}

export const resetThemeForSession = () => {
  sessionRequests.abort()
  sessionRequests = new AbortController()
  saveQueue = Promise.resolve()
  loadedForUser = null
  pendingUserLoad = null
  sessionRevision++
  appearanceRevision++
  loadRevision++
  hasUnsyncedChanges = false
  currentSettings.value = buildThemeSettings(defaultThemeName)
  applyThemeToDOM(currentSettings.value)
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage can be disabled; invalidating in-memory work still isolates sessions.
  }
}

export const loadThemeForUser = (userId) => {
  if (userId == null) return Promise.resolve(false)
  if (loadedForUser === userId) return Promise.resolve(true)
  if (pendingUserLoad?.userId === userId) return pendingUserLoad.promise
  const request = { userId, session: sessionRevision, promise: null }
  request.promise = loadThemeFromServer().then((loaded) => {
    if (request.session !== sessionRevision) return false
    if (loaded) loadedForUser = userId
    return loaded
  }).finally(() => {
    if (pendingUserLoad === request) pendingUserLoad = null
  })
  pendingUserLoad = request
  return request.promise
}
