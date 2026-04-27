<!--
/**
 * EditProfile.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="unified-page">
    <NavBar title="编辑资料" left-arrow @click-left="$router.back()" />

    <div class="content-container">
      <!-- 头像编辑 -->
      <div class="avatar-section">
        <div class="avatar-container" @click="handleAvatarClick">
          <img v-if="form.avatar" :src="form.avatar" alt="用户头像" class="avatar-img" />
          <Icon v-else name="user-o" size="40" color="var(--text-tertiary)" />
          <div class="avatar-overlay">
            <Icon name="camera-o" size="20" color="#fff" />
          </div>
        </div>
        <div class="avatar-hint">点击更换头像</div>
      </div>

      <!-- 表单 -->
      <Form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <Field
          v-model="form.name"
          name="name"
          label="姓名"
          placeholder="请输入姓名"
          :rules="rules.name"
        />
        <Field
          v-model="form.email"
          name="email"
          label="邮箱"
          placeholder="请输入邮箱"
          :rules="rules.email"
        />
        <Field
          v-model="form.phone"
          name="phone"
          label="手机号"
          placeholder="请输入手机号"
          :rules="rules.phone"
        />
        <Field
          v-model="form.department_name"
          name="department"
          label="部门"
          placeholder="部门信息"
          readonly
        />
      </Form>

      <!-- 保存按钮 -->
      <div class="action-buttons">
        <Button type="primary" block @click="handleSave" :loading="saving"> 保存修改 </Button>
      </div>
    </div>

    <!-- 头像上传 -->
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      style="display: none"
      @change="handleFileChange"
    />
  </div>
</template>

<script setup>
  import { ref, reactive, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { NavBar, Icon, Field, Form, Button, showToast, showLoadingToast } from 'vant'
  import { useAuthStore } from '@/stores/auth'

  const router = useRouter()
  const authStore = useAuthStore()
  const formRef = ref(null)
  const fileInput = ref(null)
  const saving = ref(false)

  // 表单数据
  const form = reactive({
    name: '',
    email: '',
    phone: '',
    department_name: '',
    avatar: ''
  })

  // 验证规则
  const rules = {
    name: [
      { required: true, message: '请输入姓名' },
      { min: 2, max: 20, message: '姓名长度为2-20个字符' }
    ],
    email: [
      { required: true, message: '请输入邮箱' },
      { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '请输入正确的邮箱格式' }
    ],
    phone: [
      { required: true, message: '请输入手机号' },
      { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }
    ]
  }

  // 初始化数据
  onMounted(() => {
    const userInfo = authStore.user
    if (userInfo) {
      form.name = userInfo.real_name || userInfo.name || ''
      form.email = userInfo.email || ''
      form.phone = userInfo.phone || ''
      form.department_name = userInfo.department_name || ''
      form.avatar = userInfo.avatar || ''
    }
  })

  // 头像点击
  const handleAvatarClick = () => {
    fileInput.value.click()
  }

  // 文件选择
  const handleFileChange = (event) => {
    const file = event.target.files[0]
    if (!file) return

    // 检查文件类型
    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件')
      return
    }

    // 检查文件大小（2MB）
    if (file.size > 2 * 1024 * 1024) {
      showToast('图片大小不能超过2MB')
      return
    }

    // 读取文件并预览
    const reader = new FileReader()
    reader.onload = (e) => {
      form.avatar = e.target.result
    }
    reader.readAsDataURL(file)
  }

  // 保存修改
  const handleSave = async () => {
    try {
      // 表单验证
      await formRef.value.validate()

      saving.value = true
      const loadingToast = showLoadingToast({
        message: '保存中...',
        forbidClick: true
      })

      // 调用更新接口
      await authStore.updateProfile({
        name: form.name,
        email: form.email,
        phone: form.phone,
        avatar: form.avatar
      })

      loadingToast.close()
      showToast('保存成功')
      router.back()
    } catch (error) {
      console.error('保存失败:', error)
      showToast('保存失败，请重试')
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

  .avatar-section {
    text-align: center;
    padding: 30px 20px;
    background: var(--bg-secondary);
    margin-bottom: 10px;

    .avatar-container {
      position: relative;
      display: inline-block;
      width: 80px;
      height: 80px;
      border-radius: 50%;
      overflow: hidden;
      background-color: var(--bg-secondary);
      cursor: pointer;

      .avatar-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .avatar-overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 24px;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
      }
    }

    .avatar-hint {
      margin-top: 10px;
      font-size: 0.875rem;
      color: var(--text-secondary);
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
    width: 80px;
    color: var(--text-primary);
    font-weight: 500;
  }
</style>
