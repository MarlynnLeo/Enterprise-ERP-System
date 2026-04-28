<!--
/**
 * Entries.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="entries-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>{{ pageTitle }}</h2>
          <p class="subtitle">管理会计凭证与分录</p>
        </div>
        <el-button
          type="primary"
          :icon="Plus"
          @click="createEntry"
          v-permission="'finance:entries:create'">
          新增凭证
        </el-button>
      </div>
    </el-card>
    
    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="凭证编号">
          <el-input  v-model="searchForm.entryNumber" placeholder="输入凭证编号" clearable ></el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="searchEntries">查询</el-button>
          <el-button @click="resetSearch">重置</el-button>
          <el-button class="advanced-search-btn" @click="showAdvancedSearch = !showAdvancedSearch">
            {{ showAdvancedSearch ? '收起筛选' : '高级搜索' }}
            <el-icon style="margin-left: 4px;"><ArrowUp v-if="showAdvancedSearch" /><ArrowDown v-else /></el-icon>
          </el-button>
        </el-form-item>
      </el-form>
      <!-- 高级搜索区域 -->
      <el-form :inline="true" :model="searchForm" class="search-form" v-show="showAdvancedSearch" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #dcdfe6;">
        <el-form-item label="记账日期">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          ></el-date-picker>
        </el-form-item>
        <el-form-item label="单据类型" v-if="!fixedType">
          <el-select v-model="searchForm.documentType" placeholder="选择单据类型" clearable>
            <el-option
              v-for="type in glConfig.documentTypes"
              :key="type"
              :label="type"
              :value="type"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="会计期间">
          <el-select v-model="searchForm.periodId" placeholder="选择会计期间" clearable>
            <el-option
              v-for="period in periods"
              :key="period.id"
              :label="period.periodName || period.period_name"
              :value="period.id"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.isPosted" placeholder="选择状态" clearable>
            <el-option
              v-for="status in glConfig.entryStatuses"
              :key="status.value"
              :label="status.label"
              :value="status.value"
            />
          </el-select>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.total || 0 }}</div>
        <div class="stat-label">总凭证数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.posted || 0 }}</div>
        <div class="stat-label">已过账</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.unposted || 0 }}</div>
        <div class="stat-label">未过账</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(statistics.totalAmount || 0) }}</div>
        <div class="stat-label">总金额</div>
      </el-card>
    </div>

    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-table
        :data="entriesList"
        style="width: 100%"
        row-key="id"
        border
        v-loading="loading"
        @expand-change="handleExpandChange"
      >
        <el-table-column type="expand">
          <template #default="props">
            <div class="expanded-row">
              <div class="expanded-row-header">
                <h4>凭证明细</h4>
                <span class="expanded-row-description">{{ props.row.description }}</span>
              </div>
              <el-table :data="props.row.items || []" border style="width: 100%;" class="inner-table">
                <el-table-column prop="accountCode" label="科目编码" width="120"></el-table-column>
                <el-table-column prop="accountName" label="科目名称" width="180"></el-table-column>
                <el-table-column prop="debitAmount" label="借方金额" width="150">
                  <template #default="scope">
                    <span style="color: #67C23A;" v-if="scope.row.debitAmount > 0">{{ scope.row.debitAmount.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
                    <span style="color: #F56C6C;" v-else-if="scope.row.debitAmount < 0">{{ scope.row.debitAmount.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
                    <span v-else>-</span>
                  </template>
                </el-table-column>
                <el-table-column prop="creditAmount" label="贷方金额" width="150">
                  <template #default="scope">
                    <span style="color: #F56C6C;" v-if="scope.row.creditAmount > 0">{{ scope.row.creditAmount.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
                    <span style="color: #67C23A;" v-else-if="scope.row.creditAmount < 0">{{ scope.row.creditAmount.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
                    <span v-else>-</span>
                  </template>
                </el-table-column>
                <el-table-column prop="description" label="描述" show-overflow-tooltip></el-table-column>
              </el-table>
              <div class="expanded-row-footer">
                <div class="total-item">
                  <span class="label">借方合计：</span>
                  <span class="value debit">{{ (props.row.expandedTotalDebit || props.row.totalDebit || 0).toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
                </div>
                <div class="total-item">
                  <span class="label">贷方合计：</span>
                  <span class="value credit">{{ (props.row.expandedTotalCredit || props.row.totalCredit || 0).toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="entryNumber" label="凭证编号" width="160" show-overflow-tooltip></el-table-column>
        <el-table-column prop="entryDate" label="记账日期" width="100"></el-table-column>
        <el-table-column prop="postingDate" label="过账日期" width="100"></el-table-column>
        <el-table-column prop="documentType" label="单据类型" width="90" show-overflow-tooltip></el-table-column>
        <el-table-column prop="documentNumber" label="单据编号" width="160" show-overflow-tooltip></el-table-column>
        <el-table-column prop="periodName" label="会计期间" width="110" show-overflow-tooltip></el-table-column>
        <el-table-column label="借方合计" width="120" align="right">
          <template #default="scope">
            <span class="debit" v-if="scope.row.totalDebit">{{ scope.row.totalDebit.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="贷方合计" width="120" align="right">
          <template #default="scope">
            <span class="credit" v-if="scope.row.totalCredit">{{ scope.row.totalCredit.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.isPosted ? 'success' : 'info'">
              {{ scope.row.isPosted ? '已过账' : '未过账' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="冲销状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.isReversed ? 'warning' : ''" v-if="scope.row.isReversed">
              已冲销
            </el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdBy" label="创建人" width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="description" label="描述" min-width="150" show-overflow-tooltip></el-table-column>
        <el-table-column label="操作" min-width="220" fixed="right">
          <template #default="scope">
            <div class="operation-buttons">
              <!-- 查看按钮：始终显示 -->
              <el-button
                type="primary"
                size="small"
                @click="viewEntry(scope.row)"
              >查看</el-button>

              <!-- 过账按钮：只在未过账且未冲销时显示 -->
              <el-button
                v-if="!scope.row.isPosted && !scope.row.isReversed"
                type="success"
                size="small"
                @click="postEntry(scope.row)"
              >过账</el-button>

              <!-- 冲销按钮：只在已过账且未冲销时显示 -->
              <el-button
                v-if="scope.row.isPosted && !scope.row.isReversed"
                type="warning"
                size="small"
                @click="reverseEntry(scope.row)"
                v-permission="'finance:gl:entries'"
              >冲销</el-button>

              <!-- 删除按钮：只在未过账时显示 -->
              <el-button v-permission="'finance:entries:update'"
                v-if="!scope.row.isPosted"
                type="danger"
                size="small"
                @click="deleteEntry(scope.row)"
              >删除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="Math.max(parseInt(total) || 0, 1)"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        >
        </el-pagination>
      </div>
    </el-card>
    
    <!-- 查看凭证明细对话框 -->
    <el-dialog
      title="凭证明细"
      v-model="detailDialogVisible"
      width="900px"
    >
      <template #header>
        <div class="dialog-header">
          <span class="dialog-title">凭证明细</span>
          <el-button v-permission="'finance:entries:view'" type="primary" size="small" @click="handlePrint" :icon="Printer">打印凭证</el-button>
        </div>
      </template>
      <div ref="printAreaRef" class="print-area">
      <div class="entry-detail-header">
        <div class="detail-item">
          <span class="label">凭证编号：</span>
          <span class="value">{{ currentEntry.entryNumber }}</span>
        </div>
        <div class="detail-item">
          <span class="label">记账日期：</span>
          <span class="value">{{ currentEntry.entryDate }}</span>
        </div>
        <div class="detail-item">
          <span class="label">单据类型：</span>
          <span class="value">{{ currentEntry.documentType }}</span>
        </div>
        <div class="detail-item">
          <span class="label">状态：</span>
          <el-tag :type="currentEntry.isPosted ? 'success' : 'info'" size="small">
            {{ currentEntry.isPosted ? '已过账' : '未过账' }}
          </el-tag>
        </div>
      </div>
      
      <div class="entry-description">
        <span class="label">描述：</span>
        <span class="value">{{ currentEntry.description }}</span>
      </div>
      
      <el-table :data="currentEntryItems" border style="width: 100%; margin-top: 20px;">
        <el-table-column prop="accountCode" label="科目编码" width="120"></el-table-column>
        <el-table-column prop="accountName" label="科目名称" width="180"></el-table-column>
        <el-table-column prop="debitAmount" label="借方金额" width="150">
          <template #default="scope">
            <span style="color: #67C23A;" v-if="scope.row.debitAmount > 0">{{ scope.row.debitAmount.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
            <span style="color: #F56C6C;" v-else-if="scope.row.debitAmount < 0">{{ scope.row.debitAmount.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="creditAmount" label="贷方金额" width="150">
          <template #default="scope">
            <span style="color: #F56C6C;" v-if="scope.row.creditAmount > 0">{{ scope.row.creditAmount.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
            <span style="color: #67C23A;" v-else-if="scope.row.creditAmount < 0">{{ scope.row.creditAmount.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" show-overflow-tooltip></el-table-column>
      </el-table>
      
      <div class="entry-totals">
        <div class="total-item">
          <span class="label">借方合计：</span>
          <span class="value debit">{{ totalDebit.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
        </div>
        <div class="total-item">
          <span class="label">贷方合计：</span>
          <span class="value credit">{{ totalCredit.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
        </div>
      </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
// Vue核心和路由
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { formatDate } from '@/utils/helpers/dateUtils'
import { formatCurrency } from '@/utils/format'
import { useRouter, useRoute } from 'vue-router';

// Element Plus
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Printer, ArrowUp, ArrowDown } from '@element-plus/icons-vue';

// Pinia Stores
import { useFinanceStore } from '@/stores/finance';
import { storeToRefs } from 'pinia';

// 项目工具和API
import { api } from '@/services/api';


// Props定义
const props = defineProps({
  fixedType: {
    type: String,
    default: ''
  }
});

// Stores初始化
const financeStore = useFinanceStore();
const { glConfig } = storeToRefs(financeStore);

// 权限计算属性



// 路由
const route = useRoute();
const router = useRouter();

// 页面标题
const pageTitle = computed(() => props.fixedType || route.query.type || '会计凭证管理');

// 高级搜索展开状态
const showAdvancedSearch = ref(false);

// 数据加载状态
const loading = ref(false);

// 分页相关
const total = ref(0);
const pageSize = ref(10);
const currentPage = ref(1);

// 凭证列表
const entriesList = ref([]);

// 统计数据
const statistics = reactive({
  total: 0,
  posted: 0,
  unposted: 0,
  totalAmount: 0
});

// 详情对话框相关
const detailDialogVisible = ref(false);
const currentEntry = ref({});
const currentEntryItems = ref([]);
const printAreaRef = ref(null);

// 打印凭证
const handlePrint = () => {
  if (!printAreaRef.value) {
    ElMessage.warning('打印区域未就绪');
    return;
  }
  
  const printContent = printAreaRef.value.innerHTML;
  const printWindow = window.open('', '_blank');
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>凭证打印 - ${currentEntry.value.entryNumber}</title>
      <style>
        body { 
          font-family: 'Microsoft YaHei', SimHei, sans-serif; 
          padding: 20px;
          margin: 0;
        }
        .print-title {
          text-align: center;
          font-size: 20px;
          font-weight: bold;
          margin-bottom: 20px;
          border-bottom: 2px solid #333;
          padding-bottom: 10px;
        }
        .entry-detail-header { 
          display: flex; 
          flex-wrap: wrap; 
          gap: 20px; 
          margin-bottom: 15px;
          padding: 10px;
          background: #f5f5f5;
          border-radius: 4px;
        }
        .detail-item { display: flex; }
        .detail-item .label { font-weight: bold; margin-right: 5px; }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin: 15px 0;
        }
        th, td { 
          border: 1px solid #333; 
          padding: 8px; 
          text-align: left; 
        }
        th { 
          background: #e0e0e0; 
          font-weight: bold;
        }
        .entry-totals { 
          display: flex; 
          justify-content: flex-end; 
          gap: 30px; 
          margin-top: 15px;
          padding: 10px;
          border-top: 2px solid #333;
        }
        .debit { color: var(--color-primary); }
        .credit { color: var(--color-danger); }
        .signature-area {
          display: flex;
          justify-content: space-between;
          margin-top: 50px;
          padding-top: 20px;
        }
        .signature-item {
          text-decoration: underline;
          min-width: 100px;
        }
        @media print {
          body { -webkit-print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="print-title">记   账   凭   证</div>
      ${printContent}
      <div class="signature-area">
        <div>制单人：_____________</div>
        <div>审核人：_____________</div>
        <div>记账：_____________</div>
        <div>主管：_____________</div>
      </div>
    </body>
    </html>
  `);
  
  printWindow.document.close();
  printWindow.focus();
  
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
};

// 计算借贷方合计
const totalDebit = computed(() => {
  return currentEntryItems.value.reduce((sum, item) => sum + (item.debitAmount || 0), 0);
});

const totalCredit = computed(() => {
  return currentEntryItems.value.reduce((sum, item) => sum + (item.creditAmount || 0), 0);
});

// 会计期间列表
const periods = ref([]);

// 搜索表单
const searchForm = reactive({
  entryNumber: '',
  dateRange: [],
  documentType: '',
  periodId: '',
  isPosted: ''
});

// 加载凭证列表
const loadEntries = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value
    };
    
    // 添加筛选条件
    if (searchForm.entryNumber) {
      params.entry_number = searchForm.entryNumber;
    }
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.start_date = searchForm.dateRange[0];
      params.end_date = searchForm.dateRange[1];
    }
    // 如果有 fixedType（付款凭证/收款凭证/转账凭证页面），转换为voucher_word筛选
    if (props.fixedType) {
      // 根据fixedType映射到对应的凭证字
      const voucherWordMap = {
        '收款单': '收',
        '收款凭证': '收',
        '付款单': '付',
        '付款凭证': '付',
        '转账凭证': '转',
        '记账凭证': '记'
      };
      const voucherWord = voucherWordMap[props.fixedType];
      if (voucherWord) {
        params.voucher_word = voucherWord;
      } else {
        // 如果没有映射，仍按document_type筛选
        params.document_type = props.fixedType;
      }
    } else if (searchForm.documentType) {
      params.document_type = searchForm.documentType;
    }
    if (searchForm.periodId) {
      params.period_id = searchForm.periodId;
    }
    if (searchForm.isPosted !== '') {
      params.is_posted = searchForm.isPosted;
    }
    
    const response = await api.get('/finance/entries', { params });
    // 根据后端返回的实际数据结构调整
    if (response.data.entries && Array.isArray(response.data.entries)) {
      // 提取基本数据
      entriesList.value = response.data.entries.map(entry => ({
        id: entry.id,
        // 优先显示标准凭证号: 字-号
        entryNumber: (entry.voucher_word && entry.voucher_number) 
          ? `${entry.voucher_word}-${entry.voucher_number}` 
          : entry.entry_number,
        technicalId: entry.entry_number, // 保留技术ID供参考
        entryDate: formatDate(entry.entry_date),
        postingDate: formatDate(entry.posting_date),
        documentType: entry.document_type,
        documentNumber: entry.document_number,
        periodId: entry.period_id,
        periodName: entry.period_name || `期间 ${entry.period_id}`, // 使用从后端返回的期间名称
        fiscalYear: entry.fiscal_year,
        isPosted: entry.is_posted,
        isReversed: entry.is_reversed,
        // 优先使用真实姓名，如果没有则使用用户名，最后使用created_by原值
        createdBy: entry.creator_name || entry.creator_username || entry.created_by,
        description: entry.description || '-',
        totalDebit: entry.total_debit || 0,  // 如果后端返回了借方合计就使用，否则默认为0
        totalCredit: entry.total_credit || 0 // 如果后端返回了贷方合计就使用，否则默认为0
      }));
      
      // 设置分页信息
      if (response.data.pagination) {
        total.value = response.data.pagination.total;
      } else {
        total.value = entriesList.value.length;
      }
      


      // 使用后端返回的统计数据（真实总量）
      calculateStatistics(response.data.statistics);
    } else {
      ElMessage.warning('返回的数据格式不正确');
      entriesList.value = [];
      total.value = 0;
      // 重置统计数据
      statistics.total = 0;
      statistics.posted = 0;
      statistics.unposted = 0;
      statistics.totalAmount = 0;
    }
  } catch (error) {
    console.error('加载凭证列表失败:', error);
    ElMessage.error('加载凭证列表失败');
    entriesList.value = [];
    total.value = 0;
    // 重置统计数据
    statistics.total = 0;
    statistics.posted = 0;
    statistics.unposted = 0;
    statistics.totalAmount = 0;
  } finally {
    loading.value = false;
  }
};

// 使用后端返回的统计数据（反映筛选后的真实总量，而非当前页）
const calculateStatistics = (serverStats) => {
  if (serverStats) {
    statistics.total = serverStats.total || 0;
    statistics.posted = serverStats.posted || 0;
    statistics.unposted = serverStats.unposted || 0;
    statistics.totalAmount = serverStats.totalAmount || 0;
  } else {
    // 降级方案：后端未返回统计时使用当前页数据
    const pageTotal = entriesList.value.length;
    const posted = entriesList.value.filter(entry => entry.isPosted).length;
    statistics.total = total.value || pageTotal;
    statistics.posted = posted;
    statistics.unposted = pageTotal - posted;
    statistics.totalAmount = entriesList.value.reduce((sum, entry) => {
      return sum + (parseFloat(entry.totalDebit) || 0);
    }, 0);
  }
};

// 搜索凭证
const searchEntries = () => {
  currentPage.value = 1;
  loadEntries();
};

// 重置搜索条件
const resetSearch = () => {
  searchForm.entryNumber = '';
  searchForm.dateRange = [];
  searchForm.documentType = '';
  searchForm.isPosted = '';
  searchEntries();
};

// 查看凭证详情
const viewEntry = async (row) => {
  try {
    const response = await api.get(`/finance/entries/${row.id}/items`);
    currentEntry.value = row;
    // 确保获取到的数据能正确映射到前端需要的属性
    if (Array.isArray(response.data)) {
      currentEntryItems.value = response.data;
    } else {
      console.error('获取到的凭证明细数据格式不正确:', response.data);
      currentEntryItems.value = [];
      ElMessage.warning('获取到的凭证明细数据格式不正确');
    }
    detailDialogVisible.value = true;
  } catch (error) {
    console.error('加载凭证明细失败:', error);
    ElMessage.error('加载凭证明细失败');
  }
};

// 新增凭证
const createEntry = () => {
  router.push({
    path: '/finance/gl/entries/create',
    query: { type: props.fixedType || route.query.type }
  });
};

// 过账凭证
const postEntry = (row) => {
  ElMessageBox.confirm('确认要过账该凭证吗？过账后将无法修改或删除。', '确认过账', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await api.patch(`/finance/entries/${row.id}/post`);
      ElMessage.success('过账成功');
      loadEntries();
    } catch (error) {
      console.error('过账凭证失败:', error);
      ElMessage.error('过账凭证失败');
    }
  }).catch(() => {});
};

// 冲销凭证
const reverseEntry = (row) => {
  // 首先准备冲销凭证所需数据
  const currentDate = new Date().toISOString().split('T')[0];
  const reversalForm = reactive({
    entry_number: `R-${row.entryNumber}`, // 冲销凭证编号前缀R
    entry_date: currentDate,
    posting_date: currentDate,
    period_id: row.periodId,
    description: `冲销凭证：${row.entryNumber}`
    // 不需要传递 created_by，后端会自动使用当前登录用户的ID
  });

  ElMessageBox.confirm('确认要冲销该凭证吗？将会创建一个与之相反的冲销凭证。', '确认冲销', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await api.post(
        `/finance/entries/${row.id}/reverse`,
        reversalForm
      );
      ElMessage.success('冲销成功');
      loadEntries();
    } catch (error) {
      console.error('冲销凭证失败:', error);
      ElMessage.error('冲销凭证失败');
    }
  }).catch(() => {});
};

// 删除凭证
const deleteEntry = (row) => {
  ElMessageBox.confirm('确认要删除该凭证吗？此操作不可逆。', '警告', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await api.delete(`/finance/entries/${row.id}`);
      ElMessage.success('删除成功');
      loadEntries();
    } catch (error) {
      console.error('删除凭证失败:', error);
      ElMessage.error('删除凭证失败');
    }
  }).catch(() => {});
};

// 处理展开行事件，加载凭证明细
const handleExpandChange = async (row, expandedRows) => {
  // 如果行被展开，且还没有加载过明细数据
  if (expandedRows.includes(row) && !row.items) {
    try {
      const response = await api.get(`/finance/entries/${row.id}/items`);
      if (Array.isArray(response.data)) {
        // 为当前行添加明细数据
        row.items = response.data;
        
        // 计算并添加展开行的借贷方合计
        row.expandedTotalDebit = response.data.reduce((sum, item) => sum + (item.debitAmount || 0), 0);
        row.expandedTotalCredit = response.data.reduce((sum, item) => sum + (item.creditAmount || 0), 0);
      } else {
        console.error('获取到的凭证明细数据格式不正确:', response.data);
        row.items = [];
        ElMessage.warning('获取到的凭证明细数据格式不正确');
      }
    } catch (error) {
      console.error(`加载凭证${row.id}明细失败:`, error);
      row.items = [];
      ElMessage.error(`加载凭证明细失败: ${error.message}`);
    }
  }
};

// 加载会计期间列表
const loadPeriods = async () => {
  try {
    const response = await api.get('/finance/periods');
    if (Array.isArray(response.data)) {
      periods.value = response.data.map(period => ({
        id: period.id,
        periodName: period.period_name,
        period_name: period.period_name,
        fiscalYear: period.fiscal_year,
        startDate: period.start_date,
        start_date: period.start_date,
        endDate: period.end_date,
        end_date: period.end_date,
        isClosed: period.is_closed,
        is_closed: period.is_closed
      }));
    } else if (response.data.periods) {
      periods.value = response.data.periods.map(period => ({
        id: period.id,
        periodName: period.period_name,
        period_name: period.period_name,
        fiscalYear: period.fiscal_year,
        startDate: period.start_date,
        start_date: period.start_date,
        endDate: period.end_date,
        end_date: period.end_date,
        isClosed: period.is_closed,
        is_closed: period.is_closed
      }));
    }
  } catch (error) {
    console.error('加载会计期间失败:', error);
    ElMessage.error('加载会计期间失败');
  }
};

// 分页相关方法
const handleSizeChange = (size) => {
  pageSize.value = size;
  loadEntries();
};

const handleCurrentChange = (page) => {
  currentPage.value = page;
  loadEntries();
};

// 页面加载时执行
onMounted(() => {
  loadPeriods();
  financeStore.loadSettings();
});

// 监听fixedType和路由变化，重新加载数据
watch(() => [props.fixedType, route.query.type], () => {
  currentPage.value = 1;
  loadEntries();
}, { immediate: true });
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

.title-section h2 {
  margin: 0 0 5px 0;
  font-size: 20px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.entry-detail-header {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: var(--spacing-lg);
}

.detail-item {
  margin-right: 30px;
  margin-bottom: 10px;
}

.entry-description {
  margin-bottom: var(--spacing-lg);
}

.entry-totals {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--spacing-lg);
}

.total-item {
  margin-left: 30px;
}

.debit {
  color: var(--color-success);
  font-weight: bold;
}

.credit {
  color: var(--color-danger);
  font-weight: bold;
}

.label {
  font-weight: bold;
  margin-right: 8px;
}



/* 展开行样式 */
.expanded-row {
  padding: 20px;
  background-color: #f9f9f9;
}

.expanded-row-header {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
}

.expanded-row-header h4 {
  margin: 0;
  margin-right: 20px;
  color: var(--color-primary);
}

.expanded-row-description {
  color: var(--color-text-regular);
  font-style: italic;
}

.inner-table {
  margin-bottom: 15px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.expanded-row-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 15px;
  border-top: 1px dashed #dcdfe6;
}

.expanded-row-footer .total-item {
  margin-left: 30px;
}

.expanded-row-footer .total-item .label {
  font-size: 14px;
}

.expanded-row-footer .total-item .value {
  font-size: 16px;
}


/* 详情对话框长文本处理 - 自动添加 */
:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 确保表格单元格内容不换行 */
:deep(.el-table .cell) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 操作按钮列允许换行 */
:deep(.el-table .operation-buttons) {
  white-space: normal;
}

/* 打印对话框头部样式 */
.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding-right: 40px;
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

/* 打印区域样式 */
.print-area {
  padding: 10px;
}

@media print {
  .print-area {
    padding: 0;
  }
}
</style> 