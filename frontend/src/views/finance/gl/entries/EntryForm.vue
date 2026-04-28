<template>
  <div class="entry-form-container">
    <el-card class="header-card">
      <div class="header-content">
        <h2>{{ isEdit ? '编辑凭证' : '录入凭证' }}</h2>
        <div>
          <el-button @click="goBack">返回</el-button>
          <el-button v-permission="'finance:entries:update'" type="primary" @click="saveEntry" :loading="saving">保存</el-button>
        </div>
      </div>
    </el-card>

    <el-card class="form-card">
      <el-form :model="entryForm" :rules="rules" ref="formRef" label-width="100px" class="main-form">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="记账日期" prop="entry_date">
              <el-date-picker v-model="entryForm.entry_date" type="date" value-format="YYYY-MM-DD" style="width: 100%"></el-date-picker>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="凭证字" prop="voucher_word">
              <el-select v-model="entryForm.voucher_word" style="width: 100%">
                <el-option label="记" value="记"></el-option>
                <el-option label="收" value="收"></el-option>
                <el-option label="付" value="付"></el-option>
                <el-option label="转" value="转"></el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="附单据数" prop="document_number">
              <el-input-number v-model="entryForm.document_number" :min="0" style="width: 100%"></el-input-number>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="24">
            <el-form-item label="摘要" prop="description">
              <el-input v-model="entryForm.description" placeholder="凭证摘要"></el-input>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      
      <div class="items-section">
        <div class="items-header">
          <h3>凭证明细</h3>
          <el-button v-permission="'finance:entries:create'" type="success" size="small" plain @click="addItem">添加明细行</el-button>
        </div>
        
        <el-table :data="entryForm.items" border style="width: 100%" class="entry-table">
          <el-table-column label="摘要" width="200">
            <template #default="scope">
              <el-input v-model="scope.row.description" placeholder="明细摘要"></el-input>
            </template>
          </el-table-column>
          <el-table-column label="会计科目" min-width="250">
            <template #default="scope">
              <el-cascader
                v-model="scope.row.account_id"
                :options="accountOptions"
                :props="{ checkStrictly: true, value: 'id', label: 'fullName', emitPath: false }"
                placeholder="请选择科目"
                filterable
                style="width: 100%"
                @change="(val) => handleAccountChange(val, scope.$index)"
              ></el-cascader>
              
              <!-- 辅助核算展开区域 -->
              <div v-if="scope.row._accountAux && Object.values(scope.row._accountAux).some(v => v)" class="aux-area">
                <el-select v-if="scope.row._accountAux.has_customer" v-model="scope.row.customer_id" placeholder="客户" size="small" class="aux-item">
                  <el-option v-for="c in customerOptions" :key="c.id" :label="c.customer_name" :value="c.id"></el-option>
                </el-select>
                <el-select v-if="scope.row._accountAux.has_supplier" v-model="scope.row.supplier_id" placeholder="供应商" size="small" class="aux-item">
                  <el-option v-for="s in supplierOptions" :key="s.id" :label="s.supplier_name" :value="s.id"></el-option>
                </el-select>
                <el-select v-if="scope.row._accountAux.has_employee" v-model="scope.row.employee_id" placeholder="员工" size="small" class="aux-item">
                  <el-option v-for="u in userOptions" :key="u.id" :label="u.username" :value="u.id"></el-option>
                </el-select>
                <el-select v-if="scope.row._accountAux.has_department" v-model="scope.row.cost_center_id" placeholder="部门/成本中心" size="small" class="aux-item">
                  <el-option v-for="d in departmentOptions" :key="d.id" :label="d.department_name" :value="d.id"></el-option>
                </el-select>
                <el-select v-if="scope.row._accountAux.has_project" v-model="scope.row.project_id" placeholder="项目" size="small" class="aux-item">
                  <el-option v-for="p in projectOptions" :key="p.id" :label="p.project_name" :value="p.id"></el-option>
                </el-select>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="借方金额" width="150">
            <template #default="scope">
              <el-input-number 
                v-model="scope.row.debit_amount" 
                :precision="2" :step="100" :min="0" 
                :controls="false"
                style="width: 100%"
                @change="() => scope.row.credit_amount = scope.row.debit_amount > 0 ? 0 : scope.row.credit_amount"
              ></el-input-number>
            </template>
          </el-table-column>
          <el-table-column label="贷方金额" width="150">
            <template #default="scope">
              <el-input-number 
                v-model="scope.row.credit_amount" 
                :precision="2" :step="100" :min="0" 
                :controls="false"
                style="width: 100%"
                @change="() => scope.row.debit_amount = scope.row.credit_amount > 0 ? 0 : scope.row.debit_amount"
              ></el-input-number>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" align="center">
            <template #default="scope">
              <el-button type="danger" circle size="small" @click="removeItem(scope.$index)" :disabled="entryForm.items.length <= 2">删</el-button>
            </template>
          </el-table-column>
        </el-table>
        
        <div class="totals-row">
          <div class="total-label">合计:</div>
          <div class="total-value" :class="{ 'is-balanced': isBalanced, 'is-unbalanced': !isBalanced }">
            借方: {{ formatCurrency(totalDebit) }} | 贷方: {{ formatCurrency(totalCredit) }}
          </div>
          <div v-if="!isBalanced" class="unbalanced-warning">借贷不平！差额: {{ formatCurrency(Math.abs(totalDebit - totalCredit)) }}</div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { api } from '@/services/api';
