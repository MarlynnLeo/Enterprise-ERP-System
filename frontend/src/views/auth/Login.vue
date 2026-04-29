<!--
/**
 * Login.vue
 * @description 前端登录界面 - KACON Teal Split-Screen Style
 * @date 2026-03-25
 */
-->
<template>
  <div class="login-wrapper">
    <!-- 左侧品牌与插画区 -->
    <div class="login-left">
      <div class="brand">
        <svg class="brand-icon" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M75 25 H25 V75 H75 V55 H45 V45 H75 V25 Z" fill="currentColor" />
          <circle cx="60" cy="50" r="5" fill="currentColor" />
        </svg>
        <span class="brand-text">KACON</span>
      </div>
      
      <!-- 纯CSS构建的抽象插画，模拟原图左侧视觉 -->
      <div class="illustration-container">
        <!--巨型圆环背景-->
        <div class="float-ring"></div>
        <div class="float-ring small"></div>
        
        <!-- 数据面板背景 -->
        <div class="dashboard-panel panel-bg">
          <div class="panel-header">
            <div class="dot"></div><div class="dot"></div><div class="dot"></div>
          </div>
          <div class="panel-body">
            <div class="line" style="width: 40%"></div>
            <div class="line" style="width: 70%"></div>
            <div class="line" style="width: 50%"></div>
            <div class="chart-area">
              <svg viewBox="0 0 200 60" preserveAspectRatio="none">
                 <path d="M0,50 Q25,20 50,40 T100,30 T150,40 T200,10" fill="none" stroke="#00a896" stroke-width="4" stroke-linecap="round"/>
              </svg>
            </div>
          </div>
        </div>
        
        <!-- 悬浮的主 Logo 卡片 -->
        <div class="dashboard-panel panel-fg">
          <svg class="fg-logo" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M75 25 H25 V75 H75 V55 H45 V45 H75 V25 Z" fill="#fff" />
            <circle cx="60" cy="50" r="5" fill="#fff" />
          </svg>
        </div>
      </div>
    </div>
    
    <!-- 右侧表单区 -->
    <div class="login-right">
      <div class="login-form-container">
        <!-- 顶部 Logo 与 Slogan -->
        <div class="form-header">
          <div class="form-brand">
            <svg class="form-brand-icon" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M75 25 H25 V75 H75 V55 H45 V45 H75 V25 Z" fill="currentColor" />
              <circle cx="60" cy="50" r="5" fill="currentColor" />
            </svg>
            <span class="form-brand-text">KACON</span>
          </div>
          <p class="form-slogan">新一代的开源 AI ERP系统</p>
        </div>
        
        <!-- 表单主体 -->
        <div class="form-box">
          <h2 class="form-title">账号登录</h2>
          
          <el-form :model="loginForm" :rules="rules" ref="loginFormRef" class="login-form" :show-message="false">
            <el-form-item prop="username">
              <el-input 
                v-model="loginForm.username"
                placeholder="请输入手机号或邮箱"
                class="brand-input"
                clearable
                @keyup.enter="handleLogin" />
            </el-form-item>
            
            <el-form-item prop="password">
              <el-input
                v-model="loginForm.password"
                type="password"
                placeholder="请输入密码"
                show-password
                class="brand-input"
                @keyup.enter="handleLogin"
                @input="checkPasswordStrength"
              />
            </el-form-item>
            
            <transition name="error-fade">
              <div v-if="loginError" class="login-error-text">{{ loginError }}</div>
            </transition>
            
            <el-form-item>
              <el-button
                type="primary"
                :loading="loading"
                @click="handleLogin"
                class="submit-btn"
              >
                {{ loading ? '登录中...' : '登录' }}
              </el-button>
            </el-form-item>
          </el-form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useDictionaryStore } from '../../stores/dictionary'
import { ElMessage } from 'element-plus'
import { unifiedStorage } from '@/utils/unifiedStorage'

const systemName = 'ERP 管理系统'
const router = useRouter()
const authStore = useAuthStore()
const loginFormRef = ref(null)
const loading = ref(false)
const loginError = ref('')

const passwordStrength = ref(0)
const strengthText = ref('')
const strengthColor = ref('')

