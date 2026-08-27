<template>
  <div class="login-wrapper">
    <aside class="login-panel" aria-label="KACON ERP">
      <div class="brand">
        <svg class="brand-icon" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M75 25 H25 V75 H75 V55 H45 V45 H75 V25 Z" fill="currentColor" />
          <circle cx="60" cy="50" r="5" fill="currentColor" />
        </svg>
        <span class="brand-text">KACON</span>
      </div>

      <div class="panel-copy">
        <p class="eyebrow">Enterprise Resource Planning</p>
        <h1>企业级 AI ERP 工作台</h1>
        <p>统一连接财务、供应链、生产、质量和组织协同，让核心业务流程保持清晰、可追踪、可闭环。</p>
      </div>

      <div class="workspace-preview" aria-hidden="true">
        <div class="preview-header">
          <span></span>
          <span></span>
          <span></span>
          <strong>运营总览</strong>
        </div>
        <div class="preview-metrics">
          <div class="metric-block">
            <span>本月收入</span>
            <strong>¥ 8.42M</strong>
          </div>
          <div class="metric-block">
            <span>库存周转</span>
            <strong>92.6%</strong>
          </div>
          <div class="metric-block">
            <span>生产达成</span>
            <strong>96.8%</strong>
          </div>
        </div>
        <div class="preview-chart">
          <i></i>
          <i></i>
          <i></i>
          <i></i>
          <i></i>
        </div>
      </div>

      <div class="value-list">
        <span>财务凭证与业务单据一致</span>
        <span>审批、权限、审计日志全链路留痕</span>
        <span>移动端和桌面端体验统一</span>
      </div>
    </aside>

    <main class="login-content">
      <section class="login-card" aria-label="账号登录">
        <div class="form-header">
          <div class="form-brand">
            <svg class="form-brand-icon" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M75 25 H25 V75 H75 V55 H45 V45 H75 V25 Z" fill="currentColor" />
              <circle cx="60" cy="50" r="5" fill="currentColor" />
            </svg>
            <span>KACON</span>
          </div>
          <h2>账号登录</h2>
          <p>使用企业账号进入 ERP 管理系统</p>
        </div>

        <el-form
          ref="loginFormRef"
          :model="loginForm"
          :rules="rules"
          class="login-form"
          :show-message="false"
        >
          <el-form-item prop="username">
            <label class="sr-only" for="login-username">账号</label>
            <el-input
              id="login-username"
              v-model="loginForm.username"
              name="username"
              autocomplete="username"
              placeholder="请输入手机号或邮箱"
              aria-label="账号"
              class="brand-input"
              clearable
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <el-form-item prop="password">
            <label class="sr-only" for="login-password">密码</label>
            <el-input
              id="login-password"
              v-model="loginForm.password"
              name="password"
              type="password"
              autocomplete="current-password"
              placeholder="请输入密码"
              aria-label="密码"
              show-password
              class="brand-input"
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <transition name="error-fade">
            <div v-if="loginError" class="login-error-text">{{ loginError }}</div>
          </transition>

          <el-form-item>
            <el-button
              type="primary"
              :loading="loading"
              class="submit-btn"
              @click="handleLogin"
            >
              {{ loading ? '处理中...' : '登录' }}
            </el-button>
          </el-form-item>
        </el-form>
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus/es/components/message/index'
import { useAuthStore } from '../../stores/auth'
import { useDictionaryStore } from '../../stores/dictionary'
import { unifiedStorage } from '@/utils/unifiedStorage'

const router = useRouter()
const authStore = useAuthStore()
const loginFormRef = ref(null)
const loading = ref(false)
const loginError = ref('')

const loginForm = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' }
  ]
}

onMounted(() => {
  loadSavedCredentials()
})

function loadSavedCredentials() {
  try {
    const savedUsername = unifiedStorage.get('saved_username', { defaultValue: '' })
    if (savedUsername) {
      loginForm.username = savedUsername
    }
  } catch (error) {
    console.error('读取保存的登录信息失败:', error)
  }
}

function saveCredentials() {
  try {
    unifiedStorage.set('saved_username', loginForm.username, { expires: 30 * 24 * 60 * 60 * 1000 })
  } catch (error) {
    console.error('保存登录信息失败:', error)
  }
}

function resolveLoginError(error) {
  if (error.response) {
    const status = error.response.status
    const message = error.response.data?.message || error.response.data?.error || ''
    const statusMessageMap = {
      400: '请求参数错误',
      401: message || '用户名或密码错误',
      403: '账号已被禁用',
      423: message || '账号已锁定，请联系管理员解除锁定',
      404: '登录服务未找到',
      429: '尝试次数过多，请稍后重试',
      503: '登录服务暂时不可用，请稍后重试',
      500: '服务器内部错误'
    }

    return statusMessageMap[status] || message || '登录失败'
  }

  if (error.request) {
    return '网络错误'
  }

  return '请求失败'
}

async function handleLogin() {
  if (!loginFormRef.value) return

  loginError.value = ''

  try {
    const valid = await loginFormRef.value.validate()
    if (!valid) return

    loading.value = true
    try {
      await authStore.login(loginForm)
      await completeLogin()
    } catch (error) {
      console.error('登录失败:', error)
      loginError.value = resolveLoginError(error)
      ElMessage.error(loginError.value)
    } finally {
      loading.value = false
    }
  } catch (error) {
    console.error('登录处理失败:', error)
    loading.value = false
  }
}

