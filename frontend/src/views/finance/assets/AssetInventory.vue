<template>
  <div class="asset-inventory-container">
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>资产盘点管理</span>
          <div class="header-actions">
            <el-button type="primary" :icon="Plus" @click="showAddDialog">新建盘点</el-button>
          </div>
        </div>
      </template>

      <!-- 搜索栏 -->
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="盘点状态">
          <el-select v-model="searchForm.status" placeholder="选择状态" clearable>
            <el-option label="进行中" value="进行中"></el-option>
            <el-option label="已完成" value="已完成"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="searchInventories">查询</el-button>
          <el-button @click="resetSearch">重置</el-button>
        </el-form-item>
      </el-form>
      
      <!-- 表格 -->
      <el-table :data="inventoryList" v-loading="loading" border style="width: 100%; margin-top: 15px;">
        <el-table-column prop="inventory_no" label="盘点单号" width="160"></el-table-column>
        <el-table-column prop="title" label="盘点标题" min-width="200"></el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.status === '已完成' ? 'success' : 'warning'">
              {{ scope.row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="total_items" label="总资产数" width="100" align="center"></el-table-column>
        <el-table-column label="盘点进度/结果" width="220" align="center">
          <template #default="scope">
            <template v-if="scope.row.status === '已完成'">
              <span class="text-success" v-if="scope.row.matched_items">一致: {{ scope.row.matched_items }}</span>
              <span class="text-warning" v-if="scope.row.surplus_items">盈: {{ scope.row.surplus_items }}</span>
              <span class="text-danger" v-if="scope.row.shortage_items">亏: {{ scope.row.shortage_items }}</span>
            </template>
            <template v-else>
              已盘: {{ Number(scope.row.matched_items || 0) + Number(scope.row.surplus_items || 0) + Number(scope.row.shortage_items || 0) }} / {{ scope.row.total_items }}
            </template>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160">
          <template #default="scope">
            {{ formatDate(scope.row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="scope">
            <el-button size="small" type="primary" @click="viewDetail(scope.row)">
              {{ scope.row.status === '进行中' ? '去盘点' : '查看报告' }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container" style="margin-top: 20px; text-align: right;">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- 新建盘点对话框 -->
    <el-dialog title="新建盘点单" v-model="dialogVisible" width="500px">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="盘点标题" prop="title">
          <el-input v-model="form.title" placeholder="如：2023年终固定资产盘点"></el-input>
        </el-form-item>
        <el-form-item label="备注说明" prop="notes">
          <el-input type="textarea" v-model="form.notes" :rows="3" placeholder="可选填"></el-input>
        </el-form-item>
      </el-form>
      <div style="margin: 10px 0 0 100px; color: #909399; font-size: 13px;">
        <el-icon><InfoFilled /></el-icon> 将自动把所有在用、闲置的资产加入盘点范围
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitCreate" :loading="submitLoading">确认创建</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 盘点详情对话框 (简化版,也可单独做页面) -->
    <el-dialog 
      :title="detailData.status === '进行中' ? '资产盘点执行' : '资产盘点报告'" 
      v-model="detailVisible" 
      width="60%" 
      custom-class="inventory-detail-dialog"
      top="5vh">
      
      <div v-if="detailData.id" class="detail-layout">
        <div class="header-info">
          <el-descriptions :column="3" border>
            <el-descriptions-item label="盘点单号">{{ detailData.inventory_no }}</el-descriptions-item>
            <el-descriptions-item label="标题">{{ detailData.title }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="detailData.status === '已完成' ? 'success' : 'warning'">
                {{ detailData.status }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="盘点总计">
              共 {{ detailData.items?.length || 0 }} 项
            </el-descriptions-item>
            <el-descriptions-item label="备注说明" :span="2">{{ detailData.notes || '无' }}</el-descriptions-item>
          </el-descriptions>
        </div>

        <div style="margin: 15px 0;">
          <el-radio-group v-model="itemFilter" size="small">
            <el-radio-button value="all">全部</el-radio-button>
            <el-radio-button value="未盘点">未盘点</el-radio-button>
            <el-radio-button value="盘点相符">盘点相符</el-radio-button>
            <el-radio-button value="盘盈">盘盈</el-radio-button>
            <el-radio-button value="盘亏">盘亏</el-radio-button>
          </el-radio-group>
        </div>

        <el-table :data="filteredItems" border height="400" v-loading="detailLoading">
          <el-table-column prop="asset_code" label="资产编号" width="220"></el-table-column>
          <el-table-column prop="asset_name" label="资产名称" min-width="200"></el-table-column>
          <el-table-column prop="category_name" label="类别" width="110"></el-table-column>
          <el-table-column prop="department" label="部门" width="100"></el-table-column>
          <el-table-column prop="book_quantity" label="账面数量" width="100" align="center"></el-table-column>
          <el-table-column label="实盘数量" width="100" align="center">
            <template #default="scope">
              <span v-if="detailData.status === '已完成'">{{ scope.row.actual_quantity !== null ? scope.row.actual_quantity : '-' }}</span>
              <el-input-number 
                v-else
                v-model="scope.row.editValue" 
                :min="0"
                controls-position="right"
                style="width: 100%"
                size="small"
                @change="(val) => handleQuantityChange(scope.row, val)"
              ></el-input-number>
            </template>
          </el-table-column>
          <el-table-column label="盘点状态" width="120" align="center">
            <template #default="scope">
              <el-tag :type="getItemStatusType(scope.row.status)">
                {{ scope.row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="备注说明" min-width="150">
            <template #default="scope">
              <span v-if="detailData.status === '已完成'">{{ scope.row.notes || '-' }}</span>
              <el-input v-else v-model="scope.row.editNotes" size="small" placeholder="差异说明..." @blur="saveItemNotes(scope.row)"></el-input>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right" v-if="detailData.status === '进行中'">
            <template #default="scope">
              <el-button 
                type="success" 
                size="small" 
                link 
                v-if="scope.row.status === '未盘点' && scope.row.editValue === undefined"
                @click="fastMatch(scope.row)"
              >
                账实相符
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="detailVisible = false">关闭</el-button>
          <el-button 
            type="primary" 
            v-if="detailData.status === '进行中'"
            @click="completeInventory" 
            :loading="completeLoading"
          >
            完成盘点提交
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { Plus, InfoFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/services/api'
import { parsePaginatedData, parseDataObject } from '@/utils/responseParser'
import { formatDate } from '@/utils/helpers/formatters'

const loading = ref(false)
const inventoryList = ref([])

// 搜索栏
const searchForm = reactive({
  status: ''
})

// 分页
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)

// 列表查询
const loadInventories = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      status: searchForm.status
    }
    const response = await api.get('/finance/assets-inventory', { params })
    const { list, total: totalCount } = parsePaginatedData(response, { enableLog: false })
    inventoryList.value = list
    total.value = totalCount
  } catch (err) {
    ElMessage.error('加载盘点列表失败')
  } finally {
    loading.value = false
  }
}

const searchInventories = () => {
  currentPage.value = 1
  loadInventories()
}

const resetSearch = () => {
  searchForm.status = ''
  currentPage.value = 1
  loadInventories()
}

const handleSizeChange = (val) => {
  pageSize.value = val
  loadInventories()
}

const handleCurrentChange = (val) => {
  currentPage.value = val
  loadInventories()
}

// 新建盘点
const dialogVisible = ref(false)
const submitLoading = ref(false)
const formRef = ref(null)
const form = reactive({
  title: '',
  notes: ''
})
const rules = {
  title: [{ required: true, message: '请输入盘点标题', trigger: 'blur' }]
}

const showAddDialog = () => {
  if (formRef.value) formRef.value.resetFields()
  form.title = `固定资产盘点-${formatDate(new Date(), 'YYYYMMDD')}`
  form.notes = ''
  dialogVisible.value = true
}

const submitCreate = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (valid) {
      submitLoading.value = true
      try {
        await api.post('/finance/assets-inventory', form)
        ElMessage.success('盘点单创建成功')
        dialogVisible.value = false
        loadInventories()
      } catch (err) {
        ElMessage.error(err.response?.data?.message || '创建失败，可能存在未完成的盘点单')
      } finally {
        submitLoading.value = false
      }
    }
  })
}

// 盘点详情
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailData = ref({})
const itemFilter = ref('all')
const completeLoading = ref(false)

const getItemStatusType = (status) => {
  switch(status) {
    case '盘点相符': return 'success'
    case '盘盈': return 'warning'
    case '盘亏': return 'danger'
    default: return 'info'
  }
}

const filteredItems = computed(() => {
  if (!detailData.value.items) return []
  if (itemFilter.value === 'all') return detailData.value.items
  return detailData.value.items.filter(item => item.status === itemFilter.value)
})

const viewDetail = async (row) => {
  detailLoading.value = true
  detailVisible.value = true
  itemFilter.value = 'all'
  detailData.value = { ...row, items: [] }
  
  try {
    const res = await api.get(`/finance/assets-inventory/${row.id}`)
    const data = parseDataObject(res, { enableLog: false })
    
    // 初始化编辑状态
    if (data.status === '进行中' && data.items) {
      data.items.forEach(item => {
        item.editValue = item.actual_quantity !== null ? item.actual_quantity : undefined
        item.editNotes = item.notes || ''
      })
    }
    
    detailData.value = data
  } catch (err) {
    ElMessage.error('加载详情失败')
    detailVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

// 快速设为账实相符
const fastMatch = async (row) => {
  row.editValue = row.book_quantity
  await updateItem(row, row.book_quantity, '盘点相符', row.editNotes)
}

// 手动输入实盘数量
const handleQuantityChange = async (row, val) => {
  if (val === undefined || val === null) return
  
  let status = '盘点相符'
  if (val > row.book_quantity) status = '盘盈'
  else if (val < row.book_quantity) status = '盘亏'
  
  await updateItem(row, val, status, row.editNotes)
}

// 保存备注
const saveItemNotes = async (row) => {
  if (row.editValue !== undefined && row.editValue !== null) {
    let status = '盘点相符'
    if (row.editValue > row.book_quantity) status = '盘盈'
    else if (row.editValue < row.book_quantity) status = '盘亏'
    
    await updateItem(row, row.editValue, status, row.editNotes)
  }
}

// 统一下发单条更新
const updateItem = async (row, actualQty, status, notes) => {
  try {
    await api.put(`/finance/assets-inventory/${detailData.value.id}/items/${row.id}`, {
      actual_quantity: actualQty,
      status: status,
      notes: notes
    })
    row.actual_quantity = actualQty
    row.status = status
    row.notes = notes
  } catch (err) {
    ElMessage.error('更新明细记录失败')
  }
}

// 完成盘点提交
const completeInventory = async () => {
  const uncounted = detailData.value.items.filter(item => item.status === '未盘点')
  if (uncounted.length > 0) {
    return ElMessage.warning(`还有 ${uncounted.length} 项资产未录入实盘数据`)
  }
  
  ElMessageBox.confirm('确认完成盘点？提交后将不可修改实盘数据并自动计算盈亏。', '操作提示', {
    type: 'warning'
  }).then(async () => {
    completeLoading.value = true
    try {
      await api.post(`/finance/assets-inventory/${detailData.value.id}/complete`)
      ElMessage.success('盘点完成')
      detailVisible.value = false
      loadInventories()
    } catch (err) {
      ElMessage.error(err.response?.data?.message || '完成盘点失败')
    } finally {
      completeLoading.value = false
    }
  }).catch(() => {})
}

onMounted(() => {
  loadInventories()
})
</script>

<style scoped>
.text-success { color: #67c23a; margin-right: 5px;}
.text-warning { color: #e6a23c; margin-right: 5px;}
.text-danger { color: #f56c6c; margin-right: 5px;}

.asset-inventory-container {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-actions {
  display: flex;
  gap: 10px;
}
</style>
