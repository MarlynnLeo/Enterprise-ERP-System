<template>
  <el-dialog
    :title="title"
    :model-value="modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    width="600px"
    @close="handleClose"
  >
    <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
      <el-form-item label="客户编码" prop="code">
        <el-input v-model="form.code" placeholder="请输入客户编码（如：C0001）" :disabled="isEdit">
          <template #append v-if="!isEdit">
            <el-button @click="generateCode">自动生成</el-button>
          </template>
        </el-input>
      </el-form-item>
      <el-form-item label="客户名称" prop="name">
        <el-input v-model="form.name" placeholder="请输入客户名称"></el-input>
      </el-form-item>
      <el-form-item label="客户类型" prop="customer_type">
        <el-select v-model="form.customer_type" placeholder="请选择客户类型" class="w-full">
          <el-option label="直销客户" value="direct"></el-option>
          <el-option label="经销商" value="distributor"></el-option>
          <el-option label="零售客户" value="retail"></el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="联系人" prop="contact_person">
        <el-input v-model="form.contact_person" placeholder="请输入联系人"></el-input>
      </el-form-item>
      <el-form-item label="联系电话" prop="contact_phone">
        <el-input v-model="form.contact_phone" placeholder="请输入联系电话"></el-input>
      </el-form-item>
      <el-form-item label="电子邮箱" prop="email">
        <el-input v-model="form.email" placeholder="请输入电子邮箱"></el-input>
      </el-form-item>
      <el-form-item label="信用额度" prop="credit_limit">
        <el-input-number v-model="form.credit_limit" :min="0" :precision="2" :step="100" placeholder="请输入信用额度"></el-input-number>
      </el-form-item>
      <el-form-item label="地址">
        <el-input v-model="form.address" type="textarea" :rows="2" placeholder="请输入地址"></el-input>
      </el-form-item>
      <el-form-item label="状态">
        <el-radio-group v-model="form.status">
          <el-radio :value="'active'">启用</el-radio>
          <el-radio :value="'inactive'">禁用</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="请输入备注"></el-input>
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">确定</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { baseDataApi } from '@/api/baseData'
import { parsePaginatedData } from '@/utils/responseParser'

const props = defineProps({
  modelValue: Boolean,
  editData: {
    type: Object,
    default: null
  },
  title: {
    type: String,
    default: '新增客户'
  }
})

const emit = defineEmits(['update:modelValue', 'success'])

const formRef = ref(null)
const submitting = ref(false)

// 判断是否编辑模式
const isEdit = ref(false)

const form = reactive({
  id: '',
  code: '',
  name: '',
  customer_type: 'direct',
  contact_person: '',
  contact_phone: '',
  email: '',
  address: '',
  credit_limit: 0,
  status: 'active',
  remark: ''
})

const rules = {
  name: [{ required: true, message: '请输入客户名称', trigger: 'blur' }],
  email: [{ type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' }]
}

// 监听editData变化以初始化表单
watch(() => props.editData, (newVal) => {
  if (newVal) {
    isEdit.value = true
    nextTick(() => {
      Object.assign(form, {
        ...newVal,
        credit_limit: parseFloat(newVal.credit_limit) || 0
      })
    })
  } else {
    isEdit.value = false
  }
}, { immediate: true })

const handleClose = () => {
  emit('update:modelValue', false)
  resetForm()
}

const resetForm = () => {
  if (formRef.value) formRef.value.resetFields()
  form.id = ''
  form.code = ''
  form.name = ''
  form.customer_type = 'direct'
  form.contact_person = ''
  form.contact_phone = ''
  form.email = ''
  form.address = ''
  form.credit_limit = 0
  form.status = 'active'
  form.remark = ''
  isEdit.value = false
}

// 自动生成客户编码
const generateCode = async () => {
  try {
    const now = new Date()
    const year = now.getFullYear().toString().slice(-2)
    const month = (now.getMonth() + 1).toString().padStart(2, '0')
    const prefix = `KH${year}${month}`

    const response = await baseDataApi.getCustomers({ page: 1, pageSize: 1, code: prefix })
    const { total: matchCount } = parsePaginatedData(response, { enableLog: false })

    const newCode = `${prefix}${String(matchCount + 1).padStart(4, '0')}`
    form.code = newCode
    ElMessage.success(`已生成编码: ${newCode}`)
  } catch (error) {
    console.error('生成编码失败:', error)
    ElMessage.error('生成编码失败')
  }
}

// 提交表单
const submitForm = () => {
  formRef.value.validate(async (valid) => {
    if (valid) {
      submitting.value = true
      try {
        const formData = {
          ...form,
          name: form.name.trim(),
          contact_person: form.contact_person ? form.contact_person.trim() : '',
          contact_phone: form.contact_phone ? form.contact_phone.trim() : '',
          email: form.email ? form.email.trim() : '',
          address: form.address ? form.address.trim() : '',
          customer_type: form.customer_type || 'direct',
          credit_limit: parseFloat(form.credit_limit) || 0,
          remark: form.remark ? form.remark.trim() : ''
        }

        if (isEdit.value) {
          await baseDataApi.updateCustomer(form.id, formData)
          ElMessage.success('编辑成功')
        } else {
          await baseDataApi.createCustomer(formData)
          ElMessage.success('新增成功')
        }
        emit('success')
        handleClose()
      } catch (error) {
        console.error('保存客户失败:', error)
        if (error.response?.data?.message) {
          ElMessage.error(`保存失败: ${error.response.data.message}`)
        } else {
          ElMessage.error('保存客户失败')
        }
      } finally {
        submitting.value = false
      }
    }
  })
}
</script>