import { formatCurrency } from '@/utils/format'

const router = useRouter();
const route = useRoute();

const isEdit = ref(false);
const saving = ref(false);
const formRef = ref(null);

const accountOptions = ref([]);
const flatAccounts = ref([]);

// 辅助维度选项
const customerOptions = ref([]);
const supplierOptions = ref([]);
const userOptions = ref([]);
const departmentOptions = ref([]);
const projectOptions = ref([]);

const _createEmptItem = () => ({
  description: '',
  account_id: null,
  debit_amount: 0,
  credit_amount: 0,
  customer_id: null,
  supplier_id: null,
  employee_id: null,
  cost_center_id: null,
  project_id: null,
  _accountAux: null
});

const entryForm = reactive({
  entry_date: new Date().toISOString().split('T')[0],
  voucher_word: (() => {
    const typeMap = {
      '收款凭证': '收', '收款单': '收',
      '付款凭证': '付', '付款单': '付',
      '转账凭证': '转',
      '记账凭证': '记'
    };
    return typeMap[route.query.type] || '记';
  })(),
  document_number: 0,
  description: '',
  items: [
    _createEmptItem(),
    _createEmptItem()
  ]
});

const rules = {
  entry_date: [{ required: true, message: '请选择时间', trigger: 'change' }],
  voucher_word: [{ required: true, message: '请选择凭证字', trigger: 'change' }]
};

const totalDebit = computed(() => {
  return entryForm.items.reduce((sum, item) => sum + (Number(item.debit_amount) || 0), 0);
});

const totalCredit = computed(() => {
  return entryForm.items.reduce((sum, item) => sum + (Number(item.credit_amount) || 0), 0);
});

const isBalanced = computed(() => {
  // 允许0.01误差
  return Math.abs(totalDebit.value - totalCredit.value) < 0.01 && totalDebit.value > 0;
});

const goBack = () => {
  router.back();
};

const addItem = () => {
  entryForm.items.push(_createEmptItem());
};

const removeItem = (index) => {
  if (entryForm.items.length > 2) {
    entryForm.items.splice(index, 1);
  }
};

const flattenAccounts = (accounts, result = []) => {
  accounts.forEach(acc => {
    result.push(acc);
    if (acc.children && acc.children.length > 0) {
      flattenAccounts(acc.children, result);
    }
  });
  return result;
};

