<template>
  <div class="module-page page-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>工序路线管理</h2>
          <p class="subtitle">定义产品的装配工序路线，配置每道工序的工位、工时和物料</p>
        </div>
        <div class="action-section">
          <el-button type="primary" @click="openCreateDialog">
            <el-icon><Plus /></el-icon> 新增路线
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 筛选 -->
    <el-card class="data-card">
      <el-form :inline="true" style="margin-bottom: 16px">
        <el-form-item label="关键字">
          <el-input v-model="filters.keyword" placeholder="路线名称/产品名称" clearable style="width: 200px" @keyup.enter="loadList" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.isActive" placeholder="全部" clearable style="width: 100px" @change="loadList">
            <el-option label="启用" :value="1" />
            <el-option label="停用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadList">查询</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="list" v-loading="loading" border stripe>
        <el-table-column prop="product_code" label="产品编码" width="130" />
        <el-table-column prop="product_name" label="产品名称" min-width="150" />
        <el-table-column prop="name" label="路线名称" width="160" />
        <el-table-column prop="version" label="版本" width="80" align="center" />
        <el-table-column prop="step_count" label="工序数" width="80" align="center">
          <template #default="{ row }">
            <el-tag type="info" size="small">{{ row.step_count }} 道</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="total_standard_minutes" label="总标准工时" width="120" align="center">
          <template #default="{ row }">{{ row.total_standard_minutes || 0 }} 分钟</template>
        </el-table-column>
        <el-table-column prop="is_active" label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
              {{ row.is_active ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewDetail(row.id)">查看</el-button>
            <el-button link type="primary" size="small" @click="editRoute(row.id)">编辑</el-button>
            <el-popconfirm title="确定删除?" @confirm="handleDelete(row.id)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-if="total > 0"
        :current-page="page" :page-size="pageSize" :total="total"
        layout="total, prev, pager, next"
        style="margin-top: 16px; justify-content: flex-end"
        @current-change="p => { page = p; loadList() }"
      />
    </el-card>

    <!-- 详情/编辑弹窗 -->
    <el-dialog v-model="detailVisible" :title="isEditing ? '编辑工序路线' : '工序路线详情'" width="900px" destroy-on-close>
      <template v-if="routeDetail">
        <el-descriptions :column="3" border style="margin-bottom: 20px">
          <el-descriptions-item label="产品">{{ routeDetail.product_name }} ({{ routeDetail.product_code }})</el-descriptions-item>
          <el-descriptions-item label="路线名称">{{ routeDetail.name }}</el-descriptions-item>
          <el-descriptions-item label="版本">{{ routeDetail.version }}</el-descriptions-item>
          <el-descriptions-item label="总标准工时">{{ routeDetail.total_standard_minutes }} 分钟</el-descriptions-item>
          <el-descriptions-item label="工序数">{{ routeDetail.steps?.length || 0 }} 道</el-descriptions-item>
        </el-descriptions>

        <h4 style="margin-bottom: 12px">工序步骤</h4>
        <el-table :data="routeDetail.steps" border size="small">
          <el-table-column prop="sequence" label="序号" width="60" align="center" />
          <el-table-column prop="step_name" label="工序名称" width="150" />
          <el-table-column prop="step_code" label="工序编号" width="100" />
          <el-table-column label="默认工位" width="120">
            <template #default="{ row }">{{ row.station_name || '-' }}</template>
          </el-table-column>
          <el-table-column prop="standard_minutes" label="标准工时(分钟)" width="130" align="center" />
          <el-table-column label="所需物料" min-width="200">
            <template #default="{ row }">
              <div v-if="row.materials?.length">
                <el-tag v-for="m in row.materials" :key="m.material_id" size="small" style="margin: 2px" :type="m.is_scan_required ? 'danger' : ''">
                  {{ m.material_name }} × {{ m.quantity }}
                  <span v-if="m.is_scan_required"> 📷</span>
                </el-tag>
              </div>
              <span v-else style="color: #909399">-</span>
            </template>
          </el-table-column>
          <el-table-column label="SOP" width="60" align="center">
            <template #default="{ row }">
              <el-icon v-if="row.sop_content" style="color: #67c23a"><Check /></el-icon>
              <span v-else>-</span>
            </template>
          </el-table-column>
        </el-table>
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 创建弹窗 -->
    <el-dialog v-model="createVisible" title="新增工序路线" width="800px" destroy-on-close>
      <el-form :model="createForm" label-width="90px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="产品" required>
              <el-select v-model="createForm.product_id" filterable remote :remote-method="searchProducts"
                :loading="searchLoading" placeholder="搜索产品" style="width: 100%">
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

        <h4 style="margin: 16px 0 12px">
          工序步骤
          <el-button type="primary" size="small" link @click="addStep" style="margin-left: 12px">+ 添加工序</el-button>
        </h4>

        <el-table :data="createForm.steps" border size="small">
          <el-table-column label="序号" width="60" align="center">
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </el-table-column>
          <el-table-column label="工序名称" width="160">
            <template #default="{ row }">
              <el-input v-model="row.step_name" size="small" placeholder="如 底盘装配" />
            </template>
          </el-table-column>
          <el-table-column label="工序编号" width="100">
            <template #default="{ row }">
              <el-input v-model="row.step_code" size="small" placeholder="OP10" />
            </template>
          </el-table-column>
          <el-table-column label="标准工时(分)" width="120">
            <template #default="{ row }">
              <el-input-number v-model="row.standard_minutes" size="small" :min="0" :step="5" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="工位" width="140">
            <template #default="{ row }">
              <el-select v-model="row.station_id" size="small" placeholder="选择" clearable style="width: 100%">
                <el-option v-for="s in stationOptions" :key="s.id" :label="s.name" :value="s.id" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="60" align="center">
            <template #default="{ $index }">
              <el-button link type="danger" size="small" @click="createForm.steps.splice($index, 1)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :loading="saving">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { Plus, Check } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
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
    const { data } = await api.get('/base/materials', { params: { keyword: query, pageSize: 20 } })
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
  if (!createForm.product_id || !createForm.name) return ElMessage.warning('请填写产品和路线名称')
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
