<!--
/**
 * Accounts.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="accounts-page">
    <NavBar title="会计科目" left-arrow @click-left="$router.go(-1)">
      <template #right>
        <Icon name="plus" size="18" @click="showCreateDialog = true" />
      </template>
    </NavBar>
    
    <div class="content-container">
      <!-- 搜索栏 -->
      <div class="search-section">
        <Search 
          v-model="searchKeyword" 
          placeholder="搜索科目代码或名称"
          @search="handleSearch"
          @clear="handleClear"
        />
      </div>

      <!-- 科目类型筛选 - 横向药丸标签 -->
      <div class="filter-scroll-wrapper">
        <div class="filter-scroll">
          <div
            v-for="type in accountTypes"
            :key="type.value"
            class="filter-chip"
            :class="{ active: selectedType === type.value }"
            @click="selectType(type.value)"
          >
            <span class="chip-text">{{ type.label }}</span>
            <span v-if="getTypeCount(type.value)" class="chip-badge">{{ getTypeCount(type.value) }}</span>
          </div>
        </div>
      </div>

      <!-- 科目列表 -->
      <div class="accounts-list">
        <PullRefresh v-model="refreshing" @refresh="onRefresh">
          <List
            v-model:loading="loading"
            :finished="finished"
            finished-text="没有更多了"
            @load="onLoad"
          >
            <div v-for="account in accounts" :key="account.id" class="account-item">
              <div class="account-info" @click="viewAccount(account)">
                <div class="account-header">
                  <div class="account-code">{{ account.account_code }}</div>
                  <div class="account-type-badge" :class="getTypeBadgeClass(account.account_type)">
                    {{ getTypeLabel(account.account_type) }}
                  </div>
                </div>
                <div class="account-name">{{ account.account_name }}</div>
                <div class="account-details">
                  <span class="balance">余额: ¥{{ formatMoney(account.balance || 0) }}</span>
                  <span class="status" :class="{ active: account.is_active }">
                    {{ account.is_active ? '启用' : '停用' }}
                  </span>
                </div>
              </div>
              <div class="account-actions">
                <Icon name="edit" size="16" @click="editAccount(account)" />
              </div>
            </div>
          </List>
        </PullRefresh>
      </div>
    </div>

    <!-- 新建/编辑科目弹窗 -->
    <Popup v-model:show="showCreateDialog" position="bottom" :style="{ height: '80%' }">
      <div class="create-dialog">
        <div class="dialog-header">
          <div class="dialog-title">{{ editingAccount ? '编辑科目' : '新建科目' }}</div>
          <Icon name="cross" size="18" @click="closeDialog" />
        </div>
        
        <div class="dialog-content">
          <Form @submit="handleSubmit">
            <Field
              v-model="formData.account_code"
              name="account_code"
              label="科目代码"
              placeholder="请输入科目代码"
              :rules="[{ required: true, message: '请输入科目代码' }]"
            />
            
            <Field
              v-model="formData.account_name"
              name="account_name"
              label="科目名称"
              placeholder="请输入科目名称"
              :rules="[{ required: true, message: '请输入科目名称' }]"
            />
            
            <Field
              name="account_type"
              label="科目类型"
              placeholder="请选择科目类型"
              readonly
              :value="getTypeLabel(formData.account_type)"
              @click="showTypePicker = true"
              :rules="[{ required: true, message: '请选择科目类型' }]"
            />
            
            <Field
              v-model="formData.parent_code"
              name="parent_code"
              label="上级科目"
              placeholder="请输入上级科目代码（可选）"
            />
            
            <Field
              v-model="formData.description"
              name="description"
              label="科目说明"
              type="textarea"
              placeholder="请输入科目说明（可选）"
              rows="3"
            />
            
            <div class="form-item">
              <div class="form-label">是否启用</div>
              <Switch v-model="formData.is_active" />
            </div>
            
            <div class="form-actions">
              <Button type="default" @click="closeDialog">取消</Button>
              <Button type="primary" native-type="submit" :loading="submitting">
                {{ editingAccount ? '更新' : '创建' }}
              </Button>
            </div>
          </Form>
        </div>
      </div>
    </Popup>

    <!-- 科目类型选择器 -->
    <Popup v-model:show="showTypePicker" position="bottom">
      <Picker
        :columns="accountTypeOptions"
        @confirm="onTypeConfirm"
        @cancel="showTypePicker = false"
      />
    </Popup>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { 
  NavBar, Icon, Search, PullRefresh, List, Popup, Form, Field, 
  Button, Switch, Picker, showToast, showConfirmDialog 
} from 'vant';
import { financeApi } from '@/services/api';

const router = useRouter();

// 响应式数据
const accounts = ref([]);
const loading = ref(false);
const finished = ref(false);
const refreshing = ref(false);
const searchKeyword = ref('');
const selectedType = ref('');
const showCreateDialog = ref(false);
const showTypePicker = ref(false);
const editingAccount = ref(null);
const submitting = ref(false);

// 表单数据
const formData = reactive({
  account_code: '',
  account_name: '',
  account_type: '',
  parent_code: '',
  description: '',
  is_active: true
});

// 科目类型配置
// 科目类型配置（value 与后端 account_type 字段一致）
const accountTypes = [
  { label: '全部', value: '' },
  { label: '资产', value: '资产' },
  { label: '负债', value: '负债' },
  { label: '所有者权益', value: '所有者权益' },
  { label: '成本', value: '成本' },
  { label: '收入', value: '收入' },
  { label: '费用', value: '费用' }
];

const accountTypeOptions = accountTypes.filter(type => type.value !== '').map(type => ({
  text: type.label,
  value: type.value
}));

// 计算属性
const getTypeLabel = (type) => {
  const typeItem = accountTypes.find(item => item.value === type);
  return typeItem ? typeItem.label : type;
};

// 获取各类型科目数量（用于药丸标签徽章）
const getTypeCount = (type) => {
  if (!type) return accounts.value.length;
  return accounts.value.filter(a => a.account_type === type).length;
};

const getTypeBadgeClass = (type) => {
  const classMap = {
    '资产': 'assets',
    '负债': 'liabilities', 
    '所有者权益': 'equity',
    '成本': 'costs',
    '收入': 'revenue',
    '费用': 'expenses'
  };
  return classMap[type] || 'default';
};

// 格式化金额
const formatMoney = (amount) => {
  if (!amount) return '0.00';
  return Number(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// 加载科目列表
const loadAccounts = async (isRefresh = false) => {
  if (isRefresh) {
    accounts.value = [];
    finished.value = false;
  }

  try {
    const params = {
      page: Math.floor(accounts.value.length / 20) + 1,
      limit: 20,
      search: searchKeyword.value,
      account_type: selectedType.value
    };

    const response = await financeApi.getAccounts(params);
    const resData = response.data?.data || response.data || {};
    const newAccounts = resData.list || resData.accounts || [];
    
    if (isRefresh) {
      accounts.value = newAccounts;
    } else {
      accounts.value.push(...newAccounts);
    }
    
    finished.value = newAccounts.length < 20;
  } catch (error) {
    console.error('加载科目列表失败:', error);
    showToast('加载失败，请重试');
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
};

// 事件处理
const onLoad = () => {
  loading.value = true;
  loadAccounts();
};

const onRefresh = () => {
  refreshing.value = true;
  loadAccounts(true);
};

const handleSearch = () => {
  loadAccounts(true);
};

const handleClear = () => {
  searchKeyword.value = '';
  loadAccounts(true);
};

const selectType = (type) => {
  selectedType.value = type;
  loadAccounts(true);
};

const viewAccount = (account) => {
  router.push(`/finance/gl/accounts/${account.id}`);
};

const editAccount = (account) => {
  editingAccount.value = account;
  Object.assign(formData, {
    account_code: account.account_code,
    account_name: account.account_name,
    account_type: account.account_type,
    parent_code: account.parent_code || '',
    description: account.description || '',
    is_active: account.is_active
  });
  showCreateDialog.value = true;
};

const closeDialog = () => {
  showCreateDialog.value = false;
  editingAccount.value = null;
  Object.assign(formData, {
    account_code: '',
    account_name: '',
    account_type: '',
    parent_code: '',
    description: '',
    is_active: true
  });
};

const onTypeConfirm = ({ selectedOptions }) => {
  formData.account_type = selectedOptions[0].value;
  showTypePicker.value = false;
};

const handleSubmit = async () => {
  submitting.value = true;
  
  try {
    if (editingAccount.value) {
      await financeApi.updateAccount(editingAccount.value.id, formData);
      showToast('科目更新成功');
    } else {
      await financeApi.createAccount(formData);
      showToast('科目创建成功');
    }
    
    closeDialog();
    loadAccounts(true);
  } catch (error) {
    console.error('保存科目失败:', error);
    showToast('保存失败，请重试');
  } finally {
    submitting.value = false;
  }
};

onMounted(() => {
  loadAccounts(true);
});
</script>

<style lang="scss" scoped>
.accounts-page {
  min-height: 100vh;
  background-color: var(--bg-primary);
}

.content-container {
  padding: 0 12px 12px;
}

.search-section {
  padding: 12px 0;
}

// ========== 横向药丸筛选标签 ==========
.filter-scroll-wrapper {
  padding: 4px 0 8px;
  overflow: hidden;
}

.filter-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 2px 0 6px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}

.filter-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: 20px;
  background: var(--bg-secondary);
  border: 1.5px solid var(--van-border-color);
  white-space: nowrap;
  flex-shrink: 0;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  transition: all 0.25s ease;
  cursor: pointer;

  .chip-text {
    font-weight: 500;
  }

  .chip-badge {
    min-width: 18px;
    height: 18px;
    line-height: 18px;
    text-align: center;
    font-size: 0.625rem;
    font-weight: 700;
    border-radius: 9px;
    background: var(--van-border-color);
    color: var(--text-secondary);
    padding: 0 4px;
  }

  &.active {
    background: var(--color-primary-bg, rgba(26, 115, 232, 0.1));
    border-color: var(--color-primary, #1a73e8);
    color: var(--color-primary, #1a73e8);
    .chip-badge {
      background: var(--color-primary, #1a73e8);
      color: #fff;
    }
  }
}

.accounts-list {
  .account-item {
    background: var(--bg-secondary);
    border-radius: 8px;
    margin-bottom: 8px;
    padding: 16px;
    display: flex;
    align-items: center;
    box-shadow: none;

    .account-info {
      flex: 1;

      .account-header {
        display: flex;
        align-items: center;
        margin-bottom: 8px;

        .account-code {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin-right: 8px;
        }

        .account-type-badge {
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 10px;
          color: #fff;

          &.assets { background-color: var(--module-blue); }
          &.liabilities { background-color: var(--module-red); }
          &.equity { background-color: var(--module-green); }
          &.costs { background-color: var(--module-orange); }
          &.revenue { background-color: var(--module-purple); }
          &.expenses { background-color: var(--module-yellow); }
          &.default { background-color: #c8c9cc; }
        }
      }

      .account-name {
        font-size: 14px;
        color: var(--text-primary);
        margin-bottom: 8px;
      }

      .account-details {
        display: flex;
        justify-content: space-between;
        align-items: center;

        .balance {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .status {
          font-size: 12px;
          color: #ff4444;

          &.active {
            color: #00c853;
          }
        }
      }
    }

    .account-actions {
      margin-left: 12px;
      color: var(--text-secondary);
    }
  }
}

.create-dialog {
  height: 100%;
  display: flex;
  flex-direction: column;

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid var(--van-border-color);

    .dialog-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }
  }

  .dialog-content {
    flex: 1;
    padding: 16px;
    overflow-y: auto;

    .form-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 0;
      border-bottom: 1px solid var(--van-border-color);

      .form-label {
        font-size: 14px;
        color: var(--text-primary);
      }
    }

    .form-actions {
      display: flex;
      gap: 12px;
      margin-top: 24px;

      .van-button {
        flex: 1;
      }
    }
  }
}
</style>
