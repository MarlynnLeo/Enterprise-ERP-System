/**
 * 应用配置文件
 * 包含应用的各种配置选项和常量
 */

// 应用基本信息
export const APP_INFO = {
  name: 'MES移动端',
  version: '1.0.0',
  description: '制造执行系统移动端应用',
  author: 'MES Team',
  homepage: 'https://mes.example.com'
}

// API配置
export const API_CONFIG = {
  // 基础URL - 从环境变量读取，默认使用相对路径 /api 配合反向代理
  baseURL: import.meta.env.VITE_APP_API_BASE_URL || '/api',

  // 请求超时时间（毫秒）
  timeout: 30000,

  // 重试配置
  retry: {
    times: 3,
    delay: 1000
  },

  // 缓存配置
  cache: {
    enabled: true,
    duration: 5 * 60 * 1000 // 5分钟
  }
}

// 存储配置
export const STORAGE_CONFIG = {
  // 存储键前缀
  prefix: 'mes_mobile_',

  // 存储类型
  type: 'localStorage', // localStorage, sessionStorage, indexedDB

  // 加密配置
  encryption: {
    enabled: false,
    key: 'mes_mobile_key'
  },

  // 过期时间配置
  expiry: {
    token: 24 * 60 * 60 * 1000, // 24小时
    userInfo: 7 * 24 * 60 * 60 * 1000, // 7天
    cache: 30 * 60 * 1000 // 30分钟
  }
}

// 主题配置
export const THEME_CONFIG = {
  // 默认主题
  default: 'light',

  // 可用主题
  themes: ['light', 'dark', 'auto'],

  // 主题色
  colors: {
    primary: '#1989fa',
    success: '#07c160',
    warning: '#ff976a',
    danger: '#ee0a24',
    info: '#1989fa'
  },

  // 暗色模式配置
  darkMode: {
    enabled: true,
    auto: true, // 跟随系统
    schedule: {
      enabled: false,
      start: '18:00',
      end: '06:00'
    }
  }
}

// 基础性能配置（已移除监控功能）
export const PERFORMANCE_CONFIG = {
  // 懒加载配置
  lazyLoad: {
    enabled: true,
    threshold: 100, // 提前100px开始加载
    rootMargin: '50px'
  },

  // 虚拟滚动配置
  virtualScroll: {
    enabled: true,
    itemHeight: 60,
    bufferSize: 5
  },

  // 图片优化配置
  imageOptimization: {
    enabled: true,
    quality: 0.8,
    maxWidth: 1200,
    maxHeight: 1200,
    format: 'webp'
  }
}

// 离线配置已移除

// 安全配置
export const SECURITY_CONFIG = {
  // 认证配置
  auth: {
    tokenKey: 'access_token',
    refreshTokenKey: 'refresh_token',
    autoRefresh: true,
    refreshThreshold: 5 * 60 * 1000 // 5分钟前刷新
  },

  // 加密配置
  encryption: {
    algorithm: 'AES-GCM',
    keyLength: 256
  },

  // 安全头配置
  headers: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block'
  }
}

// 功能开关配置
export const FEATURE_FLAGS = {
  // 扫码功能
  qrScanner: true,

  // 离线模式已移除
  offlineMode: false,

  // 推送通知
  pushNotifications: true,

  // 生物识别
  biometricAuth: false,

  // 语音识别
  speechRecognition: false,

  // 地理位置
  geolocation: false,

  // 摄像头
  camera: true,

  // 文件上传
  fileUpload: true,

  // 数据导出
  dataExport: true,

  // 调试模式
  debugMode: import.meta.env.DEV
}

// 用户体验配置
export const UX_CONFIG = {
  // 动画配置
  animations: {
    enabled: true,
    duration: 300,
    easing: 'ease-out'
  },

  // 触觉反馈
  hapticFeedback: {
    enabled: true,
    intensity: 'medium' // light, medium, heavy
  },

  // 手势配置
  gestures: {
    swipeBack: true,
    pullToRefresh: true,
    longPress: true
  },

  // 无障碍配置
  accessibility: {
    enabled: true,
    fontSize: 'medium', // small, medium, large
    contrast: 'normal', // normal, high
    screenReader: true
  }
}

// 日志配置
export const LOG_CONFIG = {
  // 日志级别
  level: import.meta.env.DEV ? 'debug' : 'error',

  // 日志输出
  outputs: ['console'],

  // 远程日志
  remote: {
    enabled: false,
    endpoint: '/api/logs',
    batchSize: 10,
    flushInterval: 30000
  },

  // 日志格式
  format: {
    timestamp: true,
    level: true,
    category: true,
    stack: true
  }
}

// 网络配置
export const NETWORK_CONFIG = {
  // 网络检测
  detection: {
    enabled: true,
    interval: 5000,
    timeout: 3000
  },

  // 重试配置
  retry: {
    enabled: true,
    maxAttempts: 3,
    backoff: 'exponential', // linear, exponential
    initialDelay: 1000,
    maxDelay: 10000
  },

  // 请求队列
  queue: {
    enabled: true,
    maxSize: 100,
    timeout: 60000
  }
}

// 数据同步配置已移除

// 默认配置
export const DEFAULT_CONFIG = {
  app: APP_INFO,
  api: API_CONFIG,
  storage: STORAGE_CONFIG,
  theme: THEME_CONFIG,
  performance: PERFORMANCE_CONFIG,
  security: SECURITY_CONFIG,
  features: FEATURE_FLAGS,
  ux: UX_CONFIG,
  log: LOG_CONFIG,
  network: NETWORK_CONFIG
}

// 配置管理类
export class ConfigManager {
  constructor() {
    this.config = { ...DEFAULT_CONFIG }
    this.listeners = []
  }

  // 获取配置
  get(path) {
    return this.getNestedValue(this.config, path)
  }

  // 设置配置
  set(path, value) {
    this.setNestedValue(this.config, path, value)
    this.notifyListeners(path, value)
  }

  // 更新配置
  update(updates) {
    Object.keys(updates).forEach((path) => {
      this.set(path, updates[path])
    })
  }

  // 重置配置
  reset() {
    this.config = { ...DEFAULT_CONFIG }
    this.notifyListeners('*', this.config)
  }

  // 监听配置变化
  onChange(callback) {
    this.listeners.push(callback)
    return () => {
      const index = this.listeners.indexOf(callback)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  // 通知监听器
  notifyListeners(path, value) {
    this.listeners.forEach((callback) => {
      try {
        callback(path, value)
      } catch (error) {
        console.error('Config listener error:', error)
      }
    })
  }

  // 获取嵌套值
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined
    }, obj)
  }

  // 设置嵌套值
  setNestedValue(obj, path, value) {
    const keys = path.split('.')
    const lastKey = keys.pop()
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {}
      }
      return current[key]
    }, obj)
    target[lastKey] = value
  }
}

// 创建全局配置管理器实例
export const configManager = new ConfigManager()
