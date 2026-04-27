<template>
  <div class="page-container">
    <!-- 页面头部卡片 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>合同管理</h2>
          <p class="subtitle">管理采购、销售、服务等合同的全生命周期</p>
        </div>
        <el-button type="primary" @click="openForm()">新建合同</el-button>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" class="search-form">
        <el-form-item label="搜索">
          <el-input v-model="keyword" placeholder="合同编号/名称/甲乙方" clearable @keyup.enter="fetchList">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="filterType" placeholder="全部" clearable @change="fetchList">
            <el-option label="采购合同" value="purchase" />
            <el-option label="销售合同" value="sales" />
            <el-option label="服务合同" value="service" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filterStatus" placeholder="全部" clearable @change="fetchList">
            <el-option label="草稿" value="draft" />
            <el-option label="待审批" value="pending_approval" />
            <el-option label="生效" value="active" />
            <el-option label="执行中" value="executing" />
            <el-option label="已完成" value="completed" />
            <el-option label="已终止" value="terminated" />
            <el-option label="已过期" value="expired" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="fetchList">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table :data="tableData" v-loading="loading" border stripe style="width:100%">
      <el-table-column prop="code" label="合同编号" width="160" />
      <el-table-column prop="name" label="合同名称" min-width="200" show-overflow-tooltip />
      <el-table-column prop="type" label="类型" width="100">
        <template #default="{ row }">
          <el-tag :type="typeTagMap[row.type]" size="small">{{ typeLabel[row.type] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagMap[row.status]" size="small">{{ statusLabel[row.status] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="party_b" label="对方单位" min-width="160" show-overflow-tooltip />
      <el-table-column prop="total_amount" label="金额" width="130" align="right">
        <template #default="{ row }">{{ formatAmount(row.total_amount) }}</template>
      </el-table-column>
      <el-table-column prop="effective_date" label="生效日期" width="110" />
      <el-table-column prop="expiry_date" label="到期日期" width="110" />
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="viewDetail(row)">查看</el-button>
          <el-button link type="primary" @click="openForm(row)">编辑</el-button>
          <el-popconfirm title="确定删除此合同？" @confirm="handleDelete(row.id)">
            <template #reference><el-button link type="danger">删除</el-button></template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

      <div class="pagination-container">
        <el-pagination v-model:current-page="page" v-model:page-size="pageSize"
          :total="total" :page-sizes="[20,50,100]" layout="total, sizes, prev, pager, next" @change="fetchList" />
      </div>
    </el-card>

    <!-- 合同表单对话框 -->
    <el-dialog v-model="formVisible" :title="formData.id ? '编辑合同' : '新建合同'" width="800px" destroy-on-close>
      <el-form :model="formData" label-width="100px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="合同名称" required>
              <el-input v-model="formData.name" placeholder="请输入合同名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="合同类型" required>
              <el-select v-model="formData.type" style="width:100%">
                <el-option label="采购合同" value="purchase" />
                <el-option label="销售合同" value="sales" />
                <el-option label="服务合同" value="service" />
                <el-option label="其他" value="other" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="甲方" required>
              <el-input v-model="formData.party_a" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="乙方" required>
              <el-input v-model="formData.party_b" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="合同金额">
              <el-input-number v-model="formData.total_amount" :min="0" :precision="2" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="生效日期">
              <el-date-picker v-model="formData.effective_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="到期日期">
              <el-date-picker v-model="formData.expiry_date" type="date" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="付款条件">
          <el-input v-model="formData.payment_terms" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="合同摘要">
          <el-input v-model="formData.content" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- 合同详情对话框 -->
    <el-dialog v-model="detailVisible" title="合同详情" width="900px" destroy-on-close>
      <template v-if="detailData">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="合同编号">{{ detailData.code }}</el-descriptions-item>
          <el-descriptions-item label="合同名称">{{ detailData.name }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ typeLabel[detailData.type] }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusTagMap[detailData.status]">{{ statusLabel[detailData.status] }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="甲方">{{ detailData.party_a }}</el-descriptions-item>
          <el-descriptions-item label="乙方">{{ detailData.party_b }}</el-descriptions-item>
          <el-descriptions-item label="合同金额">{{ formatAmount(detailData.total_amount) }}</el-descriptions-item>
          <el-descriptions-item label="执行进度">{{ detailData.execution_rate }}%</el-descriptions-item>
          <el-descriptions-item label="生效日期">{{ detailData.effective_date || '--' }}</el-descriptions-item>
          <el-descriptions-item label="到期日期">{{ detailData.expiry_date || '--' }}</el-descriptions-item>
        </el-descriptions>

        <h4 style="margin:16px 0 8px">合同明细</h4>
        <el-table :data="detailData.items || []" border size="small" max-height="200">
          <el-table-column prop="material_name" label="物料名称" />
          <el-table-column prop="specification" label="规格" />
          <el-table-column prop="quantity" label="数量" width="80" />
          <el-table-column prop="unit_price" label="单价" width="100" />
          <el-table-column prop="amount" label="金额" width="120" />
        </el-table>

        <h4 style="margin:16px 0 8px">执行记录</h4>
        <el-table :data="detailData.executions || []" border size="small" max-height="200">
          <el-table-column prop="execution_type" label="类型" width="100" />
          <el-table-column prop="business_code" label="单据编号" />
          <el-table-column prop="amount" label="金额" width="120" />
          <el-table-column prop="executed_at" label="时间" width="160" />
        </el-table>

        <h4 style="margin:16px 0 8px">关联单据</h4>
        <el-table :data="detailData.document_links || []" border size="small" max-height="200">
          <el-table-column prop="related_type_label" label="关联类型" width="120" />
          <el-table-column prop="related_code" label="单据编号" />
          <el-table-column prop="direction" label="方向" width="80">
            <template #default="{ row }">{{ row.direction === 'forward' ? '→ 下游' : '← 上游' }}</template>
          </el-table-column>
        </el-table>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { contractApi } from '@/api/contract'

const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
const filterType = ref('')
const filterStatus = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const tableData = ref([])
const formVisible = ref(false)
const detailVisible = ref(false)
const formData = ref({})
const detailData = ref(null)

const typeLabel = { purchase: '采购合同', sales: '销售合同', service: '服务合同', other: '其他' }
const typeTagMap = { purchase: 'warning', sales: 'success', service: 'primary', other: 'info' }
const statusLabel = { draft: '草稿', pending_approval: '待审批', active: '生效', executing: '执行中', completed: '已完成', terminated: '已终止', expired: '已过期' }
const statusTagMap = { draft: 'info', pending_approval: 'warning', active: 'success', executing: 'primary', completed: '', terminated: 'danger', expired: 'danger' }

const formatAmount = (v) => v != null ? Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '--'

const fetchList = async () => {
  loading.value = true
  try {
    const res = await contractApi.getList({ keyword: keyword.value, type: filterType.value, status: filterStatus.value, page: page.value, pageSize: pageSize.value })
    const d = res.data || res
    tableData.value = d.list || []
    total.value = d.total || 0
  } catch (e) { ElMessage.error('获取合同列表失败') }
  finally { loading.value = false }
}

const openForm = (row) => {
  formData.value = row ? { ...row } : { type: 'purchase', total_amount: 0 }
  formVisible.value = true
}

const handleSave = async () => {
  saving.value = true
  try {
    if (formData.value.id) {
      await contractApi.update(formData.value.id, formData.value)
    } else {
      await contractApi.create(formData.value)
    }
    ElMessage.success('保存成功')
    formVisible.value = false
    fetchList()
  } catch (e) { ElMessage.error(e.message || '保存失败') }
  finally { saving.value = false }
}

const handleDelete = async (id) => {
  try {
    await contractApi.delete(id)
    ElMessage.success('删除成功')
    fetchList()
  } catch (e) { ElMessage.error('删除失败') }
}

const viewDetail = async (row) => {
  try {
    const res = await contractApi.getById(row.id)
    detailData.value = res.data || res
    detailVisible.value = true
  } catch (e) { ElMessage.error('获取合同详情失败') }
}

onMounted(fetchList)
</script>

<style scoped>
/* 页面专属样式已由 common-styles.css 统一提供 */
</style>