const checkPasswordStrength = () => {
  const password = loginForm.password
  let strength = 0
  
  if (password.length >= 6) strength++
  if (password.length >= 10) strength++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) strength++
  if (/\d/.test(password)) strength++
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++
  
  strength = Math.min(strength, 4)
  passwordStrength.value = strength
  
  const strengthMap = {
    0: { text: '', color: '' },
    1: { text: '弱', color: 'var(--color-danger)' },
    2: { text: '中等', color: 'var(--color-warning)' },
    3: { text: '强', color: 'var(--color-primary)' },
    4: { text: '非常强', color: 'var(--color-success)' }
  }
  
  strengthText.value = strengthMap[strength].text
  strengthColor.value = strengthMap[strength].color
}

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

const loadSavedCredentials = () => {
  try {
    const savedUsername = unifiedStorage.get('saved_username', { defaultValue: '' })
    if (savedUsername) {
      loginForm.username = savedUsername
    }
  } catch (error) {
    console.error('读取保存的登录信息失败:', error)
  }
}

const saveCredentials = () => {
  try {
    // 安全策略：仅保存用户名，绝不在客户端持久化密码
    unifiedStorage.set('saved_username', loginForm.username, { expires: 30 * 24 * 60 * 60 * 1000 })
  } catch (error) {
    console.error('保存登录信息失败:', error)
  }
}

const clearSavedCredentials = () => {
  try {
    unifiedStorage.remove('saved_username')
  } catch (error) {
    console.error('清除保存的登录信息失败:', error)
  }
}

const handleLogin = async () => {
  if (!loginFormRef.value) return

  loginError.value = ''

  try {
    const valid = await loginFormRef.value.validate()
    if (valid) {
      loading.value = true

      try {
        await authStore.login(loginForm)
        
        try {
          const dictStore = useDictionaryStore()
          await dictStore.fetchDictionary()
        } catch (dictErr) {
          console.warn('登录后获取字典失败:', dictErr)
        }

        ElMessage.success({
          message: '登录成功！欢迎回来 🎉',
          type: 'success',
          duration: 2000
        })
        saveCredentials()
        router.push('/')
      } catch (error) {
        console.error('Login error:', error)

        if (error.response) {
          const status = error.response.status
          const message = error.response.data?.message || error.response.data?.error || ''

          switch (status) {
            case 400:
              loginError.value = '请求参数错误'
              break
            case 401:
              loginError.value = '用户名或密码错误'
              break
            case 403:
              loginError.value = '账号已被禁用'
              break
            case 404:
              loginError.value = '登录服务未找到'
              break
            case 500:
              loginError.value = '服务器内部错误'
              break
            default:
              loginError.value = message || '登录失败'
          }
          ElMessage.error(loginError.value)
        } else if (error.request) {
          loginError.value = '网络错误'
          ElMessage.error(loginError.value)
        } else {
          loginError.value = '请求失败'
          ElMessage.error(loginError.value)
        }
      } finally {
        loading.value = false
      }
    }
  } catch (error) {
    console.error('登录处理失败:', error)
    loading.value = false
  }
}

const handleForgotPassword = () => {
  ElMessage.info('请联系管理员重置密码')
}
</script>

<style scoped>
/* 全局充置与变量 */
* {
  box-sizing: border-box;
}

.login-wrapper {
  display: flex;
  min-height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: var(--color-bg-base);
}

/* ================= 左侧：品牌与插画 ================= */
.login-left {
  flex: 1;
  position: relative;
  background: linear-gradient(135deg, #02d1c6 0%, #009689 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.brand {
  position: absolute;
  top: 40px;
  left: 40px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 10;
  color: var(--color-on-primary, #fff);
}

.brand-icon {
  width: 36px;
  height: 36px;
}

.brand-text {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: 1px;
}

/* 抽象插画效果 */
.illustration-container {
  position: relative;
  width: 600px;
  height: 500px;
}

.float-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 480px;
  height: 480px;
  border: 80px solid rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.1);
  animation: floatRing 8s ease-in-out infinite;
}

.float-ring.small {
  width: 150px;
  height: 150px;
  border: 40px solid rgba(255, 255, 255, 0.2);
  top: 85%;
  left: 80%;
  animation: floatRing 6s ease-in-out infinite reverse;
}

.dashboard-panel {
  position: absolute;
  border-radius: 12px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.15);
}

