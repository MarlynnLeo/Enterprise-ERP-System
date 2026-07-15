<template>
  <div>
    <!-- 基本信息 -->
    <div v-show="activeTab === 'basic'">
      <el-card class="profile-card info-card" shadow="hover" :class="{'editing-mode': isEditing}">
        <template #header>
          <div class="card-header">
            <div class="header-left">
              <el-icon class="header-icon header-icon--primary"><User /></el-icon>
              <span class="header-title">个人信息</span>
            </div>
            <div class="header-actions">
              <el-badge v-if="isEditing" value="编辑中" type="primary">
                <el-button type="primary" size="small" @click="saveProfile">
                  <el-icon><Check /></el-icon> 保存
                </el-button>
              </el-badge>
              <el-button v-if="isEditing" size="small" @click="cancelEditing">
                <el-icon><Close /></el-icon> 取消
              </el-button>
              <el-button v-if="!isEditing" type="primary" size="small" @click="startEditing">
                <el-icon><Edit /></el-icon> 编辑资料
              </el-button>
            </div>
          </div>
        </template>

        <el-form :model="localUserForm" :rules="rules" ref="userFormRef" label-width="100px" :disabled="!isEditing">
          <div class="form-section">
            <div class="section-title">
              <el-icon><User /></el-icon>
              基本资料
            </div>
            <el-row :gutter="20">
              <el-col :xs="24" :sm="12">
                <el-form-item label="姓名" prop="name">
                  <el-input :model-value="localUserForm.name" placeholder="请输入姓名" :prefix-icon="User" @update:model-value="updateUserFormField('name', $event)" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12">
                <el-form-item label="邮箱" prop="email">
                  <el-input :model-value="localUserForm.email" placeholder="请输入邮箱" :prefix-icon="Message" @update:model-value="updateUserFormField('email', $event)" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="20">
              <el-col :xs="24" :sm="12">
                <el-form-item label="手机号" prop="phone">
                  <el-input :model-value="localUserForm.phone" placeholder="请输入手机号" :prefix-icon="Phone" @update:model-value="updateUserFormField('phone', $event)" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12">
                <el-form-item label="角色">
                  <el-input :model-value="localUserForm.role" disabled :prefix-icon="Briefcase" />
                </el-form-item>
              </el-col>
            </el-row>
          </div>

          <el-divider />

          <div class="form-section">
            <div class="section-title">
              <el-icon><Location /></el-icon>
              其他信息
            </div>
            <el-form-item label="所在地区">
              <el-cascader
                :model-value="localUserForm.location"
                :options="locationOptions"
                placeholder="选择所在地区"
                class="full-width-control"
                @update:model-value="updateUserFormField('location', $event)"
              />
            </el-form-item>

            <el-form-item label="个人简介">
              <el-input
                :model-value="localUserForm.bio"
                type="textarea"
                :rows="4"
                placeholder="介绍一下自己..."
                maxlength="200"
                show-word-limit
                @update:model-value="updateUserFormField('bio', $event)"
              />
            </el-form-item>
          </div>
        </el-form>
      </el-card>
    </div>
    <!-- 密码修改 -->
    <div v-show="activeTab === 'password'">
      <el-card class="profile-card password-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <div class="header-left">
              <el-icon class="header-icon header-icon--danger"><Lock /></el-icon>
              <span class="header-title">修改密码</span>
            </div>
          </div>
        </template>

        <el-alert
          title="安全提示"
          type="info"
          :closable="false"
          show-icon
        >
          <template #default>
            <ul class="security-tips">
              <li>密码长度至少8位字符</li>
              <li>建议包含大小写字母、数字和特殊字符</li>
              <li>定期更换密码可以提高账户安全性</li>
            </ul>
          </template>
        </el-alert>

        <el-form :model="passwordForm" :rules="passwordRules" ref="passwordFormRef" label-width="120px" class="password-form">
          <el-form-item label="当前密码" prop="currentPassword">
            <el-input
              v-model="passwordForm.currentPassword"
              type="password"
              show-password
              placeholder="请输入当前密码"
              :prefix-icon="Lock"
            />
          </el-form-item>

          <el-form-item label="新密码" prop="newPassword">
            <el-input
              v-model="passwordForm.newPassword"
              type="password"
              show-password
              placeholder="请输入新密码（至少8位）"
              :prefix-icon="Lock"
              @input="checkStrength"
            />
            <div v-if="passwordStrength > 0" class="password-strength">
              <div class="strength-label">密码强度:</div>
              <el-progress
                :percentage="passwordStrength"
                :color="passwordStrengthColor"
                :show-text="false"
              />
              <span class="strength-text" :class="passwordStrengthClass">
                {{ passwordStrengthText }}
              </span>
            </div>
          </el-form-item>

          <el-form-item label="确认新密码" prop="confirmPassword">
            <el-input
              v-model="passwordForm.confirmPassword"
              type="password"
              show-password
              placeholder="请再次输入新密码"
              :prefix-icon="Lock"
            />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" @click="submitPasswordChange" :loading="passwordChanging">
              <el-icon><Check /></el-icon> 更新密码
            </el-button>
            <el-button @click="resetPasswordForm">
              <el-icon><RefreshRight /></el-icon> 重置
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>
  </div>
