<template>
  <AppDialog
    :model-value="modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    :title="title"
    :mode="readonly ? 'view' : 'form'"
    width="600px"
    @close="handleClose"
  >
    <el-descriptions v-if="readonly" :column="2" border>
      <el-descriptions-item label="客户编码">{{ form.code || '-' }}</el-descriptions-item>
      <el-descriptions-item label="客户名称">{{ form.name || '-' }}</el-descriptions-item>
      <el-descriptions-item label="客户类型">{{ customerTypeText }}</el-descriptions-item>
      <el-descriptions-item label="联系人">{{ form.contactPerson || '-' }}</el-descriptions-item>
      <el-descriptions-item label="联系电话">{{ form.contactPhone || '-' }}</el-descriptions-item>
      <el-descriptions-item label="电子邮箱">{{ form.email || '-' }}</el-descriptions-item>
      <el-descriptions-item label="信用额度">{{ form.creditLimit ?? '-' }}</el-descriptions-item>
      <el-descriptions-item label="收款账期">{{ form.paymentTermDays != null ? `${form.paymentTermDays} 天` : '-' }}</el-descriptions-item>
      <el-descriptions-item label="状态">
        <el-tag :type="form.status === 'active' ? 'success' : 'danger'">
          {{ form.status === 'active' ? '启用' : '禁用' }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="地址" :span="2">{{ form.address || '-' }}</el-descriptions-item>
      <el-descriptions-item label="备注" :span="2">{{ form.remark || '-' }}</el-descriptions-item>
    </el-descriptions>
    <el-form v-else :model="form" :rules="rules" ref="formRef" label-width="100px">
      <el-form-item label="客户编码" prop="code">
        <el-input v-model="form.code" placeholder="请输入客户编码（如：C0001）" :disabled="readonly || isEdit">
          <template #append v-if="!isEdit">
            <el-button @click="generateCode">自动生成</el-button>
          </template>
        </el-input>
      </el-form-item>
      <el-form-item label="客户名称" prop="name">
        <el-input v-model="form.name" placeholder="请输入客户名称"></el-input>
      </el-form-item>
      <el-form-item label="客户类型" prop="customerType">
        <el-select v-model="form.customerType" placeholder="请选择客户类型" class="w-full">
          <el-option label="直销客户" value="direct"></el-option>
          <el-option label="经销商" value="distributor"></el-option>
          <el-option label="零售客户" value="retail"></el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="联系人" prop="contactPerson">
        <el-input v-model="form.contactPerson" placeholder="请输入联系人"></el-input>
      </el-form-item>
      <el-form-item label="联系电话" prop="contactPhone">
        <el-input v-model="form.contactPhone" placeholder="请输入联系电话"></el-input>
      </el-form-item>
      <el-form-item label="电子邮箱" prop="email">
        <el-input v-model="form.email" placeholder="请输入电子邮箱"></el-input>
      </el-form-item>
      <el-form-item label="信用额度" prop="creditLimit">
        <el-input-number v-model="form.creditLimit" :min="0" :precision="2" :step="100" placeholder="请输入信用额度"></el-input-number>
      </el-form-item>
      <el-form-item label="收款账期(天)" prop="paymentTermDays">
        <el-input-number
          v-model="form.paymentTermDays"
          :min="0"
          :max="3650"
          :step="1"
          controls-position="right"
          class="w-full"
          placeholder="默认 30 天"
        />
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
        <el-button @click="handleClose">{{ readonly ? '关闭' : '取消' }}</el-button>
        <el-button v-if="!readonly" type="primary" @click="submitForm" :loading="submitting">确定</el-button>
      </span>
    </template>
    </AppDialog>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'
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
  },
  readonly: {
    type: Boolean,
    default: false
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
  customerType: 'direct',
  contactPerson: '',
  contactPhone: '',
  email: '',
  address: '',
  creditLimit: 0,
  paymentTermDays: 30,
  status: 'active',
  remark: ''
})

const customerTypeText = computed(() => {
  const map = { direct: '直销客户', distributor: '经销商', retail: '零售客户' }
  return map[form.customerType] || form.customerType || '-'
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
        id: newVal.id || '',
        code: newVal.code || '',
        name: newVal.name || '',
        customerType: newVal.customerType || 'direct',
        contactPerson: newVal.contactPerson || '',
        contactPhone: newVal.contactPhone || '',
        email: newVal.email || '',
        address: newVal.address || '',
        creditLimit: parseFloat(newVal.creditLimit) || 0,
        paymentTermDays:
          newVal.paymentTermDays != null && newVal.paymentTermDays !== ''
            ? Number(newVal.paymentTermDays)
            : 30,
        status: newVal.status || 'active',
        remark: newVal.remark || ''
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
  form.customerType = 'direct'
  form.contactPerson = ''
  form.contactPhone = ''
  form.email = ''
  form.address = ''
  form.creditLimit = 0
  form.paymentTermDays = 30
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
        // HTTP body camelCase（camelOut 边界自动 mapKeysToSnake）
        const formData = {
          code: form.code,
          name: form.name.trim(),
          contactPerson: form.contactPerson ? form.contactPerson.trim() : '',
          contactPhone: form.contactPhone ? form.contactPhone.trim() : '',
          email: form.email ? form.email.trim() : '',
          address: form.address ? form.address.trim() : '',
          customerType: form.customerType || 'direct',
          creditLimit: parseFloat(form.creditLimit) || 0,
          paymentTermDays:
            form.paymentTermDays != null && form.paymentTermDays !== ''
              ? Number(form.paymentTermDays)
              : 30,
          status: form.status || 'active',
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
