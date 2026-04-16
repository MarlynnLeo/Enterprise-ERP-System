<!--
/**
 * Login.vue
 * @description 移动端登录页面 - Unified 风格
 * @date 2025-12-27
 * @version 2.0.0
 */
-->
<template>
  <div class="login-container">
    <!-- 登录卡片 -->
    <div class="login-content">
      <!-- Logo 区域 -->
      <div class="logo-section fade-in">
        <div class="logo-icon">
          <svg style="width: 40px; height: 40px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
        </div>
        <h1 class="logo-text">KACON-ERP</h1>
        <p class="logo-subtitle">企业资源管理系统</p>
      </div>

      <!-- 登录表单 -->
      <div class="unified-card login-card fade-in" style="animation-delay: 0.1s">
        <h2 class="form-title">欢迎登录</h2>

        <form @submit.prevent="onSubmit" class="login-form">
          <!-- 用户名输入框 -->
          <div class="form-item">
            <van-field
              v-model="username"
              placeholder="请输入用户名"
              :error="errors.username"
              class="kacon-field"
            >
              <template #left-icon>
                <svg style="width: 20px; height: 20px; margin-right: 8px; color: #94a3b8;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </template>
            </van-field>
          </div>

          <!-- 密码输入框 -->
          <div class="form-item">
            <van-field
              v-model="password"
              type="password"
              placeholder="请输入密码"
              :error="errors.password"
              class="kacon-field"
            >
              <template #left-icon>
                <svg style="width: 20px; height: 20px; margin-right: 8px; color: #94a3b8;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </template>
            </van-field>
          </div>

          <!-- 登录按钮 -->
          <van-button native-type="submit" type="primary" block :loading="loading" class="login-button"> 登录 </van-button>
        </form>

        <!-- 版本信息 -->
        <div class="version-info">
          <span class="text-secondary text-xs">版本号：v2.0.0</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
  import { useRouter } from 'vue-router'
  import { showToast } from 'vant'

  import { useAuthStore } from '../stores/auth'

  // iOS 检测
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)

  const router = useRouter()
  const authStore = useAuthStore()

  // 表单数据
  const username = ref('')
  const password = ref('')
  const loading = ref(false)

  // 错误状态
  const errors = reactive({
    username: false,
    password: false
  })

  // 处理窗口大小变化，更新自定义vh变量
  const updateVhVariable = () => {
    const vh = window.innerHeight * 0.01
    document.documentElement.style.setProperty('--vh', `${vh}px`)
  }

  // 在组件挂载时检查全屏状态
  onMounted(() => {
    // 强制应用全屏模式
    document.documentElement.style.height = '100%'
    document.body.style.height = '100%'
    document.body.style.margin = '0'
    document.body.style.padding = '0'
    document.body.style.overflow = 'hidden'

    // 强制移除底部菜单栏
    document
      .querySelector('meta[name="viewport"]')
      .setAttribute(
        'content',
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
      )

    // 更新视口高度变量
    updateVhVariable()
    window.addEventListener('resize', updateVhVariable)

    // 解决iOS底部灰条问题的特别处理
    if (isIOS()) {
      document.body.classList.add('ios-device')
      document.documentElement.style.background = 'transparent'
      document.body.style.background = 'transparent'
      document.documentElement.style.webkitTapHighlightColor = 'transparent'
    }
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', updateVhVariable)
  })

  // 提交登录
  const onSubmit = async () => {
    if (!username.value) {
      errors.username = true
      showToast('请输入用户名')
      return
    }
    if (!password.value) {
      errors.password = true
      showToast('请输入密码')
      return
    }

    errors.username = false
    errors.password = false
    loading.value = true

    try {
      await authStore.login({ username: username.value, password: password.value })
      // 设置登录标记
      localStorage.setItem('isLoggedIn', 'true')
      localStorage.setItem('forceFullscreen', 'true')

      showToast({
        type: 'success',
        message: '登录成功',
        duration: 1000,
        onClose: () => {
          router.push('/')
        }
      })
    } catch (error) {
      console.error('登录失败:', error)
    } finally {
      loading.value = false
    }
  }
</script>

<style lang="scss" scoped>
  /* 使用视口高度变量 */
  :root {
    --vh: 1vh;
  }

  .login-container {
    min-height: 100vh;
    min-height: calc(var(--vh, 1vh) * 100);
    height: 100vh;
    height: calc(var(--vh, 1vh) * 100);
    max-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--van-background-2);
    overflow: hidden;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
      env(safe-area-inset-left);
    box-sizing: border-box;
  }

  /* 登录内容 */
  .login-content {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 400px;
    padding: 1.5rem;
  }

  /* Logo 区域 */
  .logo-section {
    text-align: center;
    margin-bottom: 2rem;
  }

  .logo-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 4rem;
    height: 4rem;
    background: linear-gradient(135deg, #a855f7, #ec4899);
    border-radius: 1.5rem;
    margin-bottom: 1rem;
    box-shadow: none;
    color: white;
  }

  .logo-text {
    font-size: 2rem;
    font-weight: 700;
    color: var(--van-text-color);
    margin-bottom: 0.5rem;
  }

  .logo-subtitle {
    font-size: 0.875rem;
    color: var(--van-text-color-2);
  }

  /* 登录卡片 */
  .login-card {
    width: 100%;
  }

  .form-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--van-text-color);
    text-align: center;
    margin-bottom: 2rem;
  }

  .login-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-item {
    width: 100%;
  }

  /* 谷歌风格输入框 */
  :deep(.kacon-field) {
    background-color: #f1f5f9; /* 强制浅灰底色 */
    border-radius: 12px;
    padding: 12px 16px;
  }

  /* 使得原本用 flex 被破坏的图标能够重新居中 */
  :deep(.kacon-field .van-field__left-icon) {
    display: flex;
    align-items: center;
  }
  
  :deep(.kacon-field .van-field__control) {
    background-color: transparent;
  }

  .login-button {
    margin-top: 0.5rem;
  }

  .version-info {
    text-align: center;
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--van-border-color);
    color: var(--van-text-color-2);
  }

  /* 淡入动画 */
  .fade-in {
    animation: fadeIn 0.5s ease-out forwards;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* iOS特殊处理 */
  :global(.ios-device) .login-container {
    padding-bottom: calc(env(safe-area-inset-bottom) + 1rem);
  }

  /* 通用样式覆盖 */
  :deep(html),
  :deep(body) {
    background: transparent !important;
    overflow: hidden !important;
  }
</style>
