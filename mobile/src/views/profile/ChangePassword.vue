<!--
/**
 * ChangePassword.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="unified-page">
    <NavBar title="修改密码" left-arrow @click-left="$router.back()" />

    <div class="content-container">
      <!-- 密码修改表单 -->
      <Form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <Field
          v-model="form.currentPassword"
          name="currentPassword"
          label="当前密码"
          type="password"
          placeholder="请输入当前密码"
          :rules="rules.currentPassword"
        />
        <Field
          v-model="form.newPassword"
          name="newPassword"
          label="新密码"
          type="password"
          placeholder="请输入新密码"
          :rules="rules.newPassword"
        />
        <Field
          v-model="form.confirmPassword"
          name="confirmPassword"
          label="确认密码"
          type="password"
          placeholder="请再次输入新密码"
          :rules="rules.confirmPassword"
        />
      </Form>

      <!-- 密码强度提示 -->
      <div class="password-tips">
        <div class="tips-title">密码要求：</div>
        <div class="tips-list">
          <div class="tip-item" :class="{ active: hasMinLength }">
            <Icon
              :name="hasMinLength ? 'success' : 'info-o'"
              :color="hasMinLength ? '#07c160' : '#969799'"
            />
            <span>至少8个字符</span>
          </div>
          <div class="tip-item" :class="{ active: hasUpperCase }">
            <Icon
              :name="hasUpperCase ? 'success' : 'info-o'"
              :color="hasUpperCase ? '#07c160' : '#969799'"
            />
            <span>包含大写字母</span>
          </div>
          <div class="tip-item" :class="{ active: hasLowerCase }">
            <Icon
              :name="hasLowerCase ? 'success' : 'info-o'"
              :color="hasLowerCase ? '#07c160' : '#969799'"
            />
            <span>包含小写字母</span>
          </div>
          <div class="tip-item" :class="{ active: hasNumber }">
            <Icon
              :name="hasNumber ? 'success' : 'info-o'"
              :color="hasNumber ? '#07c160' : '#969799'"
            />
            <span>包含数字</span>
          </div>
          <div class="tip-item" :class="{ active: hasSpecialChar }">
            <Icon
              :name="hasSpecialChar ? 'success' : 'info-o'"
              :color="hasSpecialChar ? '#07c160' : '#969799'"
            />
            <span>包含特殊字符</span>
          </div>
        </div>
      </div>

      <!-- 保存按钮 -->
      <div class="action-buttons">
        <Button type="primary" block @click="handleSave" :loading="saving"> 修改密码 </Button>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, reactive, computed } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    NavBar,
    Icon,
    Field,
    Form,
    Button,
    showToast,
    showLoadingToast,
    showConfirmDialog
  } from 'vant'
  import { useAuthStore } from '../../stores/auth'

  const router = useRouter()
  const authStore = useAuthStore()
  const formRef = ref(null)
  const saving = ref(false)

  // 表单数据
  const form = reactive({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  // 密码强度检查
  const hasMinLength = computed(() => form.newPassword.length >= 8)
  const hasUpperCase = computed(() => /[A-Z]/.test(form.newPassword))
  const hasLowerCase = computed(() => /[a-z]/.test(form.newPassword))
  const hasNumber = computed(() => /\d/.test(form.newPassword))
  const hasSpecialChar = computed(() => /[@$!%*?&]/.test(form.newPassword))

  // 验证规则
  const rules = {
    currentPassword: [{ required: true, message: '请输入当前密码' }],
    newPassword: [
      { required: true, message: '请输入新密码' },
      { min: 8, message: '密码长度不能少于8个字符' },
      {
        validator: (value) => {
          const hasUpper = /[A-Z]/.test(value)
          const hasLower = /[a-z]/.test(value)
          const hasNum = /\d/.test(value)
          const hasSpecial = /[@$!%*?&]/.test(value)
          return hasUpper && hasLower && hasNum && hasSpecial
        },
        message: '密码必须包含大小写字母、数字和特殊字符'
      }
    ],
    confirmPassword: [
      { required: true, message: '请确认新密码' },
      {
        validator: (value) => value === form.newPassword,
        message: '两次输入的密码不一致'
      }
    ]
  }

  // 保存修改
  const handleSave = async () => {
    try {
      // 表单验证
      await formRef.value.validate()

      // 确认对话框
      await showConfirmDialog({
        title: '确认修改',
        message: '确定要修改密码吗？修改后需要重新登录。'
      })

      saving.value = true
      const loadingToast = showLoadingToast({
        message: '修改中...',
        forbidClick: true
      })

      // 这里应该调用修改密码的API
      // await userApi.changePassword({
      //   currentPassword: form.currentPassword,
      //   newPassword: form.newPassword
      // });

      // 模拟API调用
      await new Promise((resolve) => setTimeout(resolve, 2000))

      loadingToast.close()
      showToast('密码修改成功，请重新登录')

      // 清除登录状态并跳转到登录页
      authStore.logout()
      router.replace('/login')
    } catch (error) {
      if (error === 'cancel') {
        // 用户取消
        return
      }
      console.error('修改密码失败:', error)
      showToast('修改失败，请重试')
    } finally {
      saving.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .unified-page {
    min-height: 100vh;
    background-color: var(--bg-primary);
  }

  .content-container {
    padding-top: 46px;
    padding-bottom: 20px;
  }

  .password-tips {
    margin: 20px;
    padding: 16px;
    background: var(--bg-secondary);
    border-radius: 8px;

    .tips-title {
      font-size: 1rem;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 12px;
    }

    .tips-list {
      .tip-item {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
        font-size: 0.875rem;
        color: var(--text-secondary);

        &.active {
          color: var(--color-success);
        }

        .van-icon {
          margin-right: 8px;
          font-size: 1rem;
        }

        &:last-child {
          margin-bottom: 0;
        }
      }
    }
  }

  .action-buttons {
    padding: 20px;
  }

  :deep(.van-cell) {
    background: var(--bg-secondary);
    margin-bottom: 1px;
  }

  :deep(.van-field__label) {
    width: 100px;
    color: var(--text-primary);
    font-weight: 500;
  }
</style>
