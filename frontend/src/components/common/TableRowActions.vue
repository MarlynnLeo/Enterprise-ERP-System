<template>
  <div class="table-actions" @click.stop>
    <slot />

    <el-button v-if="canAdd" size="small" type="primary" @click="$emit('add', row)">
      <el-icon><Plus /></el-icon> {{ addLabel }}
    </el-button>

    <el-popconfirm
      v-if="canUpdate && !isEnabled"
      :title="`确定要启用${resourceLabel}吗？`"
      @confirm="$emit('enable', row)"
    >
      <template #reference>
        <el-button size="small" type="success">
          <el-icon><Check /></el-icon> 启用
        </el-button>
      </template>
    </el-popconfirm>

    <el-popconfirm
      v-if="canUpdate && isEnabled"
      :title="`确定要禁用${resourceLabel}吗？`"
      confirm-button-type="danger"
      @confirm="$emit('disable', row)"
    >
      <template #reference>
        <el-button size="small" type="warning">
          <el-icon><Close /></el-icon> 禁用
        </el-button>
      </template>
    </el-popconfirm>

    <el-button v-if="canUpdate && !isEnabled" size="small" @click="$emit('edit', row)">
      <el-icon><Edit /></el-icon> 编辑
    </el-button>

    <el-popconfirm
      v-if="canDelete && !isEnabled"
      :title="`确定要删除${resourceLabel}吗？此操作无法恢复。`"
      confirm-button-type="danger"
      @confirm="$emit('delete', row)"
    >
      <template #reference>
        <el-button size="small" type="danger">
          <el-icon><Delete /></el-icon> 删除
        </el-button>
      </template>
    </el-popconfirm>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Check, Close, Delete, Edit, Plus } from '@element-plus/icons-vue'

const props = defineProps({
  row: { type: Object, default: () => ({}) },
  canUpdate: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: false },
  canAdd: { type: Boolean, default: false },
  addLabel: { type: String, default: '添加子类' },
  resourceLabel: { type: String, default: '物料' },
})

defineEmits(['add', 'edit', 'delete', 'enable', 'disable'])

const isEnabled = computed(() => Number(props.row?.status) === 1)
</script>
