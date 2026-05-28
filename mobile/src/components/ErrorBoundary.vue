<template>
  <div class="error-boundary">
    <div v-if="hasError" class="error-container">
      <div class="error-content">
        <div class="error-icon">
          <Icon name="warning-o" size="64" color="var(--color-error)" />
        </div>

        <div class="error-info">
          <h3 class="error-title">{{ errorTitle }}</h3>
          <p class="error-message">{{ errorMessage }}</p>
        </div>

        <div v-if="showDetails && errorDetails" class="error-details">
          <div class="details-header" @click="toggleDetails">
            <span>错误详情</span>
            <Icon :name="showDetailsExpanded ? 'arrow-up' : 'arrow-down'" />
          </div>
          <div v-if="showDetailsExpanded" class="details-content">
            <pre>{{ errorDetails }}</pre>
          </div>
        </div>

        <div class="error-actions">
          <Button type="primary" size="large" :loading="retrying" @click="handleRetry">
            重试
          </Button>
          <Button type="default" size="large" @click="handleReload">
            刷新页面
          </Button>
          <Button v-if="canGoBack" type="default" size="large" @click="handleGoBack">
            返回上页
          </Button>
        </div>

        <div class="error-feedback">
          <Button type="default" size="small" @click="handleFeedback">
            反馈问题
          </Button>
        </div>
      </div>
    </div>

    <slot v-else />
  </div>
</template>

<script setup>
import { ref, onErrorCaptured, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { Icon, Button, showToast, showDialog } from 'vant'

const props = defineProps({
  showDetails: {
    type: Boolean,
    default: import.meta.env.DEV
  },
  fallbackTitle: {
    type: String,
    default: '页面出现错误'
  },
  fallbackMessage: {
    type: String,
    default: '抱歉，页面遇到了一些问题，请稍后重试'
  },
  canGoBack: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['error', 'retry', 'reload'])
const router = useRouter()

const hasError = ref(false)
const errorTitle = ref('')
const errorMessage = ref('')
const errorDetails = ref('')
const showDetailsExpanded = ref(false)
const retrying = ref(false)
const errorInfo = ref(null)

const CHUNK_RELOAD_KEY = 'chunk_load_reload_attempted_v2'

const getErrorMessage = (error) => String(error?.message || error || '')

const isChunkLoadError = (error) => {
  const message = getErrorMessage(error)
  return error?.name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading chunk/i.test(message)
}

const reloadForStaleChunk = () => {
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return false
  sessionStorage.setItem(CHUNK_RELOAD_KEY, 'true')
  window.location.reload()
  return true
}

const isNetworkLikeError = (error) => {
  return !!(
    error?.isAxiosError ||
    error?.config ||
    error?.response ||
    error?.request
  )
}

const isIgnorableGlobalError = (error) => {
  if (!error) return true
  if (isChunkLoadError(error)) return false
  if (isNetworkLikeError(error)) return true

  const message = getErrorMessage(error)
  return /ResizeObserver loop|Navigation cancelled|Navigation aborted|Avoided redundant navigation|Redirected when going from/i.test(message)
}

const handleError = (error, info) => {
  if (isChunkLoadError(error) && reloadForStaleChunk()) {
    return
  }

  hasError.value = true
  errorInfo.value = { error, info }

  if (isChunkLoadError(error)) {
    errorTitle.value = '资源加载失败'
    errorMessage.value = '页面资源可能仍是旧缓存，请刷新页面重试'
  } else if (error.name === 'NetworkError') {
    errorTitle.value = '网络连接错误'
    errorMessage.value = '网络连接异常，请检查网络设置后重试'
  } else if (error.message?.includes('timeout')) {
    errorTitle.value = '请求超时'
    errorMessage.value = '请求处理时间过长，请稍后重试'
  } else {
    errorTitle.value = props.fallbackTitle
    errorMessage.value = props.fallbackMessage
  }

  if (props.showDetails) {
    errorDetails.value = `${error.name}: ${error.message}\n\n${error.stack}\n\nComponent Info: ${info}`
  }
}

onErrorCaptured((error, instance, info) => {
  console.error('Error captured by boundary:', error, info)
  handleError(error, info)
  emit('error', { error, instance, info })
  return false
})

const toggleDetails = () => {
  showDetailsExpanded.value = !showDetailsExpanded.value
}

const handleRetry = async () => {
  retrying.value = true

  try {
    emit('retry')
    await new Promise((resolve) => setTimeout(resolve, 100))
    hasError.value = false
    errorInfo.value = null
    showToast('重试成功')
  } catch (error) {
    console.error('Retry failed:', error)
    hasError.value = true
    showToast('重试失败，请刷新页面')
  } finally {
    retrying.value = false
  }
}

const handleReload = () => {
  emit('reload')
  window.location.reload()
}

const handleGoBack = () => {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/')
  }
}

const handleFeedback = async () => {
  try {
    await showDialog({
      title: '问题反馈',
      message: '错误信息已收集，是否发送反馈？',
      confirmButtonText: '发送',
      cancelButtonText: '取消'
    })
    showToast('反馈已发送，感谢您的反馈')
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Send feedback failed:', error)
    }
  }
}

const handleGlobalError = (event) => {
  if (isIgnorableGlobalError(event.error)) {
    event.preventDefault?.()
    return
  }

  if (!hasError.value) {
    handleError(event.error || new Error(event.message), 'Global error')
  }
}

const handleUnhandledRejection = (event) => {
  if (isIgnorableGlobalError(event.reason)) {
    event.preventDefault?.()
    return
  }

  if (!hasError.value) {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason))
    handleError(error, 'Unhandled promise rejection')
  }
}

onMounted(() => {
  window.addEventListener('error', handleGlobalError)
  window.addEventListener('unhandledrejection', handleUnhandledRejection)
})

onBeforeUnmount(() => {
  window.removeEventListener('error', handleGlobalError)
  window.removeEventListener('unhandledrejection', handleUnhandledRejection)
})

defineExpose({
  hasError,
  clearError: () => {
    hasError.value = false
    errorInfo.value = null
  },
  triggerError: (error, info = 'Manual trigger') => {
    handleError(error, info)
  }
})
</script>

<style lang="scss" scoped>
.error-boundary {
  width: 100%;
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}

.error-container {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  min-height: 0;
  overflow-y: auto;
  padding: calc(20px + var(--safe-area-top, 0px)) 20px calc(20px + var(--safe-area-bottom, 0px));
  background-color: var(--bg-primary);
}

.error-content {
  max-width: 400px;
  width: 100%;
  text-align: center;
  background-color: var(--bg-secondary);
  border-radius: 16px;
  padding: 32px 24px;
  border: 1px solid var(--van-border-color);
  box-shadow: none;
}

.error-icon {
  margin-bottom: 24px;
}

.error-info {
  margin-bottom: 24px;

  .error-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 12px;
  }

  .error-message {
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.5;
    margin: 0;
  }
}

.error-details {
  margin-bottom: 24px;
  text-align: left;

  .details-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    background-color: var(--bg-primary);
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    color: var(--text-secondary);
  }

  .details-content {
    margin-top: 8px;
    padding: 12px;
    background-color: var(--bg-primary);
    border-radius: 8px;
    max-height: 200px;
    overflow-y: auto;

    pre {
      margin: 0;
      font-size: 12px;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-break: break-word;
    }
  }
}

.error-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.error-feedback {
  opacity: 0.7;
}
</style>