async function completeLogin() {
  saveCredentials()

  try {
    const dictStore = useDictionaryStore()
    await dictStore.fetchDictionary()
  } catch {
    // Dictionary loading is non-blocking after authentication succeeds.
  }

  ElMessage.success({ message: '登录成功，欢迎回来', duration: 2000 })
  await router.push('/')
}

</script>

<style scoped>
* {
  box-sizing: border-box;
}

.login-wrapper {
  display: grid;
  grid-template-columns: minmax(520px, 1.05fr) minmax(420px, 0.95fr);
  min-height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--color-bg-page);
}

.login-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 32px;
  padding: 48px clamp(48px, 7vw, 96px);
  color: var(--color-text-primary);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-base)), var(--color-bg-page));
  border-right: 1px solid var(--color-border-lighter);
}

.brand {
  position: absolute;
  top: 40px;
  left: clamp(48px, 7vw, 96px);
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--color-primary);
}

.brand-icon {
  width: 36px;
  height: 36px;
}

.brand-text {
  color: var(--color-text-primary);
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 0;
}

.panel-copy {
  max-width: 560px;
}

.eyebrow {
  margin: 0 0 12px;
  color: var(--color-primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.panel-copy h1 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 42px;
  line-height: 1.18;
  letter-spacing: 0;
}

.panel-copy p:last-child {
  margin: 18px 0 0;
  color: var(--color-text-secondary);
  font-size: 16px;
  line-height: 1.8;
}

.workspace-preview {
  width: min(100%, 560px);
  padding: 20px;
  border: 1px solid var(--color-border-lighter);
  border-radius: 8px;
  background: var(--color-bg-base);
  box-shadow: var(--shadow-card, 0 12px 36px color-mix(in srgb, var(--color-text-primary) 8%, transparent));
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border-lighter);
}

.preview-header span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-border-base);
}

.preview-header strong {
  margin-left: auto;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.preview-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.metric-block {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--color-border-lighter);
  border-radius: 8px;
  background: var(--color-bg-section);
}

.metric-block span {
  display: block;
  overflow: hidden;
  color: var(--color-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.metric-block strong {
  display: block;
  margin-top: 8px;
  overflow: hidden;
  color: var(--color-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 20px;
  line-height: 1.2;
}

.preview-chart {
  height: 112px;
  display: flex;
  align-items: end;
  gap: 12px;
  margin-top: 18px;
  padding: 16px;
  border: 1px solid var(--color-border-lighter);
  border-radius: 8px;
  background: var(--color-bg-base);
}

.preview-chart i {
  flex: 1;
  min-width: 0;
  border-radius: 6px 6px 0 0;
  background: linear-gradient(180deg, var(--color-primary), var(--color-primary-light-5, var(--color-primary)));
}

.preview-chart i:nth-child(1) { height: 42%; }
.preview-chart i:nth-child(2) { height: 70%; }
.preview-chart i:nth-child(3) { height: 54%; }
.preview-chart i:nth-child(4) { height: 86%; }
.preview-chart i:nth-child(5) { height: 62%; }

.value-list {
  width: min(100%, 560px);
  display: grid;
  gap: 10px;
}

.value-list span {
  position: relative;
  padding-left: 18px;
  color: var(--color-text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.value-list span::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.65em;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-primary);
}

.login-content {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  background: var(--color-bg-base);
}

.login-card {
  width: min(100%, 420px);
  padding: 36px;
  border: 1px solid var(--color-border-lighter);
  border-radius: 8px;
  background: var(--color-bg-base);
  box-shadow: var(--shadow-card, 0 12px 36px color-mix(in srgb, var(--color-text-primary) 8%, transparent));
}

.form-header {
  margin-bottom: 30px;
}

.form-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 22px;
  color: var(--color-text-primary);
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 0;
}

.form-brand-icon {
  width: 34px;
  height: 34px;
  color: var(--color-primary);
}

.form-header h2 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 24px;
  line-height: 1.3;
}

.form-header p {
  margin: 8px 0 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.login-form {
  width: 100%;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

:deep(.brand-input .el-input__wrapper) {
  min-height: 48px;
  padding: 0 14px;
  border-radius: 6px;
  background: var(--color-bg-base);
  box-shadow: 0 0 0 1px var(--color-border-base) inset !important;
  transition: box-shadow var(--transition-base, 0.2s ease), background var(--transition-base, 0.2s ease);
}

:deep(.brand-input .el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--color-primary) inset !important;
}

:deep(.brand-input .el-input__inner) {
  height: 46px;
  color: var(--color-text-primary);
  font-size: 15px;
}

:deep(.el-form-item) {
  margin-bottom: 22px;
}

.submit-btn {
  width: 100%;
  height: 48px;
  border-radius: 6px;
  color: var(--el-color-white) !important;
  font-size: 16px;
  font-weight: 600;
}

.login-error-text {
  margin: -12px 0 10px;
  padding-left: 2px;
  color: var(--color-danger);
  font-size: 13px;
}

.error-fade-enter-active,
.error-fade-leave-active {
  transition: opacity var(--transition-base, 0.2s ease), transform var(--transition-base, 0.2s ease);
}

.error-fade-enter-from,
.error-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media screen and (max-width: 1100px) {
  .login-wrapper {
    grid-template-columns: 1fr;
  }

  .login-panel {
    display: none;
  }
}

@media screen and (max-width: 640px) {
  .login-wrapper {
    min-height: 100dvh;
  }

  .login-content {
    align-items: stretch;
    padding: 0;
  }

  .login-card {
    width: 100%;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 32px 22px;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
}
</style>
