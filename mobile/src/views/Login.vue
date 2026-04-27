<!--
/**
 * Login.vue
 * @description 移动端登录页面 - 现代沉浸式设计
 * @date 2026-04-25
 * @version 3.0.0
 */
-->
<template>
  <div class="login-page">
    <!-- 动态背景 -->
    <div class="bg-layer">
      <div class="bg-orb orb-1"></div>
      <div class="bg-orb orb-2"></div>
      <div class="bg-orb orb-3"></div>
    </div>

    <!-- 主内容 -->
    <div class="login-wrapper">
      <!-- Logo 区域 -->
      <div class="logo-area fade-up">
        <div class="logo-badge">
          <svg width="32" height="32" fill="none" stroke="#fff" viewBox="0 0 24 24" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h1 class="app-name">KACON-ERP</h1>
        <p class="app-desc">企业资源管理系统</p>
      </div>

      <!-- 登录卡片 -->
      <div class="login-card fade-up" style="animation-delay: .12s">
        <h2 class="card-title">欢迎登录</h2>

        <form @submit.prevent="onSubmit" class="login-form">
          <!-- 用户名 -->
          <div class="input-group" :class="{ focused: focusState.username, error: errors.username }">
            <div class="input-icon">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <input
              v-model="username"
              type="text"
              placeholder="请输入用户名"
              autocomplete="username"
              @focus="focusState.username = true"
              @blur="focusState.username = false"
            />
          </div>

          <!-- 密码 -->
          <div class="input-group" :class="{ focused: focusState.password, error: errors.password }">
            <div class="input-icon">
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="请输入密码"
              autocomplete="current-password"
              @focus="focusState.password = true"
              @blur="focusState.password = false"
            />
            <button type="button" class="toggle-pw" @click="showPassword = !showPassword" tabindex="-1">
              <svg v-if="!showPassword" width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <svg v-else width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            </button>
          </div>

          <!-- 登录按钮 -->
          <button type="submit" class="submit-btn" :disabled="loading">
            <span v-if="!loading">登 录</span>
            <span v-else class="loading-dots">
              <i></i><i></i><i></i>
            </span>
          </button>
        </form>
      </div>

      <!-- 底部版本 -->
      <div class="footer fade-up" style="animation-delay: .24s">
        <span>v2.0.0</span>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
  import { useRouter } from 'vue-router'
  import { showToast } from 'vant'
  import { useAuthStore } from '@/stores/auth'

  const router = useRouter()
  const authStore = useAuthStore()

  const username = ref('')
  const password = ref('')
  const loading = ref(false)
  const showPassword = ref(false)

  const errors = reactive({ username: false, password: false })
  const focusState = reactive({ username: false, password: false })

  // 视口高度修正（移动端键盘弹出时）
  const updateVh = () => {
    document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`)
  }

  onMounted(() => {
    document.body.classList.add('login-page-active')
    updateVh()
    window.addEventListener('resize', updateVh)
  })

  onBeforeUnmount(() => {
    document.body.classList.remove('login-page-active')
    window.removeEventListener('resize', updateVh)
  })

  const onSubmit = async () => {
    errors.username = !username.value
    errors.password = !password.value

    if (!username.value) {
      showToast('请输入用户名')
      return
    }
    if (!password.value) {
      showToast('请输入密码')
      return
    }

    loading.value = true
    try {
      await authStore.login({ username: username.value, password: password.value })
      localStorage.setItem('isLoggedIn', 'true')
      localStorage.setItem('forceFullscreen', 'true')
      showToast({ type: 'success', message: '登录成功', duration: 800, onClose: () => router.push('/') })
    } catch (error) {
      console.error('登录失败:', error)
    } finally {
      loading.value = false
    }
  }
</script>

<style lang="scss" scoped>
  /* ======================== 页面容器 ======================== */
  .login-page {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0c0e1a;
    overflow: hidden;
    -webkit-overflow-scrolling: touch;
  }

  /* ======================== 动态背景光球 ======================== */
  .bg-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .bg-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.45;
    animation: orbFloat 12s ease-in-out infinite;
  }

  .orb-1 {
    width: 280px;
    height: 280px;
    background: radial-gradient(circle, #6366f1 0%, transparent 70%);
    top: -60px;
    left: -40px;
    animation-duration: 14s;
  }

  .orb-2 {
    width: 220px;
    height: 220px;
    background: radial-gradient(circle, #a855f7 0%, transparent 70%);
    bottom: 10%;
    right: -30px;
    animation-duration: 10s;
    animation-delay: -4s;
  }

  .orb-3 {
    width: 180px;
    height: 180px;
    background: radial-gradient(circle, #06b6d4 0%, transparent 70%);
    top: 50%;
    left: 60%;
    animation-duration: 16s;
    animation-delay: -8s;
  }

  @keyframes orbFloat {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(30px, -20px) scale(1.05); }
    66% { transform: translate(-20px, 15px) scale(0.95); }
  }

  /* ======================== 主内容 ======================== */
  .login-wrapper {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 380px;
    padding: 0 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  /* ======================== Logo ======================== */
  .logo-area {
    text-align: center;
    margin-bottom: 32px;
  }

  .logo-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border-radius: 20px;
    background: linear-gradient(135deg, #6366f1, #a855f7);
    box-shadow: 0 8px 32px rgba(99, 102, 241, 0.35);
    margin-bottom: 16px;
  }

  .app-name {
    font-size: 1.75rem;
    font-weight: 800;
    color: #fff;
    letter-spacing: 1px;
    margin: 0 0 6px;
  }

  .app-desc {
    font-size: 0.8125rem;
    color: rgba(255, 255, 255, 0.45);
    margin: 0;
    letter-spacing: 2px;
  }

  /* ======================== 登录卡片 ======================== */
  .login-card {
    width: 100%;
    background: rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    padding: 32px 24px 28px;
  }

  .card-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: #fff;
    text-align: center;
    margin: 0 0 28px;
  }

  /* ======================== 输入框 ======================== */
  .login-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .input-group {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 16px;
    height: 52px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.06);
    border: 1.5px solid rgba(255, 255, 255, 0.08);
    transition: all 0.25s ease;

    &.focused {
      border-color: rgba(99, 102, 241, 0.6);
      background: rgba(99, 102, 241, 0.06);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
    }

    &.error {
      border-color: rgba(239, 68, 68, 0.5);
      animation: shake 0.35s ease;
    }
  }

  .input-icon {
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.35);
    display: flex;
    transition: color 0.25s;

    .focused & {
      color: #818cf8;
    }
  }

  .input-group input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #fff;
    font-size: 0.9375rem;
    font-weight: 500;
    height: 100%;

    &::placeholder {
      color: rgba(255, 255, 255, 0.3);
      font-weight: 400;
    }
  }

  .toggle-pw {
    flex-shrink: 0;
    background: none;
    border: none;
    padding: 4px;
    color: rgba(255, 255, 255, 0.3);
    cursor: pointer;
    display: flex;
    transition: color 0.2s;

    &:active {
      color: rgba(255, 255, 255, 0.6);
    }
  }

  /* ======================== 登录按钮 ======================== */
  .submit-btn {
    width: 100%;
    height: 52px;
    border: none;
    border-radius: 14px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: #fff;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 4px;
    cursor: pointer;
    margin-top: 8px;
    position: relative;
    overflow: hidden;
    transition: transform 0.15s, box-shadow 0.25s;
    box-shadow: 0 4px 20px rgba(99, 102, 241, 0.35);

    &:active:not(:disabled) {
      transform: scale(0.97);
    }

    &:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    /* 光泽扫过动画 */
    &::after {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 60%;
      height: 100%;
      background: linear-gradient(
        90deg,
        transparent,
        rgba(255, 255, 255, 0.15),
        transparent
      );
      animation: shimmer 3s ease-in-out infinite;
    }
  }

  @keyframes shimmer {
    0% { left: -100%; }
    100% { left: 200%; }
  }

  /* 加载动画小点 */
  .loading-dots {
    display: flex;
    gap: 6px;
    justify-content: center;

    i {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #fff;
      animation: dotBounce 0.6s ease-in-out infinite;

      &:nth-child(2) { animation-delay: 0.1s; }
      &:nth-child(3) { animation-delay: 0.2s; }
    }
  }

  @keyframes dotBounce {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }

  /* ======================== 底部 ======================== */
  .footer {
    margin-top: 28px;
    text-align: center;
    color: rgba(255, 255, 255, 0.2);
    font-size: 0.6875rem;
    letter-spacing: 1px;
  }

  /* ======================== 动画 ======================== */
  .fade-up {
    animation: fadeUp 0.6s ease-out both;
  }

  @keyframes fadeUp {
    from {
      opacity: 0;
      transform: translateY(24px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-6px); }
    40% { transform: translateX(6px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }

  /* ======================== 全局控制 ======================== */
  :global(.login-page-active) {
    height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
  }
</style>