</template>
<script setup>
import { ref, reactive, watch } from 'vue'
import {
  User, Check, Close, Edit, Location,
  Lock, RefreshRight, Message, Phone, Briefcase
} from '@element-plus/icons-vue'
const props = defineProps({
  activeTab: String,
  userForm: Object,
  locationOptions: Array,
  isEditing: Boolean
})
const emit = defineEmits([
  'start-editing', 'cancel-editing', 'save-profile',
  'update:userForm', 'change-password'
])
const userFormRef = ref(null)
const passwordFormRef = ref(null)
const passwordChanging = ref(false)
const localUserForm = reactive({})

watch(
  () => props.userForm,
  (value) => {
    Object.keys(localUserForm).forEach((key) => {
      if (!value || !(key in value)) {
        delete localUserForm[key]
      }
    })
    Object.assign(localUserForm, value || {})
  },
  { immediate: true }
)

const updateUserFormField = (field, value) => {
  localUserForm[field] = value
  emit('update:userForm', { ...localUserForm })
}
// 密码表单
const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})
// 密码强度（颜色给 el-progress API；文案用语义 class）
const passwordStrength = ref(0)
const passwordStrengthText = ref('')
const passwordStrengthColor = ref('')
const passwordStrengthClass = ref('')
const rules = {
  name: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 20, message: '长度在 2 到 20 个字符', trigger: 'blur' }
  ],
  email: [
    { required: true, message: '请输入邮箱地址', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱地址', trigger: ['blur', 'change'] }
  ],
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号', trigger: 'blur' }
  ]
}
const passwordRules = {
  currentPassword: [
    { required: true, message: '请输入当前密码', trigger: 'blur' }
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '密码长度不能少于8个字符', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}
const startEditing = () => emit('start-editing')
const cancelEditing = () => emit('cancel-editing')
const saveProfile = async () => {
  if (!userFormRef.value) return
  await userFormRef.value.validate((valid) => {
    if (valid) {
      emit('update:userForm', { ...localUserForm })
      emit('save-profile')
    }
  })
}
const checkStrength = (value) => {
  if (!value) {
    passwordStrength.value = 0
    return
  }

  let score = 0
  if (value.length >= 8) score += 30
  if (/[A-Z]/.test(value)) score += 20
  if (/[a-z]/.test(value)) score += 20
  if (/[0-9]/.test(value)) score += 15
  if (/[^A-Za-z0-9]/.test(value)) score += 15

  passwordStrength.value = Math.min(score, 100)

  if (score < 60) {
    passwordStrengthText.value = '弱'
    passwordStrengthColor.value = 'var(--color-danger)'
    passwordStrengthClass.value = 'strength-weak'
  } else if (score < 80) {
    passwordStrengthText.value = '中'
    passwordStrengthColor.value = 'var(--color-warning)'
    passwordStrengthClass.value = 'strength-medium'
  } else {
    passwordStrengthText.value = '强'
    passwordStrengthColor.value = 'var(--color-success)'
    passwordStrengthClass.value = 'strength-strong'
  }
}
const submitPasswordChange = async () => {
  if (!passwordFormRef.value) return
  await passwordFormRef.value.validate(async (valid) => {
    if (valid) {
      passwordChanging.value = true
      try {
        emit('change-password', { ...passwordForm }, () => {
          passwordChanging.value = false
          resetPasswordForm()
        })
      } catch {
        passwordChanging.value = false
      }
    }
  })
}
const resetPasswordForm = () => {
  if (passwordFormRef.value) {
    passwordFormRef.value.resetFields()
    passwordStrength.value = 0
  }
}
</script>
<style scoped>
.profile-card {
  border-radius: var(--radius-md);
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-lighter);
  box-shadow: var(--shadow-sm);
}

.profile-card :deep(.el-card__header) {
  padding: 16px 18px;
}

.profile-card :deep(.el-card__body) {
  padding: 22px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.header-icon {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  border-radius: 50%;
  box-sizing: border-box;
  background: var(--color-primary);
  color: var(--color-on-primary);
  border: none;
}

.header-icon--primary {
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.header-icon--danger {
  background: var(--color-danger);
  color: var(--color-on-primary);
}
.header-title {
  font-size: 16px;
  font-weight: 800;
  color: var(--color-text-primary);
}
.header-actions {
  display: flex;
  gap: 12px;
}
.form-section {
  margin-bottom: 24px;
  padding: 18px;
  border: 1px solid var(--color-border-lighter);
  border-radius: var(--radius-md);
  background: var(--color-bg-hover);
}
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 18px;
}

.section-title .el-icon {
  color: var(--color-primary);
}
.editing-mode {
  border-color: var(--color-primary-light-5);
  box-shadow: var(--shadow-sm);
}
.password-strength {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
}

.strength-label {
  color: var(--color-text-secondary);
}
.strength-text {
  font-weight: 600;
}
.security-tips {
  padding-left: 20px;
  margin: 0;
  line-height: 1.8;
  font-size: 13px;
}

.password-card :deep(.el-alert) {
  border-radius: var(--radius-md);
  margin-bottom: 20px;
}

.password-form {
  padding: 18px;
  border: 1px solid var(--color-border-lighter);
  border-radius: var(--radius-md);
  background: var(--color-bg-hover);
}

@media (max-width: 768px) {
  .profile-card :deep(.el-card__body) {
    padding: 16px;
  }

  .card-header,
  .header-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .header-actions {
    width: 100%;
    gap: 8px;
  }

  .header-actions :deep(.el-button) {
    width: 100%;
    margin-left: 0;
  }

  .form-section,
  .password-form {
    padding: 14px;
  }
}
</style>
