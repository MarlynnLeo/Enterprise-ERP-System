const VIEWPORT_EVENT = 'kacon:pwa-viewport-change'

const displayModeQueries = [
  '(display-mode: fullscreen)',
  '(display-mode: standalone)'
]

let initialized = false
let cleanupCallbacks = []

const state = {
  isIOS: false,
  isStandalone: false,
  isFullscreen: false,
  keyboardOpen: false,
  shellHeight: 0,
  visualHeight: 0,
  height: 0,
  width: 0
}

const matchesDisplayMode = (mode) => {
  if (!window.matchMedia) return false
  return window.matchMedia(`(display-mode: ${mode})`).matches
}

const isIOSDevice = () => {
  const ua = window.navigator.userAgent || ''
  const platform = window.navigator.platform || ''
  return /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
}

const getDisplayState = () => {
  const isFullscreen = matchesDisplayMode('fullscreen')
  const isStandalone =
    window.navigator.standalone === true ||
    matchesDisplayMode('standalone') ||
    isFullscreen

  return {
    isStandalone,
    isFullscreen
  }
}

const getViewportSize = () => {
  const viewport = window.visualViewport
  const innerHeight = window.innerHeight || 0
  const innerWidth = window.innerWidth || 0
  const visualHeight = viewport?.height || 0
  const visualWidth = viewport?.width || 0
  const keyboardOpen = visualHeight > 0 && innerHeight > 0 && innerHeight - visualHeight > 120
  const shellHeight = innerHeight || visualHeight
  const activeVisualHeight = visualHeight || innerHeight

  return {
    shellHeight: Math.max(1, Math.round(shellHeight)),
    visualHeight: Math.max(1, Math.round(activeVisualHeight)),
    height: Math.max(1, Math.round(shellHeight)),
    width: Math.max(1, Math.round(visualWidth || innerWidth)),
    keyboardOpen
  }
}

const syncViewport = () => {
  const root = document.documentElement
  const body = document.body
  const displayState = getDisplayState()
  const isIOS = isIOSDevice()
  const size = getViewportSize()

  state.isIOS = isIOS
  state.isStandalone = displayState.isStandalone
  state.isFullscreen = displayState.isFullscreen
  state.keyboardOpen = size.keyboardOpen
  state.shellHeight = size.shellHeight
  state.visualHeight = size.visualHeight
  state.height = size.height
  state.width = size.width

  root.style.setProperty('--app-shell-height', `${size.shellHeight}px`)
  root.style.setProperty('--app-visual-height', `${size.visualHeight}px`)
  root.style.setProperty('--app-visual-width', `${size.width}px`)
  root.style.setProperty('--app-viewport-height', `${size.shellHeight}px`)
  root.style.setProperty('--app-keyboard-inset', size.keyboardOpen ? '1px' : '0px')

  root.classList.toggle('ios-device', state.isIOS)
  root.classList.toggle('pwa-standalone', state.isStandalone)
  root.classList.toggle('pwa-browser', !state.isStandalone)
  root.classList.toggle('pwa-fullscreen', state.isFullscreen)
  root.classList.toggle('keyboard-open', state.keyboardOpen)

  if (body) {
    body.classList.toggle('ios-device', state.isIOS)
    body.classList.toggle('pwa-standalone', state.isStandalone)
    body.classList.toggle('pwa-browser', !state.isStandalone)
    body.classList.toggle('pwa-fullscreen', state.isFullscreen)
    body.classList.toggle('keyboard-open', state.keyboardOpen)
  }

  window.dispatchEvent(new CustomEvent(VIEWPORT_EVENT, { detail: { ...state } }))
}

const addListener = (target, event, handler, options) => {
  target.addEventListener(event, handler, options)
  cleanupCallbacks.push(() => target.removeEventListener(event, handler, options))
}

export const getPwaViewportState = () => ({ ...state })

export const onPwaViewportChange = (callback) => {
  const handler = (event) => callback(event.detail)
  window.addEventListener(VIEWPORT_EVENT, handler)
  callback(getPwaViewportState())
  return () => window.removeEventListener(VIEWPORT_EVENT, handler)
}

export const initPwaViewport = () => {
  if (initialized) {
    syncViewport()
    return () => {}
  }

  initialized = true

  const scheduleSync = () => {
    window.requestAnimationFrame(syncViewport)
  }

  syncViewport()

  addListener(window, 'resize', scheduleSync, { passive: true })
  addListener(window, 'orientationchange', scheduleSync, { passive: true })
  addListener(window, 'pageshow', scheduleSync, { passive: true })
  addListener(window, 'focus', scheduleSync, { passive: true })
  addListener(document, 'visibilitychange', scheduleSync, { passive: true })

  if (window.visualViewport) {
    addListener(window.visualViewport, 'resize', scheduleSync, { passive: true })
    addListener(window.visualViewport, 'scroll', scheduleSync, { passive: true })
  }

  displayModeQueries.forEach((query) => {
    if (!window.matchMedia) return
    const mediaQuery = window.matchMedia(query)
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', scheduleSync)
      cleanupCallbacks.push(() => mediaQuery.removeEventListener('change', scheduleSync))
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(scheduleSync)
      cleanupCallbacks.push(() => mediaQuery.removeListener(scheduleSync))
    }
  })

  return () => {
    cleanupCallbacks.forEach((cleanup) => cleanup())
    cleanupCallbacks = []
    initialized = false
  }
}
