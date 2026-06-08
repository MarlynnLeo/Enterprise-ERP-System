<template>
  <div class="create-page">
    <NavBar title="新增部门" left-arrow @click-left="router.back()" />

    <div class="content">
      <Form ref="formRef">
        <CellGroup inset title="部门信息">
          <Field v-model="form.code" name="code" label="部门编码" placeholder="请输入部门编码" :rules="[{ required: true, message: '请输入部门编码' }]" />
          <Field v-model="form.name" name="name" label="部门名称" placeholder="请输入部门名称" :rules="[{ required: true, message: '请输入部门名称' }]" />
          <Cell title="上级部门" is-link :value="parentName" @click="showParentPicker = true" />
          <Field v-model="form.phone" name="phone" label="联系电话" placeholder="请输入联系电话" />
          <Field v-model="form.remark" name="remark" label="备注" type="textarea" rows="3" autosize />
        </CellGroup>
      </Form>

      <div class="submit-area">
        <Button type="primary" block round :loading="submitting" @click="handleSubmit">保存部门</Button>
      </div>
    </div>

    <Popup v-model:show="showParentPicker" round position="bottom" :style="{ height: '70%' }">
      <div class="picker-panel">
        <Cell title="无上级部门" clickable @click="pickParent(null)" />
        <div class="picker-list">
          <Cell v-for="item in departments" :key="item.id" :title="item.name" :label="item.code" clickable @click="pickParent(item)" />
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { Button, Cell, CellGroup, Field, Form, NavBar, Popup, showToast } from 'vant'
  import { systemApi } from '@/api'
  import { extractApiList } from '@/utils/apiHelper'

  const router = useRouter()
  const formRef = ref()
  const submitting = ref(false)
  const showParentPicker = ref(false)
  const departments = ref([])

  const form = reactive({
    code: '',
    name: '',
    parent_id: null,
    phone: '',
    remark: '',
    status: 1
  })

  const parentName = computed(() => {
    const current = departments.value.find((item) => String(item.id) === String(form.parent_id))
    return current?.name || '无上级部门'
  })

  const fetchDepartments = async () => {
    const response = await systemApi.getDepartments()
    departments.value = extractApiList(response)
  }

  const pickParent = (item) => {
    form.parent_id = item?.id || null
    showParentPicker.value = false
  }

  const handleSubmit = async () => {
    try {
      await formRef.value?.validate()
      submitting.value = true
      await systemApi.createDepartment({
        ...form,
        code: form.code.trim(),
        name: form.name.trim()
      })
      showToast({ type: 'success', message: '部门已创建' })
      router.back()
    } catch (error) {
      if (error?.message) console.error('创建部门失败:', error)
    } finally {
      submitting.value = false
    }
  }

  onMounted(fetchDepartments)
</script>

<style lang="scss" scoped>
  .create-page {
    min-height: 100%;
    background: var(--bg-primary);
  }

  .content {
    padding: 12px 0 24px;
  }

  .submit-area {
    padding: 20px 16px;
  }

  .picker-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .picker-list {
    flex: 1;
    overflow-y: auto;
  }
</style>