const loadOptions = async () => {
  try {
    const accRes = await api.get('/finance/accounts/options');
    // eslint-disable-next-line no-prototype-builtins
    const accounts = accRes.data.hasOwnProperty('data') ? accRes.data.data : accRes.data;
    const processAccounts = (list) => {
      return list.map(item => {
        const processed = {
          ...item,
          fullName: `${item.account_code} - ${item.account_name}`
        };
        if (item.children && item.children.length > 0) {
          processed.children = processAccounts(item.children);
        }
        return processed;
      });
    };
    accountOptions.value = processAccounts(accounts);
    flatAccounts.value = flattenAccounts(accountOptions.value);

    // Load aux options gracefully
    try {
      const custRes = await api.get('/sales/customers').catch(()=>({data:[]}));
      customerOptions.value = custRes?.data?.data || custRes?.data || [];
    } catch(e) { console.warn('加载客户选项失败:', e.message) }
    
    try {
      const userRes = await api.get('/system/users/list').catch(()=>({data:[]}));
      userOptions.value = userRes?.data?.data || userRes?.data || [];
    } catch(e) { console.warn('加载用户选项失败:', e.message) }

    try {
      const deptRes = await api.get('/system/departments').catch(()=>({data:[]}));
      departmentOptions.value = deptRes?.data?.data || deptRes?.data || [];
    } catch(e) { console.warn('加载部门选项失败:', e.message) }
    
    // Attempt suppliers and projects if routes exist
    try {
      const suppRes = await api.get('/purchase/suppliers').catch(()=>({data:[]}));
      supplierOptions.value = suppRes?.data?.data || suppRes?.data || [];
    } catch(e) { console.warn('加载供应商选项失败:', e.message) }
  } catch (err) {
    console.error('加载选项失败', err);
  }
};

const handleAccountChange = (accountId, index) => {
  const account = flatAccounts.value.find(a => a.id === accountId);
  if (account) {
    entryForm.items[index]._accountAux = {
      has_customer: Boolean(account.has_customer),
      has_supplier: Boolean(account.has_supplier),
      has_employee: Boolean(account.has_employee),
      has_department: Boolean(account.has_department),
      has_project: Boolean(account.has_project)
    };
    if (!account.has_customer) entryForm.items[index].customer_id = null;
    if (!account.has_supplier) entryForm.items[index].supplier_id = null;
    if (!account.has_employee) entryForm.items[index].employee_id = null;
    if (!account.has_department) entryForm.items[index].cost_center_id = null;
    if (!account.has_project) entryForm.items[index].project_id = null;
  }
};

const saveEntry = async () => {
  if (!formRef.value) return;
  await formRef.value.validate(async valid => {
    if (!valid) return;
    
    if (!isBalanced.value) {
      ElMessage.error('凭证借贷不平，无法保存');
      return;
    }

    const payload = {
      entry_date: entryForm.entry_date,
      posting_date: entryForm.entry_date,
      voucher_word: entryForm.voucher_word,
      document_number: entryForm.document_number,
      description: entryForm.description,
      items: entryForm.items.filter(i => i.account_id && (i.debit_amount > 0 || i.credit_amount > 0)).map(i => ({
        account_id: i.account_id,
        description: i.description || entryForm.description,
        debit_amount: i.debit_amount,
        credit_amount: i.credit_amount,
        customer_id: i.customer_id,
        supplier_id: i.supplier_id,
        employee_id: i.employee_id,
        cost_center_id: i.cost_center_id,
        project_id: i.project_id
      }))
    };

    if (payload.items.length === 0) {
      ElMessage.warning('请至少录入一行有效的明细');
      return;
    }

    saving.value = true;
    try {
      await api.post('/finance/entries', payload);
      ElMessage.success('凭证录入成功');
      router.back();
    } catch (err) {
      console.error(err);
      ElMessage.error('凭证保存失败: ' + (err.response?.data?.message || err.message));
    } finally {
      saving.value = false;
    }
  });
};

onMounted(() => {
  loadOptions();
});
</script>

<style scoped>
.header-card {
  margin-bottom: 20px;
}
.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-content h2 {
  margin: 0;
  font-size: 20px;
}
.items-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  border-top: 1px dashed #eee;
  padding-top: 15px;
}
.aux-area {
  margin-top: 5px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 5px;
  background-color: var(--color-bg-hover);
  border-radius: 4px;
}
.aux-item {
  width: 140px;
}
.totals-row {
  display: flex;
  align-items: center;
  margin-top: 20px;
  padding: 15px;
  background-color: #f8f9fa;
  border-radius: 4px;
  font-weight: bold;
}
.total-label {
  margin-right: 20px;
}
.is-balanced {
  color: var(--color-success);
}
.is-unbalanced {
  color: var(--color-danger);
}
.unbalanced-warning {
  margin-left: 20px;
  color: var(--color-danger);
  font-size: 14px;
}
</style>
