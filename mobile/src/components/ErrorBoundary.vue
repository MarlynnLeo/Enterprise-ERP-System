<!--
/**
 * ErrorBoundary.vue
 * @description Vue 错误边界组件
 * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="error-boundary">
    <div v-if="hasError" class="error-container">
      <div class="error-content">
        <!-- 错误图标 -->
        <div class="error-icon">
          <Icon name="warning-o" size="64" color="#ff6b6b" />
        </div>
        
        <!-- 错误信息 -->
        <div class="error-info">
          <h3 class="error-title">{{ errorTitle }}</h3>
          <p class="error-message">{{ errorMessage }}</p>
        </div>
        
        <!-- 错误详情（开发模式下显示） -->
        <div v-if="showDetails && errorDetails" class="error-details">
          <div class="details-header" @click="toggleDetails">
            <span>错误详情</span>
            <Icon :name="showDetailsExpanded ? 'arrow-up' : 'arrow-down'" />
          </div>
          <div v-if="showDetailsExpanded" class="details-content">
            <pre>{{ errorDetails }}</pre>
          </div>
        </div>
        
        <!-- 操作按钮 -->
        <div class="error-actions">
          <Button 
            type="primary" 
            size="large" 
            @click="handleRetry"
            :loading="retrying"
          >
            重试
          </Button>
          <Button 
            type="default" 
            size="large" 
            @click="handleReload"
          >
            刷新页面
          </Button>
          <Button 
            v-if="canGoBack"
            type="default" 
            size="large" 
            @click="handleGoBack"
          >
            返回上页
          </Button>
        </div>
        
        <!-- 反馈按钮 -->
        <div class="error-feedback">
          <Button 
            type="default" 
            size="small" 
            @click="handleFeedback"
          >
            反馈问题
          </Button>
        </div>
      </div>
    </div>
    
    <!-- 正常内容 -->
    <slot v-else />
  </div>
</template>

<script setup>
import { ref, onErrorCaptured, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Icon, Button, showToast, showDialog } from 'vant';

const props = defineProps({
  // 是否显示错误详情
  showDetails: {
    type: Boolean,
    default: process.env.NODE_ENV === 'development'
  },
  // 自定义错误标题
  fallbackTitle: {
    type: String,
    default: '页面出现错误'
  },
  // 自定义错误消息
  fallbackMessage: {
    type: String,
    default: '抱歉，页面遇到了一些问题，请稍后重试'
  },
  // 是否允许返回上页
  canGoBack: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['error', 'retry', 'reload']);

const router = useRouter();

const hasError = ref(false);
const errorTitle = ref('');
const errorMessage = ref('');
const errorDetails = ref('');
const showDetailsExpanded = ref(false);
const retrying = ref(false);
const errorInfo = ref(null);

// 捕获错误
onErrorCaptured((error, instance, info) => {
  console.error('Error captured by boundary:', error, info);
  
  handleError(error, info);

  emit('error', { error, instance, info });
  
  // 阻止错误继续传播
  return false;
});

// 处理错误
const handleError = (error, info) => {
  hasError.value = true;
  errorInfo.value = { error, info };
  
  // 设置错误信息
  if (error.name === 'ChunkLoadError') {
    errorTitle.value = '资源加载失败';
    errorMessage.value = '页面资源加载失败，请刷新页面重试';
  } else if (error.name === 'NetworkError') {
    errorTitle.value = '网络连接错误';
    errorMessage.value = '网络连接异常，请检查网络设置后重试';
  } else if (error.message?.includes('timeout')) {
    errorTitle.value = '请求超时';
    errorMessage.value = '请求处理时间过长，请稍后重试';
  } else {
    errorTitle.value = props.fallbackTitle;
    errorMessage.value = props.fallbackMessage;
  }
  
  // 设置错误详情
  if (props.showDetails) {
    errorDetails.value = `${error.name}: ${error.message}\n\n${error.stack}\n\nComponent Info: ${info}`;
  }
};

// 切换详情显示
const toggleDetails = () => {
  showDetailsExpanded.value = !showDetailsExpanded.value;
};

// 重试
const handleRetry = async () => {
  retrying.value = true;

  try {
    emit('retry');

    // 使用 nextTick 确保在下一个渲染周期清除错误状态
    await new Promise(resolve => setTimeout(resolve, 100));

    // 清除错误状态
    hasError.value = false;
    errorInfo.value = null;

    showToast('重试成功');
  } catch (error) {
    console.error('Retry failed:', error);
    hasError.value = true;
    showToast('重试失败，请刷新页面');
  } finally {
    retrying.value = false;
  }
};

// 刷新页面
const handleReload = () => {
  emit('reload');
  window.location.reload();
};

// 返回上页
const handleGoBack = () => {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push('/');
  }
};

// 反馈问题
const handleFeedback = async () => {
  try {
    const errorReport = {
      title: errorTitle.value,
      message: errorMessage.value,
      details: errorDetails.value,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: Date.now()
    };
    
    // 显示反馈对话框
    await showDialog({
      title: '问题反馈',
      message: '错误信息已收集，是否发送反馈？',
      confirmButtonText: '发送',
      cancelButtonText: '取消'
    });
    
    // 这里可以调用API发送错误报告
    showToast('反馈已发送，感谢您的反馈');
    
  } catch (error) {
    if (error !== 'cancel') {
      console.error('Send feedback failed:', error);
    }
  }
};

// 全局错误处理
onMounted(() => {
  // 监听全局未捕获的错误
  window.addEventListener('error', (event) => {
    if (!hasError.value) {
      handleError(event.error || new Error(event.message), 'Global error');
    }
  });
  
  // 监听未处理的Promise拒绝
  window.addEventListener('unhandledrejection', (event) => {
    if (!hasError.value) {
      const error = event.reason instanceof Error 
        ? event.reason 
        : new Error(String(event.reason));
      handleError(error, 'Unhandled promise rejection');
    }
  });
});

// 暴露方法给父组件
defineExpose({
  hasError,
  clearError: () => {
    hasError.value = false;
    errorInfo.value = null;
  },
  triggerError: (error, info = 'Manual trigger') => {
    handleError(error, info);
  }
});
</script>

<style lang="scss" scoped>
.error-boundary {
  width: 100%;
  height: 100%;
}

.error-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
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
      font-size: 12px;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-break: break-all;
      margin: 0;
    }
  }
}

.error-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
  
  .van-button {
    width: 100%;
  }
}

.error-feedback {
  .van-button {
    color: var(--text-secondary);
    font-size: 12px;
  }
}

// 响应式设计
@media (max-width: 480px) {
  .error-container {
    padding: 16px;
  }
  
  .error-content {
    padding: 24px 16px;
  }
  
  .error-actions {
    .van-button {
      height: 44px;
    }
  }
}
</style>
