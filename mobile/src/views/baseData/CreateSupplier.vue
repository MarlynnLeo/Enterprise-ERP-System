<!--
/**
 * CreateSupplier.vue - 新建供应商
 * @description 移动端新建供应商表单
 * @date 2026-04-18
 * @version 1.0.0
 */
-->
<template>
  <div class="create-page">
    <NavBar title="新建供应商" left-arrow @click-left="router.back()">
      <template #right>
        <Button type="primary" size="small" @click="submitForm" :loading="submitting">保存</Button>
      </template>
    </NavBar>

    <div class="content-container">
      <Form @submit="submitForm" ref="formRef">
        <!-- 基本信息 -->
        <div class="form-section">
          <div class="section-title">基本信息</div>
          <Field v-model="form.name" name="name" label="供应商名称" placeholder="请输入供应商名称" :rules="[{ required: true, message: '请输入供应商名称' }]" />
          <Field v-model="form.code" name="code" label="供应商编码" placeholder="系统自动生成" readonly right-icon="refresh" @click-right-icon="generateCode" />
          <Field v-model="form.short_name" name="short_name" label="供应商简称" placeholder="请输入简称（可选）" />
          <Field v-model="form.rating" name="rating" label="供应商评级" placeholder="请选择评级" readonly is-link @click="showRatingPicker = true" />
        </div>

        <!-- 联系信息 -->
        <div class="form-section">
          <div class="section-title">联系信息</div>
          <Field v-model="form.contact_person" name="contact_person" label="联系人" placeholder="请输入联系人" :rules="[{ required: true, message: '请输入联系人' }]" />
          <Field v-model="form.contact_phone" name="contact_phone" label="联系电话" placeholder="请输入联系电话" type="tel" />
          <Field v-model="form.email" name="email" label="邮箱" placeholder="请输入邮箱地址" />
          <Field v-model="form.fax" name="fax" label="传真" placeholder="请输入传真号码" />
        </div>

        <!-- 地址信息 -->
        <div class="form-section">
          <div class="section-title">地址信息</div>
          <Field v-model="form.address" name="address" label="详细地址" placeholder="请输入详细地址" type="textarea" rows="2" />
        </div>

        <!-- 财务信息 -->
        <div class="form-section">
          <div class="section-title">财务信息</div>
          <Field v-model="form.tax_no" name="tax_no" label="税号" placeholder="请输入纳税识别号" />
          <Field v-model="form.bank_name" name="bank_name" label="开户银行" placeholder="请输入开户银行" />
          <Field v-model="form.bank_account" name="bank_account" label="银行账号" placeholder="请输入银行账号" />
          <Field v-model="form.payment_terms" name="payment_terms" label="付款条件" placeholder="请输入付款条件" />
        </div>

        <!-- 经营信息 -->
        <div class="form-section">
          <div class="section-title">经营信息</div>
          <Field v-model="form.business_scope" name="business_scope" label="经营范围" placeholder="请输入主要经营范围" type="textarea" rows="2" />
          <Field v-model="form.remark" name="remark" label="备注" placeholder="请输入备注（可选）" type="textarea" rows="3" />
        </div>
      </Form>
    </div>

    <!-- 评级选择 -->
    <Popup v-model:show="showRatingPicker" position="bottom" round>
      <Picker :columns="ratingColumns" @confirm="onRatingConfirm" @cancel="showRatingPicker = false" title="选择评级" />
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
  const showRatingPicker = ref(false)

  const form = reactive({
    name: '', code: '', short_name: '', rating: '',
    contact_person: '', contact_phone: '', email: '', fax: '',
    address: '', tax_no: '', bank_name: '', bank_account: '', payment_terms: '',
    business_scope: '', status: 1, remark: ''
  })

  const ratingColumns = [
    { text: '战略供应商', value: 'strategic' },
    { text: '优选供应商', value: 'preferred' },
    { text: '合格供应商', value: 'qualified' },
    { text: '观察供应商', value: 'probation' }
  ]

  const onRatingConfirm = ({ selectedOptions }) => {
    const opt = selectedOptions[0]
    if (opt) form.rating = opt.text
    showRatingPicker.value = false
  }

  const generateCode = () => {
    const d = new Date()
    const s = `${d.getFullYear().toString().slice(-2)}${(d.getMonth()+1).toString().padStart(2,'0')}${d.getDate().toString().padStart(2,'0')}`
    form.code = `SUP${s}${Math.random().toString(36).substr(2,4).toUpperCase()}`
  }

  const submitForm = async () => {
    try {
      await formRef.value?.validate()
      submitting.value = true
      showLoadingToast({ message: '保存中...', forbidClick: true })
      await baseDataApi.createSupplier(form)
      closeToast()
      showToast('供应商创建成功')
      router.back()
    } catch (e) {
      closeToast()
      console.error('创建供应商失败:', e)
      showToast(e.response?.data?.message || '创建供应商失败')
    } finally {
      submitting.value = false
    }
  }

  onMounted(() => generateCode())
</script>

<style lang="scss" scoped>
  .create-page { height: 100vh; background: var(--bg-primary); display: flex; flex-direction: column; overflow: hidden; }
  .content-container { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .form-section { background: var(--bg-secondary); margin-bottom: 12px;
    .section-title { padding: 16px; font-size: 1rem; font-weight: 600; color: var(--text-primary); border-bottom: 1px solid var(--glass-border); }
  }
</style>
