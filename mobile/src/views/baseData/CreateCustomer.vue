<!--
/**
 * CreateCustomer.vue - 新建客户
 * @description 移动端新建客户表单（与网页端字段对齐）
 * @date 2026-04-20
 * @version 2.0.0
 */
-->
<template>
  <div class="create-page">
    <NavBar title="新建客户" left-arrow @click-left="router.back()">
      <template #right>
        <Button type="primary" size="small" @click="submitForm" :loading="submitting">保存</Button>
      </template>
    </NavBar>

    <div class="content-container">
      <Form @submit="submitForm" ref="formRef">
        <!-- 基本信息 -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-icon">📋</span>基本信息
          </div>
          <Field
            v-model="form.code"
            name="code"
            label="客户编码"
            placeholder="系统自动生成"
            readonly
            right-icon="replay"
            @click-right-icon="generateCode"
          />
          <Field
            v-model="form.name"
            name="name"
            label="客户名称"
            placeholder="请输入客户名称"
            :rules="[{ required: true, message: '请输入客户名称' }]"
          />
          <Field
            v-model="selectedCustomerTypeName"
            name="customer_type"
            label="客户类型"
            placeholder="请选择客户类型"
            readonly
            is-link
            @click="showCustomerTypePicker = true"
          />
          <Field
            v-model="form.short_name"
            name="short_name"
            label="客户简称"
            placeholder="请输入简称（可选）"
          />
          <Field
            v-model="selectedCreditLevelName"
            name="credit_level"
            label="信用等级"
            placeholder="请选择信用等级"
            readonly
            is-link
            @click="showCreditPicker = true"
          />
        </div>

        <!-- 联系信息 -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-icon">📞</span>联系信息
          </div>
          <Field
            v-model="form.contact_person"
            name="contact_person"
            label="联系人"
            placeholder="请输入联系人"
          />
          <Field
            v-model="form.contact_phone"
            name="contact_phone"
            label="联系电话"
            placeholder="请输入联系电话"
            type="tel"
          />
          <Field
            v-model="form.email"
            name="email"
            label="邮箱"
            placeholder="请输入邮箱地址"
          />
          <Field
            v-model="form.fax"
            name="fax"
            label="传真"
            placeholder="请输入传真号码"
          />
        </div>

        <!-- 地址信息 -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-icon">📍</span>地址信息
          </div>
          <Field
            v-model="form.address"
            name="address"
            label="详细地址"
            placeholder="请输入详细地址"
            type="textarea"
            rows="2"
          />
        </div>

        <!-- 财务信息 -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-icon">💰</span>财务信息
          </div>
          <Field
            v-model="form.credit_limit"
            name="credit_limit"
            label="信用额度"
            placeholder="请输入信用额度"
            type="number"
          />
          <Field
            v-model="form.tax_no"
            name="tax_no"
            label="税号"
            placeholder="请输入纳税识别号"
          />
          <Field
            v-model="form.bank_name"
            name="bank_name"
            label="开户银行"
            placeholder="请输入开户银行"
          />
          <Field
            v-model="form.bank_account"
            name="bank_account"
            label="银行账号"
            placeholder="请输入银行账号"
          />
        </div>

        <!-- 备注 -->
        <div class="form-section">
          <div class="section-title">
            <span class="section-icon">📝</span>备注信息
          </div>
          <Field
            v-model="form.remark"
            name="remark"
            label="备注"
            placeholder="请输入备注（可选）"
            type="textarea"
            rows="3"
          />
        </div>

        <!-- 底部安全间距 -->
        <div style="height: 20px;"></div>
      </Form>
    </div>

    <!-- 客户类型选择 -->
    <Popup v-model:show="showCustomerTypePicker" position="bottom" round>
      <Picker :columns="customerTypeColumns" @confirm="onCustomerTypeConfirm" @cancel="showCustomerTypePicker = false" title="选择客户类型" />
    </Popup>

    <!-- 信用等级选择 -->
    <Popup v-model:show="showCreditPicker" position="bottom" round>
      <Picker :columns="creditColumns" @confirm="onCreditConfirm" @cancel="showCreditPicker = false" title="选择信用等级" />
    </Popup>
  </div>
</template>

<script setup>
  import { ref, reactive, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { NavBar, Button, Form, Field, Popup, Picker, showToast, showLoadingToast, closeToast } from 'vant'
  import { baseDataApi } from '@/services/api'

  const router = useRouter()
  const formRef = ref()
  const submitting = ref(false)
  const showCreditPicker = ref(false)
  const showCustomerTypePicker = ref(false)

  // 表单数据 — 与网页端 CustomerFormDialog.vue 字段对齐
  const form = reactive({
    name: '',
    code: '',
    short_name: '',
    customer_type: 'direct',
    credit_level: '',
    contact_person: '',
    contact_phone: '',
    email: '',
    fax: '',
    address: '',
    credit_limit: 0,
    tax_no: '',
    bank_name: '',
    bank_account: '',
    status: 'active',
    remark: ''
  })

  // 选中显示文本
  const selectedCreditLevelName = ref('')
  const selectedCustomerTypeName = ref('直销客户')

  // 客户类型选项 — 与网页端一致
  const customerTypeColumns = [
    { text: '直销客户', value: 'direct' },
    { text: '经销商', value: 'distributor' },
    { text: '零售客户', value: 'retail' }
  ]

  const creditColumns = [
    { text: 'A级 (优质)', value: 'A' },
    { text: 'B级 (良好)', value: 'B' },
    { text: 'C级 (一般)', value: 'C' },
    { text: 'D级 (关注)', value: 'D' }
  ]

  const onCustomerTypeConfirm = ({ selectedOptions }) => {
    const opt = selectedOptions[0]
    if (opt) {
      form.customer_type = opt.value
      selectedCustomerTypeName.value = opt.text
    }
    showCustomerTypePicker.value = false
  }

  const onCreditConfirm = ({ selectedOptions }) => {
    const opt = selectedOptions[0]
    if (opt) {
      form.credit_level = opt.value
      selectedCreditLevelName.value = opt.text
    }
    showCreditPicker.value = false
  }

  const generateCode = () => {
    const d = new Date()
    const s = `${d.getFullYear().toString().slice(-2)}${(d.getMonth()+1).toString().padStart(2,'0')}${d.getDate().toString().padStart(2,'0')}`
    form.code = `CUS${s}${Math.random().toString(36).substr(2,4).toUpperCase()}`
  }

  const submitForm = async () => {
    try {
      await formRef.value?.validate()
      submitting.value = true
      showLoadingToast({ message: '保存中...', forbidClick: true })

      // 构建提交数据，确保字段名与后端一致
      const submitData = {
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

      await baseDataApi.createCustomer(submitData)
      closeToast()
      showToast('客户创建成功')
      router.back()
    } catch (e) {
      closeToast()
      console.error('创建客户失败:', e)
      showToast(e.response?.data?.message || '创建客户失败')
    } finally {
      submitting.value = false
    }
  }

  onMounted(() => generateCode())
</script>

<style lang="scss" scoped>
  .create-page {
    height: 100vh;
    background: var(--bg-primary);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .content-container {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .form-section {
    background: var(--bg-secondary);
    margin-bottom: 12px;

    .section-title {
      padding: 14px 16px;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-primary);
      border-bottom: 1px solid var(--glass-border);
      display: flex;
      align-items: center;
      gap: 6px;

      .section-icon {
        font-size: 1rem;
      }
    }
  }
</style>
