<!--
/**
 * CreateRequisition.vue
 * @description 新建采购申请单页面
 * @date 2026-04-14
 * @version 1.0.0
 */
-->
<template>
  <div class="create-page">
    <NavBar title="新建采购申请" left-arrow @click-left="$router.go(-1)" />

    <Form @submit="onSubmit">
      <CellGroup inset title="申请信息">
        <Field
          v-model="form.request_date"
          is-link
          readonly
          label="申请日期"
          placeholder="请选择"
          @click="showDatePicker = true"
          :rules="[{ required: true, message: '请选择申请日期' }]"
        />
        <Popup v-model:show="showDatePicker" round position="bottom">
          <DatePicker
            v-model="currentDate"
            title="选择日期"
            :min-date="minDate"
            :max-date="maxDate"
            @confirm="onDateConfirm"
            @cancel="showDatePicker = false"
          />
        </Popup>

        <Field v-model="form.department" label="申请部门" placeholder="选填" />

        <Field
          v-model="form.remarks"
          type="textarea"
          rows="2"
          autosize
          label="申请原因"
          placeholder="选填"
        />
      </CellGroup>

      <CellGroup inset title="需求明细">
        <div v-for="(item, index) in form.items" :key="index" class="material-item">
          <div class="item-header">
            <span>物料需求 {{ index + 1 }}</span>
            <Icon
              name="delete-o"
              color="#ee0a24"
              size="18"
              @click="removeItem(index)"
              v-if="form.items.length > 1"
            />
          </div>
          <Field
            v-model="item.material_id"
            label="物料ID"
            placeholder="必填(数字)"
            type="digit"
            :rules="[{ required: true, message: '请输入物料ID' }]"
          />
          <Field
            v-model="item.quantity"
            label="申请数量"
            placeholder="必填"
            type="number"
            :rules="[{ required: true, message: '请输入数量' }]"
          />
          <Field
            v-model="item.required_date"
            is-link
            readonly
            label="需求日期"
            placeholder="请选择"
            @click="openItemDatePicker(index)"
          />
        </div>
        <div class="add-btn-wrapper">
          <Button plain type="primary" size="small" icon="plus" @click="addItem" block
            >添加物料需求</Button
          >
        </div>
      </CellGroup>

      <!-- 明细需求日期弹窗 -->
      <Popup v-model:show="showItemDatePicker" round position="bottom">
        <DatePicker
          title="选择需求日期"
          :min-date="minDate"
          :max-date="maxDate"
          @confirm="onItemDateConfirm"
          @cancel="showItemDatePicker = false"
        />
      </Popup>

      <div class="submit-wrapper">
        <Button round block type="primary" native-type="submit" :loading="submitting">
          提交申请
        </Button>
      </div>
    </Form>
  </div>
</template>

<script setup>
  import { ref, reactive } from 'vue'
  import { useRouter } from 'vue-router'
  import { NavBar, Form, Field, CellGroup, Button, Popup, DatePicker, Icon, showToast } from 'vant'
  import { purchaseApi } from '@/services/api'

  const router = useRouter()
  const submitting = ref(false)

  const showDatePicker = ref(false)
  const showItemDatePicker = ref(false)
  const activeItemIndex = ref(-1)

  const today = new Date()
  const minDate = new Date(today.getFullYear() - 1, today.getMonth(), 1)
  const maxDate = new Date(today.getFullYear() + 2, 11, 31)

  const currentDate = ref([today.getFullYear(), today.getMonth() + 1, today.getDate()])

  const formatDate = (dateArr) => {
    return `${dateArr[0]}-${String(dateArr[1]).padStart(2, '0')}-${String(dateArr[2]).padStart(2, '0')}`
  }

  const form = reactive({
    request_date: formatDate([today.getFullYear(), today.getMonth() + 1, today.getDate()]),
    department: '',
    remarks: '',
    items: [{ material_id: '', quantity: '', required_date: '' }]
  })

  const onDateConfirm = ({ selectedValues }) => {
    form.request_date = formatDate(selectedValues)
    showDatePicker.value = false
  }

  const openItemDatePicker = (index) => {
    activeItemIndex.value = index
    showItemDatePicker.value = true
  }

  const onItemDateConfirm = ({ selectedValues }) => {
    if (activeItemIndex.value !== -1) {
      form.items[activeItemIndex.value].required_date = formatDate(selectedValues)
    }
    showItemDatePicker.value = false
  }

  const addItem = () => {
    form.items.push({ material_id: '', quantity: '', required_date: '' })
  }

  const removeItem = (index) => {
    form.items.splice(index, 1)
  }

  const onSubmit = async () => {
    if (form.items.some((item) => !item.material_id || !item.quantity)) {
      showToast('带有必填项的物料明细填写不完整')
      return
    }

    submitting.value = true
    try {
      const payload = {
        request_date: form.request_date,
        department: form.department,
        remarks: form.remarks,
        items: form.items.map((i) => ({
          material_id: parseInt(i.material_id),
          quantity: parseFloat(i.quantity),
          required_date: i.required_date || null
        }))
      }

      await purchaseApi.createRequisition(payload)
      showToast('提交申请单成功')
      setTimeout(() => {
        router.back()
      }, 1000)
    } catch (error) {
      showToast('提交失败: ' + (error.message || '系统错误'))
    } finally {
      submitting.value = false
    }
  }
</script>

<style scoped>
  .create-page {
    min-height: 100vh;
    background-color: var(--van-background-2);
    padding-bottom: 30px;
  }
  .material-item {
    background: var(--van-background);
    margin-bottom: 8px;
    border-bottom: 1px dashed #eee;
    padding-bottom: 8px;
  }
  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    font-size: 0.875rem;
    color: var(--van-text-color-2);
    background: var(--van-background-2);
  }
  .add-btn-wrapper {
    padding: 10px 16px;
  }
  .submit-wrapper {
    margin: 24px 16px;
  }
</style>
