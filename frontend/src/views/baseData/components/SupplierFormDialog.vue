<template>
  <el-dialog
    :title="title"
    :model-value="modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    width="600px"
    @close="handleClose"
  >
    <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
      <el-form-item label="供应商编码" prop="code">
        <el-input v-model="form.code" placeholder="请输入供应商编码"></el-input>
      </el-form-item>
      <el-form-item label="供应商名称" prop="name">
        <el-input v-model="form.name" placeholder="请输入供应商名称"></el-input>
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
      <el-form-item label="地址">
        <el-input v-model="form.address" type="textarea" :rows="2" placeholder="请输入地址"></el-input>
      </el-form-item>
      <el-form-item label="付款账期(天)" prop="payment_term_days">
        <el-input-number
          v-model="form.payment_term_days"
          :min="0"
          :max="3650"
          :step="1"
          controls-position="right"
          class="w-full"
          placeholder="默认 30 天"
        />
      </el-form-item>
      <el-form-item label="状态">
        <el-radio-group v-model="form.status">
          <el-radio :value="1">启用</el-radio>
          <el-radio :value="0">禁用</el-radio>
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
import { supplierApi } from '@/api/supplier'

const props = defineProps({
  modelValue: Boolean,
  editData: {
    type: Object,
    default: null
  },
  title: {
    type: String,
    default: '新增供应商'
  }
})

const emit = defineEmits(['update:modelValue', 'success'])

const formRef = ref(null)
const submitting = ref(false)
const isEdit = ref(false)

const form = reactive({
  id: '',
  code: '',
  name: '',
  contact_person: '',
  contact_phone: '',
  email: '',
  address: '',
  payment_term_days: 30,
  status: 1,
  remark: ''
})

const rules = {
  code: [{ required: true, message: '请输入供应商编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入供应商名称', trigger: 'blur' }],
  contact_person: [{ required: true, message: '请输入联系人', trigger: 'blur' }],
  contact_phone: [{ required: true, message: '请输入联系电话', trigger: 'blur' }],
  email: [{ type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' }]
}

// 监听editData变化以初始化表单
watch(() => props.editData, (newVal) => {
  if (newVal) {
    isEdit.value = true
    nextTick(() => {
      // 标准化字段名称（兼容不同API返回格式）
      Object.assign(form, {
        id: newVal.id,
        code: newVal.code || newVal.supplier_code || '',
        name: newVal.name || newVal.supplier_name || '',
        contact_person: newVal.contact_person || newVal.contact || '',
        contact_phone: newVal.contact_phone || newVal.phone || '',
        email: newVal.email || '',
        address: newVal.address || '',
        payment_term_days:
          newVal.payment_term_days != null && newVal.payment_term_days !== ''
            ? Number(newVal.payment_term_days)
            : 30,
        status: newVal.status !== undefined ? Number(newVal.status) : 1,
        remark: newVal.remark || newVal.remarks || ''
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
  form.contact_person = ''
  form.contact_phone = ''
  form.email = ''
  form.address = ''
  form.payment_term_days = 30
  form.status = 1
  form.remark = ''
  isEdit.value = false
}

// 提交表单
const submitForm = () => {
  formRef.value.validate(async (valid) => {
    if (valid) {
      submitting.value = true
      try {
        // 只保留数据库中存在的字段
        const cleanData = {
          code: form.code,
          name: form.name,
          contact_person: form.contact_person,
          contact_phone: form.contact_phone,
          email: form.email,
          address: form.address,
          payment_term_days:
            form.payment_term_days != null && form.payment_term_days !== ''
              ? Number(form.payment_term_days)
              : 30,
          status: form.status !== undefined ? Number(form.status) : 1,
          remark: form.remark
        }

        if (isEdit.value) {
          await supplierApi.updateSupplier(form.id, cleanData)
          ElMessage.success('编辑成功')
        } else {
          await supplierApi.createSupplier(cleanData)
          ElMessage.success('新增成功')
        }
        emit('success')
        handleClose()
      } catch (error) {
        console.error('保存供应商失败:', error)
        ElMessage.error(error.response?.data?.message || '保存供应商失败')
      } finally {
        submitting.value = false
      }
    }
  })
}
</script>
