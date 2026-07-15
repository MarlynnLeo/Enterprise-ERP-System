<!--
/**
 * PaymentDialog.vue
 * @description 记录收款对话框
 * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <el-dialog
    title="记录收款"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    width="500px"
  >
    <el-form :model="editableForm" :rules="paymentRules" ref="paymentFormRef" label-width="100px">
      <el-form-item label="发票编号">
        <el-input v-model="editableForm.invoice_number" disabled></el-input>
      </el-form-item>
      <el-form-item label="客户名称">
        <el-input v-model="editableForm.customer_name" disabled></el-input>
      </el-form-item>
      <el-form-item label="发票金额">
        <el-input v-model="editableForm.total_amount" disabled></el-input>
      </el-form-item>
      <el-form-item label="已付金额">
        <el-input v-model="editableForm.paid_amount" disabled></el-input>
      </el-form-item>
      <el-form-item label="剩余金额">
        <el-input v-model="editableForm.balance_amount" disabled></el-input>
      </el-form-item>
      <el-form-item label="收款日期" prop="paymentDate">
        <el-date-picker
          v-model="editableForm.paymentDate"
          type="date"
          placeholder="选择收款日期"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          class="w-full"
        ></el-date-picker>
      </el-form-item>
      <el-form-item label="收款金额" prop="amount">
        <el-input-number v-model="editableForm.amount" :precision="2" :min="0" :max="editableForm.balanceValue" class="w-full"></el-input-number>
      </el-form-item>
      <el-form-item label="收款方式" prop="paymentMethod">
        <el-select v-model="editableForm.paymentMethod" placeholder="请选择收款方式" class="w-full" @change="handlePaymentMethodChange">
          <el-option label="现金" value="cash"></el-option>
          <el-option label="银行转账" value="bank_transfer"></el-option>
          <el-option label="支票" value="check"></el-option>
          <el-option label="信用卡" value="credit_card"></el-option>
          <el-option label="其他" value="other"></el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="收款账户" prop="bankAccountId" v-if="showBankAccountField">
        <el-select v-model="editableForm.bankAccountId" placeholder="选择收款账户" filterable class="w-full">
          <el-option
            v-for="account in bankAccounts"
            :key="account.id"
            :label="`${account.account_name || account.accountName} (${account.account_number || account.accountNumber})`"
            :value="account.id"
          ></el-option>
        </el-select>
        <div class="form-tip"><el-icon class="icon-inline text-primary"><InfoFilled /></el-icon> 选择后将自动创建银行交易记录并更新账户余额</div>
      </el-form-item>
      <el-form-item label="备注" prop="notes">
        <el-input
          v-model="editableForm.notes"
          type="textarea"
          :rows="3"
          placeholder="请输入备注信息"
        ></el-input>
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="$emit('update:modelValue', false)">取消</el-button>
        <el-button v-permission="'finance:ar:receive'" type="primary" @click="$emit('save')" :loading="saveLoading">确认</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  form: {
    type: Object,
    required: true
  },
  bankAccounts: {
    type: Array,
    default: () => []
  },
  saveLoading: {
    type: Boolean,
    default: false
  }
})

defineEmits(['update:modelValue', 'save'])

const editableForm = computed(() => props.form)

// 是否显示银行账户字段
const showBankAccountField = computed(() => {
  return ['bank_transfer', 'credit_card', 'check'].includes(editableForm.value.paymentMethod)
})

// 收款方式变更处理
const handlePaymentMethodChange = () => {
  // 如果切换到非银行类支付方式，清空银行账户选择
  if (!showBankAccountField.value) {
    editableForm.value.bankAccountId = null
  }
}

// 表单验证规则
const paymentRules = {
  paymentDate: [
    { required: true, message: '请选择收款日期', trigger: 'change' }
  ],
  amount: [
    { required: true, message: '请输入收款金额', trigger: 'blur' }
  ],
  paymentMethod: [
    { required: true, message: '请选择收款方式', trigger: 'change' }
  ],
  bankAccountId: [
    {
      validator: (rule, value, callback) => {
        if (showBankAccountField.value && !value) {
          callback(new Error('请选择收款账户'))
        } else {
          callback()
        }
      },
      trigger: 'change'
    }
  ]
}
</script>
