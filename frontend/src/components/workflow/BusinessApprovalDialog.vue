<template>
  <AppDialog
    v-model="dialogVisible"
    :title="title"
    mode="form"
    width="500px"
  >
    <div v-loading="loading">
      <el-descriptions v-if="summaryItems.length" border :column="1">
        <el-descriptions-item
          v-for="item in summaryItems"
          :key="item.label"
          :label="item.label"
        >
          {{ item.value }}
        </el-descriptions-item>
      </el-descriptions>
      <el-form label-width="80px" :class="summaryItems.length ? 'mt-md' : ''">
        <el-form-item label="审批意见">
          <el-input
            v-model="comment"
            type="textarea"
            :rows="3"
            placeholder="请输入审批意见（选填）"
          />
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="danger" :loading="loading" @click="submit('reject')">拒绝</el-button>
      <el-button type="success" :loading="loading" @click="submit('approve')">通过</el-button>
    </template>
  </AppDialog>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '审批' },
  loading: { type: Boolean, default: false },
  comment: { type: String, default: '' },
  summaryItems: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue', 'update:comment', 'approve', 'reject'])

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const comment = computed({
  get: () => props.comment,
  set: (value) => emit('update:comment', value)
})

const submit = (action) => {
  emit(action)
}
</script>
