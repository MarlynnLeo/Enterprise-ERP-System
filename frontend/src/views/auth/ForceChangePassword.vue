<template>
  <div class="force-password-page">
    <section class="force-card">
      <h2>首次登录请修改密码</h2>
      <p>当前使用的是初始密码，请先修改后再进入系统。</p>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="96px" @submit.prevent>
        <el-form-item label="当前密码" prop="currentPassword">
          <el-input v-model="form.currentPassword" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="form.newPassword" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="form.confirmPassword" type="password" show-password autocomplete="new-password" />
        </el-form-item>

        <el-button type="primary" class="submit-btn" :loading="submitting" @click="submit">
          确认修改并重新登录
        </el-button>
      </el-form>
    </section>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { userApi } from '@/api/user'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const formRef = ref(null)
const submitting = ref(false)
const form = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const rules = {
  currentPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [{ required: true, message: '请输入新密码', trigger: 'blur' }],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== form.newPassword) callback(new Error('两次输入的密码不一致'))
        else callback()
      },
      trigger: 'blur'
    }
  ]
}

const submit = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    submitting.value = true
    try {
      await userApi.changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword
      })
      ElMessage.success('密码已修改，请使用新密码重新登录')
      await authStore.logout()
      router.replace('/login')
    } catch (error) {
      ElMessage.error(error.response?.data?.message || error.message || '修改密码失败')
    } finally {
      submitting.value = false
    }
  })
}
</script>

<style scoped>
.force-password-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--el-bg-color-page, #f5f7fa);
}
.force-card {
  width: 100%;
  max-width: 460px;
  padding: 32px 28px;
  border-radius: 16px;
  background: var(--el-bg-color, #fff);
  box-shadow: 0 12px 40px rgb(0 0 0 / 8%);
}
.force-card h2 {
  margin: 0 0 8px;
  font-size: 22px;
}
.force-card p {
  margin: 0 0 24px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
.password-rules {
  margin: 0 0 20px;
  padding-left: 18px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.7;
}
.submit-btn {
  width: 100%;
}
</style>
