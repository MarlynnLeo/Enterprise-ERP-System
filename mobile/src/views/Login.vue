<!--
/**
 * Login.vue
 * @description 移动端登录页面 - 现代沉浸式设计
 * @date 2026-04-25
 * @version 3.1.0 — B-07: 版本号从 APP_INFO 读取; B-17: 登录失败计数与延迟
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
          <div v-if="!mfaState.required && !mfaState.recoveryCodes.length" class="input-group" :class="{ focused: focusState.username, error: errors.username }">
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
          <div v-if="!mfaState.required && !mfaState.recoveryCodes.length" class="input-group" :class="{ focused: focusState.password, error: errors.password }">
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

          <template v-if="mfaState.required && !mfaState.recoveryCodes.length">
            <div class="mfa-hint">{{ mfaState.setupRequired ? '请先在验证器中完成账户配置' : '请输入 6 位验证码或恢复码' }}</div>
            <div v-if="mfaState.setupRequired" class="mfa-setup">
              <img v-if="mfaState.qrDataUrl" :src="mfaState.qrDataUrl" alt="MFA 验证器二维码" class="mfa-qr" />
              <a v-if="mfaState.otpauthUri" :href="mfaState.otpauthUri" class="mfa-open-link">在验证器中打开</a>
              <code v-if="mfaState.secret" class="mfa-secret">{{ mfaState.secret }}</code>
            </div>
            <input class="mfa-input" v-model="mfaState.token" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="MFA 验证码" />
            <input class="mfa-input" v-if="!mfaState.setupRequired" v-model="mfaState.recoveryCode" type="text" maxlength="14" autocomplete="off" placeholder="一次性恢复码（可选）" />
          </template>

          <section v-if="mfaState.recoveryCodes.length" class="recovery-panel">
            <h3>请立即保存恢复码</h3>
            <p>每个恢复码只能使用一次，离开后不会再次显示。</p>
            <ul><li v-for="code in mfaState.recoveryCodes" :key="code"><code>{{ code }}</code></li></ul>
            <button type="button" class="copy-codes" @click="copyRecoveryCodes">复制全部</button>
          </section>

          <!-- B-17: 登录失败延迟提示 -->
          <div v-if="lockoutRemaining > 0" class="lockout-tip">
            登录失败次数过多，请等待 {{ lockoutRemaining }} 秒后重试
          </div>

          <!-- 登录按钮 -->
          <button type="submit" class="submit-btn" :disabled="loading || lockoutRemaining > 0">
            <span v-if="!loading">{{ submitLabel }}</span>
            <span v-else class="loading-dots">
              <i></i><i></i><i></i>
            </span>
          </button>
        </form>
      </div>

      <!-- B-07: 底部版本号从 APP_INFO 读取 -->
      <div class="footer fade-up" style="animation-delay: .24s">
        <span>v{{ appVersion }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import { showToast } from 'vant'
  import QRCode from 'qrcode'
  import { useAuthStore } from '@/stores/auth'
  import { useDictionaryStore } from '@/stores/dictionary'
  import { APP_INFO } from '@/config/app'

  const router = useRouter()
  const route = useRoute()
  const authStore = useAuthStore()
  const dictionaryStore = useDictionaryStore()

  const username = ref('')
  const password = ref('')
  const mfaState = reactive({
    required: false,
    setupRequired: false,
    challengeId: '',
    token: '',
    recoveryCode: '',
    otpauthUri: '',
    secret: '',
    qrDataUrl: '',
    recoveryCodes: [],
  })
  const loading = ref(false)
  const showPassword = ref(false)

  const errors = reactive({ username: false, password: false })
  const focusState = reactive({ username: false, password: false })

  // B-07: 版本号从配置读取
  const appVersion = computed(() => APP_INFO.version)
  const submitLabel = computed(() => {
    if (mfaState.recoveryCodes.length) return '我已保存，继续'
    if (mfaState.required) return '验证并登录'
    return '登 录'
  })

  // B-17: 登录失败计数与递增延迟
  const failCount = ref(0)
  const lockoutRemaining = ref(0)
  let lockoutTimer = null

  /** 根据失败次数计算延迟秒数：3次→5s, 4次→10s, 5次→20s, 6次→40s... */
  const getLockoutSeconds = (count) => {
    if (count < 3) return 0
    return 5 * Math.pow(2, count - 3) // 5, 10, 20, 40...
  }

  const startLockoutCountdown = (seconds) => {
    lockoutRemaining.value = seconds
    if (lockoutTimer) clearInterval(lockoutTimer)
    lockoutTimer = setInterval(() => {
      lockoutRemaining.value--
      if (lockoutRemaining.value <= 0) {
        clearInterval(lockoutTimer)
        lockoutTimer = null
      }
    }, 1000)
  }

  onMounted(() => {
    document.body.classList.add('login-page-active')
  })

  onBeforeUnmount(() => {
    document.body.classList.remove('login-page-active')
    if (lockoutTimer) {
      clearInterval(lockoutTimer)
      lockoutTimer = null
    }
  })

  const onSubmit = async () => {
    // B-17: 如果处于锁定状态，不允许提交
    if (lockoutRemaining.value > 0) return

    if (!mfaState.required && !mfaState.recoveryCodes.length) {
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
    }

    loading.value = true
    try {
      if (mfaState.recoveryCodes.length) {
        await completeLogin()
        return
      }

      if (mfaState.required) {
        if (!/^\d{6}$/.test(mfaState.token.trim()) && !mfaState.recoveryCode.trim()) {
          showToast('请输入 6 位验证码或一次性恢复码')
          return
        }
        const verified = await authStore.verifyMfa({
          challengeId: mfaState.challengeId,
          token: mfaState.token,
          recoveryCode: mfaState.recoveryCode,
        })
        if (Array.isArray(verified.recoveryCodes) && verified.recoveryCodes.length) {
          mfaState.recoveryCodes = verified.recoveryCodes
          mfaState.token = ''
          return
        }
      } else {
        const loginResult = await authStore.login({ username: username.value, password: password.value })
        if (loginResult?.mfaRequired) {
          mfaState.required = true
          mfaState.setupRequired = Boolean(loginResult.mfaSetupRequired)
          mfaState.challengeId = loginResult.challengeId
          password.value = ''
          if (mfaState.setupRequired) {
            const setupResponse = await authStore.enrollMfa({ challengeId: mfaState.challengeId })
            const setup = setupResponse.data || {}
            mfaState.otpauthUri = setup.otpauthUri || ''
            mfaState.secret = setup.secret || ''
            if (mfaState.otpauthUri) {
              mfaState.qrDataUrl = await QRCode.toDataURL(mfaState.otpauthUri, {
                width: 220,
                margin: 1,
                errorCorrectionLevel: 'M',
              })
            }
            showToast('请配置验证器后再次提交')
          }
          return
        }
      }
      await completeLogin()
    } catch (error) {
      console.error('登录失败:', error)
      const code = error.response?.data?.errorCode || error.response?.data?.code
      if (code === 'MFA_CHALLENGE_INVALID' || code === 'MFA_CHALLENGE_LOCKED') {
        resetMfaFlow()
      }
      showToast(error.response?.data?.message || '登录失败，请重试')
      // B-17: 记录失败次数，连续失败 3 次后启用递增延迟
      failCount.value++
      const lockoutSeconds = getLockoutSeconds(failCount.value)
      if (lockoutSeconds > 0) {
        startLockoutCountdown(lockoutSeconds)
      }
    } finally {
      loading.value = false
    }
  }

  const completeLogin = async () => {
    try {
      await dictionaryStore.fetchDictionary(true)
    } catch {
      // Dictionary loading is non-blocking after authentication succeeds.
    }
    localStorage.setItem('isLoggedIn', 'true')
    failCount.value = 0
    lockoutRemaining.value = 0
    showToast({
      type: 'success',
      message: '登录成功',
      duration: 800,
      onClose: () => {
        const raw = route.query.redirect
        const redirect = Array.isArray(raw) ? raw[0] : raw
        if (authStore.mustChangePassword) {
          router.replace('/profile/password?forced=1')
          return
        }
        const safe =
          typeof redirect === 'string' &&
          redirect.startsWith('/') &&
          !redirect.startsWith('//') &&
          !redirect.includes('://')
            ? redirect
            : '/'
        router.replace(safe)
      }
    })
  }

  const resetMfaFlow = () => {
    Object.assign(mfaState, {
      required: false,
      setupRequired: false,
      challengeId: '',
      token: '',
      recoveryCode: '',
      otpauthUri: '',
      secret: '',
      qrDataUrl: '',
      recoveryCodes: [],
    })
  }

  const copyRecoveryCodes = async () => {
    try {
      await navigator.clipboard.writeText(mfaState.recoveryCodes.join('\n'))
      showToast('恢复码已复制')
    } catch {
      showToast('复制失败，请手动保存')
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
    background: radial-gradient(circle, var(--color-primary) 0%, transparent 70%);
    top: -60px;
    left: -40px;
    animation-duration: 14s;
  }

  .orb-2 {
    width: 220px;
    height: 220px;
    background: radial-gradient(circle, var(--ds-purple) 0%, transparent 70%);
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
    background: linear-gradient(135deg, var(--color-primary), var(--ds-purple));
    box-shadow: 0 8px 32px rgba(99, 102, 241, 0.35);
    margin-bottom: 16px;
  }

  .app-name {
    font-size: 1.75rem;
    font-weight: 800;
    color: var(--color-on-primary, #fff);
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
    color: var(--color-on-primary, #fff);
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
    transition:
      background-color 0.25s ease,
      border-color 0.25s ease,
      box-shadow 0.25s ease;

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
    color: var(--color-on-primary, #fff);
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

  /* ======================== B-17: 锁定提示 ======================== */
  .lockout-tip {
    text-align: center;
    color: var(--color-error);
    font-size: 0.8125rem;
    padding: 8px 0;
    animation: fadeUp 0.3s ease-out;
  }

  .mfa-hint,
  .recovery-panel p {
    color: rgba(255, 255, 255, 0.68);
    font-size: 0.8125rem;
    line-height: 1.6;
  }

  .mfa-setup {
    display: grid;
    justify-items: center;
    gap: 10px;
  }

  .mfa-qr {
    width: 180px;
    height: 180px;
    padding: 8px;
    border-radius: 12px;
    background: #fff;
  }

  .mfa-open-link {
    color: #a5b4fc;
  }

  .mfa-secret {
    max-width: 100%;
    overflow-wrap: anywhere;
    color: rgba(255, 255, 255, 0.82);
    user-select: all;
  }

  .mfa-input {
    box-sizing: border-box;
    width: 100%;
    height: 48px;
    padding: 0 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    outline: none;
    color: #fff;
    background: rgba(255, 255, 255, 0.06);
  }

  .recovery-panel {
    padding: 16px;
    border: 1px solid rgba(245, 158, 11, 0.4);
    border-radius: 14px;
    background: rgba(245, 158, 11, 0.08);
  }

  .recovery-panel h3 {
    margin: 0 0 8px;
    color: #fff;
    font-size: 1rem;
  }

  .recovery-panel ul {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 12px 0;
    padding: 0;
    list-style: none;
  }

  .recovery-panel code {
    color: #fff;
    font-size: 0.75rem;
    user-select: all;
  }

  .copy-codes {
    width: 100%;
    height: 40px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 10px;
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
  }

  /* ======================== 登录按钮 ======================== */
  .submit-btn {
    width: 100%;
    height: 52px;
    border: none;
    border-radius: 14px;
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    color: var(--color-on-primary, #fff);
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
      background: var(--bg-primary);
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
