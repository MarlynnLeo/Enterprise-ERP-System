<template>
  <AppDialog :model-value="modelValue" :title="title" mode="form" width="900px" @update:model-value="$emit('update:modelValue', $event)">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
      <el-row :gutter="20">
        <el-col :span="12"><el-form-item label="系统编号"><el-input :model-value="form.invoiceNumber" placeholder="保存时自动生成" disabled /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="供应商发票号"><el-input v-model="editable.supplierInvoiceNumber" maxlength="100" placeholder="选填" /></el-form-item></el-col>
      </el-row>
      <el-form-item label="供应商" prop="supplierId">
        <el-select v-model="editable.supplierId" filterable remote :remote-method="query => $emit('supplier-search', query)" :loading="supplierLoading" placeholder="搜索供应商名称或编码" class="w-full">
          <el-option v-for="item in suppliers" :key="item.id" :value="Number(item.id)" :label="[item.code, item.name].filter(Boolean).join(' - ')" />
        </el-select>
      </el-form-item>
      <el-row :gutter="20">
        <el-col :span="12"><el-form-item label="开票日期" prop="invoiceDate"><el-date-picker v-model="editable.invoiceDate" type="date" value-format="YYYY-MM-DD" @change="$emit('date-change')" class="w-full" /></el-form-item></el-col>
        <el-col :span="12"><el-form-item label="到期日期" prop="dueDate"><el-date-picker v-model="editable.dueDate" type="date" value-format="YYYY-MM-DD" class="w-full" /></el-form-item></el-col>
      </el-row>
      <el-form-item label="发票明细" prop="items">
        <div class="w-full">
          <el-table :data="form.items" border>
            <el-table-column label="物料/服务" min-width="180">
              <template #default="{ row }"><el-select v-model="row.materialId" filterable remote :remote-method="query => $emit('material-search', query)" :loading="materialLoading" placeholder="搜索物料" @change="selectMaterial(row)"><el-option v-for="item in materials" :key="item.id" :value="Number(item.id)" :label="[item.code, item.name].filter(Boolean).join(' - ')" /></el-select></template>
            </el-table-column>
            <el-table-column label="描述" min-width="130"><template #default="{ row }"><el-input v-model="row.description" placeholder="服务或物料说明" /></template></el-table-column>
            <el-table-column label="数量" width="120"><template #default="{ row }"><el-input-number v-model="row.quantity" :min="0.0001" :precision="4" :controls="false" class="w-full" @change="recalculate(row)" /></template></el-table-column>
            <el-table-column label="单价" width="120"><template #default="{ row }"><el-input-number v-model="row.unitPrice" :min="0" :precision="4" :controls="false" class="w-full" @change="recalculate(row)" /></template></el-table-column>
            <el-table-column label="金额" width="110"><template #default="{ row }">{{ formatCurrency(lineAmount(row)) }}</template></el-table-column>
            <el-table-column label="操作" min-width="70" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"><template #default="{ $index }"><el-button type="danger" size="small" @click="editable.items.splice($index, 1)">删除</el-button></template></el-table-column>
          </el-table>
          <el-button class="mt-md" @click="addItem">添加明细项</el-button>
        </div>
      </el-form-item>
      <el-form-item label="税率" prop="taxRate"><el-select v-model="editable.taxRate"><el-option v-for="rate in financeStore.vatRateOptions" :key="rate" :value="rate" :label="financeStore.formatTaxRate(rate)" /></el-select></el-form-item>
      <el-descriptions :column="3" border class="mb-md">
        <el-descriptions-item label="未税金额">{{ formatCurrency(subtotal) }}</el-descriptions-item>
        <el-descriptions-item label="税额">{{ formatCurrency(tax) }}</el-descriptions-item>
        <el-descriptions-item label="价税合计">{{ formatCurrency(total) }}</el-descriptions-item>
      </el-descriptions>
      <el-form-item label="备注"><el-input v-model="editable.notes" type="textarea" :rows="2" /></el-form-item>
    </el-form>
    <template #footer><el-button @click="$emit('update:modelValue', false)">取消</el-button><el-button v-permission="form.id ? 'finance:ap:update' : 'finance:ap:create'" type="primary" :loading="saving" @click="$emit('save')">保存</el-button></template>
  </AppDialog>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useFinanceStore } from '@/stores/finance';
import { formatCurrency } from '@/utils/format';
const props = defineProps({ modelValue: Boolean, title: String, form: { type: Object, required: true }, suppliers: { type: Array, default: () => [] }, materials: { type: Array, default: () => [] }, supplierLoading: Boolean, materialLoading: Boolean, saving: Boolean });
defineEmits(['update:modelValue', 'supplier-search', 'material-search', 'date-change', 'save']);
const financeStore = useFinanceStore();
const formRef = ref(null);
const editable = computed(() => props.form);
const subtotal = computed(() => props.form.items.reduce((sum, item) => sum + Math.round(Number(item.quantity || 0) * Number(item.unitPrice || 0) * 100), 0) / 100);
const tax = computed(() => Math.round(subtotal.value * Number(props.form.taxRate || 0) * 100) / 100);
const total = computed(() => Math.round((subtotal.value + tax.value) * 100) / 100);
const rules = {
  supplierId: [{ required: true, message: '请选择供应商', trigger: 'change' }],
  invoiceDate: [{ required: true, message: '请选择开票日期', trigger: 'change' }],
  dueDate: [{ required: true, message: '请选择到期日期', trigger: 'change' }, { validator: (_rule, value, callback) => callback(value && value < props.form.invoiceDate ? new Error('到期日期不能早于开票日期') : undefined), trigger: 'change' }],
  taxRate: [{ required: true, message: '请选择税率', trigger: 'change' }],
  items: [{ validator: (_rule, value, callback) => {
    if (!value?.length) return callback(new Error('请至少添加一个明细项'));
    if (value.some(item => !Number.isInteger(Number(item.materialId)) || Number(item.materialId) <= 0 || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0)) return callback(new Error('请选择物料，并填写有效的数量和单价'));
    callback(total.value > 0 ? undefined : new Error('价税合计必须大于0'));
  }, trigger: 'change' }],
};
const lineAmount = item => Math.round(Number(item.quantity || 0) * Number(item.unitPrice || 0) * 100) / 100;
const recalculate = item => { item.amount = lineAmount(item); };
const addItem = () => editable.value.items.push({ materialId: null, description: '', quantity: 1, unitPrice: 0, amount: 0 });
const selectMaterial = item => { const material = props.materials.find(option => Number(option.id) === Number(item.materialId)); if (material) { item.description = material.name; item.unitPrice = Number(material.purchasePrice ?? material.price ?? 0); recalculate(item); } };
defineExpose({ validate: () => formRef.value?.validate(), clearValidate: () => formRef.value?.clearValidate(), calculateTotal: () => total.value });
</script>
