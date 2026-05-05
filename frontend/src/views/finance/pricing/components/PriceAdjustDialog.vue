<template>
  <!-- 价格调整表单对话框 -->
  <el-dialog 
    v-model="visible" 
    title="调整物料价格" 
    width="500px"
    :close-on-click-modal="false"
  >
    <el-form :model="form" label-width="100px" ref="formRef">
      <el-form-item label="物料编码">
        <el-input :value="form.material_code" disabled />
      </el-form-item>
      <el-form-item label="物料名称">
        <el-input :value="form.material_name" disabled />
      </el-form-item>
      <el-form-item label="原始采购价">
        <el-input-number 
          :model-value="form.original_price" 
          disabled 
          style="width: 100%" 
          :controls="false"
        />
      </el-form-item>
      <el-form-item label="调整后价格" prop="adjusted_price" required>
        <el-input-number 
          :model-value="form.adjusted_price" 
          :min="0"
          :precision="2"
          :step="0.01"
          style="width: 100%"
          @update:model-value="updateFormField('adjusted_price', $event)"
        />
      </el-form-item>
      <el-form-item label="调整原因" prop="adjustment_reason" required>
        <el-input 
          :model-value="form.adjustment_reason" 
          type="textarea"
          :rows="3"
          placeholder="请输入调整原因"
          @update:model-value="updateFormField('adjustment_reason', $event)"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleSave" :loading="submitting">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: Boolean,
  form: {
    type: Object,
    required: true
  },
  submitting: Boolean
});

const emit = defineEmits(['update:modelValue', 'update:form', 'save']);

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const handleClose = () => {
  visible.value = false;
};

const updateFormField = (field, value) => {
  emit('update:form', { ...props.form, [field]: value });
};

const handleSave = () => {
  emit('save');
};
</script>
