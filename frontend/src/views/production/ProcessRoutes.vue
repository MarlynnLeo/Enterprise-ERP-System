<template>
  <div class="module-page page-container">
    <PageHeader title="工序路线管理" subtitle="定义产品的装配工序路线，配置每道工序的工位、工时和物料">
      <template #actions>
<el-button type="primary" v-permission="'production:routes:create'" @click="openCreateDialog">
            <el-icon><Plus /></el-icon> 新增路线
          </el-button>
      </template>
    </PageHeader>

    <!-- 筛选 -->
    <el-card class="data-card">
      <el-form :inline="true" class="mb-md">
        <el-form-item label="关键字">
          <el-input v-model="filters.keyword" placeholder="路线名称/产品名称" clearable class="form-control-lg" @keyup.enter="loadList" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.isActive" placeholder="全部" clearable class="form-control-100" @change="loadList">
            <el-option label="启用" :value="1" />
            <el-option label="停用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadList">查询</el-button>
        </el-form-item>
      </el-form>

      <el-table class="table-row-click" :data="list" v-loading="loading" border stripe
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => viewDetail(row.id))">
        <el-table-column prop="productCode" label="产品编码" width="130" />
        <el-table-column prop="productName" label="产品名称" min-width="150" />
        <el-table-column prop="name" label="路线名称" width="160" />
        <el-table-column prop="version" label="版本" width="80" align="center" />
        <el-table-column prop="stepCount" label="工序数" width="80" align="center">
          <template #default="{ row }">
            <el-tag type="info" size="small">{{ row.stepCount }} 道</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="totalStandardMinutes" label="总标准工时" width="120" align="center">
          <template #default="{ row }">{{ row.totalStandardMinutes || 0 }} 分钟</template>
        </el-table-column>
        <el-table-column prop="isActive" label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'info'" size="small">
              {{ row.isActive ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="280" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="{ row }">
            <div class="table-actions">
              
              <el-button size="small" v-permission="'production:routes:update'" @click="editRoute(row.id)">
                <el-icon><Edit /></el-icon> 编辑
              </el-button>
              <el-popconfirm title="确定删除?" @confirm="handleDelete(row.id)">
                <template #reference>
                  <el-button type="danger" size="small" v-permission="'production:routes:delete'">
                    <el-icon><Delete /></el-icon> 删除
                  </el-button>
                </template>
              </el-popconfirm>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-if="total > 0"
        :current-page="page" :page-size="pageSize" :total="total"
        layout="total, prev, pager, next"
        class="pagination-bar"
        @current-change="p => { page = p; loadList() }"
      />
    </el-card>

    <!-- 详情/编辑弹窗 -->
    <AppDialog
      v-model="detailVisible"
      :title="isEditing ? '编辑工序路线' : '工序路线详情'"
      :mode="isEditing ? 'form' : 'view'"
      width="900px"
      content-width="wide"
    >
      <template v-if="routeDetail">
        <el-descriptions :column="3" border class="mb-20">
          <el-descriptions-item label="产品">{{ routeDetail.productName }} ({{ routeDetail.productCode }})</el-descriptions-item>
          <el-descriptions-item label="路线名称">{{ routeDetail.name }}</el-descriptions-item>
          <el-descriptions-item label="版本">{{ routeDetail.version }}</el-descriptions-item>
          <el-descriptions-item label="总标准工时">{{ routeDetail.total_standard_minutes }} 分钟</el-descriptions-item>
          <el-descriptions-item label="工序数">{{ routeDetail.steps?.length || 0 }} 道</el-descriptions-item>
        </el-descriptions>

        <h4 class="mb-md">工序步骤</h4>
        <el-table :data="routeDetail.steps" border size="small">
          <el-table-column prop="sequence" label="序号" width="60" align="center" />
          <el-table-column prop="stepName" label="工序名称" width="150" />
          <el-table-column prop="stepCode" label="工序编号" width="100" />
          <el-table-column label="默认工位" width="120">
            <template #default="{ row }">{{ row.stationName || '-' }}</template>
          </el-table-column>
          <el-table-column prop="standardMinutes" label="标准工时(分钟)" width="130" align="center" />
          <el-table-column label="所需物料" min-width="200">
            <template #default="{ row }">
              <div v-if="row.materials?.length">
                <el-tag v-for="m in row.materials" :key="m.materialId" size="small" class="chip-gap" :type="m.is_scan_required ? 'danger' : ''">
                  {{ m.materialName }} × {{ m.quantity }}
                  <span v-if="m.is_scan_required"> 📷</span>
                </el-tag>
              </div>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
          <el-table-column label="SOP" width="60" align="center">
            <template #default="{ row }">
              <el-icon v-if="row.sopContent" class="text-success"><Check /></el-icon>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </AppDialog>

    <!-- 创建弹窗 -->
    <AppDialog
      v-model="createVisible"
      title="新增工序路线"
      mode="form"
      width="800px"
    >
      <el-form :model="createForm" label-width="90px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="产品" required>
              <el-select v-model="createForm.productId" filterable remote :remote-method="searchProducts"
                :loading="searchLoading" placeholder="搜索产品" class="w-full">
                <el-option v-for="p in productOptions" :key="p.id" :label="`${p.code} - ${p.name}`" :value="p.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="版本">
              <el-input v-model="createForm.version" placeholder="V1.0" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="路线名称" required>
              <el-input v-model="createForm.name" placeholder="如 标准装配路线" />
            </el-form-item>
          </el-col>
        </el-row>

        <h4 class="section-subhead">
          工序步骤
          <el-button type="primary" size="small" link v-permission="'production:routes:create'" @click="addStep" class="ml-sm">+ 添加工序</el-button>
        </h4>

        <el-table :data="createForm.steps" border size="small">
          <el-table-column label="序号" width="60" align="center">
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column label="工序名称" width="160">
            <template #default="{ row }">
              <el-input v-model="row.stepName" size="small" placeholder="如 底盘装配" />
            </template>
          </el-table-column>
          <el-table-column label="工序编号" width="100">
            <template #default="{ row }">
              <el-input v-model="row.stepCode" size="small" placeholder="OP10" />
            </template>
          </el-table-column>
          <el-table-column label="标准工时(分)" width="120">
            <template #default="{ row }">
              <el-input-number v-model="row.standardMinutes" size="small" :min="0" :step="5" class="w-full" />
            </template>
          </el-table-column>
          <el-table-column label="工位" width="140">
            <template #default="{ row }">
              <el-select v-model="row.stationId" size="small" placeholder="选择" clearable class="w-full">
                <el-option v-for="s in stationOptions" :key="s.id" :label="s.name" :value="s.id" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="60" align="center" class-name="operation-column" header-class-name="operation-column-header">
            <template #default="{ $index }">
              <el-button link type="danger" size="small" v-permission="'production:routes:create'" @click="createForm.steps.splice($index, 1)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" v-permission="'production:routes:create'" @click="handleCreate" :loading="saving">保存</el-button>
      </template>
        </AppDialog>
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { ref, reactive, onMounted } from 'vue'
import { Plus, Check, Edit, Delete } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { processRouteApi, workStationApi } from '../../api/assembly'
import { api } from '../../services/axiosInstance'

const loading = ref(false)
const saving = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filters = reactive({ keyword: '', isActive: '' })

const detailVisible = ref(false)
const isEditing = ref(false)
const routeDetail = ref(null)

const createVisible = ref(false)
const searchLoading = ref(false)
const productOptions = ref([])
const stationOptions = ref([])
const createForm = reactive({
  product_id: null, version: 'V1.0', name: '',
  steps: []
})

const loadList = async () => {
  loading.value = true
  try {
    const { data } = await processRouteApi.getList({
      page: page.value, pageSize: pageSize.value, ...filters
    })
    list.value = data?.data?.list || data?.list || []
    total.value = data?.data?.total || data?.total || 0
  } catch {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const viewDetail = async (id) => {
  try {
    const { data } = await processRouteApi.getById(id)
    routeDetail.value = data?.data || data
    isEditing.value = false
    detailVisible.value = true
  } catch {
    ElMessage.error('加载详情失败')
  }
}

const editRoute = async (id) => {
  await viewDetail(id)
  isEditing.value = true
}

const handleDelete = async (id) => {
  try {
    await processRouteApi.delete(id)
    ElMessage.success('删除成功')
    loadList()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '删除失败')
  }
}

const searchProducts = async (query) => {
  if (!query || query.length < 1) return
  searchLoading.value = true
  try {
    const { data } = await api.get('/base-data/materials', { params: { keyword: query, pageSize: 20 } })
    productOptions.value = data?.data?.list || data?.list || []
  } catch {} finally {
    searchLoading.value = false
  }
}

const loadStations = async () => {
  try {
    const { data } = await workStationApi.getList({ pageSize: 200 })
    stationOptions.value = data?.data?.list || data?.list || []
  } catch {}
}

const openCreateDialog = () => {
  Object.assign(createForm, { product_id: null, version: 'V1.0', name: '', steps: [] })
  loadStations()
  createVisible.value = true
}

const addStep = () => {
  createForm.steps.push({
    step_name: '', step_code: '', standard_minutes: 10, station_id: null
  })
}

const handleCreate = async () => {
  if (!createForm.productId || !createForm.name) return ElMessage.warning('请填写产品和路线名称')
  if (!createForm.steps.length) return ElMessage.warning('请至少添加一道工序')
  saving.value = true
  try {
    await processRouteApi.create(createForm)
    ElMessage.success('创建成功')
    createVisible.value = false
    loadList()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '创建失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadList()
})
</script>
