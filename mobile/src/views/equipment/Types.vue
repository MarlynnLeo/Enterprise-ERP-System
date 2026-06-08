<!--
/**
 * Types.vue
 * @description 设备类别管理
 */
-->
<template>
  <UniversalListPage :key="listKey" :config="pageConfig" :api-function="loadTypes" />

  <Popup v-model:show="showCreatePopup" round position="bottom" :style="{ height: '70%' }">
    <div class="type-editor">
      <div class="editor-title">新增设备类别</div>
      <Form ref="formRef">
        <CellGroup inset>
          <Field
            v-model="form.code"
            name="code"
            label="类别编码"
            placeholder="如 CNC"
            :rules="[{ required: true, message: '请输入类别编码' }]"
          />
          <Field
            v-model="form.name"
            name="name"
            label="类别名称"
            placeholder="请输入类别名称"
            :rules="[{ required: true, message: '请输入类别名称' }]"
          />
          <Field v-model="form.manufacturer" name="manufacturer" label="默认厂商" placeholder="选填" />
          <Field
            v-model="form.description"
            name="description"
            label="说明"
            type="textarea"
            rows="3"
            autosize
            placeholder="请输入类别说明"
          />
        </CellGroup>
      </Form>
      <div class="submit-area">
        <Button block round type="primary" :loading="submitting" @click="handleCreate">保存类别</Button>
      </div>
    </div>
  </Popup>
</template>

<script setup>
  import { computed, reactive, ref } from 'vue'
  import { Button, CellGroup, Field, Form, Popup, showToast } from 'vant'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { equipmentApi } from '@/api'

  const listKey = ref(0)
  const formRef = ref()
  const submitting = ref(false)
  const showCreatePopup = ref(false)

  const form = reactive({
    code: '',
    name: '',
    manufacturer: '',
    description: ''
  })

  const resetForm = () => {
    form.code = ''
    form.name = ''
    form.manufacturer = ''
    form.description = ''
  }

  const openCreatePopup = () => {
    resetForm()
    showCreatePopup.value = true
  }

  const pageConfig = computed(() => ({
    title: '设备类别',
    searchPlaceholder: '搜索类别名称或编码',

    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '启用', value: 'active' }
    ],

    fields: {
      id: 'id',
      title: 'name',
      subtitle: 'code',
      icon: 'cluster-o',
      status: {
        field: 'status',
        map: {
          active: { text: '启用', class: 'status-success' },
          inactive: { text: '停用', class: 'status-warning' }
        }
      },

      details: [
        { label: '设备数量', field: 'count', suffix: '台' },
        { label: '默认厂商', field: 'manufacturer' }
      ]
    },

    headerActions: [
      { icon: 'plus', label: '新增类别', action: 'create', handler: openCreatePopup }
    ]
  }))

  const loadTypes = async (params = {}) => {
    return await equipmentApi.getTypes(params)
  }

  const handleCreate = async () => {
    try {
      await formRef.value?.validate()
      submitting.value = true
      await equipmentApi.createType({
        code: form.code.trim(),
        name: form.name.trim(),
        manufacturer: form.manufacturer.trim(),
        description: form.description.trim()
      })
      showToast({ type: 'success', message: '设备类别已创建' })
      showCreatePopup.value = false
      listKey.value += 1
    } catch (error) {
      if (error?.message) console.error('创建设备类别失败:', error)
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .type-editor {
    min-height: 100%;
    background: var(--bg-primary);
    padding: 12px 0 var(--app-bottom-space);
  }

  .editor-title {
    padding: 8px 16px 12px;
    font-size: 17px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .submit-area {
    padding: 20px 16px;
  }
</style>