.panel-bg {
  width: 380px;
  height: 250px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  top: 20%;
  left: 10%;
  padding: 16px;
  transform: rotate(-5deg);
  animation: floatPanelBg 7s ease-in-out infinite 1s;
}

.panel-header {
  display: flex;
  gap: 6px;
  margin-bottom: 20px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #E0E0E0;
}
.dot:nth-child(1) { background: #FF5F56; }
.dot:nth-child(2) { background: #FFBD2E; }
.dot:nth-child(3) { background: #27C93F; }

.panel-body .line {
  height: 12px;
  background: #F0F0F0;
  border-radius: 6px;
  margin-bottom: 16px;
}

.chart-area {
  margin-top: 30px;
  height: 80px;
  background: #f8fcfb;
  border-radius: 8px;
  padding: 10px;
}

.panel-fg {
  width: 200px;
  height: 140px;
  background: linear-gradient(135deg, #02d1c6 0%, #00a095 100%);
  bottom: 25%;
  left: 60%;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(5deg);
  animation: floatPanelFg 7s ease-in-out infinite;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.fg-logo {
  width: 60px;
  height: 60px;
}

@keyframes floatRing {
  0%, 100% { transform: translate(-50%, -50%) translateY(0); }
  50% { transform: translate(-50%, -50%) translateY(-20px); }
}

@keyframes floatPanelBg {
  0%, 100% { transform: rotate(-5deg) translateY(0); }
  50% { transform: rotate(-5deg) translateY(-20px); }
}

@keyframes floatPanelFg {
  0%, 100% { transform: rotate(5deg) translateY(0); }
  50% { transform: rotate(5deg) translateY(-20px); }
}

/* ================= 右侧：表单区 ================= */
.login-right {
  flex: 1;
  background: var(--color-bg-base);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.login-form-container {
  width: 100%;
  max-width: 480px;
  padding: 0 40px;
}

.form-header {
  text-align: center;
  margin-bottom: 40px;
}

.form-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #334155;
  margin-bottom: 10px;
}

.form-brand-icon {
  width: 40px;
  height: 40px;
  color: #00A896;
}

.form-brand-text {
  font-size: 32px;
  font-weight: 800;
  letter-spacing: 1px;
}

.form-slogan {
  color: #00A896;
  font-size: 15px;
  letter-spacing: 1px;
  margin: 0;
}

.form-box {
  background: var(--color-bg-base);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.05);
  border: 1px solid #f1f5f9;
  border-radius: 12px;
  padding: 40px;
}

.form-title {
  color: #00A896;
  font-size: 18px;
  font-weight: 600;
  margin-top: 0;
  margin-bottom: 30px;
}

.login-form {
  width: 100%;
}

:deep(.brand-input .el-input__wrapper) {
  box-shadow: 0 0 0 1px #e2e8f0 inset !important;
  border-radius: 4px;
  padding: 0 15px;
  background: var(--color-bg-base);
  transition: all 0.3s;
}

:deep(.brand-input .el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #00A896 inset !important;
}

:deep(.brand-input .el-input__inner) {
  height: 48px;
  font-size: 15px;
}

:deep(.el-form-item) {
  margin-bottom: 24px;
}

.submit-btn {
  width: 100%;
  height: 50px;
  background-color: #00A896;
  border-color: #00A896;
  font-size: 16px;
  font-weight: 500;
  border-radius: 4px;
  margin-top: 10px;
  transition: background-color 0.3s;
}

.submit-btn:hover, .submit-btn:focus {
  background-color: #009686;
  border-color: #009686;
}

.login-error-text {
  color: var(--color-danger);
  font-size: 13px;
  margin-top: -16px;
  margin-bottom: 8px;
  padding-left: 2px;
}

.form-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: -10px;
}

:deep(.el-checkbox__input.is-checked .el-checkbox__inner),
:deep(.el-checkbox__input.is-indeterminate .el-checkbox__inner) {
  background-color: #00A896;
  border-color: #00A896;
}

:deep(.el-checkbox__input.is-checked + .el-checkbox__label) {
  color: #00A896;
}

.forgot-link {
  color: #94a3b8;
  font-size: 14px;
  text-decoration: none;
  transition: color 0.3s;
}

.forgot-link:hover {
  color: #00A896;
}

/* 响应式调整 */
@media screen and (max-width: 1024px) {
  .login-left {
    display: none;
  }
}
</style>
